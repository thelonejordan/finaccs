from django.db import transaction


def get_refund_links_for_rt_ids(rt_ids):
    """Return a map of resolved_transaction_id -> refund_link_info for a batch of rt_ids.

    Each value is: {'id': link_id, 'role': 'original'|'refund', 'other_transaction': {...}}
    """
    from links.models import RefundLink
    from dashboard.views import _serialize_any_txn, _get_txn_by_type

    if not rt_ids:
        return {}

    result = {}
    rt_id_set = set(rt_ids)

    # Fetch all refund links where these rt_ids appear as either original or refund
    links = RefundLink.objects.filter(
        original_resolved_transaction_id__in=rt_id_set
    ).select_related('refund_resolved_transaction')
    for rl in links:
        rt_id = rl.original_resolved_transaction_id
        if rt_id in result:
            continue
        other_rt = rl.refund_resolved_transaction
        if other_rt:
            other_txn = _get_txn_by_type(other_rt.primary_transaction_id, other_rt.transaction_type)
            if other_txn:
                result[rt_id] = {
                    'id': rl.id,
                    'role': 'original',
                    'other_transaction': _serialize_any_txn(other_txn, other_rt.transaction_type),
                }

    links = RefundLink.objects.filter(
        refund_resolved_transaction_id__in=rt_id_set
    ).select_related('original_resolved_transaction')
    for rl in links:
        rt_id = rl.refund_resolved_transaction_id
        if rt_id in result:
            continue
        other_rt = rl.original_resolved_transaction
        if other_rt:
            other_txn = _get_txn_by_type(other_rt.primary_transaction_id, other_rt.transaction_type)
            if other_txn:
                result[rt_id] = {
                    'id': rl.id,
                    'role': 'refund',
                    'other_transaction': _serialize_any_txn(other_txn, other_rt.transaction_type),
                }

    return result


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
