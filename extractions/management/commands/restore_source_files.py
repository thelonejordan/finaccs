"""
Restore source files from the database to disk.

The SourceFile model stores gzip-compressed file content in the file_data field.
This command decompresses and writes the files back to their original file_path,
verifying SHA-256 hash and file size after restoration.

Usage:
  uv run python manage.py restore_source_files --dry-run
  uv run python manage.py restore_source_files --domain bank_account
  uv run python manage.py restore_source_files --domain credit_card
  uv run python manage.py restore_source_files --id sf_a1b2c3d4
  uv run python manage.py restore_source_files --force
"""
import gzip
import hashlib
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Restore source files from the database (file_data) to disk."

    def add_arguments(self, parser):
        parser.add_argument(
            '--domain',
            choices=['bank_account', 'credit_card'],
            help='Restore only files of this domain.',
        )
        parser.add_argument(
            '--id',
            dest='source_file_id',
            help='Restore a single file by source_file_id (e.g. sf_a1b2c3d4).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be restored without writing files.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite files that already exist on disk.',
        )

    def _hash_file(self, path):
        """Compute SHA-256 of a file using chunked reads."""
        h = hashlib.sha256()
        with path.open('rb') as fh:
            for chunk in iter(lambda: fh.read(8192), b''):
                h.update(chunk)
        return h.hexdigest()

    def handle(self, *args, **options):
        from extractions.models import SourceFile

        base_dir = Path(settings.BASE_DIR).resolve()

        queryset = SourceFile.objects.all()

        if options['source_file_id']:
            queryset = queryset.filter(source_file_id=options['source_file_id'])
        elif options['domain']:
            queryset = queryset.filter(domain=options['domain'])

        queryset = queryset.order_by('filename')

        dry_run = options['dry_run']
        force = options['force']

        restored = 0
        verified = 0
        skipped_no_data = 0
        errors = 0

        for sf in queryset.iterator():
            label = f"{sf.source_file_id} ({sf.filename})"
            file_path = Path(sf.file_path).resolve()

            # Path traversal check
            if not file_path.is_relative_to(base_dir):
                self.stdout.write(self.style.ERROR(
                    f"  REFUSED (path outside project): {label} -> {sf.file_path}"
                ))
                errors += 1
                continue

            if not sf.file_data:
                self.stdout.write(f"  SKIP (no data): {label}")
                skipped_no_data += 1
                continue

            # File already exists on disk — verify hash (skip if --force)
            if file_path.exists() and not force:
                if not sf.file_hash:
                    self.stdout.write(self.style.WARNING(
                        f"  NO HASH (cannot verify): {label}"
                    ))
                    verified += 1
                    continue
                disk_hash = self._hash_file(file_path)
                if disk_hash != sf.file_hash:
                    self.stdout.write(self.style.ERROR(
                        f"  HASH MISMATCH (disk): {label} expected={sf.file_hash[:16]}... got={disk_hash[:16]}..."
                    ))
                    errors += 1
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f"  VERIFIED:       {label}"
                    ))
                    verified += 1
                continue

            if dry_run:
                self.stdout.write(f"  WOULD RESTORE:  {label} -> {sf.file_path}")
                restored += 1
                continue

            try:
                raw_bytes = gzip.decompress(sf.file_data)
            except (gzip.BadGzipFile, OSError, EOFError):
                self.stdout.write(self.style.WARNING(
                    f"  NOT GZIP (using raw): {label}"
                ))
                raw_bytes = sf.file_data

            actual_hash = hashlib.sha256(raw_bytes).hexdigest()
            if sf.file_hash:
                if actual_hash != sf.file_hash:
                    self.stdout.write(self.style.ERROR(
                        f"  HASH MISMATCH (db):   {label} expected={sf.file_hash[:16]}... got={actual_hash[:16]}..."
                    ))
                    errors += 1
                    continue
            else:
                self.stdout.write(self.style.WARNING(
                    f"  NO HASH (cannot verify): {label}"
                ))

            if sf.file_size is not None and sf.file_size > 0 and len(raw_bytes) != sf.file_size:
                self.stdout.write(self.style.ERROR(
                    f"  SIZE MISMATCH:  {label} expected={sf.file_size} got={len(raw_bytes)}"
                ))
                errors += 1
                continue

            try:
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with file_path.open('wb') as f:
                    f.write(raw_bytes)
            except OSError as exc:
                self.stdout.write(self.style.ERROR(
                    f"  WRITE FAILED:   {label} -> {exc}"
                ))
                errors += 1
                continue

            self.stdout.write(self.style.SUCCESS(
                f"  RESTORED:       {label} ({len(raw_bytes)} bytes)"
            ))
            restored += 1

        self.stdout.write("")
        if dry_run:
            self.stdout.write(f"Dry run summary: would_restore={restored}, verified={verified}, "
                              f"skipped_no_data={skipped_no_data}, errors={errors}")
        else:
            self.stdout.write(f"Summary: restored={restored}, verified={verified}, "
                              f"skipped_no_data={skipped_no_data}, errors={errors}")
