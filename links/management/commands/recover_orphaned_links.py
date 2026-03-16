"""
Recover links orphaned by resolved transaction deletion.

Links with resolved_transaction=NULL but origin_transaction_id set can be
re-attached to the origin transaction's current ResolvedTransaction (or a
newly created one).
"""
from django.core.management.base import BaseCommand
from django.db import IntegrityError, transaction

from links.models import CategoryLink, StoryLink, EntityLink, SelfTransferLink, CreditCardPaymentLink
from extractions.models import ResolvedTransaction
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction


def _get_or_create_rt(txn, txn_type):
    """Get existing RT for a transaction, or create a new one."""
    if txn.resolved_transaction_id:
        return txn.resolved_transaction_id

    if txn_type == 'bank':
        amount = txn.credit_amount - txn.debit_amount
        rt = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=amount,
            bank_account_id=txn.bank_account_id,
        )
    else:
        rt = ResolvedTransaction.objects.create(
            transaction_type='credit_card',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=txn.amount,
            credit_card_id=txn.credit_card_id,
        )

    txn.resolved_transaction = rt
    txn.is_primary = True
    txn.save()
    return rt.id


def _resolve_origin(origin_type, origin_id):
    """Look up origin transaction and return its RT id (creating if needed)."""
    if origin_type == 'bank':
        try:
            txn = BankTransaction.objects.get(id=origin_id)
        except BankTransaction.DoesNotExist:
            return None
        return _get_or_create_rt(txn, 'bank')
    elif origin_type == 'credit_card':
        try:
            txn = CreditCardTransaction.objects.get(id=origin_id)
        except CreditCardTransaction.DoesNotExist:
            return None
        return _get_or_create_rt(txn, 'credit_card')
    return None


class Command(BaseCommand):
    help = 'Recover orphaned links whose resolved_transaction was set to NULL'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show what would be recovered without making changes')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        stats = {'recovered': 0, 'skipped_no_origin': 0, 'skipped_txn_missing': 0, 'skipped_duplicate': 0}

        # CategoryLink, StoryLink, EntityLink
        for LinkModel, label in [
            (CategoryLink, 'CategoryLink'),
            (StoryLink, 'StoryLink'),
            (EntityLink, 'EntityLink'),
        ]:
            orphaned = LinkModel.objects.filter(
                resolved_transaction__isnull=True,
                origin_transaction_id__isnull=False,
            )
            for link in orphaned:
                if not link.origin_transaction_type:
                    stats['skipped_no_origin'] += 1
                    continue

                rt_id = _resolve_origin(link.origin_transaction_type, link.origin_transaction_id)
                if rt_id is None:
                    self.stdout.write(f"  {label} id={link.id}: origin txn {link.origin_transaction_type}:{link.origin_transaction_id} not found")
                    stats['skipped_txn_missing'] += 1
                    continue

                self.stdout.write(f"  {label} id={link.id}: -> RT {rt_id}")
                if not dry_run:
                    link.resolved_transaction_id = rt_id
                    try:
                        with transaction.atomic():
                            link.save()
                    except IntegrityError:
                        stats['skipped_duplicate'] += 1
                        self.stdout.write(f"    (duplicate, skipping)")
                        continue
                stats['recovered'] += 1

        # SelfTransferLink - recover each side independently
        orphaned_stl_a = SelfTransferLink.objects.filter(
            resolved_transaction_a__isnull=True,
            origin_transaction_id_a__isnull=False,
        )
        for stl in orphaned_stl_a:
            rt_id = _resolve_origin('bank', stl.origin_transaction_id_a)
            if rt_id is None:
                self.stdout.write(f"  SelfTransferLink id={stl.id} side_a: origin txn {stl.origin_transaction_id_a} not found")
                stats['skipped_txn_missing'] += 1
                continue
            self.stdout.write(f"  SelfTransferLink id={stl.id} side_a: -> RT {rt_id}")
            if not dry_run:
                stl.resolved_transaction_a_id = rt_id
                stl.save()
            stats['recovered'] += 1

        orphaned_stl_b = SelfTransferLink.objects.filter(
            resolved_transaction_b__isnull=True,
            origin_transaction_id_b__isnull=False,
        )
        for stl in orphaned_stl_b:
            rt_id = _resolve_origin('bank', stl.origin_transaction_id_b)
            if rt_id is None:
                self.stdout.write(f"  SelfTransferLink id={stl.id} side_b: origin txn {stl.origin_transaction_id_b} not found")
                stats['skipped_txn_missing'] += 1
                continue
            self.stdout.write(f"  SelfTransferLink id={stl.id} side_b: -> RT {rt_id}")
            if not dry_run:
                stl.resolved_transaction_b_id = rt_id
                stl.save()
            stats['recovered'] += 1

        # CreditCardPaymentLink - recover each side independently
        orphaned_cpl_bank = CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction__isnull=True,
            origin_bank_transaction_id__isnull=False,
        )
        for cpl in orphaned_cpl_bank:
            rt_id = _resolve_origin('bank', cpl.origin_bank_transaction_id)
            if rt_id is None:
                self.stdout.write(f"  CCPaymentLink id={cpl.id} bank_side: origin txn {cpl.origin_bank_transaction_id} not found")
                stats['skipped_txn_missing'] += 1
                continue
            self.stdout.write(f"  CCPaymentLink id={cpl.id} bank_side: -> RT {rt_id}")
            if not dry_run:
                cpl.bank_resolved_transaction_id = rt_id
                cpl.save()
            stats['recovered'] += 1

        orphaned_cpl_cc = CreditCardPaymentLink.objects.filter(
            cc_resolved_transaction__isnull=True,
            origin_cc_transaction_id__isnull=False,
        )
        for cpl in orphaned_cpl_cc:
            rt_id = _resolve_origin('credit_card', cpl.origin_cc_transaction_id)
            if rt_id is None:
                self.stdout.write(f"  CCPaymentLink id={cpl.id} cc_side: origin txn {cpl.origin_cc_transaction_id} not found")
                stats['skipped_txn_missing'] += 1
                continue
            self.stdout.write(f"  CCPaymentLink id={cpl.id} cc_side: -> RT {rt_id}")
            if not dry_run:
                cpl.cc_resolved_transaction_id = rt_id
                cpl.save()
            stats['recovered'] += 1

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(
            f"\n{prefix}Recovery complete: "
            f"{stats['recovered']} recovered, "
            f"{stats['skipped_no_origin']} skipped (no origin type), "
            f"{stats['skipped_txn_missing']} skipped (txn not found), "
            f"{stats['skipped_duplicate']} skipped (duplicate)"
        ))
