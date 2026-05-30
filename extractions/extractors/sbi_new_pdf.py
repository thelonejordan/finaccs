"""
SBI Bank PDF extractor (new format).

Extracts transactions from SBI bank PDF statements with the newer column layout:
Post Date, Value Date, Description, Cheque No/Reference, Debit, Credit, Balance (with CR/DR suffix).
"""
import re
import csv
import io
from decimal import Decimal
from datetime import datetime
from typing import Optional

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


BANK_CSV_COLUMNS = [
    'row_id', 'date', 'value_date', 'narration', 'debit_amount',
    'credit_amount', 'reference_number', 'closing_balance'
]


def format_date(d):
    if d is None:
        return ''
    return d.strftime('%Y-%m-%d')


def format_decimal(d):
    if d is None:
        return '0.00'
    return f'{d:.2f}'


def parse_amount(amount_str):
    if amount_str is None:
        return Decimal('0.00')
    cleaned = str(amount_str).strip().replace(',', '')
    if not cleaned or cleaned == '-':
        return Decimal('0.00')
    try:
        return Decimal(cleaned)
    except Exception:
        return Decimal('0.00')


def parse_balance(balance_str):
    """Parse balance string that may have CR/DR suffix."""
    if balance_str is None:
        return Decimal('0.00')
    cleaned = str(balance_str).strip().replace(',', '')
    if not cleaned or cleaned == '-':
        return Decimal('0.00')
    sign = Decimal('1')
    if cleaned.endswith('DR'):
        sign = Decimal('-1')
        cleaned = cleaned[:-2]
    elif cleaned.endswith('CR'):
        cleaned = cleaned[:-2]
    try:
        return Decimal(cleaned) * sign
    except Exception:
        return Decimal('0.00')


def parse_date(date_str):
    if date_str is None:
        return None
    date_str = str(date_str).strip()
    if not date_str:
        return None
    for fmt in ('%d-%m-%Y', '%d-%m-%y', '%d/%m/%Y', '%d/%m/%y'):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def is_transaction_row(row):
    if not row or len(row) < 7:
        return False
    first_cell = str(row[0]).strip() if row[0] else ''
    return bool(re.match(r'\d{2}-\d{2}-\d{4}', first_cell))


def transactions_to_csv(transactions):
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(BANK_CSV_COLUMNS)
    for row_id, txn in enumerate(transactions, start=1):
        writer.writerow([
            row_id,
            format_date(txn.get('date')),
            format_date(txn.get('value_date')),
            txn.get('narration', ''),
            format_decimal(txn.get('debit_amount', Decimal('0.00'))),
            format_decimal(txn.get('credit_amount', Decimal('0.00'))),
            txn.get('reference_number', ''),
            format_decimal(txn.get('closing_balance', Decimal('0.00'))),
        ])
    return output.getvalue()


@register_extractor
class SBINewPDFExtractor(BaseExtractor):
    """SBI Bank PDF Statement Extractor (new format with Post Date, Value Date, Description, Ref, Debit, Credit, Balance)."""
    name = 'sbi_new_pdf'
    version = '1.0'
    domain = 'bank_account'
    supported_extensions = ['.pdf']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        if not PDFPLUMBER_AVAILABLE:
            return ExtractionResult(error='pdfplumber is required for PDF parsing. Install with: uv add pdfplumber')

        passwords_to_try = [password, None] if password else [None]

        pdf = None
        for pwd in passwords_to_try:
            try:
                pdf = pdfplumber.open(io.BytesIO(file_bytes), password=pwd)
                break
            except Exception:
                continue

        if pdf is None:
            return ExtractionResult(error='Failed to open PDF file. Check password if file is encrypted.')

        transactions = []
        try:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue

                    for row in table:
                        if not is_transaction_row(row):
                            continue

                        try:
                            date = parse_date(row[0])
                            if date is None:
                                continue

                            value_date = parse_date(row[1]) or date
                            narration = str(row[2] or '').strip().replace('\n', ' ')
                            reference = str(row[3] or '').strip()
                            debit = parse_amount(row[4])
                            credit = parse_amount(row[5])
                            balance = parse_balance(row[6])

                            if debit == 0 and credit == 0:
                                continue

                            transactions.append({
                                'date': date,
                                'value_date': value_date,
                                'narration': narration,
                                'debit_amount': debit,
                                'credit_amount': credit,
                                'reference_number': reference,
                                'closing_balance': balance,
                            })
                        except (ValueError, IndexError, TypeError):
                            continue
        finally:
            pdf.close()

        if not transactions:
            return ExtractionResult(error='No transactions found in PDF')

        csv_content = transactions_to_csv(transactions)
        artifact = ArtifactSpec(
            artifact_type='transactions',
            content=csv_content,
            content_format='csv',
            row_count=len(transactions),
            data_source_target='bank_account_transactions',
            transformer='bank_transactions',
        )

        return ExtractionResult(artifacts=[artifact])
