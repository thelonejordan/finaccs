"""
Niyo DCB Bank PDF extractor.

Extracts transactions from Niyo (DCB Bank) PDF statements.
"""
import re
import csv
import io
from decimal import Decimal
from datetime import datetime
from typing import Optional, List

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


def parse_date(date_str):
    if date_str is None:
        return None
    date_str = str(date_str).strip()
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%d-%m-%Y').date()
    except ValueError:
        pass
    try:
        return datetime.strptime(date_str, '%d-%m-%y').date()
    except ValueError:
        return None


def is_transaction_row(row):
    """Check if row is a valid transaction (starts with a date)."""
    if not row or len(row) < 6:
        return False
    first_cell = str(row[0]).strip() if row[0] else ''
    return bool(re.match(r'\d{2}-\d{2}-\d{4}', first_cell))


def is_transaction_table(table):
    """Check if a table contains transaction data by looking at headers."""
    if not table or len(table) < 2:
        return False
    # Header row or account number row
    first_row_text = ' '.join(str(c or '') for c in table[0]).lower()
    if 'account number' in first_row_text and 'niyox' in first_row_text:
        return True
    # Check if first row has Date* header
    if table[0][0] and 'date' in str(table[0][0]).lower():
        return True
    # Continuation table on next page — first row is a transaction
    if is_transaction_row(table[0]):
        return True
    return False


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
class NiyoDCBPDFExtractor(BaseExtractor):
    """Niyo DCB Bank PDF Statement Extractor."""
    name = 'niyo_dcb_pdf'
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
                    if not table or not is_transaction_table(table):
                        continue

                    for row in table:
                        if not is_transaction_row(row):
                            continue

                        try:
                            date = parse_date(row[0])
                            if date is None:
                                continue

                            narration = str(row[1] or '').strip()
                            cheque_number = str(row[2] or '').strip()
                            withdrawal = parse_amount(row[3])
                            deposit = parse_amount(row[4])
                            balance = parse_amount(row[5])

                            if withdrawal == 0 and deposit == 0:
                                continue

                            transactions.append({
                                'date': date,
                                'value_date': date,
                                'narration': narration,
                                'debit_amount': withdrawal,
                                'credit_amount': deposit,
                                'reference_number': cheque_number,
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
