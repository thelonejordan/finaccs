"""
Management command to transform extracted PDF artifacts to ingestable format.

Uses the pluggable transformer registry to transform artifacts based on their
declared transformer_name.

Usage:
    # Transform all extracted extractions (dry run)
    uv run python manage.py transform_pdf_extractions --all --dry-run

    # Transform all extracted extractions
    uv run python manage.py transform_pdf_extractions --all

    # Transform a specific extraction
    uv run python manage.py transform_pdf_extractions --extraction-id 5

    # Re-transform already transformed extractions
    uv run python manage.py transform_pdf_extractions --all --force
"""
from django.core.management.base import BaseCommand, CommandError

from credit_cards.models import CreditCardPDFExtraction, ExtractionArtifact
from credit_cards.transformers import transform_artifact, TRANSFORMERS


class Command(BaseCommand):
    help = 'Transform extracted PDF artifacts to ingestable format using the transformer registry'

    def add_arguments(self, parser):
        parser.add_argument(
            '--extraction-id',
            type=int,
            help='Transform a specific extraction by ID'
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Transform all extracted (untransformed) extractions'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-transform already transformed extractions'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be transformed without making changes'
        )
        parser.add_argument(
            '--list-transformers',
            action='store_true',
            help='List available transformers and exit'
        )

    def handle(self, *args, **options):
        # List transformers mode
        if options.get('list_transformers'):
            self.stdout.write('Available transformers:')
            for name, cls in TRANSFORMERS.items():
                self.stdout.write(f'  - {name} (v{cls.version})')
            return

        extraction_id = options.get('extraction_id')
        transform_all = options.get('all')
        force = options.get('force')
        dry_run = options.get('dry_run')

        if not extraction_id and not transform_all:
            raise CommandError(
                'Please specify either --extraction-id or --all'
            )

        if extraction_id and transform_all:
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
            ).exclude(status__in=['superseded', 'loaded', 'loading'])

            if not force:
                # Only get extracted (not yet transformed) extractions
                extractions = extractions.filter(status='extracted')

            extractions = list(extractions.select_related('source_file', 'credit_card').prefetch_related('artifacts'))

        if not extractions:
            self.stdout.write(self.style.WARNING('No extractions to process'))
            return

        self.stdout.write(f'Found {len(extractions)} extraction(s) to process')
        self.stdout.write('')

        total_transformed = 0
        total_rows = 0
        errors = []

        for ext in extractions:
            txn_artifact = ext.transactions_artifact
            row_count = txn_artifact.row_count if txn_artifact else 0

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

            if not txn_artifact:
                self.stdout.write(
                    self.style.WARNING('       No transactions artifact, skipping')
                )
                continue

            if not txn_artifact.is_transformable:
                self.stdout.write(
                    self.style.WARNING('       Artifact not marked as transformable, skipping')
                )
                continue

            transformer_name = txn_artifact.transformer_name
            if not transformer_name:
                self.stdout.write(
                    self.style.WARNING('       No transformer_name set, skipping')
                )
                continue

            if transformer_name not in TRANSFORMERS:
                self.stdout.write(
                    self.style.ERROR(f'       Unknown transformer: {transformer_name}')
                )
                continue

            self.stdout.write(f'       Transformer: {transformer_name}')

            if dry_run:
                if ext.status == 'transformed':
                    self.stdout.write(
                        self.style.WARNING('       Would re-transform')
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS(f'       Would transform {row_count} rows')
                    )
                continue

            # Process extraction
            try:
                # Skip if already transformed and not force
                if ext.status == 'transformed' and not force:
                    self.stdout.write(
                        self.style.WARNING('       Already transformed, skipping (use --force to re-transform)')
                    )
                    continue

                # If force, delete existing transformed artifacts first
                if force:
                    ExtractionArtifact.objects.filter(
                        extraction=ext,
                        is_transformed=True
                    ).delete()

                # Transform using the registry
                transformed = transform_artifact(txn_artifact)
                if transformed:
                    ext.status = 'transformed'
                    ext.save()
                    total_transformed += 1
                    total_rows += row_count

                    self.stdout.write(
                        self.style.SUCCESS(f'       Transformed {row_count} rows -> {transformed.artifact_type}')
                    )
                else:
                    self.stdout.write(
                        self.style.ERROR('       Transformation returned no result')
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
                    f'Transformed {total_rows} rows from {total_transformed} extraction(s)'
                )
            )

        if errors:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(f'{len(errors)} error(s):'))
            for ext_id, error in errors:
                self.stdout.write(self.style.ERROR(f'  [{ext_id}] {error}'))
