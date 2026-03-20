"""
Delete orphaned ResolvedTransaction rows that are not referenced by any
BankTransaction or CreditCardTransaction.

Usage:
  uv run python manage.py cleanup_orphaned_resolved_transactions
  uv run python manage.py cleanup_orphaned_resolved_transactions --dry-run
"""
from django.core.management.base import BaseCommand
from django.db.models import Min, Max


class Command(BaseCommand):
    help = "Delete orphaned ResolvedTransaction rows not referenced by any transaction."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be deleted without making changes.',
        )
        parser.add_argument(
            '--batch',
            type=int,
            default=10000,
            help='ID range per batch (default 10000).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        batch_size = options['batch']

        from bank_accounts.models import BankTransaction
        from credit_cards.models import CreditCardTransaction
        from extractions.models import ResolvedTransaction

        self.stdout.write("Collecting referenced RT ids...")
        self.stdout.flush()

        referenced = set(
            BankTransaction.objects.exclude(resolved_transaction__isnull=True)
            .values_list('resolved_transaction_id', flat=True)
        )
        referenced.update(
            CreditCardTransaction.objects.exclude(resolved_transaction__isnull=True)
            .values_list('resolved_transaction_id', flat=True)
        )
        self.stdout.write(f"Referenced RTs: {len(referenced)}")

        agg = ResolvedTransaction.objects.aggregate(min_id=Min('id'), max_id=Max('id'))
        min_id = agg['min_id']
        max_id = agg['max_id']
        if min_id is None:
            self.stdout.write("No ResolvedTransactions found.")
            return

        self.stdout.write(f"RT id range: {min_id} - {max_id}")

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry run: no deletions performed."))
            return

        total_deleted = 0
        cursor = min_id
        while cursor <= max_id:
            chunk_end = cursor + batch_size
            deleted, _ = (
                ResolvedTransaction.objects
                .filter(id__gte=cursor, id__lt=chunk_end)
                .exclude(id__in=referenced)
                .delete()
            )
            total_deleted += deleted
            self.stdout.write(f"id {cursor}-{chunk_end}: deleted {deleted} (total: {total_deleted})")
            self.stdout.flush()
            cursor = chunk_end

        self.stdout.write(self.style.SUCCESS(f"Done. Deleted {total_deleted} orphaned RTs."))
