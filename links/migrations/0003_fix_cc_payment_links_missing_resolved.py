# Fix CC payment matches that were created without resolved transactions,
# causing them to be invisible in the UI (no CreditCardPaymentLink created).

from django.db import migrations


def fix_cc_payment_links(apps, schema_editor):
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    CreditCardTransaction = apps.get_model('credit_cards', 'CreditCardTransaction')
    CreditCardPaymentMatch = apps.get_model('credit_cards', 'CreditCardPaymentMatch')
    CreditCardPaymentLink = apps.get_model('links', 'CreditCardPaymentLink')
    ResolvedTransaction = apps.get_model('extractions', 'ResolvedTransaction')

    matches = CreditCardPaymentMatch.objects.filter(is_active=True).select_related(
        'bank_transaction', 'credit_card_transaction',
    )

    for match in matches:
        bank_txn = match.bank_transaction
        cc_txn = match.credit_card_transaction
        if not bank_txn or not cc_txn:
            continue

        # Ensure bank txn has a resolved transaction
        if not bank_txn.resolved_transaction_id:
            rt = ResolvedTransaction.objects.create(
                transaction_type='bank',
                primary_transaction_id=bank_txn.id,
                date=bank_txn.date,
                amount=(bank_txn.credit_amount or 0) - (bank_txn.debit_amount or 0),
                bank_account_id=bank_txn.bank_account_id,
            )
            bank_txn.resolved_transaction_id = rt.id
            bank_txn.is_primary = True
            BankTransaction.objects.filter(id=bank_txn.id).update(
                resolved_transaction_id=rt.id, is_primary=True,
            )

        # Ensure cc txn has a resolved transaction
        if not cc_txn.resolved_transaction_id:
            rt = ResolvedTransaction.objects.create(
                transaction_type='credit_card',
                primary_transaction_id=cc_txn.id,
                date=cc_txn.date,
                amount=cc_txn.amount,
                credit_card_id=cc_txn.credit_card_id,
            )
            cc_txn.resolved_transaction_id = rt.id
            cc_txn.is_primary = True
            CreditCardTransaction.objects.filter(id=cc_txn.id).update(
                resolved_transaction_id=rt.id, is_primary=True,
            )

        # Create or reactivate the durable link
        existing = CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction_id=bank_txn.resolved_transaction_id,
            cc_resolved_transaction_id=cc_txn.resolved_transaction_id,
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                existing.offset = match.offset
                existing.confidence_score = match.confidence_score
                existing.match_reasons = match.match_reasons or []
                existing.origin_bank_transaction_id = bank_txn.id
                existing.origin_cc_transaction_id = cc_txn.id
                existing.save()
        else:
            CreditCardPaymentLink.objects.create(
                bank_resolved_transaction_id=bank_txn.resolved_transaction_id,
                cc_resolved_transaction_id=cc_txn.resolved_transaction_id,
                offset=match.offset,
                confidence_score=match.confidence_score,
                match_reasons=match.match_reasons or [],
                origin_bank_transaction_id=bank_txn.id,
                origin_cc_transaction_id=cc_txn.id,
                is_active=True,
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('bank_accounts', '0003_add_transaction_resolution'),
        ('credit_cards', '0003_add_transaction_resolution'),
        ('extractions', '0003_ensure_resolved_for_all_transactions'),
        ('links', '0002_migrate_existing_links'),
    ]

    operations = [
        migrations.RunPython(fix_cc_payment_links, noop, atomic=False),
    ]
