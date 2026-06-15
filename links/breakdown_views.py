import json
from decimal import Decimal
from django.db import transaction as db_transaction
from django.http import JsonResponse
from rest_framework.decorators import api_view

from .models import Breakdown, BreakdownPart
from .utils import ensure_resolved_transaction
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction
from dashboard.views import get_active_transactions
from credit_cards.views import get_active_cc_transactions


def _get_transaction_info(breakdown):
    """Get the linked transaction's details."""
    rt = breakdown.resolved_transaction
    if not rt:
        return None

    if rt.transaction_type == 'bank':
        txn = get_active_transactions().filter(
            resolved_transaction_id=rt.id, is_primary=True
        ).select_related('bank_account').first()
        if txn:
            return {
                'id': txn.id,
                'type': 'bank',
                'date': txn.date.isoformat(),
                'description': txn.narration,
                'amount': float(txn.debit_amount) - float(txn.credit_amount),
                'source': txn.bank_account.nickname if txn.bank_account else 'Unknown',
            }
    elif rt.transaction_type == 'credit_card':
        txn = get_active_cc_transactions().filter(
            resolved_transaction_id=rt.id, is_primary=True
        ).select_related('credit_card').first()
        if txn:
            return {
                'id': txn.id,
                'type': 'credit_card',
                'date': txn.date.isoformat(),
                'description': txn.description,
                'amount': float(txn.amount),
                'source': txn.credit_card.nickname if txn.credit_card else 'Unknown',
            }
    return None


def _get_breakdown_stats(breakdown):
    parts = list(breakdown.parts.all())
    txn_info = _get_transaction_info(breakdown)
    transaction_amount = abs(txn_info['amount']) if txn_info else 0
    parts_sum = float(sum(p.amount for p in parts))
    return {
        'parts_count': len(parts),
        'parts_sum': parts_sum,
        'transaction_amount': transaction_amount,
        'is_valid': abs(parts_sum - transaction_amount) <= 0.01 if txn_info else False,
    }


def _serialize_part(part):
    return {
        'id': part.id,
        'label': part.label,
        'amount': float(part.amount),
        'rate': float(part.rate) if part.rate is not None else None,
        'rate_reference_id': part.rate_reference_id,
        'order': part.order,
    }


def _serialize_breakdown(breakdown, include_parts=False):
    data = {
        'id': breakdown.id,
        'breakdown_id': breakdown.breakdown_id,
        'name': breakdown.name,
        'description': breakdown.description,
        'transaction': _get_transaction_info(breakdown),
        'stats': _get_breakdown_stats(breakdown),
        'created_at': breakdown.created_at.isoformat() if breakdown.created_at else None,
        'updated_at': breakdown.updated_at.isoformat() if breakdown.updated_at else None,
    }
    if include_parts:
        data['parts'] = [_serialize_part(p) for p in breakdown.parts.all()]
    return data


def _compute_validations(breakdown):
    parts = list(breakdown.parts.all())
    txn_info = _get_transaction_info(breakdown)
    if not txn_info:
        return []

    results = []
    transaction_amount = abs(txn_info['amount'])
    parts_sum = float(sum(p.amount for p in parts))

    diff = abs(parts_sum - transaction_amount)
    if diff <= 0.01:
        results.append({
            'label': 'Parts sum = Transaction',
            'status': 'pass',
            'detail': f'{parts_sum:.2f} = {transaction_amount:.2f}',
        })
    else:
        results.append({
            'label': 'Parts sum != Transaction',
            'status': 'error',
            'detail': f'{parts_sum:.2f} vs {transaction_amount:.2f} (diff {diff:.2f})',
        })

    part_map = {p.id: p for p in parts}
    for part in parts:
        if part.rate is not None:
            if part.rate_reference_id and part.rate_reference_id in part_map:
                ref = part_map[part.rate_reference_id]
                ref_amount = float(ref.amount)
                ref_label = ref.label
            else:
                ref_amount = transaction_amount
                ref_label = 'total'
            expected = ref_amount * float(part.rate) / 100
            rate_diff = abs(float(part.amount) - expected)
            if rate_diff <= 0.015:
                results.append({
                    'label': f'{part.label} = {float(part.rate)}% of {ref_label}',
                    'status': 'pass',
                    'detail': f'{float(part.amount):.2f} = {expected:.2f}',
                })
            else:
                results.append({
                    'label': f'{part.label} != {float(part.rate)}% of {ref_label}',
                    'status': 'warn',
                    'detail': f'{float(part.amount):.2f} vs {expected:.2f} (diff {rate_diff:.2f})',
                })

    return results


@api_view(['GET', 'POST'])
def breakdown_list(request):
    if request.method == 'GET':
        breakdowns = Breakdown.objects.all()
        return JsonResponse({
            'breakdowns': [_serialize_breakdown(b) for b in breakdowns]
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

        txn_type = data.get('transaction_type')
        txn_id = data.get('transaction_id')
        if not txn_type or not txn_id:
            return JsonResponse({'error': 'transaction_type and transaction_id are required'}, status=400)

        if txn_type == 'bank':
            txn = BankTransaction.objects.filter(id=txn_id).first()
        elif txn_type == 'credit_card':
            txn = CreditCardTransaction.objects.filter(id=txn_id).first()
        else:
            return JsonResponse({'error': 'Invalid transaction_type'}, status=400)

        if not txn:
            return JsonResponse({'error': 'Transaction not found'}, status=404)

        # Default name from transaction description if not provided
        name = data.get('name', '').strip()
        if not name:
            name = (getattr(txn, 'narration', None) or getattr(txn, 'description', None) or 'Breakdown')[:200]

        rt_id = ensure_resolved_transaction(txn, txn_type)

        if Breakdown.objects.filter(resolved_transaction_id=rt_id).exists():
            return JsonResponse({'error': 'A breakdown already exists for this transaction'}, status=409)

        with db_transaction.atomic():
            breakdown = Breakdown.objects.create(
                name=name,
                description=data.get('description', ''),
                resolved_transaction_id=rt_id,
                origin_transaction_type=txn_type,
                origin_transaction_id=txn_id,
            )

            parts_data = data.get('parts', [])
            created_parts = []
            for i, part_data in enumerate(parts_data):
                part = BreakdownPart.objects.create(
                    breakdown=breakdown,
                    label=part_data.get('label', f'Part {i+1}'),
                    amount=Decimal(str(part_data.get('amount', 0))),
                    rate=Decimal(str(part_data['rate'])) if part_data.get('rate') is not None else None,
                    order=part_data.get('order', i),
                )
                created_parts.append(part)

            # Resolve rate references by order
            for i, part_data in enumerate(parts_data):
                ref_order = part_data.get('rate_reference_order')
                if ref_order is not None:
                    ref_part = next((p for p in created_parts if p.order == ref_order), None)
                    if ref_part and ref_part.id != created_parts[i].id:
                        created_parts[i].rate_reference = ref_part
                        created_parts[i].save(update_fields=['rate_reference'])

        return JsonResponse(_serialize_breakdown(breakdown, include_parts=True), status=201)


@api_view(['GET', 'PUT', 'DELETE'])
def breakdown_detail(request, breakdown_id):
    try:
        breakdown = Breakdown.objects.get(breakdown_id=breakdown_id)
    except Breakdown.DoesNotExist:
        return JsonResponse({'error': 'Breakdown not found'}, status=404)

    if request.method == 'GET':
        data = _serialize_breakdown(breakdown, include_parts=True)
        data['validations'] = _compute_validations(breakdown)
        return JsonResponse(data)

    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

        if 'name' in data:
            breakdown.name = data['name']
        if 'description' in data:
            breakdown.description = data['description']
        breakdown.save()
        return JsonResponse(_serialize_breakdown(breakdown, include_parts=True))

    elif request.method == 'DELETE':
        breakdown.delete()
        return JsonResponse({'success': True})


@api_view(['POST'])
def breakdown_parts(request, breakdown_id):
    """Bulk replace all parts for a breakdown."""
    try:
        breakdown = Breakdown.objects.get(breakdown_id=breakdown_id)
    except Breakdown.DoesNotExist:
        return JsonResponse({'error': 'Breakdown not found'}, status=404)

    try:
        data = json.loads(request.body)
        parts_data = data.get('parts', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    with db_transaction.atomic():
        breakdown.parts.all().delete()

        created_parts = []
        for i, part_data in enumerate(parts_data):
            part = BreakdownPart.objects.create(
                breakdown=breakdown,
                label=part_data.get('label', f'Part {i+1}'),
                amount=Decimal(str(part_data.get('amount', 0))),
                rate=Decimal(str(part_data['rate'])) if part_data.get('rate') is not None else None,
                order=part_data.get('order', i),
            )
            created_parts.append(part)

        # Resolve rate references by order
        for i, part_data in enumerate(parts_data):
            ref_order = part_data.get('rate_reference_order')
            if ref_order is not None:
                ref_part = next((p for p in created_parts if p.order == ref_order), None)
                if ref_part and ref_part.id != created_parts[i].id:
                    created_parts[i].rate_reference = ref_part
                    created_parts[i].save(update_fields=['rate_reference'])

    breakdown.save()  # touch updated_at
    data = _serialize_breakdown(breakdown, include_parts=True)
    data['validations'] = _compute_validations(breakdown)
    return JsonResponse(data)


@api_view(['DELETE'])
def breakdown_part_delete(request, breakdown_id, part_id):
    try:
        breakdown = Breakdown.objects.get(breakdown_id=breakdown_id)
    except Breakdown.DoesNotExist:
        return JsonResponse({'error': 'Breakdown not found'}, status=404)

    deleted, _ = BreakdownPart.objects.filter(breakdown=breakdown, id=part_id).delete()
    if not deleted:
        return JsonResponse({'error': 'Part not found'}, status=404)

    breakdown.save()  # touch updated_at
    return JsonResponse({'success': True})


@api_view(['POST'])
def transaction_breakdowns(request):
    """Batch lookup: which transactions have breakdowns."""
    try:
        data = json.loads(request.body)
        transactions = data.get('transactions', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    result = {}
    for txn in transactions:
        txn_type = txn.get('type')
        txn_id = txn.get('id')
        if txn_type in ('bank', 'credit_card') and txn_id:
            key = f"{txn_type}:{txn_id}"
            rt_id = None
            if txn_type == 'bank':
                rt_id = BankTransaction.objects.filter(id=txn_id).values_list(
                    'resolved_transaction_id', flat=True
                ).first()
            elif txn_type == 'credit_card':
                rt_id = CreditCardTransaction.objects.filter(id=txn_id).values_list(
                    'resolved_transaction_id', flat=True
                ).first()

            breakdown_info = None
            if rt_id:
                breakdown = Breakdown.objects.filter(resolved_transaction_id=rt_id).first()
                if breakdown:
                    breakdown_info = {
                        'breakdown_id': breakdown.breakdown_id,
                        'name': breakdown.name,
                    }
            result[key] = breakdown_info

    return JsonResponse({'transaction_breakdowns': result})
