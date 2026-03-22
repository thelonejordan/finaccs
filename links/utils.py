from django.db import transaction


def ensure_resolved_transaction(txn, txn_type):
    """Get or create a ResolvedTransaction for a transaction.

    Returns the resolved_transaction_id (existing or newly created).
    """
    if txn.resolved_transaction_id:
        return txn.resolved_transaction_id
    from extractions.models import ResolvedTransaction
    with transaction.atomic():
        if txn_type == 'bank':
            rt = ResolvedTransaction.objects.create(
                transaction_type='bank', primary_transaction_id=txn.id,
                date=txn.date, amount=(txn.credit_amount or 0) - (txn.debit_amount or 0),
                bank_account_id=txn.bank_account_id,
            )
        else:
            rt = ResolvedTransaction.objects.create(
                transaction_type='credit_card', primary_transaction_id=txn.id,
                date=txn.date, amount=txn.amount, credit_card_id=txn.credit_card_id,
            )
        txn.resolved_transaction_id = rt.id
        txn.is_primary = True
        txn.save(update_fields=['resolved_transaction_id', 'is_primary'])
    return rt.id
