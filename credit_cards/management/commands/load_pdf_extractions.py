"""
Management command to load transactions from transformed PDF extraction artifacts.

Requires extractions to be in 'transformed' status (run transform_pdf_extractions first).

Usage:
    # Load all transformed extractions (dry run)
    uv run python manage.py load_pdf_extractions --all --dry-run

    # Load all transformed extractions
    uv run python manage.py load_pdf_extractions --all

    # Load a specific extraction
    uv run python manage.py load_pdf_extractions --extraction-id 5

    # Reload already loaded extractions (will unload first)
    uv run python manage.py load_pdf_extractions --all --force
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from credit_cards.models import CreditCardPDFExtraction, CreditCardTransaction
from credit_cards.pdf_extractor import load_transactions_from_extraction


class Command(BaseCommand):
    help = 'Load transactions from PDF extraction artifacts'

    def add_arguments(self, parser):
        parser.add_argument(
            '--extraction-id',
            type=int,
            help='Load a specific extraction by ID'
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Load all unloaded extractions'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Reload already loaded extractions (unloads first)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be loaded without making changes'
        )

    def handle(self, *args, **options):
        extraction_id = options.get('extraction_id')
        load_all = options.get('all')
        force = options.get('force')
        dry_run = options.get('dry_run')

        if not extraction_id and not load_all:
            raise CommandError(
                'Please specify either --extraction-id or --all'
            )

        if extraction_id and load_all:
            raise CommandError(
                'Cannot use both --extraction-id and --all'
            )

        # Build queryset of extractions to process
        if extraction_id:
            try:
                extractions = [CreditCardPDFExtraction.objects.get(id=extraction_id)]
            except CreditCardPDFExtraction.DoesNotExist:
                raise CommandError(f'Extraction with ID {extraction_id} not found')
        else:
            # Get all non-hidden extractions
            extractions = CreditCardPDFExtraction.objects.filter(
                hidden=False
            ).exclude(status='superseded')

            if not force:
                # Only get transformed (ready to load) extractions
                extractions = extractions.filter(status='transformed')

            extractions = list(extractions.select_related('source_file', 'credit_card'))

        if not extractions:
            self.stdout.write(self.style.WARNING('No extractions to process'))
            return

        self.stdout.write(f'Found {len(extractions)} extraction(s) to process')
        self.stdout.write('')

        total_loaded = 0
        total_transactions = 0
        errors = []

        for ext in extractions:
            # Use ingestable artifact if available, otherwise raw transactions
            artifact = ext.ingestable_artifact or ext.transactions_artifact
            row_count = artifact.row_count if artifact else 0

            # Build display info
            card_info = f' -> {ext.credit_card.nickname}' if ext.credit_card else ''
            period_info = ''
            if ext.statement_period_begin and ext.statement_period_end:
                period_info = f' ({ext.statement_period_begin} to {ext.statement_period_end})'
            elif ext.statement_date:
                period_info = f' (stmt: {ext.statement_date})'

            self.stdout.write(
                f'  [{ext.id}] {ext.source_file.filename}{card_info}{period_info}'
            )
            self.stdout.write(f'       Status: {ext.status}, Rows: {row_count}')

            if dry_run:
                if ext.status == 'loaded':
                    self.stdout.write(
                        self.style.WARNING(f'       Would unload and reload')
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS(f'       Would load {row_count} transactions')
                    )
                continue

            # Process extraction
            try:
                # Unload if already loaded and force is set
                if ext.status == 'loaded' and force:
                    deleted_count, _ = CreditCardTransaction.objects.filter(
                        pdf_extraction=ext
                    ).delete()
                    ext.status = 'transformed'  # Reset to transformed, keep ingestable artifact
                    ext.loaded_at = None
                    ext.save()
                    self.stdout.write(
                        self.style.WARNING(f'       Unloaded {deleted_count} transactions')
                    )

                # Skip if already loaded and not force
                if ext.status == 'loaded':
                    self.stdout.write(
                        self.style.WARNING('       Already loaded, skipping (use --force to reload)')
                    )
                    continue

                # Load transactions
                ext.status = 'loading'
                ext.save()

                transactions = load_transactions_from_extraction(ext)
                total_loaded += 1
                total_transactions += len(transactions)

                self.stdout.write(
                    self.style.SUCCESS(f'       Loaded {len(transactions)} transactions')
                )

            except Exception as e:
                ext.status = 'error'
                ext.error_message = str(e)
                ext.save()
                errors.append((ext.id, str(e)))
                self.stdout.write(
                    self.style.ERROR(f'       Error: {e}')
                )

            self.stdout.write('')

        # Summary
        self.stdout.write('')
        self.stdout.write('=' * 50)

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes made'))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Loaded {total_transactions} transactions from {total_loaded} extraction(s)'
                )
            )

        if errors:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(f'{len(errors)} error(s):'))
            for ext_id, error in errors:
                self.stdout.write(self.style.ERROR(f'  [{ext_id}] {error}'))
