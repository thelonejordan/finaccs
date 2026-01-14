import io
import os
import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand
from dotenv import load_dotenv

from dashboard.models import Transaction

# Load environment variables
load_dotenv()

# Excel parsing imports
try:
    from openpyxl import load_workbook
    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

try:
    import msoffcrypto
    MSOFFCRYPTO_AVAILABLE = True
except ImportError:
    MSOFFCRYPTO_AVAILABLE = False


CATEGORY_PATTERNS = {
    'Food Delivery': ['SWIGGY', 'ZOMATO', 'BLINKIT', 'GROFERS'],
    'Transport': ['UBER', 'OLA', 'RAPIDO'],
    'Shopping': ['AMAZON', 'FLIPKART', 'MYNTRA', 'VENUS TRADER'],
    'Medical': ['WELLNESS FOREVER', 'MEDLIFE', 'PHARMACY', 'MEDICAL'],
    'Utilities': ['ELECTRICITY', 'GAS', 'WATER', 'BROADBAND', 'TRAFFIC'],
    'Bank Charges': ['AMB CHRG', 'CHRG INCL GST'],
    'ATM': ['ATW-', 'NWD-'],
    'Salary/Income': ['SALARY', 'INTEREST PAID'],
    'Rent': ['RENT'],
    'Self Transfer': ['UPI-JYOTIRMAYA  MAHANTA', 'UPI-JYOTIRMAYA MAHANTA'],
    'Credit Card Payment': ['PAID VIA CRED'],
    'Cafe & Restaurant': ['CAFE', 'HOTEL', 'RESTAURANT', 'MC DONALDS', 'MCDONALDS'],
    'Groceries': ['WHOLE MART', 'GENERAL ST', 'SUPER MARKET', 'MAHALAXMI GENERAL'],
    'Personal Care': ['SALON', 'UNISEX', 'NATURALS'],
    'Legal Services': ['ONLINE LEGAL', 'LEGAL INDIA'],
    'Entertainment': ['ELEPHANT AND CO'],
    'Sports': ['SPORT', 'CHAMPION'],
}


def categorize_transaction(narration):
    narration_upper = narration.upper()
    for category, patterns in CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if pattern in narration_upper:
                return category
    return 'Uncategorized'


def parse_amount(amount_str):
    cleaned = amount_str.strip().replace(',', '')
    if not cleaned or cleaned == '':
        return Decimal('0.00')
    return Decimal(cleaned)


def parse_date(date_str):
    """Parse date string in DD/MM/YY format."""
    date_str = str(date_str).strip()
    return datetime.strptime(date_str, '%d/%m/%y').date()


def parse_date_flexible(date_val):
    """Parse date from various formats (string or datetime object)."""
    if date_val is None:
        return None
    if isinstance(date_val, datetime):
        return date_val.date()
    if hasattr(date_val, 'date'):  # datetime-like object
        return date_val.date()

    date_str = str(date_val).strip()

    # Try different formats
    formats = ['%d/%m/%y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d-%m-%y']
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    raise ValueError(f"Unable to parse date: {date_val}")


def load_xlsx_workbook(file_path, password=None):
    """Load an xlsx workbook, handling encryption if needed."""
    if not OPENPYXL_AVAILABLE:
        raise ImportError("openpyxl is required for xlsx parsing. Install with: uv add openpyxl")

    file_path = Path(file_path)

    # Try direct loading first
    try:
        return load_workbook(file_path, data_only=True)
    except Exception:
        pass

    # Check if encrypted
    if not MSOFFCRYPTO_AVAILABLE:
        raise ImportError("msoffcrypto-tool is required for encrypted xlsx files. Install with: uv add msoffcrypto-tool")

    with open(file_path, 'rb') as f:
        office_file = msoffcrypto.OfficeFile(f)
        if not office_file.is_encrypted():
            raise ValueError(f"Failed to open xlsx file: {file_path}")

        # Try with provided password, env password, or empty password
        decrypted = io.BytesIO()
        env_password = os.getenv('XLSX_PASSWORD')
        passwords_to_try = []
        if password:
            passwords_to_try.append(password)
        if env_password:
            passwords_to_try.append(env_password)
        passwords_to_try.extend(['', None])

        for pwd in passwords_to_try:
            try:
                f.seek(0)
                office_file = msoffcrypto.OfficeFile(f)
                office_file.load_key(password=pwd or '')
                office_file.decrypt(decrypted)
                decrypted.seek(0)
                return load_workbook(decrypted, data_only=True)
            except Exception:
                continue

        raise ValueError(f"Could not decrypt xlsx file. Set XLSX_PASSWORD in .env or use --password option.")


def find_header_row(sheet):
    """Find the header row in an xlsx sheet by looking for common column names."""
    header_patterns = ['date', 'narration', 'debit', 'credit', 'balance', 'description', 'particulars']

    for row_idx, row in enumerate(sheet.iter_rows(max_row=20, values_only=True), 1):
        if row is None:
            continue
        row_lower = [str(cell).lower() if cell else '' for cell in row]
        matches = sum(1 for pattern in header_patterns if any(pattern in cell for cell in row_lower))
        if matches >= 3:  # Found at least 3 matching column headers
            return row_idx, row

    return None, None


def map_xlsx_columns(header_row):
    """Map xlsx column indices to transaction fields based on header names."""
    column_map = {}
    header_lower = [str(cell).lower().strip() if cell else '' for cell in header_row]

    # Common column name mappings
    mappings = {
        'date': ['date', 'txn date', 'transaction date', 'trans date', 'txndate'],
        'narration': ['narration', 'description', 'particulars', 'details', 'remarks', 'transaction details'],
        'value_date': ['value date', 'value dt', 'valuedate', 'val date'],
        'debit': ['debit', 'debit amount', 'withdrawal', 'dr', 'debit amt', 'dr amount'],
        'credit': ['credit', 'credit amount', 'deposit', 'cr', 'credit amt', 'cr amount'],
        'reference': ['ref', 'reference', 'chq/ref', 'chq', 'ref no', 'reference no', 'chq/ref number'],
        'balance': ['balance', 'closing balance', 'closing bal', 'running balance', 'available balance'],
    }

    for field, patterns in mappings.items():
        for idx, header in enumerate(header_lower):
            if any(pattern in header for pattern in patterns):
                column_map[field] = idx
                break

    return column_map


def parse_xlsx_transactions(sheet, column_map, header_row_idx):
    """Parse transactions from xlsx sheet rows."""
    transactions = []

    for row in sheet.iter_rows(min_row=header_row_idx + 1, values_only=True):
        if not row or all(cell is None or str(cell).strip() == '' for cell in row):
            continue

        try:
            # Extract values using column mapping
            date_val = row[column_map.get('date', 0)] if 'date' in column_map else None
            if date_val is None:
                continue

            date = parse_date_flexible(date_val)
            if date is None:
                continue

            narration = str(row[column_map.get('narration', 1)] or '').strip() if 'narration' in column_map else ''

            value_date_val = row[column_map.get('value_date', 2)] if 'value_date' in column_map else date_val
            try:
                value_date = parse_date_flexible(value_date_val)
            except (ValueError, TypeError):
                value_date = date

            debit_val = row[column_map.get('debit', 3)] if 'debit' in column_map else 0
            credit_val = row[column_map.get('credit', 4)] if 'credit' in column_map else 0
            ref_val = row[column_map.get('reference', 5)] if 'reference' in column_map else ''
            balance_val = row[column_map.get('balance', 6)] if 'balance' in column_map else 0

            # Parse amounts
            debit = parse_amount(str(debit_val) if debit_val else '0')
            credit = parse_amount(str(credit_val) if credit_val else '0')
            balance = parse_amount(str(balance_val) if balance_val else '0')
            reference = str(ref_val or '').strip()

            # Skip rows with no transaction amounts
            if debit == 0 and credit == 0:
                continue

            category = categorize_transaction(narration)

            transactions.append({
                'date': date,
                'narration': narration,
                'value_date': value_date,
                'debit_amount': debit,
                'credit_amount': credit,
                'reference_number': reference,
                'closing_balance': balance,
                'category': category,
            })
        except (ValueError, IndexError, TypeError) as e:
            continue

    return transactions


class Command(BaseCommand):
    help = 'Load transactions from bank statement file (.txt or .xlsx)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Path to the bank statement file',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing transactions before loading',
        )
        parser.add_argument(
            '--password',
            type=str,
            help='Password for encrypted xlsx files (can also be set via XLSX_PASSWORD env var)',
        )

    def handle(self, *args, **options):
        file_path = options.get('file')
        password = options.get('password')

        if not file_path:
            data_dir = Path('bank_accs/data')
            # Look for both txt and xlsx files
            files = list(data_dir.glob('*.txt')) + list(data_dir.glob('*.xlsx')) + list(data_dir.glob('*.xls'))
            if not files:
                self.stderr.write(self.style.ERROR('No statement files found in bank_accs/data/'))
                return
            file_path = files[0]

        if options['clear']:
            deleted_count, _ = Transaction.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted {deleted_count} existing transactions'))

        file_path = Path(file_path)
        if not file_path.exists():
            self.stderr.write(self.style.ERROR(f'File not found: {file_path}'))
            return

        self.stdout.write(f'Loading transactions from {file_path}')

        # Find the bank account linked to this source file
        from bank_accs.models import BankAccount
        filename = file_path.name
        bank_account = BankAccount.objects.filter(source_file=filename).first()
        if bank_account:
            self.stdout.write(f'Linking transactions to account: {bank_account.nickname}')
        else:
            self.stdout.write(self.style.WARNING(f'No bank account linked to {filename}'))

        # Determine file type and parse accordingly
        suffix = file_path.suffix.lower()
        if suffix in ['.xlsx', '.xls']:
            transactions_created = self.load_xlsx(file_path, password, bank_account)
        else:
            transactions_created = self.load_txt(file_path, bank_account)

        self.stdout.write(self.style.SUCCESS(f'Successfully loaded {transactions_created} transactions'))

    def load_txt(self, file_path, bank_account=None):
        """Load transactions from a txt/csv file."""
        with open(file_path, 'r') as f:
            lines = f.readlines()

        transactions_created = 0
        for i, line in enumerate(lines):
            if i == 0:
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

                date = parse_date(date_str)
                narration = parts[1].strip()
                value_date = parse_date(parts[2].strip())
                debit_amount = parse_amount(parts[3])
                credit_amount = parse_amount(parts[4])
                reference_number = parts[5].strip()
                closing_balance = parse_amount(parts[6])

                category = categorize_transaction(narration)

                Transaction.objects.create(
                    date=date,
                    narration=narration,
                    value_date=value_date,
                    debit_amount=debit_amount,
                    credit_amount=credit_amount,
                    reference_number=reference_number,
                    closing_balance=closing_balance,
                    category=category,
                    bank_account=bank_account,
                )
                transactions_created += 1
            except (ValueError, IndexError) as e:
                self.stderr.write(f'Error parsing line {i + 1}: {e}')
                continue

        return transactions_created

    def load_xlsx(self, file_path, password=None, bank_account=None):
        """Load transactions from an xlsx file."""
        try:
            wb = load_xlsx_workbook(file_path, password)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Failed to open xlsx file: {e}'))
            return 0

        sheet = wb.active

        # Find header row
        header_row_idx, header_row = find_header_row(sheet)
        if header_row_idx is None:
            self.stderr.write(self.style.ERROR('Could not find header row in xlsx file'))
            return 0

        self.stdout.write(f'Found header row at row {header_row_idx}: {header_row}')

        # Map columns
        column_map = map_xlsx_columns(header_row)
        self.stdout.write(f'Column mapping: {column_map}')

        # Parse transactions
        transactions = parse_xlsx_transactions(sheet, column_map, header_row_idx)

        # Save to database
        transactions_created = 0
        for txn in transactions:
            try:
                Transaction.objects.create(**txn, bank_account=bank_account)
                transactions_created += 1
            except Exception as e:
                self.stderr.write(f'Error saving transaction: {e}')
                continue

        return transactions_created
