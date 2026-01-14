import re
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from django.core.management.base import BaseCommand

from dashboard.models import Transaction


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
    return datetime.strptime(date_str.strip(), '%d/%m/%y').date()


class Command(BaseCommand):
    help = 'Load transactions from bank statement file'

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

    def handle(self, *args, **options):
        file_path = options.get('file')
        if not file_path:
            data_dir = Path('bank_accs/data')
            files = list(data_dir.glob('*.txt'))
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
                )
                transactions_created += 1
            except (ValueError, IndexError) as e:
                self.stderr.write(f'Error parsing line {i + 1}: {e}')
                continue

        self.stdout.write(self.style.SUCCESS(f'Successfully loaded {transactions_created} transactions'))
