import json
from django.db.models import Sum, Min, Max, Count
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

from .models import Story, StoryTransaction
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction
from dashboard.views import get_active_transactions
from credit_cards.views import get_active_cc_transactions


def get_story_stats(story):
    """Get transaction stats for a story."""
    story_txns = StoryTransaction.objects.filter(story=story)

    bank_ids = list(story_txns.filter(transaction_type='bank').values_list('transaction_id', flat=True))
    cc_ids = list(story_txns.filter(transaction_type='credit_card').values_list('transaction_id', flat=True))

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


def serialize_story(story, include_stats=True):
    """Serialize a Story object to dict."""
    data = {
        'id': story.id,
        'story_id': story.story_id,
        'name': story.name,
        'description': story.description,
        'icon': story.icon,
        'created_at': story.created_at.isoformat() if story.created_at else None,
        'updated_at': story.updated_at.isoformat() if story.updated_at else None,
    }
    if include_stats:
        data.update(get_story_stats(story))
    return data


def get_story_transactions(story):
    """Get all transactions for a story with full details."""
    story_txns = StoryTransaction.objects.filter(story=story)
    transactions = []

    bank_ids = list(story_txns.filter(transaction_type='bank').values_list('transaction_id', flat=True))
    cc_ids = list(story_txns.filter(transaction_type='credit_card').values_list('transaction_id', flat=True))

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
    operation_id='stories_list',
    summary="List stories",
    description="Get all stories with their transaction statistics.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Stories List',
            value={
                'stories': [{
                    'id': 1,
                    'story_id': 'story_abc12345',
                    'name': 'Japan Trip 2024',
                    'description': 'All expenses from my Japan vacation',
                    'icon': '🇯🇵',
                    'transaction_count': 45,
                    'total_spent': 125000.0,
                    'min_date': '2024-03-01',
                    'max_date': '2024-03-15',
                    'created_at': '2024-03-01T10:30:00Z',
                    'updated_at': '2024-03-15T18:00:00Z',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Stories'],
)
@extend_schema(
    methods=['POST'],
    summary="Create story",
    description="Create a new story.",
    request=OpenApiTypes.OBJECT,
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Stories'],
    examples=[
        OpenApiExample(
            'Create Story',
            value={
                'name': 'Japan Trip 2024',
                'description': 'All expenses from my Japan vacation',
                'icon': '🇯🇵',
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def story_list(request):
    if request.method == "GET":
        stories_data = [serialize_story(story) for story in Story.objects.all()]
        return JsonResponse({'stories': stories_data})

    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            story = Story.objects.create(
                name=data.get('name', 'Untitled Story'),
                description=data.get('description', ''),
                icon=data.get('icon', '📁'),
            )
            return JsonResponse(serialize_story(story), status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='stories_detail',
    summary="Get story details",
    description="Get details of a specific story including all its transactions.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Story Detail',
            value={
                'id': 1,
                'story_id': 'story_abc12345',
                'name': 'Japan Trip 2024',
                'description': 'All expenses from my Japan vacation',
                'icon': '🇯🇵',
                'transaction_count': 45,
                'total_spent': 125000.0,
                'min_date': '2024-03-01',
                'max_date': '2024-03-15',
                'transactions': [{
                    'id': 123,
                    'type': 'credit_card',
                    'date': '2024-03-05',
                    'description': 'Tokyo Hotel',
                    'amount': 15000.0,
                    'category': 'Travel',
                    'source': 'HDFC Credit Card',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Stories'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update story",
    description="Update story name, description, or icon.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Stories'],
    examples=[
        OpenApiExample(
            'Update Story',
            value={'name': 'Japan Trip March 2024', 'icon': '✈️'},
            request_only=True,
        ),
    ],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete story",
    description="Delete a story and all its transaction associations.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Delete Success',
            value={'success': True},
            response_only=True,
        ),
    ],
    tags=['Stories'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def story_detail(request, story_id):
    try:
        story = Story.objects.get(story_id=story_id)
    except Story.DoesNotExist:
        return JsonResponse({'error': 'Story not found'}, status=404)

    if request.method == "GET":
        data = serialize_story(story)
        data['transactions'] = get_story_transactions(story)
        return JsonResponse(data)

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            if 'name' in data:
                story.name = data['name']
            if 'description' in data:
                story.description = data['description']
            if 'icon' in data:
                story.icon = data['icon']
            story.save()
            return JsonResponse(serialize_story(story))
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        story.delete()
        return JsonResponse({'success': True})


@extend_schema(
    methods=['POST'],
    operation_id='story_add_transactions',
    summary="Add transactions to story",
    description="Add one or more transactions to a story.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Stories'],
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
    operation_id='story_remove_transactions',
    summary="Remove transactions from story",
    description="Remove one or more transactions from a story.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Stories'],
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
def story_transactions(request, story_id):
    try:
        story = Story.objects.get(story_id=story_id)
    except Story.DoesNotExist:
        return JsonResponse({'error': 'Story not found'}, status=404)

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
                _, created = StoryTransaction.objects.get_or_create(
                    story=story,
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
                deleted, _ = StoryTransaction.objects.filter(
                    story=story,
                    transaction_type=txn_type,
                    transaction_id=txn_id,
                ).delete()
                removed += deleted
        return JsonResponse({'success': True, 'removed': removed})


@extend_schema(
    methods=['POST'],
    operation_id='get_transaction_stories',
    summary="Get stories for transactions",
    description="Get which stories each transaction belongs to. Useful for showing story badges on transaction lists.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Stories'],
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
                'transaction_stories': {
                    'bank:123': [
                        {'story_id': 'story_abc12345', 'name': 'Japan Trip', 'icon': '🇯🇵'},
                    ],
                    'credit_card:456': [
                        {'story_id': 'story_abc12345', 'name': 'Japan Trip', 'icon': '🇯🇵'},
                        {'story_id': 'story_def67890', 'name': 'March Shopping', 'icon': '🛍️'},
                    ],
                }
            },
            response_only=True,
        ),
    ],
)
@api_view(['POST'])
def get_transaction_stories(request):
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

            # For resolved transactions, aggregate stories from ALL member transactions
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

            # Query stories for all member transaction IDs
            story_txns = StoryTransaction.objects.filter(
                transaction_type=txn_type,
                transaction_id__in=member_ids,
            ).select_related('story')

            # Deduplicate stories (same story might be linked to multiple members)
            seen_stories = set()
            stories = []
            for st in story_txns:
                if st.story.story_id not in seen_stories:
                    seen_stories.add(st.story.story_id)
                    stories.append({
                        'story_id': st.story.story_id,
                        'name': st.story.name,
                        'icon': st.story.icon,
                    })
            result[key] = stories

    return JsonResponse({'transaction_stories': result})


@extend_schema(
    methods=['POST'],
    operation_id='compare_stories',
    summary="Compare multiple stories",
    description="Compare 2 or more stories to find common and unique transactions.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Stories'],
    examples=[
        OpenApiExample(
            'Compare Request',
            value={
                'story_ids': ['story_abc12345', 'story_def67890'],
            },
            request_only=True,
        ),
        OpenApiExample(
            'Compare Response',
            value={
                'stories': [
                    {'story_id': 'story_abc12345', 'name': 'Japan Trip', 'icon': '🇯🇵', 'transaction_count': 45, 'total_spent': 125000.0},
                    {'story_id': 'story_def67890', 'name': 'Shopping', 'icon': '🛍️', 'transaction_count': 23, 'total_spent': 45000.0},
                ],
                'common_transactions': [
                    {'id': 123, 'type': 'credit_card', 'date': '2024-03-05', 'description': 'Store Purchase', 'amount': 5000.0, 'category': 'Shopping', 'source': 'HDFC Credit Card'},
                ],
                'unique_transactions': {
                    'story_abc12345': [
                        {'id': 456, 'type': 'bank', 'date': '2024-03-01', 'description': 'Hotel Booking', 'amount': 15000.0, 'category': 'Travel', 'source': 'ICICI Bank'},
                    ],
                    'story_def67890': [
                        {'id': 789, 'type': 'credit_card', 'date': '2024-03-10', 'description': 'Online Shopping', 'amount': 3000.0, 'category': 'Shopping', 'source': 'SBI Credit Card'},
                    ],
                },
                'overlap_stats': {
                    'common_count': 5,
                    'total_unique': 63,
                },
            },
            response_only=True,
        ),
    ],
)
@api_view(['POST'])
def compare_stories(request):
    """Compare multiple stories to find common and unique transactions."""
    try:
        data = json.loads(request.body)
        story_ids = data.get('story_ids', [])
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)

    if len(story_ids) < 2:
        return JsonResponse({'error': 'At least 2 stories are required for comparison'}, status=400)

    # Get stories
    stories = Story.objects.filter(story_id__in=story_ids)
    if stories.count() != len(story_ids):
        return JsonResponse({'error': 'One or more stories not found'}, status=400)

    # Build story info and transaction sets
    stories_info = []
    story_transaction_sets = {}  # story_id -> set of (type, id) tuples

    for story in stories:
        stats = get_story_stats(story)
        stories_info.append({
            'story_id': story.story_id,
            'name': story.name,
            'icon': story.icon,
            'transaction_count': stats['transaction_count'],
            'total_spent': stats['total_spent'],
        })

        # Get transaction identifiers for this story
        story_txns = StoryTransaction.objects.filter(story=story)
        txn_set = set()
        for st in story_txns:
            txn_set.add((st.transaction_type, st.transaction_id))
        story_transaction_sets[story.story_id] = txn_set

    # Find common transactions (present in ALL stories)
    all_txn_sets = list(story_transaction_sets.values())
    common_txns = all_txn_sets[0].copy()
    for txn_set in all_txn_sets[1:]:
        common_txns &= txn_set

    # Find unique transactions (present in only ONE story)
    unique_transactions = {}
    for story_id, txn_set in story_transaction_sets.items():
        other_sets = [s for sid, s in story_transaction_sets.items() if sid != story_id]
        other_union = set()
        for s in other_sets:
            other_union |= s
        unique_txns = txn_set - other_union
        unique_transactions[story_id] = unique_txns

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
        story_id: serialize_transactions(txn_set)
        for story_id, txn_set in unique_transactions.items()
    }

    # Calculate overlap stats
    total_unique = sum(len(txns) for txns in unique_transactions.values())

    return JsonResponse({
        'stories': stories_info,
        'common_transactions': common_transactions_list,
        'unique_transactions': unique_transactions_dict,
        'overlap_stats': {
            'common_count': len(common_transactions_list),
            'total_unique': total_unique,
        },
    })
