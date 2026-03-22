import json
from django.http import JsonResponse
from rest_framework.decorators import api_view

# Conditional import for API docs (dev only)
try:
    from drf_spectacular.utils import extend_schema, OpenApiExample
    from drf_spectacular.types import OpenApiTypes
except ImportError:
    def extend_schema(*args, **kwargs):
        def decorator(func):
            return func
        return decorator

    class _MockCallable:
        QUERY = 'query'
        PATH = 'path'
        def __init__(self, *args, **kwargs):
            pass

    OpenApiExample = _MockCallable
    OpenApiTypes = type('OpenApiTypes', (), {'OBJECT': object, 'INT': int, 'STR': str, 'BOOL': bool})()

from .models import Entity
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction
from extractions.models import ResolvedTransaction
from links.models import EntityLink, CategoryLink
from dashboard.views import get_active_transactions
from credit_cards.views import get_active_cc_transactions


def get_entity_stats(entity):
    """Get transaction stats for an entity."""
    rt_ids = list(EntityLink.objects.filter(entity=entity).values_list('resolved_transaction_id', flat=True))
    resolved_txns = ResolvedTransaction.objects.filter(id__in=rt_ids)

    total_spent = 0
    min_date = None
    max_date = None
    transaction_count = 0

    # Get bank transactions via resolved transactions
    bank_rt_ids = list(resolved_txns.filter(transaction_type='bank').values_list('id', flat=True))
    if bank_rt_ids:
        bank_txns = get_active_transactions().filter(resolved_transaction_id__in=bank_rt_ids, is_primary=True)
        for txn in bank_txns:
            total_spent += float(txn.debit_amount) - float(txn.credit_amount)
            transaction_count += 1
            if min_date is None or txn.date < min_date:
                min_date = txn.date
            if max_date is None or txn.date > max_date:
                max_date = txn.date

    # Get CC transactions via resolved transactions
    cc_rt_ids = list(resolved_txns.filter(transaction_type='credit_card').values_list('id', flat=True))
    if cc_rt_ids:
        cc_txns = get_active_cc_transactions().filter(resolved_transaction_id__in=cc_rt_ids, is_primary=True)
        for txn in cc_txns:
            total_spent += float(txn.amount)
            transaction_count += 1
            if min_date is None or txn.date < min_date:
                min_date = txn.date
            if max_date is None or txn.date > max_date:
                max_date = txn.date

    return {
        'transaction_count': transaction_count,
        'total_spent': round(total_spent, 2),
        'min_date': min_date.isoformat() if min_date else None,
        'max_date': max_date.isoformat() if max_date else None,
    }


def serialize_entity(entity, include_stats=True):
    """Serialize an Entity object to dict."""
    data = {
        'id': entity.id,
        'entity_id': entity.entity_id,
        'name': entity.name,
        'description': entity.description,
        'icon': entity.icon,
        'entity_type': entity.entity_type,
        'created_at': entity.created_at.isoformat() if entity.created_at else None,
        'updated_at': entity.updated_at.isoformat() if entity.updated_at else None,
    }
    if include_stats:
        data.update(get_entity_stats(entity))
    return data


def _build_category_map(resolved_transaction_ids):
    """Build a map of resolved_transaction_id -> category from CategoryLinks (latest wins)."""
    category_map = {}
    for link in CategoryLink.objects.filter(
        resolved_transaction_id__in=resolved_transaction_ids
    ).order_by('created_at'):
        category_map[link.resolved_transaction_id] = link.category
    return category_map


def get_entity_transactions(entity):
    """Get all transactions for an entity with full details."""
    rt_ids = list(EntityLink.objects.filter(entity=entity).values_list('resolved_transaction_id', flat=True))
    resolved_txns = ResolvedTransaction.objects.filter(id__in=rt_ids)
    transactions = []

    bank_rt_ids = list(resolved_txns.filter(transaction_type='bank').values_list('id', flat=True))
    cc_rt_ids = list(resolved_txns.filter(transaction_type='credit_card').values_list('id', flat=True))
    category_map = _build_category_map(rt_ids)

    # Get bank transactions
    if bank_rt_ids:
        bank_txns = get_active_transactions().filter(
            resolved_transaction_id__in=bank_rt_ids, is_primary=True
        ).select_related('bank_account', 'resolved_transaction')
        for txn in bank_txns:
            category = category_map.get(txn.resolved_transaction_id) if txn.resolved_transaction_id else txn.category
            transactions.append({
                'id': txn.id,
                'type': 'bank',
                'date': txn.date.isoformat(),
                'description': txn.narration,
                'amount': float(txn.debit_amount) - float(txn.credit_amount),
                'category': category,
                'source': txn.bank_account.nickname if txn.bank_account else 'Unknown',
            })

    # Get CC transactions
    if cc_rt_ids:
        cc_txns = get_active_cc_transactions().filter(
            resolved_transaction_id__in=cc_rt_ids, is_primary=True
        ).select_related('credit_card', 'resolved_transaction')
        for txn in cc_txns:
            category = category_map.get(txn.resolved_transaction_id) if txn.resolved_transaction_id else txn.category
            transactions.append({
                'id': txn.id,
                'type': 'credit_card',
                'date': txn.date.isoformat(),
                'description': txn.description,
                'amount': float(txn.amount),
                'category': category,
                'source': txn.credit_card.nickname if txn.credit_card else 'Unknown',
            })

    # Sort by date descending
    transactions.sort(key=lambda x: x['date'], reverse=True)
    return transactions


@extend_schema(
    methods=['GET'],
    operation_id='entities_list',
    summary="List entities",
    description="Get all entities with their transaction statistics.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Entities List',
            value={
                'entities': [{
                    'id': 1,
                    'entity_id': 'entity_abc12345',
                    'name': 'John Doe',
                    'description': 'Friend from work',
                    'icon': '👤',
                    'entity_type': 'person',
                    'transaction_count': 15,
                    'total_spent': 25000.0,
                    'min_date': '2024-01-01',
                    'max_date': '2024-03-15',
                    'created_at': '2024-01-01T10:30:00Z',
                    'updated_at': '2024-03-15T18:00:00Z',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Entities'],
)
@extend_schema(
    methods=['POST'],
    summary="Create entity",
    description="Create a new entity.",
    request=OpenApiTypes.OBJECT,
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Create Entity',
            value={
                'name': 'John Doe',
                'description': 'Friend from work',
                'icon': '👤',
                'entity_type': 'person',
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def entity_list(request):
    if request.method == "GET":
        entities_data = [serialize_entity(entity) for entity in Entity.objects.all()]
        return JsonResponse({'entities': entities_data})

    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            entity_type = data.get('entity_type', 'person')
            # Set default icon based on entity type
            default_icon = '👤' if entity_type == 'person' else '🏢'
            entity = Entity.objects.create(
                name=data.get('name', 'Untitled Entity'),
                description=data.get('description', ''),
                icon=data.get('icon', default_icon),
                entity_type=entity_type,
            )
            return JsonResponse(serialize_entity(entity), status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='entities_detail',
    summary="Get entity details",
    description="Get details of a specific entity including all its transactions.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Entity Detail',
            value={
                'id': 1,
                'entity_id': 'entity_abc12345',
                'name': 'John Doe',
                'description': 'Friend from work',
                'icon': '👤',
                'entity_type': 'person',
                'transaction_count': 15,
                'total_spent': 25000.0,
                'min_date': '2024-01-01',
                'max_date': '2024-03-15',
                'transactions': [{
                    'id': 123,
                    'type': 'credit_card',
                    'date': '2024-03-05',
                    'description': 'Lunch with John',
                    'amount': 500.0,
                    'category': 'Food',
                    'source': 'HDFC Credit Card',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Entities'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update entity",
    description="Update entity name, description, icon, or type.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Update Entity',
            value={'name': 'John Smith', 'icon': '👨'},
            request_only=True,
        ),
    ],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete entity",
    description="Delete an entity and all its transaction associations.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Delete Success',
            value={'success': True},
            response_only=True,
        ),
    ],
    tags=['Entities'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def entity_detail(request, entity_id):
    try:
        entity = Entity.objects.get(entity_id=entity_id)
    except Entity.DoesNotExist:
        return JsonResponse({'error': 'Entity not found'}, status=404)

    if request.method == "GET":
        data = serialize_entity(entity)
        data['transactions'] = get_entity_transactions(entity)
        return JsonResponse(data)

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            if 'name' in data:
                entity.name = data['name']
            if 'description' in data:
                entity.description = data['description']
            if 'icon' in data:
                entity.icon = data['icon']
            if 'entity_type' in data:
                entity.entity_type = data['entity_type']
            entity.save()
            return JsonResponse(serialize_entity(entity))
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        entity.delete()
        return JsonResponse({'success': True})


@extend_schema(
    methods=['POST'],
    operation_id='entity_add_transactions',
    summary="Add transactions to entity",
    description="Add one or more transactions to an entity.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Add Transactions',
            value={
                'transactions': [
                    {'type': 'bank', 'id': 123},
                    {'type': 'credit_card', 'id': 456},
                ]
            },
            request_only=True,
        ),
        OpenApiExample(
            'Add Success',
            value={'success': True, 'added': 2},
            response_only=True,
        ),
    ],
)
@extend_schema(
    methods=['DELETE'],
    operation_id='entity_remove_transactions',
    summary="Remove transactions from entity",
    description="Remove one or more transactions from an entity.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Remove Transactions',
            value={
                'transactions': [
                    {'type': 'bank', 'id': 123},
                ]
            },
            request_only=True,
        ),
        OpenApiExample(
            'Remove Success',
            value={'success': True, 'removed': 1},
            response_only=True,
        ),
    ],
)
@api_view(['POST', 'DELETE'])
def entity_transactions(request, entity_id):
    try:
        entity = Entity.objects.get(entity_id=entity_id)
    except Entity.DoesNotExist:
        return JsonResponse({'error': 'Entity not found'}, status=404)

    try:
        data = json.loads(request.body)
        transactions = data.get('transactions', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    if request.method == "POST":
        added = 0
        for txn in transactions:
            txn_type = txn.get('type')
            txn_id = txn.get('id')
            if txn_type in ('bank', 'credit_card') and txn_id:
                if txn_type == 'bank':
                    t = BankTransaction.objects.filter(id=txn_id).first()
                else:
                    t = CreditCardTransaction.objects.filter(id=txn_id).first()
                if not t:
                    continue
                if not t.resolved_transaction_id:
                    from links.utils import ensure_resolved_transaction
                    ensure_resolved_transaction(t, txn_type)
                _, created = EntityLink.objects.get_or_create(
                    resolved_transaction_id=t.resolved_transaction_id,
                    entity=entity,
                    defaults={'origin_transaction_type': txn_type, 'origin_transaction_id': txn_id},
                )
                if created:
                    added += 1
        return JsonResponse({'success': True, 'added': added})

    elif request.method == "DELETE":
        removed = 0
        for txn in transactions:
            txn_type = txn.get('type')
            txn_id = txn.get('id')
            if txn_type in ('bank', 'credit_card') and txn_id:
                if txn_type == 'bank':
                    t = BankTransaction.objects.filter(id=txn_id).first()
                else:
                    t = CreditCardTransaction.objects.filter(id=txn_id).first()
                if t and t.resolved_transaction_id:
                    deleted, _ = EntityLink.objects.filter(
                        resolved_transaction_id=t.resolved_transaction_id,
                        entity=entity,
                    ).delete()
                    removed += deleted
        return JsonResponse({'success': True, 'removed': removed})


@extend_schema(
    methods=['POST'],
    operation_id='get_transaction_entities',
    summary="Get entities for transactions",
    description="Get which entities each transaction belongs to. Useful for showing entity badges on transaction lists.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Request',
            value={
                'transactions': [
                    {'type': 'bank', 'id': 123},
                    {'type': 'credit_card', 'id': 456},
                ]
            },
            request_only=True,
        ),
        OpenApiExample(
            'Response',
            value={
                'transaction_entities': {
                    'bank:123': [
                        {'entity_id': 'entity_abc12345', 'name': 'John Doe', 'icon': '👤', 'entity_type': 'person'},
                    ],
                    'credit_card:456': [
                        {'entity_id': 'entity_abc12345', 'name': 'John Doe', 'icon': '👤', 'entity_type': 'person'},
                        {'entity_id': 'entity_def67890', 'name': 'Amazon', 'icon': '🏢', 'entity_type': 'business'},
                    ],
                }
            },
            response_only=True,
        ),
    ],
)
@api_view(['POST'])
def get_transaction_entities(request):
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

            # Find the resolved_transaction for this transaction
            rt_id = None
            if txn_type == 'bank':
                rt_id = BankTransaction.objects.filter(id=txn_id).values_list('resolved_transaction_id', flat=True).first()
            elif txn_type == 'credit_card':
                rt_id = CreditCardTransaction.objects.filter(id=txn_id).values_list('resolved_transaction_id', flat=True).first()

            # Query entities via EntityLink
            entities = []
            if rt_id:
                entity_links = EntityLink.objects.filter(
                    resolved_transaction_id=rt_id
                ).select_related('entity')
                for el in entity_links:
                    entities.append({
                        'entity_id': el.entity.entity_id,
                        'name': el.entity.name,
                        'icon': el.entity.icon,
                        'entity_type': el.entity.entity_type,
                    })
            result[key] = entities

    return JsonResponse({'transaction_entities': result})


@extend_schema(
    methods=['POST'],
    operation_id='compare_entities',
    summary="Compare multiple entities",
    description="Compare 2 or more entities to find common and unique transactions.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Entities'],
    examples=[
        OpenApiExample(
            'Compare Request',
            value={
                'entity_ids': ['entity_abc12345', 'entity_def67890'],
            },
            request_only=True,
        ),
        OpenApiExample(
            'Compare Response',
            value={
                'entities': [
                    {'entity_id': 'entity_abc12345', 'name': 'John Doe', 'icon': '👤', 'entity_type': 'person', 'transaction_count': 15, 'total_spent': 25000.0},
                    {'entity_id': 'entity_def67890', 'name': 'Amazon', 'icon': '🏢', 'entity_type': 'business', 'transaction_count': 30, 'total_spent': 75000.0},
                ],
                'common_transactions': [
                    {'id': 123, 'type': 'credit_card', 'date': '2024-03-05', 'description': 'Amazon Purchase', 'amount': 5000.0, 'category': 'Shopping', 'source': 'HDFC Credit Card'},
                ],
                'unique_transactions': {
                    'entity_abc12345': [
                        {'id': 456, 'type': 'bank', 'date': '2024-03-01', 'description': 'Lunch', 'amount': 500.0, 'category': 'Food', 'source': 'ICICI Bank'},
                    ],
                    'entity_def67890': [
                        {'id': 789, 'type': 'credit_card', 'date': '2024-03-10', 'description': 'Prime Subscription', 'amount': 1499.0, 'category': 'Subscriptions', 'source': 'SBI Credit Card'},
                    ],
                },
                'overlap_stats': {
                    'common_count': 5,
                    'total_unique': 35,
                },
            },
            response_only=True,
        ),
    ],
)
@api_view(['POST'])
def compare_entities(request):
    """Compare multiple entities to find common and unique transactions."""
    try:
        data = json.loads(request.body)
        entity_ids = data.get('entity_ids', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    if len(entity_ids) < 2:
        return JsonResponse({'error': 'At least 2 entities are required for comparison'}, status=400)

    # Get entities
    entities = Entity.objects.filter(entity_id__in=entity_ids)
    if entities.count() != len(entity_ids):
        return JsonResponse({'error': 'One or more entities not found'}, status=400)

    # Build entity info and transaction sets
    entities_info = []
    entity_transaction_sets = {}  # entity_id -> set of (type, id) tuples

    for entity in entities:
        stats = get_entity_stats(entity)
        entities_info.append({
            'entity_id': entity.entity_id,
            'name': entity.name,
            'icon': entity.icon,
            'entity_type': entity.entity_type,
            'transaction_count': stats['transaction_count'],
            'total_spent': stats['total_spent'],
        })

        # Get resolved_transaction_ids for this entity via EntityLink
        rt_ids = set(EntityLink.objects.filter(entity=entity).values_list('resolved_transaction_id', flat=True))
        entity_transaction_sets[entity.entity_id] = rt_ids

    # Find common transactions (present in ALL entities)
    all_txn_sets = list(entity_transaction_sets.values())
    common_txns = all_txn_sets[0].copy()
    for txn_set in all_txn_sets[1:]:
        common_txns &= txn_set

    # Find unique transactions (present in only ONE entity)
    unique_transactions = {}
    for entity_id, txn_set in entity_transaction_sets.items():
        other_sets = [s for eid, s in entity_transaction_sets.items() if eid != entity_id]
        other_union = set()
        for s in other_sets:
            other_union |= s
        unique_txns = txn_set - other_union
        unique_transactions[entity_id] = unique_txns

    # Helper to serialize transactions from resolved_transaction_ids
    def serialize_transactions(rt_ids):
        result = []
        resolved_txns = ResolvedTransaction.objects.filter(id__in=rt_ids)

        bank_rt_ids = list(resolved_txns.filter(transaction_type='bank').values_list('id', flat=True))
        cc_rt_ids = list(resolved_txns.filter(transaction_type='credit_card').values_list('id', flat=True))
        cat_map = _build_category_map(rt_ids)

        if bank_rt_ids:
            bank_txns = get_active_transactions().filter(
                resolved_transaction_id__in=bank_rt_ids, is_primary=True
            ).select_related('bank_account', 'resolved_transaction')
            for txn in bank_txns:
                category = cat_map.get(txn.resolved_transaction_id) if txn.resolved_transaction_id else txn.category
                result.append({
                    'id': txn.id,
                    'type': 'bank',
                    'date': txn.date.isoformat(),
                    'description': txn.narration,
                    'amount': float(txn.debit_amount) - float(txn.credit_amount),
                    'category': category,
                    'source': txn.bank_account.nickname if txn.bank_account else 'Unknown',
                })

        if cc_rt_ids:
            cc_txns = get_active_cc_transactions().filter(
                resolved_transaction_id__in=cc_rt_ids, is_primary=True
            ).select_related('credit_card', 'resolved_transaction')
            for txn in cc_txns:
                category = cat_map.get(txn.resolved_transaction_id) if txn.resolved_transaction_id else txn.category
                result.append({
                    'id': txn.id,
                    'type': 'credit_card',
                    'date': txn.date.isoformat(),
                    'description': txn.description,
                    'amount': float(txn.amount),
                    'category': category,
                    'source': txn.credit_card.nickname if txn.credit_card else 'Unknown',
                })

        result.sort(key=lambda x: x['date'], reverse=True)
        return result

    # Serialize results
    common_transactions_list = serialize_transactions(common_txns)
    unique_transactions_dict = {
        entity_id: serialize_transactions(txn_set)
        for entity_id, txn_set in unique_transactions.items()
    }

    # Calculate overlap stats
    total_unique = sum(len(txns) for txns in unique_transactions.values())

    return JsonResponse({
        'entities': entities_info,
        'common_transactions': common_transactions_list,
        'unique_transactions': unique_transactions_dict,
        'overlap_stats': {
            'common_count': len(common_transactions_list),
            'total_unique': total_unique,
        },
    })
