import json
from django.core.cache import cache
from django.http import JsonResponse
from django.db.models import Min, Max, Sum, Q
from rest_framework.decorators import api_view

from project.cache_utils import get_cc_inconsistencies_key, invalidate_cc_inconsistencies

# Conditional import for API docs (dev only)
try:
    from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
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

    OpenApiParameter = _MockCallable
    OpenApiExample = _MockCallable
    OpenApiTypes = type('OpenApiTypes', (), {'OBJECT': object, 'INT': int, 'STR': str, 'BOOL': bool})()

from .models import CreditCard, CreditCardTransaction


def get_active_cc_transactions():
    """
    Get CC transactions from the extraction system (DataSourceArtifact).

    Uses the extraction pipeline where:
    - data_source_artifact links transactions to DataSourceArtifact
    - status='loaded' means the artifact data is loaded into transactions
    - enabled=True means the artifact is shown in views (not disabled)
    - hidden=False means the artifact is visible in UI lists
    """
    return CreditCardTransaction.objects.filter(
        data_source_artifact__isnull=False,
        data_source_artifact__status='loaded',
        data_source_artifact__enabled=True,
        data_source_artifact__hidden=False,
    )


def get_credit_card_stats(card):
    """Get transaction stats for a credit card."""
    transactions = get_active_cc_transactions().filter(credit_card=card)

    if not transactions.exists():
        return {
            'total_charges': 0,
            'total_payments': 0,
            'last_transaction_date': None,
            'first_transaction_date': None,
            'transaction_count': 0
        }

    latest = transactions.first()
    earliest = transactions.order_by('date', 'row_number').first()

    # Total charges (positive amounts)
    total_charges = transactions.filter(amount__gt=0).aggregate(total=Sum('amount'))['total'] or 0
    # Total payments (negative amounts, as absolute value)
    total_payments = abs(transactions.filter(amount__lt=0).aggregate(total=Sum('amount'))['total'] or 0)

    return {
        'total_charges': float(total_charges),
        'total_payments': float(total_payments),
        'last_transaction_date': latest.date.isoformat() if latest else None,
        'first_transaction_date': earliest.date.isoformat() if earliest else None,
        'transaction_count': transactions.count()
    }


@extend_schema(
    methods=['GET'],
    operation_id='credit_cards_list',
    summary="List credit cards",
    description="Get all credit cards with their transaction statistics.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Credit Cards List',
            value={
                'cards': [{
                    'id': 1,
                    'nickname': 'HDFC Card',
                    'card_name': 'HDFC Regalia',
                    'card_number_mask': '****1234',
                    'issuer': 'HDFC',
                    'credit_limit': 500000.0,
                    'created_at': '2024-01-15T10:30:00Z',
                    'updated_at': '2024-01-15T10:30:00Z',
                    'total_charges': 50000.0,
                    'total_payments': 45000.0,
                    'last_transaction_date': '2024-01-20',
                    'first_transaction_date': '2023-06-01',
                    'transaction_count': 150,
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['POST'],
    summary="Create credit card",
    description="Create a new credit card.",
    request=OpenApiTypes.OBJECT,
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Cards'],
    examples=[
        OpenApiExample(
            'Create card',
            value={
                'nickname': 'My Card',
                'card_name': 'HDFC Regalia',
                'card_number_mask': '****1234',
                'issuer': 'HDFC',
                'credit_limit': 500000,
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def credit_card_list(request):
    """List all credit cards or create a new one."""
    if request.method == "GET":
        cards_data = []
        for card in CreditCard.objects.all():
            card_dict = {
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
                'created_at': card.created_at.isoformat() if card.created_at else None,
                'updated_at': card.updated_at.isoformat() if card.updated_at else None,
            }
            card_dict.update(get_credit_card_stats(card))
            cards_data.append(card_dict)

        return JsonResponse({
            'cards': cards_data,
        })

    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            card = CreditCard.objects.create(
                nickname=data.get('nickname', ''),
                card_name=data.get('card_name', ''),
                card_number_mask=data.get('card_number_mask', ''),
                issuer=data.get('issuer', ''),
                credit_limit=data.get('credit_limit'),
            )

            return JsonResponse({
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='credit_cards_detail',
    summary="Get credit card",
    description="Get details of a specific credit card.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Credit Card Detail',
            value={
                'id': 1,
                'nickname': 'HDFC Card',
                'card_name': 'HDFC Regalia',
                'card_number_mask': '****1234',
                'issuer': 'HDFC',
                'credit_limit': 500000.0,
                'total_charges': 50000.0,
                'total_payments': 45000.0,
                'last_transaction_date': '2024-01-20',
                'first_transaction_date': '2023-06-01',
                'transaction_count': 150,
            },
            response_only=True,
        ),
    ],
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update credit card",
    description="Update credit card details.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Update Credit Card',
            value={'nickname': 'Updated Card Name', 'credit_limit': 600000},
            request_only=True,
        ),
    ],
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete credit card",
    description="Delete a credit card.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Delete Success',
            value={'success': True},
            response_only=True,
        ),
    ],
    tags=['Credit Cards'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def credit_card_detail(request, card_id):
    """Get, update, or delete a credit card."""
    try:
        card = CreditCard.objects.get(id=card_id)
    except CreditCard.DoesNotExist:
        return JsonResponse({'error': 'Credit card not found'}, status=404)

    if request.method == "GET":
        card_dict = {
            'id': card.id,
            'nickname': card.nickname,
            'card_name': card.card_name,
            'card_number_mask': card.card_number_mask,
            'issuer': card.issuer,
            'credit_limit': float(card.credit_limit) if card.credit_limit else None,
        }
        card_dict.update(get_credit_card_stats(card))
        return JsonResponse(card_dict)

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            card.nickname = data.get('nickname', card.nickname)
            card.card_name = data.get('card_name', card.card_name)
            card.card_number_mask = data.get('card_number_mask', card.card_number_mask)
            card.issuer = data.get('issuer', card.issuer)
            if 'credit_limit' in data:
                card.credit_limit = data['credit_limit']
            card.save()

            return JsonResponse({
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        card.delete()
        return JsonResponse({'success': True})


@extend_schema(
    summary="List credit card transactions",
    description="List credit card transactions with filtering and pagination.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='category', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by category'),
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by type: charge or payment'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
        OpenApiParameter(name='month', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by month (1-12)'),
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search description or category'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Credit Card Transactions',
            value={
                'data': [{
                    'id': 1,
                    'date': '2024-01-15',
                    'description': 'Amazon.in Purchase',
                    'amount': 2500.0,
                    'intl_amount': 0.0,
                    'intl_currency': '',
                    'exchange_rate': None,
                    'category': 'Shopping',
                    'credit_card': {'id': 1, 'nickname': 'HDFC Card'},
                    'bank_payment_match': None,
                }],
                'total': 150,
                'stats': {
                    'total_charges': 50000.0,
                    'total_payments': 45000.0,
                    'net': 5000.0,
                },
            },
            response_only=True,
        ),
    ],
    tags=['Credit Card Transactions'],
)
@api_view(['GET'])
def credit_card_transactions(request):
    """List credit card transactions with filters."""
    transactions = get_active_cc_transactions().select_related(
        'credit_card',
        'data_source_artifact',
        'bank_payment_match',
        'bank_payment_match__bank_transaction',
        'bank_payment_match__bank_transaction__bank_account',
    )

    # Filter by credit card
    card_id = request.GET.get('credit_card')
    if card_id:
        transactions = transactions.filter(credit_card_id=card_id)

    # Filter by category
    category = request.GET.get('category')
    if category:
        transactions = transactions.filter(category=category)

    # Filter by type (charge/payment)
    transaction_type = request.GET.get('type')
    if transaction_type == 'charge':
        transactions = transactions.filter(amount__gt=0)
    elif transaction_type == 'payment':
        transactions = transactions.filter(amount__lt=0)

    # Filter by year and month
    year = request.GET.get('year')
    month = request.GET.get('month')
    if year:
        transactions = transactions.filter(date__year=int(year))
    if month:
        transactions = transactions.filter(date__month=int(month))

    # Search filter
    search = request.GET.get('search')
    if search:
        transactions = transactions.filter(
            Q(description__icontains=search) |
            Q(category__icontains=search)
        )

    # Filter by data source artifact
    data_source_artifact_id = request.GET.get('data_source_artifact')
    if data_source_artifact_id:
        transactions = transactions.filter(data_source_artifact_id=data_source_artifact_id)

    # Calculate aggregate stats
    total_charges = transactions.filter(amount__gt=0).aggregate(total=Sum('amount'))['total'] or 0
    total_payments = abs(transactions.filter(amount__lt=0).aggregate(total=Sum('amount'))['total'] or 0)

    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    total = transactions.count()
    transactions_page = transactions[offset:offset + limit]

    data = []
    for t in transactions_page:
        # Get bank payment match if exists and is active
        bank_match_data = None
        try:
            bank_match = t.bank_payment_match
            if bank_match and bank_match.is_active:
                bank_txn = bank_match.bank_transaction
                # Skip orphaned transactions
                if not bank_txn.data_source_artifact_id:
                    raise AttributeError("Orphaned transaction")
                bank_match_data = {
                    'id': bank_match.id,
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
                    'offset': float(bank_match.offset),
                    'confidence_score': bank_match.confidence_score,
                    'match_reasons': bank_match.match_reasons,
                }
        except Exception:
            pass

        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'description': t.description,
            'amount': float(t.amount),
            'intl_amount': float(t.intl_amount),
            'intl_currency': t.intl_currency,
            'exchange_rate': float(t.exchange_rate) if t.exchange_rate else None,
            'category': t.category,
            'credit_card': {
                'id': t.credit_card.id,
                'nickname': t.credit_card.nickname,
            } if t.credit_card else None,
            'bank_payment_match': bank_match_data,
        })

    return JsonResponse({
        'data': data,
        'total': total,
        'stats': {
            'total_charges': float(total_charges),
            'total_payments': float(total_payments),
            'net': float(total_charges - total_payments),
        }
    })


@extend_schema(
    summary="Get credit card date range",
    description="Get available years and months with credit card transaction data.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Date Range',
            value={'years': {'2024': [1, 2, 3, 4, 5, 6], '2023': [7, 8, 9, 10, 11, 12]}},
            response_only=True,
        ),
    ],
    tags=['Credit Card Transactions'],
)
@api_view(['GET'])
def credit_card_date_range(request):
    """Get available years and months with credit card transaction data."""
    dates = get_active_cc_transactions().dates('date', 'month', order='ASC')

    years = {}
    for d in dates:
        year = str(d.year)
        month = d.month
        if year not in years:
            years[year] = []
        years[year].append(month)

    return JsonResponse({'years': years})


PREDEFINED_CC_CATEGORIES = [
    'Uncategorized',
    'Credit Card Payment',
    'Food Delivery',
    'Transport',
    'Shopping',
    'Entertainment',
    'Utilities',
    'Rent',
    'Cafe & Restaurant',
    'Personal Care',
    'Legal Services',
    'Sports',
    'Medical',
    'Groceries',
]


@extend_schema(
    summary="Get credit card categories",
    description="Get credit card categories with transaction counts and totals.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='include_all', type=OpenApiTypes.BOOL, location=OpenApiParameter.QUERY, description='Include uncategorized (default: false)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Credit Card Categories',
            value={
                'categories': [
                    {'category': 'Shopping', 'count': 50, 'amount': 25000.0},
                    {'category': 'Food Delivery', 'count': 30, 'amount': 8000.0},
                    {'category': 'Transport', 'count': 20, 'amount': 3000.0},
                ]
            },
            response_only=True,
        ),
    ],
    tags=['Credit Card Transactions'],
)
@api_view(['GET'])
def credit_card_categories(request):
    """Get credit card categories with counts."""
    from django.db.models import Count

    transactions = get_active_cc_transactions()

    # Filter by credit card if specified
    card_id = request.GET.get('credit_card')
    if card_id:
        transactions = transactions.filter(credit_card_id=card_id)

    include_all = request.GET.get('include_all', 'false').lower() == 'true'

    # Aggregate by category
    categories = transactions.values('category').annotate(
        count=Count('id'),
        total_charges=Sum('amount', filter=Q(amount__gt=0)),
        total_payments=Sum('amount', filter=Q(amount__lt=0)),
    ).order_by('-count')

    # Build dict of existing categories
    existing_categories = {}
    for cat in categories:
        category_name = cat['category'] or 'Uncategorized'
        existing_categories[category_name] = {
            'count': cat['count'],
            'total_charges': float(cat['total_charges'] or 0),
            'total_payments': float(abs(cat['total_payments'] or 0)),
        }

    # Add predefined categories with zero counts if they don't exist
    for cat_name in PREDEFINED_CC_CATEGORIES:
        if cat_name not in existing_categories:
            existing_categories[cat_name] = {
                'count': 0,
                'total_charges': 0,
                'total_payments': 0,
            }

    data = []
    for category_name, stats in existing_categories.items():
        if not include_all and category_name == 'Uncategorized':
            continue
        data.append({
            'category': category_name,
            'count': stats['count'],
            'total_charges': stats['total_charges'],
            'total_payments': stats['total_payments'],
        })

    # Sort: Uncategorized first if include_all, then by count (non-zero first), then alphabetically
    if include_all:
        data.sort(key=lambda x: (x['category'] != 'Uncategorized', -x['count'], x['category']))
    else:
        data.sort(key=lambda x: (-x['count'], x['category']))

    return JsonResponse({'data': data})


@extend_schema(
    summary="Update credit card transaction category",
    description="Update a credit card transaction's category.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card Transactions'],
    examples=[
        OpenApiExample(
            'Update category',
            value={'category': 'Food & Dining'},
            request_only=True,
        )
    ],
)
@api_view(['PATCH'])
def credit_card_transaction_category(request, transaction_id):
    """Update a credit card transaction's category."""
    try:
        transaction = CreditCardTransaction.objects.get(id=transaction_id)
    except CreditCardTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if 'category' in data:
        new_category = data['category']
        if new_category == 'Uncategorized':
            new_category = ''
        transaction.category = new_category
        transaction.save()

    return JsonResponse({
        'id': transaction.id,
        'category': transaction.category or 'Uncategorized',
    })


@extend_schema(
    summary="Get credit card inconsistencies",
    description="Detect inconsistencies: same-card duplicates, cross-card matches, missing descriptions.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='include_dismissed', type=OpenApiTypes.BOOL, location=OpenApiParameter.QUERY, description='Include dismissed inconsistencies (default: false)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Credit Card Inconsistencies',
            value={
                'data': [{
                    'type': 'same_card_duplicate',
                    'key': '1_2024-01-15_Amazon Purchase_2500.0',
                    'dismissed': False,
                    'transactions': [{
                        'id': 1,
                        'date': '2024-01-15',
                        'description': 'Amazon Purchase',
                        'amount': 2500.0,
                        'credit_card': {'id': 1, 'nickname': 'HDFC Card'},
                    }],
                }],
                'counts': {
                    'same_card_duplicate': 2,
                    'cross_card_match': 1,
                    'missing_description': 3,
                },
                'total': 6,
            },
            response_only=True,
        ),
    ],
    tags=['Credit Card Transactions'],
)
@api_view(['GET'])
def credit_card_inconsistencies(request):
    """Detect inconsistencies in credit card transactions.

    Returns:
    - Duplicate transactions: Same card, same date + description + amount (real duplicates)
    - Cross-card matches: Different cards, same date + description + amount (likely linked cards)
    - Missing descriptions: Transactions with empty description field

    Query params:
    - credit_card: Filter by credit card ID
    - include_dismissed: Include dismissed inconsistencies (default: false)
    """
    from django.db.models import Count
    from .models import DismissedCreditCardInconsistency

    card_id = request.GET.get('credit_card')
    include_dismissed = request.GET.get('include_dismissed', 'false').lower() == 'true'

    # Check cache first
    cache_key = get_cc_inconsistencies_key(card_id, include_dismissed)
    cached = cache.get(cache_key)
    if cached is not None:
        return JsonResponse(cached)

    transactions = get_active_cc_transactions().select_related('credit_card')

    if card_id:
        transactions = transactions.filter(credit_card_id=card_id)

    inconsistencies = []

    # 1. Find SAME-CARD duplicates (real duplicates within a single card)
    # Group by card + date + description + amount
    same_card_duplicates = transactions.values(
        'credit_card_id', 'date', 'description', 'amount'
    ).annotate(
        count=Count('id')
    ).filter(count__gt=1, credit_card_id__isnull=False)

    same_card_dup_keys = set()
    for dup in same_card_duplicates:
        key = (dup['credit_card_id'], dup['date'], dup['description'], float(dup['amount']))
        same_card_dup_keys.add(key)

    # Build map of (date, desc, amount) -> list of transactions for cross-card detection
    cross_card_map = {}  # key -> list of (card_id, transaction)
    for t in transactions:
        if t.credit_card_id:
            key = (t.date, t.description, float(t.amount))
            if key not in cross_card_map:
                cross_card_map[key] = []
            cross_card_map[key].append(t)

    # Process same-card duplicates
    processed_same_card = set()  # Track which groups we've already added
    for t in transactions:
        if not t.credit_card_id:
            continue
        same_card_key = (t.credit_card_id, t.date, t.description, float(t.amount))
        if same_card_key in same_card_dup_keys and same_card_key not in processed_same_card:
            # Find all transactions in this duplicate group
            group_key = (t.date, t.description, float(t.amount))
            group_txns = [tx for tx in cross_card_map.get(group_key, [])
                         if tx.credit_card_id == t.credit_card_id]
            group_ids = [tx.id for tx in group_txns]

            # Check if dismissed
            is_dismissed = DismissedCreditCardInconsistency.is_dismissed('duplicate', group_ids)
            if is_dismissed and not include_dismissed:
                processed_same_card.add(same_card_key)
                continue

            for tx in group_txns:
                inconsistencies.append({
                    'id': tx.id,
                    'type': 'duplicate',
                    'date': tx.date.isoformat(),
                    'description': tx.description,
                    'amount': float(tx.amount),
                    'category': tx.category or 'Uncategorized',
                    'credit_card': {
                        'id': tx.credit_card.id,
                        'nickname': tx.credit_card.nickname,
                    } if tx.credit_card else None,
                    'message': f"Duplicate transaction on same card",
                    'related_ids': group_ids,
                    'dismissed': is_dismissed,
                })
            processed_same_card.add(same_card_key)

    # 2. Find CROSS-CARD matches (same transaction on different cards)
    # Only when not filtering by a specific card
    if not card_id:
        processed_cross_card = set()
        for key, txns in cross_card_map.items():
            if key in processed_cross_card:
                continue
            # Check if there are transactions on different cards
            card_ids = set(tx.credit_card_id for tx in txns)
            if len(card_ids) > 1:
                group_ids = [tx.id for tx in txns]

                # Check if dismissed
                is_dismissed = DismissedCreditCardInconsistency.is_dismissed('cross_card', group_ids)
                if is_dismissed and not include_dismissed:
                    processed_cross_card.add(key)
                    continue

                for tx in txns:
                    # Skip if this transaction is also part of a same-card duplicate
                    same_card_key = (tx.credit_card_id, tx.date, tx.description, float(tx.amount))
                    if same_card_key in same_card_dup_keys:
                        continue

                    inconsistencies.append({
                        'id': tx.id,
                        'type': 'cross_card',
                        'date': tx.date.isoformat(),
                        'description': tx.description,
                        'amount': float(tx.amount),
                        'category': tx.category or 'Uncategorized',
                        'credit_card': {
                            'id': tx.credit_card.id,
                            'nickname': tx.credit_card.nickname,
                        } if tx.credit_card else None,
                        'message': f"Same transaction on {len(card_ids)} different cards",
                        'related_ids': group_ids,
                        'dismissed': is_dismissed,
                    })
                processed_cross_card.add(key)

    # 3. Find transactions with missing descriptions
    missing_desc = transactions.filter(
        Q(description__isnull=True) | Q(description='')
    )

    for t in missing_desc:
        is_dismissed = DismissedCreditCardInconsistency.is_dismissed('missing_description', [t.id])
        if is_dismissed and not include_dismissed:
            continue

        inconsistencies.append({
            'id': t.id,
            'type': 'missing_description',
            'date': t.date.isoformat(),
            'description': t.description or '',
            'amount': float(t.amount),
            'category': t.category or 'Uncategorized',
            'credit_card': {
                'id': t.credit_card.id,
                'nickname': t.credit_card.nickname,
            } if t.credit_card else None,
            'message': "Transaction has no description",
            'related_ids': [t.id],
            'dismissed': is_dismissed,
        })

    # Sort by date descending
    inconsistencies.sort(key=lambda x: x['date'], reverse=True)

    # Count by type
    duplicate_count = sum(1 for i in inconsistencies if i['type'] == 'duplicate')
    cross_card_count = sum(1 for i in inconsistencies if i['type'] == 'cross_card')
    missing_desc_count = sum(1 for i in inconsistencies if i['type'] == 'missing_description')

    result = {
        'data': inconsistencies,
        'total': len(inconsistencies),
        'counts': {
            'duplicate': duplicate_count,
            'cross_card': cross_card_count,
            'missing_description': missing_desc_count,
        }
    }

    # Cache the result (no timeout, invalidated manually)
    cache.set(cache_key, result, None)

    return JsonResponse(result)


@extend_schema(
    summary="Dismiss credit card inconsistency",
    description="Dismiss a credit card inconsistency as a false positive.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Card Transactions'],
    examples=[
        OpenApiExample(
            'Dismiss inconsistency',
            value={
                'type': 'duplicate',
                'transaction_ids': [1, 2],
                'reason': 'Not a real duplicate'
            },
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def dismiss_credit_card_inconsistency(request):
    """Dismiss a credit card inconsistency as a false positive."""
    from .models import DismissedCreditCardInconsistency

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    inconsistency_type = data.get('type')
    transaction_ids = data.get('transaction_ids', [])
    reason = data.get('reason', '')

    if not inconsistency_type:
        return JsonResponse({'error': 'Missing type'}, status=400)
    if not transaction_ids:
        return JsonResponse({'error': 'Missing transaction_ids'}, status=400)

    valid_types = ['duplicate', 'cross_card', 'missing_description']
    if inconsistency_type not in valid_types:
        return JsonResponse({'error': f'Invalid type. Must be one of: {valid_types}'}, status=400)

    try:
        key = DismissedCreditCardInconsistency.make_key(transaction_ids)
        dismissed, created = DismissedCreditCardInconsistency.objects.get_or_create(
            inconsistency_type=inconsistency_type,
            transaction_ids=key,
            defaults={'reason': reason}
        )
        if not created and reason:
            dismissed.reason = reason
            dismissed.save()

        # Invalidate cache after successful dismiss
        invalidate_cc_inconsistencies()

        return JsonResponse({
            'success': True,
            'created': created,
            'id': dismissed.id,
            'type': inconsistency_type,
            'transaction_ids': transaction_ids,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    summary="Restore credit card inconsistency",
    description="Restore a previously dismissed credit card inconsistency.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Card Transactions'],
    examples=[
        OpenApiExample(
            'Restore inconsistency',
            value={
                'type': 'duplicate',
                'transaction_ids': [1, 2]
            },
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def restore_credit_card_inconsistency(request):
    """Restore a previously dismissed credit card inconsistency."""
    from .models import DismissedCreditCardInconsistency

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    inconsistency_type = data.get('type')
    transaction_ids = data.get('transaction_ids', [])

    if not inconsistency_type:
        return JsonResponse({'error': 'Missing type'}, status=400)
    if not transaction_ids:
        return JsonResponse({'error': 'Missing transaction_ids'}, status=400)

    key = DismissedCreditCardInconsistency.make_key(transaction_ids)
    deleted, _ = DismissedCreditCardInconsistency.objects.filter(
        inconsistency_type=inconsistency_type,
        transaction_ids=key
    ).delete()

    # Invalidate cache after successful restore
    invalidate_cc_inconsistencies()

    return JsonResponse({
        'success': True,
        'deleted': deleted > 0,
        'type': inconsistency_type,
        'transaction_ids': transaction_ids,
    })
