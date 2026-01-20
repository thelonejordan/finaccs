"""
Load transactions from ExtractedCSV blobs into the database.

This command loads extracted CSV data into Transaction records.
Files should be uploaded via the UI and extracted before running this command.
"""
import csv
import gzip
import io
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from bank_accs.models import SourceFile, ExtractedCSV, BankExtractionArtifact
from dashboard.models import Transaction, FileLoadLog


# Category patterns for automatic categorization
CATEGORY_PATTERNS = {
    'Food Delivery': ['SWIGGY', 'ZOMATO', 'BLINKIT', 'GROFERS'],
    'Transport': ['UBER', 'OLA', 'RAPIDO'],
    'Shopping': ['AMAZON', 'FLIPKART', 'MYNTRA', 'VENUS TRADER'],
    'Medical': ['WELLNESS FOREVER', 'MEDLIFE', 'PHARMACY', 'MEDICAL'],
    'Utilities': ['ELECTRICITY', 'GAS', 'WATER', 'BROADBAND', 'TRAFFIC'],
    'Bank Charges': ['AMB CHRG', 'CHRG INCL GST'],
    'ATM': ['ATW-', 'NWD-'],
    'Salary/Income': ['SALARY'],
    'Interest': ['INTEREST PAID'],
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
    """Categorize a transaction based on narration patterns."""
    narration_upper = narration.upper()
    for category, patterns in CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if pattern in narration_upper:
                return category
    return 'Uncategorized'


def parse_date(date_str):
    """Parse date in YYYY-MM-DD format."""
    return datetime.strptime(date_str, '%Y-%m-%d').date()


def parse_decimal(value_str):
    """Parse decimal value."""
    if not value_str or value_str.strip() == '':
        return Decimal('0.00')
    return Decimal(value_str)


class Command(BaseCommand):
    help = 'Load transactions from ExtractedCSV blobs into the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Filename of a specific source file to load',
        )
        parser.add_argument(
            '--csv-id',
            type=int,
            help='ID of a specific ExtractedCSV to load',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Load all extracted CSVs that are in "extracted" status',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing transactions before loading',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force reload even if CSV is already loaded',
        )
        parser.add_argument(
            '--sync-accounts',
            action='store_true',
            help='Sync transaction bank_account_id from source_artifact.bank_account_id',
        )
        parser.add_argument(
            '--backfill-artifacts',
            action='store_true',
            help='Link existing transactions to their source artifacts',
        )
        parser.add_argument(
            '--fix-orphaned-matches',
            action='store_true',
            help='Fix CreditCardPaymentMatch records pointing to orphaned transactions',
        )

    def handle(self, *args, **options):
        filename = options.get('file')
        csv_id = options.get('csv_id')
        load_all = options.get('all')
        self.force = options.get('force', False)

        if options.get('fix_orphaned_matches'):
            self.fix_orphaned_matches()
            return

        if options.get('backfill_artifacts'):
            self.backfill_artifacts()
            return

        if options.get('sync_accounts'):
            self.sync_bank_accounts()
            return

        if options['clear']:
            deleted_count, _ = Transaction.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted {deleted_count} transactions'))
            # Reset all ExtractedCSV status to 'extracted'
            ExtractedCSV.objects.filter(status='loaded').update(
                status='extracted',
                loaded_at=None
            )

        if load_all:
            self.load_all_csvs()
            return

        if csv_id:
            try:
                extracted_csv = ExtractedCSV.objects.get(id=csv_id)
                self.load_csv(extracted_csv)
            except ExtractedCSV.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'ExtractedCSV with id {csv_id} not found'))
            return

        if filename:
            try:
                source_file = SourceFile.objects.get(filename=filename)
                # Get the latest non-superseded CSV
                extracted_csv = source_file.extracted_csvs.filter(
                    status__in=['extracted', 'loaded']
                ).order_by('-extracted_at').first()

                if not extracted_csv:
                    self.stderr.write(self.style.ERROR(
                        f'No extracted CSV found for {filename}. Extract the file first via the UI.'
                    ))
                    return

                self.load_csv(extracted_csv)
            except SourceFile.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'Source file {filename} not found'))
            return

        self.stderr.write(self.style.ERROR('Please specify --file, --csv-id, or --all'))

    def load_all_csvs(self):
        """Load all ExtractedCSVs that are in 'extracted' status."""
        if self.force:
            csvs_to_load = ExtractedCSV.objects.filter(
                status__in=['extracted', 'loaded']
            ).exclude(status='superseded')
        else:
            csvs_to_load = ExtractedCSV.objects.filter(status='extracted')

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
            f'Loaded {total_loaded} transactions from {files_processed} CSV blobs'
        ))

    def load_csv(self, extracted_csv):
        """
        Load transactions from an ExtractedCSV blob.

        Returns:
            int: Number of transactions loaded, -1 if skipped
        """
        source_file = extracted_csv.source_file

        # Find the ingestable artifact for this extraction
        ingestable_artifact = extracted_csv.artifacts.filter(
            artifact_type='ingestable_transactions'
        ).first()

        # Get bank_account from artifact (preferred) or fall back to extracted_csv
        if ingestable_artifact and ingestable_artifact.bank_account:
            bank_account = ingestable_artifact.bank_account
        else:
            bank_account = extracted_csv.bank_account

        # Check if already loaded
        if not self.force and extracted_csv.status == 'loaded':
            self.stdout.write(f'Skipping {source_file.filename} (already loaded)')
            return -1

        self.stdout.write(f'Loading transactions from {source_file.filename}')
        if bank_account:
            self.stdout.write(f'  Linking to account: {bank_account.nickname}')
        else:
            self.stdout.write(self.style.WARNING(f'  No bank account linked to extraction {extracted_csv.name}'))

        # Delete existing transactions from this extracted CSV before reloading
        if self.force:
            deleted_count = Transaction.objects.filter(extracted_csv=extracted_csv).delete()[0]
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
        category_counts = {}

        reader = csv.DictReader(io.StringIO(csv_string))
        for row_number, row in enumerate(reader, start=1):
            try:
                date = parse_date(row['date'])
                value_date = parse_date(row['value_date'])
                narration = row['narration']
                debit_amount = parse_decimal(row['debit_amount'])
                credit_amount = parse_decimal(row['credit_amount'])
                reference_number = row.get('reference_number', '')
                closing_balance = parse_decimal(row['closing_balance'])

                # Categorize transaction
                category = categorize_transaction(narration)

                # Always create new transaction (duplicates handled by inconsistencies page)
                Transaction.objects.create(
                    date=date,
                    value_date=value_date,
                    narration=narration,
                    debit_amount=debit_amount,
                    credit_amount=credit_amount,
                    reference_number=reference_number,
                    closing_balance=closing_balance,
                    category=category,
                    bank_account=bank_account,
                    source_file=source_file,
                    extracted_csv=extracted_csv,
                    source_artifact=ingestable_artifact,
                    row_number=row_number,
                )
                transactions_created += 1

                category_counts[category] = category_counts.get(category, 0) + 1

            except Exception as e:
                self.stderr.write(f'  Error parsing row: {e}')
                continue

        # Update ExtractedCSV status
        extracted_csv.status = 'loaded'
        extracted_csv.loaded_at = timezone.now()
        extracted_csv.save()

        # Update source file last_loaded_at and date range
        source_file.last_loaded_at = timezone.now()
        # Compute date range from all transactions in this file
        from django.db.models import Min, Max
        date_range = Transaction.objects.filter(source_file=source_file).aggregate(
            start=Min('date'), end=Max('date')
        )
        source_file.date_range_start = date_range['start']
        source_file.date_range_end = date_range['end']
        source_file.save(update_fields=['last_loaded_at', 'date_range_start', 'date_range_end'])

        # Create FileLoadLog entry
        if transactions_created > 0:
            FileLoadLog.objects.create(
                source_file=source_file,
                bank_account=bank_account,
                transaction_count=transactions_created,
                file_hash=extracted_csv.csv_hash,
                category_summary=category_counts,
                link_source='pre_existing' if bank_account else 'none',
            )

        self.stdout.write(self.style.SUCCESS(f'  Loaded {transactions_created} transactions'))
        return transactions_created

    def sync_bank_accounts(self):
        """Sync Transaction.bank_account_id from source_artifact.bank_account_id."""
        from django.db.models import F

        # Update transactions where bank_account doesn't match source_artifact's bank_account
        updated = Transaction.objects.filter(
            source_artifact__bank_account__isnull=False
        ).exclude(
            bank_account_id=F('source_artifact__bank_account_id')
        ).update(
            bank_account_id=F('source_artifact__bank_account_id')
        )

        self.stdout.write(self.style.SUCCESS(f'Synced bank_account for {updated} transactions'))

    def backfill_artifacts(self):
        """Link existing transactions to their source artifacts."""
        updated = 0
        for artifact in BankExtractionArtifact.objects.filter(artifact_type='ingestable_transactions'):
            count = Transaction.objects.filter(
                extracted_csv=artifact.extraction,
                source_artifact__isnull=True
            ).update(source_artifact=artifact)
            updated += count

        self.stdout.write(self.style.SUCCESS(f'Linked {updated} transactions to artifacts'))

    def fix_orphaned_matches(self):
        """Fix CreditCardPaymentMatch records pointing to orphaned transactions."""
        from dashboard.models import CreditCardPaymentMatch

        fixed = 0
        orphaned_matches = CreditCardPaymentMatch.objects.filter(
            bank_transaction__extracted_csv__isnull=True
        )
        total = orphaned_matches.count()
        self.stdout.write(f'Found {total} matches pointing to orphaned transactions')

        for match in orphaned_matches:
            orphan = match.bank_transaction
            # Find linked duplicate with matching attributes that has extracted_csv
            linked = Transaction.objects.filter(
                date=orphan.date,
                narration=orphan.narration,
                debit_amount=orphan.debit_amount,
                credit_amount=orphan.credit_amount,
                extracted_csv__isnull=False
            ).first()

            if linked:
                self.stdout.write(
                    f'  Updating match {match.id}: txn {orphan.id} -> {linked.id} '
                    f'({orphan.date} {orphan.narration[:40]}...)'
                )
                match.bank_transaction = linked
                match.save(update_fields=['bank_transaction'])
                fixed += 1
            else:
                self.stdout.write(self.style.WARNING(
                    f'  No linked duplicate found for match {match.id} '
                    f'(txn {orphan.id}: {orphan.date} {orphan.narration[:40]}...)'
                ))

        self.stdout.write(self.style.SUCCESS(f'Fixed {fixed} of {total} orphaned matches'))
