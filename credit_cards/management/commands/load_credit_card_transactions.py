"""
Load credit card transactions from CreditCardExtractedCSV blobs into the database.

This is the second phase of the two-phase workflow:
1. Extract: Original file blob → Standardized CSV blob (extract_credit_card_transactions command)
2. Load: CSV blob → Transaction records (this command)
"""
import csv
import gzip
import io
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from credit_cards.models import (
    CreditCard, CreditCardSourceFile, CreditCardExtractedCSV, CreditCardTransaction
)


# Category patterns for credit card transactions
CATEGORY_PATTERNS = {
    'Credit Card Payment': ['BBPS', 'BILL PAYMENT', 'CC PAYMENT', 'UPI PAYMENT RECEIVED', 'PAYMENT RECEIVED'],
    'Food Delivery': ['SWIGGY', 'ZOMATO', 'BLINKIT', 'GROFERS'],
    'Transport': ['UBER', 'OLA', 'RAPIDO'],
    'Shopping': ['AMAZON', 'FLIPKART', 'MYNTRA'],
    'Entertainment': ['NETFLIX', 'SPOTIFY', 'YOUTUBE', 'GOOGLE PLAY'],
    'Utilities': ['AIRTEL', 'JIO', 'VODAFONE', 'ELECTRICITY', 'GAS'],
    'Rent': ['RENTOMOJO', 'NEST AWAY', 'RENT'],
    'Cafe & Restaurant': ['CAFE', 'HOTEL', 'RESTAURANT', 'MC DONALDS', 'MCDONALDS'],
    'Personal Care': ['SALON', 'UNISEX', 'NATURALS'],
    'Legal Services': ['ONLINE LEGAL', 'LEGAL INDIA'],
    'Sports': ['SPORT', 'CHAMPION'],
    'Medical': ['WELLNESS FOREVER', 'MEDLIFE', 'PHARMACY', 'MEDICAL'],
    'Groceries': ['WHOLE MART', 'GENERAL ST', 'SUPER MARKET', 'MAHALAXMI GENERAL'],
}


def categorize_transaction(description):
    """Categorize a credit card transaction based on description."""
    description_upper = description.upper()
    for category, patterns in CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if pattern in description_upper:
                return category
    return ''


def parse_date(date_str):
    """Parse date in YYYY-MM-DD format."""
    return datetime.strptime(date_str, '%Y-%m-%d').date()


def parse_decimal(value_str):
    """Parse decimal value."""
    if not value_str or value_str.strip() == '':
        return Decimal('0.00')
    return Decimal(value_str)


class Command(BaseCommand):
    help = 'Load credit card transactions from CreditCardExtractedCSV blobs into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Filename of a specific source file to load',
        )
        parser.add_argument(
            '--csv-id',
            type=int,
            help='ID of a specific CreditCardExtractedCSV to load',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Load all extracted CSVs that are in "extracted" status',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing credit card transactions before loading',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force reload even if CSV is already loaded',
        )

    def handle(self, *args, **options):
        filename = options.get('file')
        csv_id = options.get('csv_id')
        load_all = options.get('all')
        self.force = options.get('force', False)

        if options['clear']:
            deleted_count, _ = CreditCardTransaction.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted {deleted_count} credit card transactions'))
            # Reset all CreditCardExtractedCSV status to 'extracted'
            CreditCardExtractedCSV.objects.filter(status='loaded').update(
                status='extracted',
                loaded_at=None
            )

        if load_all:
            self.load_all_csvs()
            return

        if csv_id:
            try:
                extracted_csv = CreditCardExtractedCSV.objects.get(id=csv_id)
                self.load_csv(extracted_csv)
            except CreditCardExtractedCSV.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'CreditCardExtractedCSV with id {csv_id} not found'))
            return

        if filename:
            try:
                source_file = CreditCardSourceFile.objects.get(filename=filename)
                # Get the latest non-superseded CSV
                extracted_csv = source_file.extracted_csvs.filter(
                    status__in=['extracted', 'loaded']
                ).order_by('-extracted_at').first()

                if not extracted_csv:
                    self.stderr.write(self.style.ERROR(
                        f'No extracted CSV found for {filename}. Run extract_credit_card_transactions first.'
                    ))
                    return

                self.load_csv(extracted_csv)
            except CreditCardSourceFile.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'Source file {filename} not found'))
            return

        self.stderr.write(self.style.ERROR('Please specify --file, --csv-id, or --all'))

    def load_all_csvs(self):
        """Load all CreditCardExtractedCSVs that are in 'extracted' status."""
        if self.force:
            csvs_to_load = CreditCardExtractedCSV.objects.filter(
                status__in=['extracted', 'loaded']
            ).exclude(status='superseded')
        else:
            csvs_to_load = CreditCardExtractedCSV.objects.filter(status='extracted')

        if not csvs_to_load.exists():
            self.stdout.write('No extracted CSVs to load')
            return

        total_loaded = 0
        files_processed = 0

        for extracted_csv in csvs_to_load:
            transactions_loaded = self.load_csv(extracted_csv)
            if transactions_loaded >= 0:
                total_loaded += transactions_loaded
                files_processed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Loaded {total_loaded} credit card transactions from {files_processed} CSV blobs'
        ))

    def load_csv(self, extracted_csv):
        """
        Load transactions from a CreditCardExtractedCSV blob.

        Returns:
            int: Number of transactions loaded, -1 if skipped
        """
        source_file = extracted_csv.source_file
        credit_card = source_file.credit_card

        # Check if already loaded
        if not self.force and extracted_csv.status == 'loaded':
            self.stdout.write(f'Skipping {source_file.filename} (already loaded)')
            return -1

        self.stdout.write(f'Loading credit card transactions from {source_file.filename}')
        if credit_card:
            self.stdout.write(f'  Linking to card: {credit_card.nickname}')
        else:
            self.stdout.write(self.style.WARNING(f'  No credit card linked to {source_file.filename}'))

        # Delete existing transactions from this extracted CSV before reloading
        if self.force:
            deleted_count = CreditCardTransaction.objects.filter(extracted_csv=extracted_csv).delete()[0]
            if deleted_count:
                self.stdout.write(f'  Deleted {deleted_count} existing transactions from this CSV')

        # Decompress and parse CSV
        try:
            csv_bytes = gzip.decompress(extracted_csv.csv_data)
            csv_string = csv_bytes.decode('utf-8')
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'  Failed to decompress CSV: {e}'))
            extracted_csv.status = 'error'
            extracted_csv.error_message = str(e)
            extracted_csv.save()
            return 0

        # Parse CSV and create transactions
        transactions_created = 0
        duplicates_skipped = 0

        reader = csv.DictReader(io.StringIO(csv_string))
        for row_number, row in enumerate(reader, start=1):
            try:
                date = parse_date(row['date'])
                description = row['description']
                amount = parse_decimal(row['amount'])
                intl_amount = parse_decimal(row.get('intl_amount', '0.00'))

                # Check for duplicate transaction (same key fields for the same card)
                existing = CreditCardTransaction.objects.filter(
                    credit_card=credit_card,
                    date=date,
                    description=description,
                    amount=amount,
                ).first()

                if existing:
                    duplicates_skipped += 1
                    continue

                # Categorize transaction
                category = categorize_transaction(description)

                CreditCardTransaction.objects.create(
                    date=date,
                    description=description,
                    amount=amount,
                    intl_amount=intl_amount,
                    category=category,
                    credit_card=credit_card,
                    source_file=source_file,
                    extracted_csv=extracted_csv,
                    row_number=row_number,
                )

                transactions_created += 1

            except Exception as e:
                self.stderr.write(f'  Error parsing row: {e}')
                continue

        if duplicates_skipped:
            self.stdout.write(f'  Skipped {duplicates_skipped} duplicate transactions')

        # Update CreditCardExtractedCSV status
        extracted_csv.status = 'loaded'
        extracted_csv.loaded_at = timezone.now()
        extracted_csv.save()

        # Update source file last_loaded_at and date range
        source_file.last_loaded_at = timezone.now()
        # Compute date range from all transactions in this file
        from django.db.models import Min, Max
        date_range = CreditCardTransaction.objects.filter(source_file=source_file).aggregate(
            start=Min('date'), end=Max('date')
        )
        source_file.date_range_start = date_range['start']
        source_file.date_range_end = date_range['end']
        source_file.save(update_fields=['last_loaded_at', 'date_range_start', 'date_range_end'])

        self.stdout.write(self.style.SUCCESS(f'  Loaded {transactions_created} transactions'))
        return transactions_created
