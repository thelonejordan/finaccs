"""
Backfill ResolvedTransaction for all BankTransaction and CreditCardTransaction
rows that have resolved_transaction_id=NULL.

Use when migration extractions.0003_ensure_resolved_for_all_transactions fails
with lock timeout (e.g. MySQL 1205). Run with no other DB traffic, then:

  uv run python manage.py migrate extractions 0003 --fake
  uv run python manage.py migrate

Or run this command instead of the migration for the same effect (then --fake the migration).
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Backfill ResolvedTransaction for txns with null resolved_transaction (batch, low lock)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch',
            type=int,
            default=20,
            help='Batch size (default 20). Use smaller if you still see lock timeouts.',
        )

    def handle(self, *args, **options):
        batch_size = options['batch']
        from bank_accounts.models import BankTransaction
        from credit_cards.models import CreditCardTransaction
        from extractions.models import ResolvedTransaction

        bank_done = 0
        while True:
            txns = list(
                BankTransaction.objects.filter(resolved_transaction__isnull=True)[:batch_size]
            )
            if not txns:
                break
            resolved_list = [
                ResolvedTransaction(
                    transaction_type='bank',
                    primary_transaction_id=txn.id,
                    date=txn.date,
                    amount=(txn.credit_amount or 0) - (txn.debit_amount or 0),
                    bank_account=txn.bank_account,
                    credit_card=None,
                )
                for txn in txns
            ]
            ResolvedTransaction.objects.bulk_create(resolved_list)
            for i, txn in enumerate(txns):
                txn.resolved_transaction_id = resolved_list[i].id
                txn.is_primary = True
            BankTransaction.objects.bulk_update(txns, ['resolved_transaction_id', 'is_primary'])
            bank_done += len(txns)
            self.stdout.write(f"Bank backfill: {bank_done} rows")

        cc_done = 0
        while True:
            txns = list(
                CreditCardTransaction.objects.filter(resolved_transaction__isnull=True)[:batch_size]
            )
            if not txns:
                break
            resolved_list = [
                ResolvedTransaction(
                    transaction_type='credit_card',
                    primary_transaction_id=txn.id,
                    date=txn.date,
                    amount=txn.amount,
                    bank_account=None,
                    credit_card=txn.credit_card,
                )
                for txn in txns
            ]
            ResolvedTransaction.objects.bulk_create(resolved_list)
            for i, txn in enumerate(txns):
                txn.resolved_transaction_id = resolved_list[i].id
                txn.is_primary = True
            CreditCardTransaction.objects.bulk_update(txns, ['resolved_transaction_id', 'is_primary'])
            cc_done += len(txns)
            self.stdout.write(f"CC backfill: {cc_done} rows")

        self.stdout.write(self.style.SUCCESS(f"Done. Bank: {bank_done}, CC: {cc_done}"))
