"""
Extract credit card transactions from statement files to standardized CSV blobs.

This is the first phase of the two-phase workflow:
1. Extract: Original file blob → Standardized CSV blob (this command)
2. Load: CSV blob → Transaction records (load_credit_card_transactions command)
"""
import gzip
import hashlib
import mimetypes
from pathlib import Path

from django.core.management.base import BaseCommand
from django.conf import settings

from credit_cards.models import CreditCardSourceFile, CreditCardExtractedCSV
from credit_cards.extractors import get_extractor, detect_extractor


def compute_file_hash(file_path):
    """Compute SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def compute_data_hash(data):
    """Compute SHA-256 hash of bytes data."""
    return hashlib.sha256(data).hexdigest()


def count_csv_rows(csv_string):
    """Count data rows in CSV string (excluding header)."""
    lines = csv_string.strip().split('\n')
    return max(0, len(lines) - 1)  # Subtract header row


def get_mime_type(file_path):
    """Get MIME type for a file."""
    mime_type, _ = mimetypes.guess_type(str(file_path))
    return mime_type or 'application/octet-stream'


class Command(BaseCommand):
    help = 'Extract credit card transactions from statement files to standardized CSV blobs'

    def add_arguments(self, parser):
        parser.add_argument(
            '--file',
            type=str,
            help='Path to a specific CSV file to extract',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Extract all files from credit_cards/data/',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force re-extraction even if file hash matches',
        )
        parser.add_argument(
            '--store-original',
            action='store_true',
            default=True,
            help='Store original file as compressed blob (default: True)',
        )

    def handle(self, *args, **options):
        file_path = options.get('file')
        extract_all = options.get('all')
        self.force = options.get('force', False)
        self.store_original = options.get('store_original', True)

        # Sync source files from disk
        self.sync_source_files()

        if extract_all:
            self.extract_all_files()
            return

        if file_path:
            file_path = Path(file_path)
            if not file_path.exists():
                self.stderr.write(self.style.ERROR(f'File not found: {file_path}'))
                return
            self.extract_file(file_path)
        else:
            self.stderr.write(self.style.ERROR('Please specify --file or --all'))

    def sync_source_files(self):
        """Sync CreditCardSourceFile model with CSV files in data directory."""
        data_dir = Path(settings.BASE_DIR) / 'credit_cards' / 'data'
        if not data_dir.exists():
            return

        for f in data_dir.iterdir():
            if f.suffix.lower() == '.csv':
                CreditCardSourceFile.objects.get_or_create(filename=f.name)

    def extract_all_files(self):
        """Extract all credit card CSV files from credit_cards/data/"""
        data_dir = Path(settings.BASE_DIR) / 'credit_cards' / 'data'
        csv_files = [f for f in data_dir.iterdir() if f.suffix.lower() == '.csv']

        if not csv_files:
            self.stderr.write(self.style.ERROR('No CSV files found in credit_cards/data/'))
            return

        total_extracted = 0
        files_processed = 0
        files_skipped = 0

        for file_path in sorted(csv_files):
            result = self.extract_file(file_path)
            if result > 0:
                total_extracted += result
                files_processed += 1
            elif result == 0:
                files_processed += 1
            else:
                files_skipped += 1

        self.stdout.write(self.style.SUCCESS(
            f'Extracted {total_extracted} rows from {files_processed} files'
            + (f' (skipped {files_skipped} unchanged)' if files_skipped else '')
        ))

    def extract_file(self, file_path):
        """
        Extract transactions from a single file.

        Returns:
            int: Number of rows extracted, 0 if error, -1 if skipped
        """
        file_path = Path(file_path)
        filename = file_path.name

        # Find or create the source file record
        source_file, _ = CreditCardSourceFile.objects.get_or_create(filename=filename)

        # Compute file hash
        current_hash = compute_file_hash(file_path)

        # Check if file has changed
        if not self.force and source_file.file_hash == current_hash:
            # Check if we already have an extracted CSV for this hash
            existing_csv = source_file.extracted_csvs.filter(
                status__in=['extracted', 'loaded']
            ).first()
            if existing_csv:
                self.stdout.write(f'Skipping {filename} (unchanged)')
                return -1

        self.stdout.write(f'Extracting credit card transactions from {file_path}')

        # Determine extractor
        extractor_name = detect_extractor(file_path)
        if not extractor_name:
            self.stderr.write(self.style.ERROR(f'  Could not determine extractor for {filename}'))
            return 0

        extractor_func = get_extractor(extractor_name)
        if not extractor_func:
            self.stderr.write(self.style.ERROR(f'  Unknown extractor: {extractor_name}'))
            return 0

        self.stdout.write(f'  Using extractor: {extractor_name}')

        # Extract to CSV
        try:
            csv_string = extractor_func(file_path)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'  Extraction failed: {e}'))
            return 0

        # Count rows
        row_count = count_csv_rows(csv_string)
        self.stdout.write(f'  Extracted {row_count} transactions')

        if row_count == 0:
            self.stderr.write(self.style.WARNING(f'  No transactions found in {filename}'))
            return 0

        # Compress CSV data
        csv_bytes = csv_string.encode('utf-8')
        compressed_csv = gzip.compress(csv_bytes)
        csv_hash = compute_data_hash(csv_bytes)

        # Mark any existing extracted CSVs as superseded
        source_file.extracted_csvs.filter(
            status__in=['extracted', 'loaded']
        ).update(status='superseded')

        # Create new CreditCardExtractedCSV record
        extracted_csv = CreditCardExtractedCSV.objects.create(
            source_file=source_file,
            csv_data=compressed_csv,
            csv_hash=csv_hash,
            row_count=row_count,
            extractor_version='1.0',
            status='extracted',
        )

        # Store original file blob if requested
        if self.store_original:
            with open(file_path, 'rb') as f:
                original_data = f.read()

            source_file.file_data = gzip.compress(original_data)
            source_file.file_size = len(original_data)
            source_file.mime_type = get_mime_type(file_path)

        # Update source file hash
        source_file.file_hash = current_hash
        source_file.save()

        self.stdout.write(self.style.SUCCESS(
            f'  Created CreditCardExtractedCSV #{extracted_csv.id} with {row_count} rows'
        ))
        return row_count
