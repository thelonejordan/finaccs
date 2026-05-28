"""
Standard CSV extractors.

Universal fallback for manually-created transaction files.
Accepts CSVs already in the data source (ingestable) format.
"""
import csv
import io
from decimal import Decimal
from datetime import datetime
from typing import Optional

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


BANK_CSV_COLUMNS = [
    'row_id', 'date', 'value_date', 'narration', 'debit_amount',
    'credit_amount', 'reference_number', 'closing_balance'
]

CC_CSV_COLUMNS = [
    'row_id', 'date', 'value_date', 'narration', 'debit_amount', 'credit_amount',
    'reference_number', 'closing_balance', 'intl_amount', 'intl_currency', 'exchange_rate'
]

BANK_REQUIRED_COLUMNS = {'date', 'narration', 'debit_amount', 'credit_amount'}
BANK_OPTIONAL_COLUMNS = {'value_date', 'reference_number', 'closing_balance'}

CC_REQUIRED_COLUMNS = {'date', 'narration', 'debit_amount', 'credit_amount'}
CC_OPTIONAL_COLUMNS = {'value_date', 'reference_number', 'closing_balance', 'intl_amount', 'intl_currency', 'exchange_rate'}


def parse_date_flexible(date_str):
    if not date_str or not date_str.strip():
        return None
    date_str = date_str.strip()
    formats = [
        '%Y-%m-%d',
        '%d/%m/%Y',
        '%d/%m/%y',
        '%d-%m-%Y',
        '%d-%m-%y',
        '%d-%b-%Y',
        '%d-%b-%y',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


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


def validate_header(header_row, required_columns, optional_columns):
    """Validate CSV header contains required columns. Returns normalized header list or error."""
    header_lower = [h.strip().lower() for h in header_row]
    # Strip row_id if present (we auto-generate it)
    recognized = required_columns | optional_columns | {'row_id'}
    missing = required_columns - set(header_lower)
    if missing:
        return None, f"Missing required columns: {', '.join(sorted(missing))}"
    unknown = set(header_lower) - recognized
    if unknown:
        return None, f"Unknown columns: {', '.join(sorted(unknown))}. Expected: {', '.join(sorted(recognized - {'row_id'}))}"
    return header_lower, None


@register_extractor
class StandardBankCSVExtractor(BaseExtractor):
    """Standard CSV extractor for bank account transactions."""
    name = 'standard_bank_csv'
    version = '1.0'
    domain = 'bank_account'
    supported_extensions = ['.csv']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
            except Exception as e:
                return ExtractionResult(error=f'Failed to decode file: {e}')

        reader = csv.reader(io.StringIO(content))
        rows = list(reader)

        if len(rows) < 2:
            return ExtractionResult(error='File has no data rows')

        header, error = validate_header(rows[0], BANK_REQUIRED_COLUMNS, BANK_OPTIONAL_COLUMNS)
        if error:
            return ExtractionResult(error=error)

        dict_reader = csv.DictReader(io.StringIO(content))
        transactions = []

        for row in dict_reader:
            # Normalize keys to lowercase
            row = {k.strip().lower(): v for k, v in row.items()}

            date = parse_date_flexible(row.get('date', ''))
            if date is None:
                continue

            value_date = parse_date_flexible(row.get('value_date', '')) or date
            narration = row.get('narration', '').strip()
            debit = parse_amount(row.get('debit_amount'))
            credit = parse_amount(row.get('credit_amount'))

            if debit == 0 and credit == 0:
                continue

            reference = row.get('reference_number', '').strip()
            balance = parse_amount(row.get('closing_balance'))

            transactions.append({
                'date': date,
                'value_date': value_date,
                'narration': narration,
                'debit_amount': debit,
                'credit_amount': credit,
                'reference_number': reference,
                'closing_balance': balance,
            })

        if not transactions:
            return ExtractionResult(error='No valid transactions found in CSV')

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(BANK_CSV_COLUMNS)
        for row_id, txn in enumerate(transactions, start=1):
            writer.writerow([
                row_id,
                format_date(txn['date']),
                format_date(txn['value_date']),
                txn['narration'],
                format_decimal(txn['debit_amount']),
                format_decimal(txn['credit_amount']),
                txn['reference_number'],
                format_decimal(txn['closing_balance']),
            ])

        csv_content = output.getvalue()
        artifact = ArtifactSpec(
            artifact_type='transactions',
            content=csv_content,
            content_format='csv',
            row_count=len(transactions),
            data_source_target='bank_account_transactions',
            transformer='bank_transactions',
        )
        return ExtractionResult(artifacts=[artifact])


@register_extractor
class StandardCCCSVExtractor(BaseExtractor):
    """Standard CSV extractor for credit card transactions."""
    name = 'standard_cc_csv'
    version = '1.0'
    domain = 'credit_card'
    supported_extensions = ['.csv']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
            except Exception as e:
                return ExtractionResult(error=f'Failed to decode file: {e}')

        reader = csv.reader(io.StringIO(content))
        rows = list(reader)

        if len(rows) < 2:
            return ExtractionResult(error='File has no data rows')

        header, error = validate_header(rows[0], CC_REQUIRED_COLUMNS, CC_OPTIONAL_COLUMNS)
        if error:
            return ExtractionResult(error=error)

        dict_reader = csv.DictReader(io.StringIO(content))
        transactions = []

        for row in dict_reader:
            row = {k.strip().lower(): v for k, v in row.items()}

            date = parse_date_flexible(row.get('date', ''))
            if date is None:
                continue

            narration = row.get('narration', '').strip()
            debit = parse_amount(row.get('debit_amount'))
            credit = parse_amount(row.get('credit_amount'))

            if debit == 0 and credit == 0:
                continue

            value_date = parse_date_flexible(row.get('value_date', '')) or date
            reference = row.get('reference_number', '').strip()
            closing_balance = row.get('closing_balance', '').strip()
            intl_amount = row.get('intl_amount', '').strip()
            intl_currency = row.get('intl_currency', '').strip()
            exchange_rate = row.get('exchange_rate', '').strip()

            transactions.append({
                'date': date,
                'value_date': value_date,
                'narration': narration,
                'debit_amount': debit,
                'credit_amount': credit,
                'reference_number': reference,
                'closing_balance': closing_balance,
                'intl_amount': intl_amount,
                'intl_currency': intl_currency,
                'exchange_rate': exchange_rate,
            })

        if not transactions:
            return ExtractionResult(error='No valid transactions found in CSV')

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(CC_CSV_COLUMNS)
        for row_id, txn in enumerate(transactions, start=1):
            writer.writerow([
                row_id,
                format_date(txn['date']),
                format_date(txn['value_date']),
                txn['narration'],
                format_decimal(txn['debit_amount']),
                format_decimal(txn['credit_amount']),
                txn['reference_number'],
                txn['closing_balance'],
                txn['intl_amount'],
                txn['intl_currency'],
                txn['exchange_rate'],
            ])

        csv_content = output.getvalue()
        artifact = ArtifactSpec(
            artifact_type='transactions',
            content=csv_content,
            content_format='csv',
            row_count=len(transactions),
            data_source_target='credit_card_transactions',
            transformer='cc_transactions',
        )
        return ExtractionResult(artifacts=[artifact])
