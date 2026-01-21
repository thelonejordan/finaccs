"""
SBI Bank PDF extractor.

Extracts transactions from SBI bank PDF statements.
Ported from bank_accs/extractors.py.
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


# Standard CSV columns for bank transactions
BANK_CSV_COLUMNS = [
    'row_id', 'date', 'value_date', 'narration', 'debit_amount',
    'credit_amount', 'reference_number', 'closing_balance'
]


def format_date(d):
    """Format date as YYYY-MM-DD."""
    if d is None:
        return ''
    return d.strftime('%Y-%m-%d')


def format_decimal(d):
    """Format decimal as NNNN.NN."""
    if d is None:
        return '0.00'
    return f'{d:.2f}'


def parse_amount(amount_str):
    """Parse amount string to Decimal."""
    if amount_str is None:
        return Decimal('0.00')
    cleaned = str(amount_str).strip().replace(',', '')
    if not cleaned or cleaned == '' or cleaned == '-':
        return Decimal('0.00')
    try:
        return Decimal(cleaned)
    except Exception:
        return Decimal('0.00')


def parse_pdf_date(date_str):
    """Parse date from PDF in DD-MM-YY format."""
    if date_str is None:
        return None
    date_str = str(date_str).strip()
    # Try DD-MM-YY format (SBI format)
    try:
        return datetime.strptime(date_str, '%d-%m-%y').date()
    except ValueError:
        pass
    # Try other formats
    formats = ['%d-%m-%Y', '%d/%m/%y', '%d/%m/%Y']
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def is_valid_pdf_transaction_row(row):
    """Check if a PDF row looks like a valid transaction row."""
    if not row or len(row) < 5:
        return False

    non_empty = [c for c in row if c is not None and str(c).strip()]
    if len(non_empty) < 3:
        return False

    first_cell = str(row[0]).strip() if row[0] else ''
    if not re.match(r'\d{2}-\d{2}-\d{2}', first_cell):
        return False

    return True


def transactions_to_csv(transactions):
    """Convert list of transaction dicts to CSV string."""
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
class SBIPDFExtractor(BaseExtractor):
    """SBI Bank PDF Statement Extractor."""
    name = 'sbi_pdf'
    version = '1.0'
    domain = 'bank_account'
    supported_extensions = ['.pdf']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        if not PDFPLUMBER_AVAILABLE:
            return ExtractionResult(error='pdfplumber is required for PDF parsing. Install with: uv add pdfplumber')

        # Try passwords in order: provided, None
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
                        if not is_valid_pdf_transaction_row(row):
                            continue

                        try:
                            date_str = str(row[0]).strip()
                            date = parse_pdf_date(date_str)
                            if date is None:
                                continue

                            narration = str(row[1] or '').strip()

                            # Last 3 columns are always Credit, Debit, Balance
                            if len(row) >= 6:
                                credit = parse_amount(row[-3])
                                debit = parse_amount(row[-2])
                                balance = parse_amount(row[-1])
                                ref = str(row[-4] or '').strip() if len(row) >= 7 else ''
                            else:
                                continue

                            if credit == 0 and debit == 0:
                                continue

                            transactions.append({
                                'date': date,
                                'narration': narration,
                                'value_date': date,  # PDF doesn't have separate value date
                                'debit_amount': debit,
                                'credit_amount': credit,
                                'reference_number': ref,
                                'closing_balance': balance,
                            })
                        except (ValueError, IndexError, TypeError):
                            continue
        finally:
            pdf.close()

        if not transactions:
            return ExtractionResult(error='No transactions found in PDF')

        # Create artifact
        csv_content = transactions_to_csv(transactions)
        artifact = ArtifactSpec(
            artifact_type='transactions',
            content=csv_content,
            content_format='csv',
            row_count=len(transactions),
            data_source_target='bank_account_transactions',
            transformer='bank_transactions',  # Pass-through transformer
        )

        return ExtractionResult(artifacts=[artifact])
