"""
Migrate legacy CSV credit card files to the new PDF extraction flow.

This command:
1. Finds CSV files in credit_cards/data/
2. Extracts transactions using the existing SBI extractor
3. Creates CreditCardPDFExtraction records (for unified handling)
4. Creates ExtractionArtifact with the standardized CSV
5. Runs transformation to create ingestable artifacts
6. Marks extractions as 'transformed' (ready to load)

Usage:
    python manage.py migrate_csv_to_extractions --all
    python manage.py migrate_csv_to_extractions --file FY24-25-6004.csv
    python manage.py migrate_csv_to_extractions --all --dry-run
"""
import gzip
import hashlib
import re
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import transaction

from credit_cards.models import (
    CreditCardSourceFile,
    CreditCardPDFExtraction,
    ExtractionArtifact,
)
from credit_cards.extractors import extract_sbi_credit_card_csv
from credit_cards.transformers import transform_artifact


def compress_data(data_str):
    """Compress string data with gzip."""
    return gzip.compress(data_str.encode('utf-8'))


def compute_hash(data_str):
    """Compute SHA-256 hash of string data."""
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


def count_csv_rows(csv_string):
    """Count data rows in CSV string (excluding header)."""
    lines = csv_string.strip().split('\n')
    return max(0, len(lines) - 1)


def parse_date_range_from_csv(csv_string):
    """Parse date range from CSV data.

    Returns (start_date, end_date) or (None, None) if parsing fails.
    """
    lines = csv_string.strip().split('\n')
    if len(lines) < 2:
        return None, None

    dates = []
    for line in lines[1:]:  # Skip header
        if not line.strip():
            continue
        # First column is date in YYYY-MM-DD format
        parts = line.split(',')
        if parts and parts[0]:
            try:
                date = datetime.strptime(parts[0], '%Y-%m-%d').date()
                dates.append(date)
            except ValueError:
                continue

    if not dates:
        return None, None

    return min(dates), max(dates)


def parse_fiscal_year_from_filename(filename):
    """Parse fiscal year info from filename like FY24-25-6004.csv.

    Returns (period_start, period_end) or (None, None) if parsing fails.
    """
    # Match patterns like FY24-25, FY2024-25, FY2022-23
    match = re.match(r'FY(\d{2,4})-(\d{2})', filename)
    if not match:
        return None, None

    start_year = match.group(1)
    end_year = match.group(2)

    # Normalize to 4-digit years
    if len(start_year) == 2:
        start_year = '20' + start_year
    if len(end_year) == 2:
        # Determine century based on start year
        century = start_year[:2]
        end_year = century + end_year

    try:
        # FY runs April to March
        period_start = datetime.strptime(f'{start_year}-04-01', '%Y-%m-%d').date()
        period_end = datetime.strptime(f'{end_year}-03-31', '%Y-%m-%d').date()
        return period_start, period_end
    except ValueError:
        return None, None


class Command(BaseCommand):
    help = 'Migrate legacy CSV credit card files to the new extraction flow'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Specific CSV filename to migrate (e.g., FY24-25-6004.csv)',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Migrate all CSV files from credit_cards/data/',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without making changes',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force migration even if extraction already exists',
        )

    def handle(self, *args, **options):
        self.dry_run = options.get('dry_run', False)
        self.force = options.get('force', False)

        if self.dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes will be made'))

        file_name = options.get('file')
        migrate_all = options.get('all')

        if migrate_all:
            self.migrate_all_csvs()
        elif file_name:
            self.migrate_csv(file_name)
        else:
            self.stderr.write(self.style.ERROR('Please specify --file or --all'))

    def migrate_all_csvs(self):
        """Migrate all CSV files from credit_cards/data/"""
        data_dir = Path(settings.BASE_DIR) / 'credit_cards' / 'data'
        csv_files = sorted([f for f in data_dir.iterdir() if f.suffix.lower() == '.csv'])

        if not csv_files:
            self.stderr.write(self.style.ERROR('No CSV files found in credit_cards/data/'))
            return

        self.stdout.write(f'Found {len(csv_files)} CSV files to migrate')

        migrated = 0
        skipped = 0
        errors = 0

        for csv_path in csv_files:
            result = self.migrate_csv(csv_path.name)
            if result == 'migrated':
                migrated += 1
            elif result == 'skipped':
                skipped += 1
            else:
                errors += 1

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Migration complete: {migrated} migrated, {skipped} skipped, {errors} errors'
        ))

    def migrate_csv(self, filename):
        """Migrate a single CSV file to extraction flow.

        Returns: 'migrated', 'skipped', or 'error'
        """
        data_dir = Path(settings.BASE_DIR) / 'credit_cards' / 'data'
        file_path = data_dir / filename

        if not file_path.exists():
            self.stderr.write(self.style.ERROR(f'File not found: {filename}'))
            return 'error'

        self.stdout.write(f'\nMigrating {filename}...')

        # Get or create source file
        source_file, created = CreditCardSourceFile.objects.get_or_create(
            filename=filename,
            defaults={'mime_type': 'text/csv'}
        )

        if created:
            self.stdout.write(f'  Created CreditCardSourceFile')
        else:
            self.stdout.write(f'  Using existing CreditCardSourceFile (id={source_file.id})')

        # Check if extraction already exists for this source file
        existing_extraction = CreditCardPDFExtraction.objects.filter(
            source_file=source_file,
            hidden=False,
        ).exclude(status='superseded').first()

        if existing_extraction and not self.force:
            self.stdout.write(self.style.WARNING(
                f'  Skipping - extraction already exists: {existing_extraction.name}'
            ))
            return 'skipped'

        # Extract transactions using existing extractor
        try:
            csv_string = extract_sbi_credit_card_csv(file_path)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'  Extraction failed: {e}'))
            return 'error'

        row_count = count_csv_rows(csv_string)
        self.stdout.write(f'  Extracted {row_count} transactions')

        if row_count == 0:
            self.stderr.write(self.style.WARNING(f'  No transactions found'))
            return 'error'

        # Parse date range from CSV data
        csv_start, csv_end = parse_date_range_from_csv(csv_string)
        fy_start, fy_end = parse_fiscal_year_from_filename(filename)

        # Use CSV dates if available, fall back to FY dates
        period_start = csv_start or fy_start
        period_end = csv_end or fy_end

        self.stdout.write(f'  Period: {period_start} to {period_end}')

        if self.dry_run:
            self.stdout.write(self.style.SUCCESS(f'  Would create extraction with {row_count} rows'))
            return 'migrated'

        # Create extraction and artifacts in a transaction
        with transaction.atomic():
            # Mark existing extraction as superseded if forcing
            if existing_extraction and self.force:
                existing_extraction.status = 'superseded'
                existing_extraction.save()
                self.stdout.write(f'  Superseded existing extraction: {existing_extraction.name}')

            # Create PDF extraction (used for both PDF and CSV now)
            extraction = CreditCardPDFExtraction.objects.create(
                source_file=source_file,
                credit_card=source_file.credit_card,
                statement_period_begin=period_start,
                statement_period_end=period_end,
                extractor_version='csv_migration_1.0',
                status='extracted',
            )
            self.stdout.write(f'  Created extraction: {extraction.name}')

            # Create transactions artifact
            artifact = ExtractionArtifact.objects.create(
                extraction=extraction,
                artifact_type='transactions',
                content_type='csv',
                data=compress_data(csv_string),
                data_hash=compute_hash(csv_string),
                row_count=row_count,
                transformer_name='legacy_cc_transactions',
                is_transformable=True,
            )
            self.stdout.write(f'  Created artifact: {artifact.artifact_id}')

            # Transform to ingestable format
            try:
                ingestable = transform_artifact(artifact)
                if ingestable:
                    self.stdout.write(f'  Created ingestable artifact: {ingestable.artifact_id}')
                    extraction.status = 'transformed'
                    extraction.save()
                    self.stdout.write(self.style.SUCCESS(f'  Migration complete - ready to load'))
                else:
                    self.stderr.write(self.style.WARNING(f'  Transformation returned None'))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f'  Transformation failed: {e}'))
                extraction.status = 'error'
                extraction.error_message = str(e)
                extraction.save()
                return 'error'

        return 'migrated'
