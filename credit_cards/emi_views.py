import json
import csv
import io
from decimal import Decimal
from django.http import JsonResponse
from rest_framework.decorators import api_view

from .models import CreditCard, CreditCardEMI, CreditCardTransaction
from .views import get_active_cc_transactions
from extractions.models import ExtractionArtifact, ResolvedTransaction
from extractions.extractors import decompress_data
from links.models import EMILink
from links.utils import ensure_resolved_transaction


def get_emi_stats(emi):
    """Compute stats from linked transactions by component type."""
    links = EMILink.objects.filter(emi=emi)
    rt_ids = list(links.values_list('resolved_transaction_id', flat=True))

    cc_txns = get_active_cc_transactions().filter(
        resolved_transaction_id__in=rt_ids, is_primary=True
    )

    # Build component type map
    component_map = {}
    installment_numbers = set()
    for link in links:
        component_map[link.resolved_transaction_id] = link.component_type
        if link.installment_number and link.component_type == 'principal':
            installment_numbers.add(link.installment_number)

    total_principal = Decimal('0')
    total_interest = Decimal('0')
    total_fees = Decimal('0')
    total_tax = Decimal('0')
    total_other = Decimal('0')
    transaction_count = 0

    for txn in cc_txns:
        component = component_map.get(txn.resolved_transaction_id, 'other')
        amount = txn.amount
        transaction_count += 1

        if component == 'principal':
            total_principal += amount
        elif component == 'interest':
            total_interest += amount
        elif component == 'processing_fee':
            total_fees += amount
        elif component == 'tax':
            total_tax += amount
        elif component in ('purchase', 'loan'):
            pass  # Original purchase/loan credit not counted in "paid" totals
        else:
            total_other += amount

    total_paid = total_principal + total_interest + total_fees + total_tax + total_other

    return {
        'transaction_count': transaction_count,
        'installments_paid': len(installment_numbers),
        'total_principal_paid': float(total_principal),
        'total_interest_paid': float(total_interest),
        'total_fees_paid': float(total_fees),
        'total_tax_paid': float(total_tax),
        'total_paid': float(total_paid),
    }


def serialize_emi(emi, include_stats=True):
    data = {
        'id': emi.id,
        'emi_id': emi.emi_id,
        'name': emi.name,
        'description': emi.description,
        'credit_card': {
            'id': emi.credit_card.id,
            'nickname': emi.credit_card.nickname,
            'card_number_mask': emi.credit_card.card_number_mask,
        } if emi.credit_card else None,
        'original_amount': float(emi.original_amount) if emi.original_amount else None,
        'num_installments': emi.num_installments,
        'monthly_installment': float(emi.monthly_installment) if emi.monthly_installment else None,
        'creation_date': str(emi.creation_date) if emi.creation_date else None,
        'finish_date': str(emi.finish_date) if emi.finish_date else None,
        'status': emi.status,
        'source_artifact_id': emi.source_artifact_id,
        'created_at': emi.created_at.isoformat() if emi.created_at else None,
        'updated_at': emi.updated_at.isoformat() if emi.updated_at else None,
    }
    if include_stats:
        data['stats'] = get_emi_stats(emi)
    return data


def get_emi_transactions(emi):
    """Get all transactions linked to an EMI with component info."""
    from links.utils import get_refund_links_for_rt_ids

    links = EMILink.objects.filter(emi=emi).select_related('resolved_transaction')
    rt_ids = list(links.values_list('resolved_transaction_id', flat=True))

    # Build link metadata map
    link_map = {}
    for link in links:
        link_map[link.resolved_transaction_id] = {
            'link_id': link.id,
            'component_type': link.component_type,
            'installment_number': link.installment_number,
            'tax_parent_link_id': link.tax_parent_link_id,
            'tax_rate': float(link.tax_rate) if link.tax_rate else None,
        }

    cc_txns = get_active_cc_transactions().filter(
        resolved_transaction_id__in=rt_ids, is_primary=True
    ).select_related('credit_card')

    refund_map = get_refund_links_for_rt_ids(rt_ids)

    transactions = []
    for txn in cc_txns:
        link_info = link_map.get(txn.resolved_transaction_id, {})
        transactions.append({
            'id': txn.id,
            'link_id': link_info.get('link_id'),
            'type': 'credit_card',
            'date': txn.date.isoformat(),
            'description': txn.description,
            'amount': float(txn.amount),
            'source': txn.credit_card.nickname if txn.credit_card else 'Unknown',
            'component_type': link_info.get('component_type', 'other'),
            'installment_number': link_info.get('installment_number'),
            'tax_parent_link_id': link_info.get('tax_parent_link_id'),
            'tax_rate': link_info.get('tax_rate'),
            'refund_link': refund_map.get(txn.resolved_transaction_id),
        })

    transactions.sort(key=lambda x: x['date'])
    return transactions


@api_view(['GET', 'POST'])
def emi_list(request):
    if request.method == 'GET':
        emis = CreditCardEMI.objects.select_related('credit_card').all()
        return JsonResponse({'emis': [serialize_emi(emi) for emi in emis]})

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

        credit_card = None
        if data.get('credit_card_id'):
            credit_card = CreditCard.objects.filter(id=data['credit_card_id']).first()

        source_artifact = None
        if data.get('source_artifact_id'):
            source_artifact = ExtractionArtifact.objects.filter(id=data['source_artifact_id']).first()

        emi = CreditCardEMI.objects.create(
            name=data.get('name', 'Untitled EMI'),
            description=data.get('description', ''),
            credit_card=credit_card,
            original_amount=data.get('original_amount'),
            num_installments=data.get('num_installments'),
            monthly_installment=data.get('monthly_installment'),
            creation_date=data.get('creation_date'),
            finish_date=data.get('finish_date'),
            status=data.get('status', 'active'),
            source_artifact=source_artifact,
        )
        return JsonResponse(serialize_emi(emi), status=201)


@api_view(['GET', 'PUT', 'DELETE'])
def emi_detail(request, emi_id):
    try:
        emi = CreditCardEMI.objects.select_related('credit_card').get(emi_id=emi_id)
    except CreditCardEMI.DoesNotExist:
        return JsonResponse({'error': 'EMI not found'}, status=404)

    if request.method == 'GET':
        data = serialize_emi(emi)
        data['transactions'] = get_emi_transactions(emi)
        return JsonResponse(data)

    elif request.method == 'PUT':
        try:
            body = json.loads(request.body)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

        if 'name' in body:
            emi.name = body['name']
        if 'description' in body:
            emi.description = body['description']
        if 'status' in body:
            emi.status = body['status']
        if 'original_amount' in body:
            emi.original_amount = body['original_amount']
        if 'num_installments' in body:
            emi.num_installments = body['num_installments']
        if 'monthly_installment' in body:
            emi.monthly_installment = body['monthly_installment']
        if 'creation_date' in body:
            emi.creation_date = body['creation_date']
        if 'finish_date' in body:
            emi.finish_date = body['finish_date']
        if 'credit_card_id' in body:
            emi.credit_card = CreditCard.objects.filter(id=body['credit_card_id']).first()

        emi.save()
        return JsonResponse(serialize_emi(emi))

    elif request.method == 'DELETE':
        emi.delete()
        return JsonResponse({'success': True})


@api_view(['POST', 'DELETE'])
def emi_transactions(request, emi_id):
    try:
        emi = CreditCardEMI.objects.get(emi_id=emi_id)
    except CreditCardEMI.DoesNotExist:
        return JsonResponse({'error': 'EMI not found'}, status=404)

    try:
        data = json.loads(request.body)
        transactions = data.get('transactions', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    if request.method == 'POST':
        added = 0
        for txn_data in transactions:
            txn_type = txn_data.get('type')
            txn_id = txn_data.get('id')
            component_type = txn_data.get('component_type', 'other')
            installment_number = txn_data.get('installment_number')

            if txn_type != 'credit_card' or not txn_id:
                continue

            txn = CreditCardTransaction.objects.filter(id=txn_id).first()
            if not txn:
                continue

            if not txn.resolved_transaction_id:
                ensure_resolved_transaction(txn, 'credit_card')

            existing_link = EMILink.objects.filter(
                resolved_transaction_id=txn.resolved_transaction_id,
            ).exclude(emi=emi).first()
            if existing_link:
                continue

            _, created = EMILink.objects.get_or_create(
                resolved_transaction_id=txn.resolved_transaction_id,
                emi=emi,
                defaults={
                    'component_type': component_type,
                    'installment_number': installment_number,
                    'origin_transaction_type': txn_type,
                    'origin_transaction_id': txn_id,
                },
            )
            if created:
                added += 1

        return JsonResponse({'success': True, 'added': added})

    elif request.method == 'DELETE':
        removed = 0
        for txn_data in transactions:
            txn_type = txn_data.get('type')
            txn_id = txn_data.get('id')

            if txn_type != 'credit_card' or not txn_id:
                continue

            txn = CreditCardTransaction.objects.filter(id=txn_id).first()
            if txn and txn.resolved_transaction_id:
                deleted, _ = EMILink.objects.filter(
                    resolved_transaction_id=txn.resolved_transaction_id,
                    emi=emi,
                ).delete()
                removed += deleted

        return JsonResponse({'success': True, 'removed': removed})


@api_view(['PATCH'])
def emi_link_update(request, emi_id, link_id):
    try:
        emi = CreditCardEMI.objects.get(emi_id=emi_id)
    except CreditCardEMI.DoesNotExist:
        return JsonResponse({'error': 'EMI not found'}, status=404)

    try:
        link = EMILink.objects.get(id=link_id, emi=emi)
    except EMILink.DoesNotExist:
        return JsonResponse({'error': 'Link not found'}, status=404)

    try:
        data = json.loads(request.body)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    if 'component_type' in data:
        valid_types = {c[0] for c in EMILink.COMPONENT_TYPE_CHOICES}
        if data['component_type'] not in valid_types:
            return JsonResponse({'error': f"Invalid component_type: {data['component_type']}"}, status=400)
        link.component_type = data['component_type']
    if 'installment_number' in data:
        link.installment_number = data['installment_number']
    if 'tax_parent_link_id' in data:
        parent_id = data['tax_parent_link_id']
        if parent_id:
            parent = EMILink.objects.filter(id=parent_id, emi=emi).first()
            link.tax_parent_link = parent
        else:
            link.tax_parent_link = None
    if 'tax_rate' in data:
        link.tax_rate = data['tax_rate']

    link.save()
    return JsonResponse({
        'link_id': link.id,
        'component_type': link.component_type,
        'installment_number': link.installment_number,
        'tax_parent_link_id': link.tax_parent_link_id,
        'tax_rate': float(link.tax_rate) if link.tax_rate else None,
    })


@api_view(['POST'])
def transaction_emis(request):
    """Get EMIs linked to a batch of transactions."""
    try:
        data = json.loads(request.body)
        transactions = data.get('transactions', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    cc_ids = [t['id'] for t in transactions if t.get('type') == 'credit_card' and t.get('id')]

    rt_map = dict(
        CreditCardTransaction.objects.filter(id__in=cc_ids)
        .values_list('id', 'resolved_transaction_id')
    )

    rt_ids = [rt for rt in rt_map.values() if rt]
    emi_links = EMILink.objects.filter(
        resolved_transaction_id__in=rt_ids
    ).select_related('emi')

    rt_to_emis = {}
    for el in emi_links:
        rt_to_emis.setdefault(el.resolved_transaction_id, []).append({
            'emi_id': el.emi.emi_id,
            'name': el.emi.name,
        })

    result = {}
    for txn_id in cc_ids:
        rt_id = rt_map.get(txn_id)
        result[f"credit_card:{txn_id}"] = rt_to_emis.get(rt_id, [])

    return JsonResponse({'transaction_emis': result})


@api_view(['GET'])
def emi_suggestions(request):
    """Get EMI suggestions from extraction artifacts not yet linked to an EMI record."""
    emi_artifacts = ExtractionArtifact.objects.filter(
        artifact_type='emi',
        row_count__gt=0,
    ).select_related('extraction__source_file')

    # Build map of existing EMIs by key fields for matching
    existing_emi_map = {}
    for emi in CreditCardEMI.objects.all():
        if emi.original_amount and emi.creation_date:
            key = (emi.original_amount.normalize(), str(emi.creation_date), emi.num_installments)
            existing_emi_map[key] = {'emi_id': emi.emi_id, 'name': emi.name}
    existing_emi_keys = set(existing_emi_map.keys())

    # First pass: collect all rows and determine linkage per row via existing_emi_map
    linked_dedup_keys = {}  # dedup_key -> {'emi_id', 'name'}
    all_rows = []  # (dedup_key, artifact, filename, card_mask, row)

    for artifact in emi_artifacts:
        try:
            content = decompress_data(artifact.content)
            reader = csv.DictReader(io.StringIO(content))

            source_file = artifact.extraction.source_file
            filename = source_file.filename
            card_mask = filename.split('_')[0] if '_' in filename else ''

            for row in reader:
                creation_date = row.get('creation_date', '')
                emi_amount = row.get('emi_amount', '0')
                dedup_key = (card_mask, emi_amount, creation_date)
                all_rows.append((dedup_key, artifact, filename, card_mask, row))

                if dedup_key not in linked_dedup_keys and creation_date and emi_amount:
                    num_installments = int(row['num_installments']) if row.get('num_installments') else None
                    emi_key = (Decimal(emi_amount).normalize(), creation_date, num_installments)
                    if emi_key in existing_emi_keys:
                        linked_dedup_keys[dedup_key] = existing_emi_map[emi_key]
        except Exception:
            continue

    # Second pass: deduplicate and build suggestions
    suggestions = []
    seen = set()

    for dedup_key, artifact, filename, card_mask, row in all_rows:
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        linked_emi = linked_dedup_keys.get(dedup_key)
        suggestions.append({
            'artifact_id': artifact.id,
            'source_file': filename,
            'card_number_mask': card_mask,
            'loan_type': row.get('loan_type', ''),
            'creation_date': row.get('creation_date', '') or None,
            'finish_date': row.get('finish_date', '') or None,
            'num_installments': int(row['num_installments']) if row.get('num_installments') else None,
            'emi_amount': float(row['emi_amount']) if row.get('emi_amount') else None,
            'pending_installments': int(row['pending_installments']) if row.get('pending_installments') else None,
            'outstanding_amount': float(row['outstanding_amount']) if row.get('outstanding_amount') else None,
            'monthly_installment': float(row['monthly_installment']) if row.get('monthly_installment') else None,
            'already_linked': linked_emi is not None,
            'linked_emi_id': linked_emi['emi_id'] if linked_emi else None,
            'linked_emi_name': linked_emi['name'] if linked_emi else None,
        })

    suggestions.sort(key=lambda s: s['creation_date'] or '', reverse=True)
    return JsonResponse({'suggestions': suggestions})
