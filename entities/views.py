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

from .models import Entity, EntityTransaction
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction
from dashboard.views import get_active_transactions
from credit_cards.views import get_active_cc_transactions


def get_entity_stats(entity):
    """Get transaction stats for an entity."""
    entity_txns = EntityTransaction.objects.filter(entity=entity)

    bank_ids = list(entity_txns.filter(transaction_type='bank').values_list('transaction_id', flat=True))
    cc_ids = list(entity_txns.filter(transaction_type='credit_card').values_list('transaction_id', flat=True))

    total_spent = 0
    min_date = None
    max_date = None
    transaction_count = 0

    # Get bank transactions
    if bank_ids:
        bank_txns = get_active_transactions().filter(id__in=bank_ids)
        for txn in bank_txns:
            # Debit = expense (positive spent), Credit = income (negative spent for total)
            total_spent += float(txn.debit_amount) - float(txn.credit_amount)
            transaction_count += 1
            if min_date is None or txn.date < min_date:
                min_date = txn.date
            if max_date is None or txn.date > max_date:
                max_date = txn.date

    # Get CC transactions
    if cc_ids:
        cc_txns = get_active_cc_transactions().filter(id__in=cc_ids)
        for txn in cc_txns:
            # All CC transactions are expenses (positive amounts)
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


def get_entity_transactions(entity):
    """Get all transactions for an entity with full details."""
    entity_txns = EntityTransaction.objects.filter(entity=entity)
    transactions = []

    bank_ids = list(entity_txns.filter(transaction_type='bank').values_list('transaction_id', flat=True))
    cc_ids = list(entity_txns.filter(transaction_type='credit_card').values_list('transaction_id', flat=True))

    # Get bank transactions
    if bank_ids:
        bank_txns = get_active_transactions().filter(id__in=bank_ids).select_related(
            'bank_account', 'resolved_transaction'
        ).prefetch_related('resolved_transaction__bank_transactions')
        for txn in bank_txns:
            # Aggregate category from member transactions
            aggregated_category = txn.category
            if not aggregated_category and txn.resolved_transaction:
                for member in txn.resolved_transaction.bank_transactions.all():
                    if member.category:
                        aggregated_category = member.category
                        break

            transactions.append({
                'id': txn.id,
                'type': 'bank',
                'date': txn.date.isoformat(),
                'description': txn.narration,
                'amount': float(txn.debit_amount) - float(txn.credit_amount),
                'category': aggregated_category,
                'source': txn.bank_account.nickname if txn.bank_account else 'Unknown',
            })

    # Get CC transactions
    if cc_ids:
        cc_txns = get_active_cc_transactions().filter(id__in=cc_ids).select_related(
            'credit_card', 'resolved_transaction'
        ).prefetch_related('resolved_transaction__credit_card_transactions')
        for txn in cc_txns:
            # Aggregate category from member transactions
            aggregated_category = txn.category
            if not aggregated_category and txn.resolved_transaction:
                for member in txn.resolved_transaction.credit_card_transactions.all():
                    if member.category:
                        aggregated_category = member.category
                        break

            transactions.append({
                'id': txn.id,
                'type': 'credit_card',
                'date': txn.date.isoformat(),
                'description': txn.description,
                'amount': float(txn.amount),
                'category': aggregated_category,
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
                _, created = EntityTransaction.objects.get_or_create(
                    entity=entity,
                    transaction_type=txn_type,
                    transaction_id=txn_id,
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
                deleted, _ = EntityTransaction.objects.filter(
                    entity=entity,
                    transaction_type=txn_type,
                    transaction_id=txn_id,
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

            # For resolved transactions, aggregate entities from ALL member transactions
            member_ids = [txn_id]
            if txn_type == 'bank':
                from bank_accounts.models import BankTransaction
                try:
                    bank_txn = BankTransaction.objects.select_related('resolved_transaction').get(id=txn_id)
                    if bank_txn.resolved_transaction:
                        member_ids = list(bank_txn.resolved_transaction.bank_transactions.values_list('id', flat=True))
                except BankTransaction.DoesNotExist:
                    pass
            elif txn_type == 'credit_card':
                from credit_cards.models import CreditCardTransaction
                try:
                    cc_txn = CreditCardTransaction.objects.select_related('resolved_transaction').get(id=txn_id)
                    if cc_txn.resolved_transaction:
                        member_ids = list(cc_txn.resolved_transaction.credit_card_transactions.values_list('id', flat=True))
                except CreditCardTransaction.DoesNotExist:
                    pass

            # Query entities for all member transaction IDs
            entity_txns = EntityTransaction.objects.filter(
                transaction_type=txn_type,
                transaction_id__in=member_ids,
            ).select_related('entity')

            # Deduplicate entities (same entity might be linked to multiple members)
            seen_entities = set()
            entities = []
            for et in entity_txns:
                if et.entity.entity_id not in seen_entities:
                    seen_entities.add(et.entity.entity_id)
                    entities.append({
                        'entity_id': et.entity.entity_id,
                        'name': et.entity.name,
                        'icon': et.entity.icon,
                        'entity_type': et.entity.entity_type,
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

        # Get transaction identifiers for this entity
        entity_txns = EntityTransaction.objects.filter(entity=entity)
        txn_set = set()
        for et in entity_txns:
            txn_set.add((et.transaction_type, et.transaction_id))
        entity_transaction_sets[entity.entity_id] = txn_set

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

    # Helper to serialize transactions
    def serialize_transactions(txn_tuples):
        result = []
        bank_ids = [tid for ttype, tid in txn_tuples if ttype == 'bank']
        cc_ids = [tid for ttype, tid in txn_tuples if ttype == 'credit_card']

        if bank_ids:
            bank_txns = get_active_transactions().filter(id__in=bank_ids).select_related(
                'bank_account', 'resolved_transaction'
            ).prefetch_related('resolved_transaction__bank_transactions')
            for txn in bank_txns:
                # Aggregate category from resolved member transactions
                aggregated_category = txn.category
                if not aggregated_category and txn.resolved_transaction:
                    for member in txn.resolved_transaction.bank_transactions.all():
                        if member.category:
                            aggregated_category = member.category
                            break

                result.append({
                    'id': txn.id,
                    'type': 'bank',
                    'date': txn.date.isoformat(),
                    'description': txn.narration,
                    'amount': float(txn.debit_amount) - float(txn.credit_amount),
                    'category': aggregated_category,
                    'source': txn.bank_account.nickname if txn.bank_account else 'Unknown',
                })

        if cc_ids:
            cc_txns = get_active_cc_transactions().filter(id__in=cc_ids).select_related(
                'credit_card', 'resolved_transaction'
            ).prefetch_related('resolved_transaction__credit_card_transactions')
            for txn in cc_txns:
                # Aggregate category from resolved member transactions
                aggregated_category = txn.category
                if not aggregated_category and txn.resolved_transaction:
                    for member in txn.resolved_transaction.credit_card_transactions.all():
                        if member.category:
                            aggregated_category = member.category
                            break

                result.append({
                    'id': txn.id,
                    'type': 'credit_card',
                    'date': txn.date.isoformat(),
                    'description': txn.description,
                    'amount': float(txn.amount),
                    'category': aggregated_category,
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
