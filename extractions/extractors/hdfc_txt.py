"""
HDFC Bank TXT/CSV extractor.

Extracts transactions from HDFC bank text/CSV statements.
Ported from bank_accs/extractors.py.
"""
import re
import csv
import io
from decimal import Decimal
from datetime import datetime
from typing import Optional

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
class HDFCTXTExtractor(BaseExtractor):
    """HDFC Bank Text/CSV Statement Extractor."""
    name = 'hdfc_txt'
    version = '1.0'
    domain = 'bank_account'
    supported_extensions = ['.txt', '.csv']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        """
        Extract transactions from HDFC-style TXT/CSV file.

        Expected format (comma-separated):
        date,narration,value_date,debit,credit,reference,balance
        DD/MM/YY,...
        """
        transactions = []

        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
            except Exception as e:
                return ExtractionResult(error=f'Failed to decode file: {str(e)}')

        lines = content.splitlines()

        for i, line in enumerate(lines):
            if i == 0:  # Skip header
                continue
            line = line.strip()
            if not line:
                continue

            parts = line.split(',')
            if len(parts) < 7:
                continue

            try:
                date_str = parts[0].strip()
                if not re.match(r'\d{2}/\d{2}/\d{2}', date_str):
                    continue

                date = datetime.strptime(date_str, '%d/%m/%y').date()
                narration = parts[1].strip()
                value_date = datetime.strptime(parts[2].strip(), '%d/%m/%y').date()
                debit_amount = parse_amount(parts[3])
                credit_amount = parse_amount(parts[4])
                reference_number = parts[5].strip()
                closing_balance = parse_amount(parts[6])

                if debit_amount == 0 and credit_amount == 0:
                    continue

                transactions.append({
                    'date': date,
                    'narration': narration,
                    'value_date': value_date,
                    'debit_amount': debit_amount,
                    'credit_amount': credit_amount,
                    'reference_number': reference_number,
                    'closing_balance': closing_balance,
                })
            except (ValueError, IndexError):
                continue

        if not transactions:
            return ExtractionResult(error='No transactions found in file')

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
