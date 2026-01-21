"""
SBI Credit Card CSV extractor.

Extracts transactions from SBI credit card CSV statements.
Ported from credit_cards/extractors.py.
"""
import csv
import io
from decimal import Decimal
from datetime import datetime
from typing import Optional

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


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


def parse_date(date_str):
    """Parse date string like '01-APR-24' to date object."""
    return datetime.strptime(date_str, '%d-%b-%y').date()


def parse_amount(amount_str):
    """Parse amount string like '3,004.00' or '-169.00' to Decimal."""
    if not amount_str or amount_str == '0.00':
        return Decimal('0')
    clean = str(amount_str).replace(',', '')
    return Decimal(clean)


def transactions_to_csv(transactions):
    """Convert list of transaction dicts to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency', 'card_number'])

    for row_id, txn in enumerate(transactions, start=1):
        writer.writerow([
            row_id,
            format_date(txn.get('date')),
            txn.get('ser_no', ''),
            txn.get('description', ''),
            format_decimal(txn.get('amount', Decimal('0.00'))),
            format_decimal(txn.get('intl_amount', Decimal('0.00'))),
            '',  # intl_currency
            '',  # card_number
        ])

    return output.getvalue()


@register_extractor
class SBICCCSVExtractor(BaseExtractor):
    """SBI Credit Card CSV Statement Extractor."""
    name = 'sbi_cc_csv'
    version = '1.0'
    domain = 'credit_card'
    supported_extensions = ['.csv']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        """
        Parse SBI Credit Card CSV statement.

        Format:
        Date,Sr.No.,Transaction Details,Reward Point Header,Intl.Amount,Amount(in Rs),BillingAmountSign
        01-Apr-24,1,SWIGGY WWW.SWIGGY.IN IN,6,0,654,654
        """
        transactions = []

        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
            except Exception as e:
                return ExtractionResult(error=f'Failed to decode file: {str(e)}')

        reader = csv.reader(io.StringIO(content))
        header_skipped = False

        for row in reader:
            if not row:
                continue

            # Skip header row
            if not header_skipped and row[0] == 'Date':
                header_skipped = True
                continue

            # Transaction row
            if header_skipped and len(row) >= 6:
                try:
                    date_str = row[0]
                    ser_no = row[1]
                    description = row[2]
                    intl_amt = row[4]
                    amount = row[5]

                    transactions.append({
                        'date': parse_date(date_str),
                        'ser_no': ser_no,
                        'description': description,
                        'amount': parse_amount(amount),
                        'intl_amount': parse_amount(intl_amt),
                    })
                except (ValueError, IndexError):
                    continue

        if not transactions:
            return ExtractionResult(error='No transactions found in CSV')

        csv_content = transactions_to_csv(transactions)
        artifact = ArtifactSpec(
            artifact_type='transactions',
            content=csv_content,
            content_format='csv',
            row_count=len(transactions),
            data_source_target='credit_card_transactions',
            transformer='legacy_cc_transactions',  # Uses the legacy transformer
        )

        return ExtractionResult(artifacts=[artifact])
