"""
Credit card statement extractors that output standardized CSV format.

CSV Schema:
    date,description,amount,intl_amount
    2024-01-15,"SWIGGY WWW.SWIGGY.IN",654.00,0.00
"""
import csv
import io
from datetime import datetime
from decimal import Decimal


# Standard CSV columns for credit card transactions
CREDIT_CARD_CSV_COLUMNS = ['date', 'description', 'amount', 'intl_amount']


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
    # Remove commas and convert
    clean = str(amount_str).replace(',', '')
    return Decimal(clean)


def transactions_to_csv(transactions):
    """Convert list of transaction dicts to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Write header
    writer.writerow(CREDIT_CARD_CSV_COLUMNS)

    # Write data rows
    for txn in transactions:
        writer.writerow([
            format_date(txn.get('date')),
            txn.get('description', ''),
            format_decimal(txn.get('amount', Decimal('0.00'))),
            format_decimal(txn.get('intl_amount', Decimal('0.00'))),
        ])

    return output.getvalue()


def extract_sbi_credit_card_csv(filepath):
    """
    Parse SBI Credit Card CSV statement.

    Format:
    Date,Sr.No.,Transaction Details,Reward Point Header,Intl.Amount,Amount(in Rs),BillingAmountSign
    01-Apr-24,1,SWIGGY WWW.SWIGGY.IN IN,6,0,654,654
    ...

    Returns:
        str: CSV string in standardized format
    """
    transactions = []

    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header_skipped = False

        for row in reader:
            if not row:
                continue

            # Skip the header row
            if not header_skipped and row[0] == 'Date':
                header_skipped = True
                continue

            # Transaction row
            if header_skipped and len(row) >= 6:
                try:
                    date_str = row[0]
                    description = row[2]
                    intl_amt = row[4]
                    amount = row[5]

                    transactions.append({
                        'date': parse_date(date_str),
                        'description': description,
                        'amount': parse_amount(amount),
                        'intl_amount': parse_amount(intl_amt),
                    })
                except (ValueError, IndexError) as e:
                    # Skip malformed rows
                    print(f"Skipping row: {row}, error: {e}")
                    continue

    return transactions_to_csv(transactions)


# Map of extractor names to functions
EXTRACTORS = {
    'sbi_credit_card_csv': extract_sbi_credit_card_csv,
}


def get_extractor(extractor_name):
    """Get an extractor function by name."""
    return EXTRACTORS.get(extractor_name)


def detect_extractor(file_path):
    """Auto-detect the appropriate extractor based on file extension."""
    # For credit cards, currently only supporting CSV
    return 'sbi_credit_card_csv'
