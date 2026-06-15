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

from .models import Story
from bank_accounts.models import BankTransaction
from credit_cards.models import CreditCardTransaction
from extractions.models import ResolvedTransaction
from links.models import StoryLink, CategoryLink
from dashboard.views import get_active_transactions
from credit_cards.views import get_active_cc_transactions


def get_story_stats(story):
    """Get transaction stats for a story."""
    rt_ids = list(StoryLink.objects.filter(story=story).values_list('resolved_transaction_id', flat=True))
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


def _build_category_map(resolved_transaction_ids):
    """Build a map of resolved_transaction_id -> category from CategoryLinks (latest wins)."""
    category_map = {}
    for link in CategoryLink.objects.filter(
        resolved_transaction_id__in=resolved_transaction_ids
    ).order_by('created_at'):
        category_map[link.resolved_transaction_id] = link.category
    return category_map


def get_story_transactions(story):
    """Get all transactions for a story with full details."""
    from links.utils import get_refund_links_for_rt_ids, get_self_transfer_links_for_rt_ids
    from links.models import CreditCardPaymentLink, Breakdown

    rt_ids = list(StoryLink.objects.filter(story=story).values_list('resolved_transaction_id', flat=True))
    resolved_txns = ResolvedTransaction.objects.filter(id__in=rt_ids)
    transactions = []

    bank_rt_ids = list(resolved_txns.filter(transaction_type='bank').values_list('id', flat=True))
    cc_rt_ids = list(resolved_txns.filter(transaction_type='credit_card').values_list('id', flat=True))
    category_map = _build_category_map(rt_ids)
    refund_map = get_refund_links_for_rt_ids(rt_ids)
    self_transfer_map = get_self_transfer_links_for_rt_ids(bank_rt_ids)

    breakdown_map = {}
    for bd in Breakdown.objects.filter(resolved_transaction_id__in=rt_ids):
        breakdown_map[bd.resolved_transaction_id] = {
            'breakdown_id': bd.breakdown_id,
            'name': bd.name,
        }

    # Build CC payment link maps
    cc_payment_links = CreditCardPaymentLink.objects.filter(
        is_active=True
    ).select_related(
        'bank_resolved_transaction', 'cc_resolved_transaction'
    )

    # bank_rt_id -> link info (for bank transactions showing their CC payment link)
    bank_rt_cc_link_map = {}
    for link in cc_payment_links.filter(bank_resolved_transaction_id__in=bank_rt_ids):
        if link.bank_resolved_transaction_id not in bank_rt_cc_link_map:
            cc_rt = link.cc_resolved_transaction
            if cc_rt and cc_rt.primary_transaction_id:
                from credit_cards.models import CreditCardTransaction
                cc_txn = CreditCardTransaction.objects.filter(
                    id=cc_rt.primary_transaction_id
                ).select_related('credit_card').first()
                if cc_txn:
                    bank_rt_cc_link_map[link.bank_resolved_transaction_id] = {
                        'id': link.id,
                        'credit_card_transaction': {
                            'id': cc_txn.id,
                            'date': cc_txn.date.isoformat(),
                            'description': cc_txn.description,
                            'amount': float(cc_txn.amount),
                            'credit_card': {
                                'id': cc_txn.credit_card.id,
                                'nickname': cc_txn.credit_card.nickname,
                            } if cc_txn.credit_card else None,
                        },
                        'offset': float(link.offset),
                        'confidence_score': link.confidence_score,
                        'match_reasons': link.match_reasons,
                    }

    # cc_rt_id -> link info (for CC transactions showing their bank payment link)
    cc_rt_bank_link_map = {}
    for link in cc_payment_links.filter(cc_resolved_transaction_id__in=cc_rt_ids):
        if link.cc_resolved_transaction_id not in cc_rt_bank_link_map:
            bank_rt = link.bank_resolved_transaction
            if bank_rt and bank_rt.primary_transaction_id:
                from bank_accounts.models import BankTransaction
                bank_txn = BankTransaction.objects.filter(
                    id=bank_rt.primary_transaction_id
                ).select_related('bank_account').first()
                if bank_txn:
                    cc_rt_bank_link_map[link.cc_resolved_transaction_id] = {
                        'id': link.id,
                        'bank_transaction': {
                            'id': bank_txn.id,
                            'date': bank_txn.date.isoformat(),
                            'narration': bank_txn.narration,
                            'amount': float(bank_txn.debit_amount),
                            'bank_account': {
                                'id': bank_txn.bank_account.id,
                                'nickname': bank_txn.bank_account.nickname,
                            } if bank_txn.bank_account else None,
                        },
                        'offset': float(link.offset),
                        'confidence_score': link.confidence_score,
                        'match_reasons': link.match_reasons,
                    }

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
                'refund_link': refund_map.get(txn.resolved_transaction_id),
                'cc_payment_match': bank_rt_cc_link_map.get(txn.resolved_transaction_id),
                'bank_payment_match': None,
                'linked_transaction': self_transfer_map.get(txn.resolved_transaction_id),
                'breakdown': breakdown_map.get(txn.resolved_transaction_id),
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
                'refund_link': refund_map.get(txn.resolved_transaction_id),
                'cc_payment_match': None,
                'bank_payment_match': cc_rt_bank_link_map.get(txn.resolved_transaction_id),
                'linked_transaction': None,
                'breakdown': breakdown_map.get(txn.resolved_transaction_id),
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
                if txn_type == 'bank':
                    t = BankTransaction.objects.filter(id=txn_id).first()
                else:
                    t = CreditCardTransaction.objects.filter(id=txn_id).first()
                if not t:
                    continue
                if not t.resolved_transaction_id:
                    from links.utils import ensure_resolved_transaction
                    ensure_resolved_transaction(t, txn_type)
                _, created = StoryLink.objects.get_or_create(
                    resolved_transaction_id=t.resolved_transaction_id,
                    story=story,
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
                    deleted, _ = StoryLink.objects.filter(
                        resolved_transaction_id=t.resolved_transaction_id,
                        story=story,
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

            # Find the resolved_transaction for this transaction
            rt_id = None
            if txn_type == 'bank':
                bank_txn = BankTransaction.objects.filter(id=txn_id).values_list('resolved_transaction_id', flat=True).first()
                rt_id = bank_txn
            elif txn_type == 'credit_card':
                cc_txn = CreditCardTransaction.objects.filter(id=txn_id).values_list('resolved_transaction_id', flat=True).first()
                rt_id = cc_txn

            # Query stories via StoryLink
            stories = []
            if rt_id:
                story_links = StoryLink.objects.filter(
                    resolved_transaction_id=rt_id
                ).select_related('story')
                for sl in story_links:
                    stories.append({
                        'story_id': sl.story.story_id,
                        'name': sl.story.name,
                        'icon': sl.story.icon,
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

        # Get resolved_transaction_ids for this story via StoryLink
        rt_ids = set(StoryLink.objects.filter(story=story).values_list('resolved_transaction_id', flat=True))
        story_transaction_sets[story.story_id] = rt_ids

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
