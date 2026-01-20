import json
import os
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

from .models import CreditCard, CreditCardSourceFile, CreditCardTransaction, CreditCardPDFExtraction, ExtractionArtifact


def get_active_cc_transactions():
    """Get transactions from loaded extractions only.

    Only includes transactions that:
    - Have a source_artifact (loaded via artifact system)
    - Come from non-hidden, non-superseded extractions
    """
    return CreditCardTransaction.objects.filter(
        source_artifact__isnull=False,
        pdf_extraction__isnull=False,
        pdf_extraction__hidden=False,
    ).exclude(
        pdf_extraction__status='superseded'
    )


def get_credit_card_source_files_with_stats():
    """Get list of credit card statement files with transaction date ranges.

    Only returns files that have file_data blob stored in DB.
    """
    files = []
    # Only return files with file_data blob stored in DB
    for sf in CreditCardSourceFile.objects.select_related('credit_card').exclude(file_data=b'').exclude(file_data__isnull=True):
        file_info = {
            'id': sf.id,
            'filename': sf.filename,
            'credit_card_id': sf.credit_card.id if sf.credit_card else None,
            'credit_card_nickname': sf.credit_card.nickname if sf.credit_card else None,
            'disabled': sf.disabled,
        }

        # Get date range from active transactions linked to this source file
        active_txns = get_active_cc_transactions().filter(source_file=sf)
        date_range = active_txns.aggregate(
            first_date=Min('date'),
            last_date=Max('date')
        )
        file_info['first_transaction_date'] = date_range['first_date'].isoformat() if date_range['first_date'] else None
        file_info['last_transaction_date'] = date_range['last_date'].isoformat() if date_range['last_date'] else None
        file_info['transaction_count'] = active_txns.count()

        # Get extraction name from most recent non-superseded PDF extraction
        latest_extraction = CreditCardPDFExtraction.objects.filter(
            source_file=sf
        ).exclude(
            status='superseded'
        ).order_by('-extracted_at').first()
        file_info['extraction_name'] = latest_extraction.name if latest_extraction else None

        files.append(file_info)

    # Sort by first_transaction_date descending
    files.sort(key=lambda f: (f['first_transaction_date'] is not None, f['first_transaction_date'] or ''), reverse=True)
    return files


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
    earliest = transactions.order_by('date', 'source_file__date_range_start', 'row_number').first()

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
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['POST'],
    summary="Create credit card",
    description="Create a new credit card and optionally link source files.",
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
                'source_files': ['statement.csv']
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
        for card in CreditCard.objects.prefetch_related('source_files').all():
            card_dict = {
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
                'source_files': [sf.filename for sf in card.source_files.all()],
                'created_at': card.created_at.isoformat() if card.created_at else None,
                'updated_at': card.updated_at.isoformat() if card.updated_at else None,
            }
            card_dict.update(get_credit_card_stats(card))
            cards_data.append(card_dict)

        source_files = get_credit_card_source_files_with_stats()
        return JsonResponse({
            'cards': cards_data,
            'source_files': source_files
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

            # Link source files to the card
            source_files = data.get('source_files', [])
            if isinstance(source_files, str):
                source_files = [source_files] if source_files else []
            for filename in source_files:
                sf, _ = CreditCardSourceFile.objects.get_or_create(filename=filename)
                sf.credit_card = card
                sf.save()
                # Update transactions from this source file to link to card
                CreditCardTransaction.objects.filter(source_file=sf).update(credit_card=card)

            return JsonResponse({
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
                'source_files': [sf.filename for sf in card.source_files.all()],
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='credit_cards_detail',
    summary="Get credit card",
    description="Get details of a specific credit card.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update credit card",
    description="Update credit card details and source file linkage.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Cards'],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete credit card",
    description="Delete a credit card.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Cards'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def credit_card_detail(request, card_id):
    """Get, update, or delete a credit card."""
    try:
        card = CreditCard.objects.prefetch_related('source_files').get(id=card_id)
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
            'source_files': [sf.filename for sf in card.source_files.all()],
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

            # Update source files if provided
            if 'source_files' in data:
                new_source_files = data['source_files']
                if isinstance(new_source_files, str):
                    new_source_files = [new_source_files] if new_source_files else []

                current_filenames = set(sf.filename for sf in card.source_files.all())
                new_filenames = set(new_source_files)

                # Unlink files
                for sf in card.source_files.all():
                    if sf.filename not in new_filenames:
                        CreditCardTransaction.objects.filter(source_file=sf).update(credit_card=None)
                        sf.credit_card = None
                        sf.save()

                # Link new files
                for filename in new_filenames - current_filenames:
                    sf, _ = CreditCardSourceFile.objects.get_or_create(filename=filename)
                    sf.credit_card = card
                    sf.save()
                    CreditCardTransaction.objects.filter(source_file=sf).update(credit_card=card)

            return JsonResponse({
                'id': card.id,
                'nickname': card.nickname,
                'card_name': card.card_name,
                'card_number_mask': card.card_number_mask,
                'issuer': card.issuer,
                'credit_limit': float(card.credit_limit) if card.credit_limit else None,
                'source_files': [sf.filename for sf in card.source_files.all()],
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        card.delete()
        return JsonResponse({'success': True})


@extend_schema(
    summary="Toggle credit card source file",
    description="Toggle the disabled state of a credit card source file.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Cards'],
    examples=[
        OpenApiExample(
            'Toggle disabled',
            value={'disabled': True},
            request_only=True,
        )
    ],
)
@api_view(['PATCH'])
def credit_card_source_file_toggle(request, source_file_id):
    """Toggle the disabled state of a credit card source file."""
    try:
        source_file = CreditCardSourceFile.objects.get(id=source_file_id)
    except CreditCardSourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if 'disabled' in data:
        source_file.disabled = data['disabled']
        source_file.save()
        invalidate_cc_inconsistencies()

    return JsonResponse({
        'id': source_file.id,
        'filename': source_file.filename,
        'disabled': source_file.disabled,
    })


@extend_schema(
    summary="List credit card transactions",
    description="List credit card transactions with filtering and pagination.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='category', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by category'),
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by type: charge or payment'),
        OpenApiParameter(name='source_file', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by source file ID'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
        OpenApiParameter(name='month', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by month (1-12)'),
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search description or category'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card Transactions'],
)
@api_view(['GET'])
def credit_card_transactions(request):
    """List credit card transactions with filters."""
    transactions = get_active_cc_transactions().select_related(
        'credit_card',
        'source_file',
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

    # Filter by source file
    source_file_id = request.GET.get('source_file')
    if source_file_id:
        transactions = transactions.filter(source_file_id=source_file_id)

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
            'source_file': {
                'id': t.source_file.id,
                'filename': t.source_file.filename,
            } if t.source_file else None,
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


@extend_schema(
    summary="Get credit card categories",
    description="Get credit card categories with transaction counts and totals.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='include_all', type=OpenApiTypes.BOOL, location=OpenApiParameter.QUERY, description='Include uncategorized (default: false)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
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

    data = []
    for cat in categories:
        category_name = cat['category'] or 'Uncategorized'
        if not include_all and category_name == 'Uncategorized':
            continue
        data.append({
            'category': category_name,
            'count': cat['count'],
            'total_charges': float(cat['total_charges'] or 0),
            'total_payments': float(abs(cat['total_payments'] or 0)),
        })

    # Sort: Uncategorized first if include_all, then by count
    if include_all:
        data.sort(key=lambda x: (x['category'] != 'Uncategorized', -x['count']))

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

    # Filter by credit card if specified
    card_id = request.GET.get('credit_card')
    include_dismissed = request.GET.get('include_dismissed', 'false').lower() == 'true'

    # Check cache first
    cache_key = get_cc_inconsistencies_key(card_id, include_dismissed)
    cached = cache.get(cache_key)
    if cached is not None:
        return JsonResponse(cached)

    transactions = get_active_cc_transactions().select_related(
        'credit_card',
        'source_file',
    )

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
                    'source_file': {
                        'id': tx.source_file.id,
                        'filename': tx.source_file.filename,
                    } if tx.source_file else None,
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
                        'source_file': {
                            'id': tx.source_file.id,
                            'filename': tx.source_file.filename,
                        } if tx.source_file else None,
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
            'source_file': {
                'id': t.source_file.id,
                'filename': t.source_file.filename,
            } if t.source_file else None,
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


# ==================== PDF Extractions ====================

def serialize_artifact(artifact):
    """Serialize an ExtractionArtifact for API response."""
    return {
        'artifact_id': artifact.artifact_id,
        'artifact_type': artifact.artifact_type,
        'content_type': artifact.content_type,
        'row_count': artifact.row_count,
        'is_transformable': artifact.is_transformable,
        'is_transformed': artifact.is_transformed,
        'transformer_name': artifact.transformer_name or None,
        'source_artifact_id': artifact.source_artifact.artifact_id if artifact.source_artifact else None,
    }


def serialize_extraction(ext, include_artifacts=True):
    """Serialize a CreditCardPDFExtraction for API response."""
    artifacts = list(ext.artifacts.all())

    # Calculate transformation status
    transformable = [a for a in artifacts if a.is_transformable]
    transformed = [a for a in artifacts if a.is_transformed]
    transformable_count = len(transformable)
    transformed_count = len(transformed)

    # Check if all transformable artifacts have been transformed
    # (each transformable artifact should have a corresponding transformed artifact)
    all_transformed = transformable_count > 0 and all(
        any(t.source_artifact_id == a.id for t in artifacts if t.is_transformed)
        for a in transformable
    )

    data = {
        'id': ext.id,
        'name': ext.name,
        'source_file': {
            'id': ext.source_file.id,
            'filename': ext.source_file.filename,
        },
        'credit_card': {
            'id': ext.credit_card.id,
            'nickname': ext.credit_card.nickname,
        } if ext.credit_card else None,
        'statement_date': ext.statement_date.isoformat() if ext.statement_date else None,
        'statement_period_begin': ext.statement_period_begin.isoformat() if ext.statement_period_begin else None,
        'statement_period_end': ext.statement_period_end.isoformat() if ext.statement_period_end else None,
        'payment_due_date': ext.payment_due_date.isoformat() if ext.payment_due_date else None,
        'card_number_mask': ext.card_number_mask,
        'invoice_number': ext.invoice_number,
        'total_amount_due': float(ext.total_amount_due) if ext.total_amount_due else None,
        'minimum_amount_due': float(ext.minimum_amount_due) if ext.minimum_amount_due else None,
        'status': ext.status,
        'extracted_at': ext.extracted_at.isoformat(),
        'loaded_at': ext.loaded_at.isoformat() if ext.loaded_at else None,
        'error_message': ext.error_message,
        'extractor_version': ext.extractor_version,
        'hidden': ext.hidden,
        # Transformation status summary
        'transformable_count': transformable_count,
        'transformed_count': transformed_count,
        'all_transformed': all_transformed,
    }

    if include_artifacts:
        data['artifacts'] = [serialize_artifact(a) for a in artifacts]

    return data


@extend_schema(
    summary="List PDF extractions",
    description="List all credit card PDF extractions with nested artifacts. By default hides archived extractions.",
    parameters=[
        OpenApiParameter(name='include_hidden', type=OpenApiTypes.BOOL, location=OpenApiParameter.QUERY, description='Include hidden/archived extractions (default: false)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['GET'])
def pdf_extraction_list(request):
    """List all PDF extractions with nested artifacts."""
    include_hidden = request.GET.get('include_hidden', 'false').lower() == 'true'

    extractions = CreditCardPDFExtraction.objects.select_related(
        'source_file', 'credit_card'
    ).prefetch_related('artifacts')

    if not include_hidden:
        extractions = extractions.filter(hidden=False)

    data = [serialize_extraction(ext) for ext in extractions]

    return JsonResponse({'data': data})


@extend_schema(
    summary="Get PDF extraction detail",
    description="Get details of a specific PDF extraction with artifacts.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['GET'])
def pdf_extraction_detail(request, extraction_id):
    """Get PDF extraction detail with artifacts."""
    try:
        ext = CreditCardPDFExtraction.objects.select_related(
            'source_file', 'credit_card'
        ).prefetch_related('artifacts').get(id=extraction_id)
    except CreditCardPDFExtraction.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)

    return JsonResponse(serialize_extraction(ext))


# ==================== Artifact Endpoints ====================

@extend_schema(
    summary="Download artifact by ID",
    description="Download raw artifact blob by artifact_id.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Extraction Artifacts'],
)
@api_view(['GET'])
def artifact_download(request, artifact_id):
    """Download raw artifact by artifact_id."""
    from django.http import HttpResponse
    from .pdf_extractor import decompress_data

    try:
        artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        return JsonResponse({'error': 'Artifact not found'}, status=404)

    data = decompress_data(artifact.data)
    ext_name = artifact.extraction.name

    # Use startswith to match: transactions*, ingestable_transactions*, emi
    is_csv = (artifact.artifact_type.startswith('transactions') or
              artifact.artifact_type.startswith('ingestable_transactions') or
              artifact.artifact_type == 'emi')

    if is_csv:
        response = HttpResponse(data, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{ext_name}_{artifact.artifact_type}.csv"'
    else:
        response = HttpResponse(data, content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="{ext_name}_{artifact.artifact_type}.json"'

    return response


@extend_schema(
    summary="Get artifact preview by ID",
    description="Get artifact content for preview by artifact_id.",
    parameters=[
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Max rows to return for CSV (default: 10)'),
    ],
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Extraction Artifacts'],
)
@api_view(['GET'])
def artifact_preview(request, artifact_id):
    """Get artifact preview as JSON by artifact_id."""
    import csv
    import io
    from .pdf_extractor import decompress_data

    try:
        artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        return JsonResponse({'error': 'Artifact not found'}, status=404)

    limit = int(request.GET.get('limit', 10))
    data = decompress_data(artifact.data)

    # Handle CSV artifacts (transactions and ingestable)
    # Use startswith to match: transactions, transactions-{card}, ingestable_transactions, ingestable_transactions-{card}
    is_transactions = artifact.artifact_type.startswith('transactions') or artifact.artifact_type.startswith('ingestable_transactions')
    is_emi = artifact.artifact_type == 'emi'

    if is_transactions or is_emi:
        reader = csv.DictReader(io.StringIO(data))
        rows = []
        for i, row in enumerate(reader):
            if is_transactions and i >= limit:
                break
            rows.append(row)
        return JsonResponse({'data': rows, 'total': artifact.row_count})

    elif artifact.artifact_type == 'metadata':
        return JsonResponse({'data': json.loads(data)})

    else:
        return JsonResponse({'error': f'Unknown artifact type: {artifact.artifact_type}'}, status=400)


@extend_schema(
    summary="Trigger PDF extraction",
    description="Trigger extraction for a PDF source file.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Extract with password',
            value={'password': 'optional_pdf_password'},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_extract(request, source_file_id):
    """Trigger extraction for a PDF source file."""
    from .pdf_extractor import create_pdf_extraction

    try:
        source_file = CreditCardSourceFile.objects.get(id=source_file_id)
    except CreditCardSourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    # Check if file has data stored
    if not source_file.file_data:
        return JsonResponse({'error': 'Source file has no stored data'}, status=400)

    # Check if it's a PDF
    if not source_file.filename.lower().endswith('.pdf'):
        return JsonResponse({'error': 'Source file is not a PDF'}, status=400)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    password = data.get('password')

    # Use saved password if none provided
    if not password and source_file.pdf_password:
        password = source_file.pdf_password

    try:
        # Decompress file data
        import gzip
        file_bytes = gzip.decompress(source_file.file_data)

        # Create extraction
        extraction = create_pdf_extraction(source_file, file_bytes, password=password)

        # Save password on successful extraction (if provided and not already saved)
        if password and source_file.pdf_password != password:
            source_file.pdf_password = password
            source_file.save()

        # Get row counts from artifacts
        txn_artifact = extraction.transactions_artifact
        emi_artifact = extraction.emi_artifact

        return JsonResponse({
            'success': True,
            'extraction': {
                'id': extraction.id,
                'name': extraction.name,
                'transactions_row_count': txn_artifact.row_count if txn_artifact else 0,
                'emi_row_count': emi_artifact.row_count if emi_artifact else 0,
                'statement_date': extraction.statement_date.isoformat() if extraction.statement_date else None,
            },
            'password_saved': bool(password),
        })
    except Exception as e:
        error_msg = str(e)
        # Check for password-related errors
        if 'password' in error_msg.lower() or 'PDFPasswordIncorrect' in type(e).__name__ or not error_msg:
            error_msg = 'PDF is password-protected. Please provide the correct password.'
        return JsonResponse({'error': error_msg}, status=400)


@extend_schema(
    summary="Load transactions from PDF extractions",
    description="Load transactions from PDF extractions into the database.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Load extractions',
            value={'extraction_ids': [1, 2, 3]},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_load(request):
    """Load transactions from PDF extractions into DB."""
    from django.utils import timezone
    from .pdf_extractor import load_transactions_from_extraction

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_ids = data.get('extraction_ids', [])
    if not extraction_ids:
        return JsonResponse({'error': 'No extraction IDs provided'}, status=400)

    results = []
    for ext_id in extraction_ids:
        try:
            extraction = CreditCardPDFExtraction.objects.get(id=ext_id)

            if extraction.status == 'loaded':
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': 'Already loaded',
                })
                continue

            # Mark as loading
            extraction.status = 'loading'
            extraction.save()

            try:
                transactions = load_transactions_from_extraction(extraction)
                results.append({
                    'id': ext_id,
                    'success': True,
                    'message': f'Loaded {len(transactions)} transactions',
                    'transaction_count': len(transactions),
                })
            except Exception as e:
                extraction.status = 'error'
                extraction.error_message = str(e)
                extraction.save()
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': str(e),
                })

        except CreditCardPDFExtraction.DoesNotExist:
            results.append({
                'id': ext_id,
                'success': False,
                'message': 'Extraction not found',
            })

    invalidate_cc_inconsistencies()
    return JsonResponse({'results': results})


@extend_schema(
    summary="Unload transactions from PDF extractions",
    description="Undo loading by deleting transactions and resetting extraction status.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Unload extractions',
            value={'extraction_ids': [1, 2, 3]},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_unload(request):
    """Unload transactions from PDF extractions (undo load)."""
    from .models import CreditCardTransaction

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_ids = data.get('extraction_ids', [])
    if not extraction_ids:
        return JsonResponse({'error': 'No extraction IDs provided'}, status=400)

    results = []
    for ext_id in extraction_ids:
        try:
            extraction = CreditCardPDFExtraction.objects.get(id=ext_id)

            if extraction.status != 'loaded':
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': f'Extraction is not loaded (status: {extraction.status})',
                })
                continue

            # Delete transactions linked to this extraction
            deleted_count, _ = CreditCardTransaction.objects.filter(
                pdf_extraction=extraction
            ).delete()

            # Reset extraction status to transformed (keep ingestable artifact)
            extraction.status = 'transformed'
            extraction.loaded_at = None
            extraction.error_message = ''
            extraction.save()

            results.append({
                'id': ext_id,
                'success': True,
                'message': f'Unloaded {deleted_count} transactions',
                'deleted_count': deleted_count,
            })

        except CreditCardPDFExtraction.DoesNotExist:
            results.append({
                'id': ext_id,
                'success': False,
                'message': 'Extraction not found',
            })

    invalidate_cc_inconsistencies()
    return JsonResponse({'results': results})


@extend_schema(
    summary="Load transactions from artifacts",
    description="Load transactions from specific artifacts into the database. Allows loading artifacts independently.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Extraction Artifacts'],
    examples=[
        OpenApiExample(
            'Load artifacts',
            value={'artifact_ids': ['artifact_abc123', 'artifact_def456']},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def artifact_load(request):
    """Load transactions from specific artifacts into DB."""
    from .pdf_extractor import load_transactions_from_artifact
    from .models import CreditCardTransaction

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    artifact_ids = data.get('artifact_ids', [])
    if not artifact_ids:
        return JsonResponse({'error': 'No artifact IDs provided'}, status=400)

    results = []
    for artifact_id in artifact_ids:
        try:
            artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)

            # Check if already loaded (has transactions linked to this artifact)
            existing_count = CreditCardTransaction.objects.filter(source_artifact=artifact).count()
            if existing_count > 0:
                results.append({
                    'artifact_id': artifact_id,
                    'success': False,
                    'message': f'Already loaded ({existing_count} transactions)',
                })
                continue

            # Check if it's an ingestable artifact
            if not artifact.artifact_type.startswith('ingestable_'):
                results.append({
                    'artifact_id': artifact_id,
                    'success': False,
                    'message': 'Not an ingestable artifact',
                })
                continue

            try:
                transactions = load_transactions_from_artifact(artifact)
                results.append({
                    'artifact_id': artifact_id,
                    'success': True,
                    'message': f'Loaded {len(transactions)} transactions',
                    'transaction_count': len(transactions),
                })
            except Exception as e:
                results.append({
                    'artifact_id': artifact_id,
                    'success': False,
                    'message': str(e),
                })

        except ExtractionArtifact.DoesNotExist:
            results.append({
                'artifact_id': artifact_id,
                'success': False,
                'message': 'Artifact not found',
            })

    invalidate_cc_inconsistencies()
    return JsonResponse({'results': results})


@extend_schema(
    summary="Unload transactions from artifacts",
    description="Undo loading by deleting transactions linked to specific artifacts.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Extraction Artifacts'],
    examples=[
        OpenApiExample(
            'Unload artifacts',
            value={'artifact_ids': ['artifact_abc123', 'artifact_def456']},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def artifact_unload(request):
    """Unload transactions from specific artifacts (undo load)."""
    from .models import CreditCardTransaction

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    artifact_ids = data.get('artifact_ids', [])
    if not artifact_ids:
        return JsonResponse({'error': 'No artifact IDs provided'}, status=400)

    results = []
    for artifact_id in artifact_ids:
        try:
            artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)

            # Delete transactions linked to this artifact
            deleted_count, _ = CreditCardTransaction.objects.filter(
                source_artifact=artifact
            ).delete()

            # Also check for legacy transactions (source_artifact=NULL) from the same extraction
            legacy_deleted = 0
            if deleted_count == 0:
                # Check if there are legacy transactions without source_artifact
                legacy_count = CreditCardTransaction.objects.filter(
                    pdf_extraction=artifact.extraction,
                    source_artifact__isnull=True
                ).count()

                if legacy_count > 0:
                    # For multi-card extractions, we can't determine which artifact
                    # the legacy transactions belong to, so delete all legacy ones
                    legacy_deleted, _ = CreditCardTransaction.objects.filter(
                        pdf_extraction=artifact.extraction,
                        source_artifact__isnull=True
                    ).delete()

            total_deleted = deleted_count + legacy_deleted

            if total_deleted == 0:
                results.append({
                    'artifact_id': artifact_id,
                    'success': False,
                    'message': 'No transactions to unload',
                })
            else:
                message = f'Unloaded {total_deleted} transactions'
                if legacy_deleted > 0:
                    message += f' ({legacy_deleted} legacy)'
                results.append({
                    'artifact_id': artifact_id,
                    'success': True,
                    'message': message,
                    'deleted_count': total_deleted,
                })

        except ExtractionArtifact.DoesNotExist:
            results.append({
                'artifact_id': artifact_id,
                'success': False,
                'message': 'Artifact not found',
            })

    invalidate_cc_inconsistencies()
    return JsonResponse({'results': results})


@extend_schema(
    summary="Delete an artifact",
    description="Delete a specific artifact and its linked transactions. Does not delete the entire extraction.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Extraction Artifacts'],
    examples=[
        OpenApiExample(
            'Delete artifact',
            value={'artifact_id': 'artifact_abc123'},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def artifact_delete(request):
    """Delete a specific artifact and its linked transactions."""
    from .models import CreditCardTransaction

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    artifact_id = data.get('artifact_id')
    if not artifact_id:
        return JsonResponse({'error': 'artifact_id is required'}, status=400)

    try:
        artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        return JsonResponse({'error': 'Artifact not found'}, status=404)

    # Delete transactions linked to this artifact
    transactions_deleted, _ = CreditCardTransaction.objects.filter(
        source_artifact=artifact
    ).delete()

    # Delete the artifact itself
    artifact.delete()

    invalidate_cc_inconsistencies()
    return JsonResponse({
        'success': True,
        'artifact_id': artifact_id,
        'transactions_deleted': transactions_deleted,
    })


@extend_schema(
    summary="Toggle extraction hidden status",
    description="Hide or unhide a PDF extraction.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Toggle hidden',
            value={'extraction_id': 1, 'hidden': True},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_toggle_hidden(request):
    """Toggle hidden status for a PDF extraction."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_id = data.get('extraction_id')
    hidden = data.get('hidden')

    if extraction_id is None:
        return JsonResponse({'error': 'extraction_id is required'}, status=400)

    if hidden is None:
        return JsonResponse({'error': 'hidden is required'}, status=400)

    try:
        extraction = CreditCardPDFExtraction.objects.get(id=extraction_id)
        extraction.hidden = hidden
        extraction.save()
        invalidate_cc_inconsistencies()

        return JsonResponse({
            'success': True,
            'id': extraction_id,
            'hidden': extraction.hidden,
        })
    except CreditCardPDFExtraction.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)


@extend_schema(
    summary="Update extraction/artifact credit card",
    description="Assign or change the credit card for a PDF extraction or specific artifact. Use artifact_id for multi-card PDFs.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Assign card to artifact',
            value={'artifact_id': 'artifact_abc123', 'credit_card_id': 2},
            request_only=True,
        ),
        OpenApiExample(
            'Assign card to extraction (legacy)',
            value={'extraction_id': 1, 'credit_card_id': 2},
            request_only=True,
        ),
        OpenApiExample(
            'Remove card',
            value={'artifact_id': 'artifact_abc123', 'credit_card_id': None},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_update_card(request):
    """Update the credit card assignment for a PDF extraction or artifact."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    artifact_id = data.get('artifact_id')
    extraction_id = data.get('extraction_id')
    credit_card_id = data.get('credit_card_id')

    # Get the credit card (or None)
    card = None
    if credit_card_id is not None:
        try:
            card = CreditCard.objects.get(id=credit_card_id)
        except CreditCard.DoesNotExist:
            return JsonResponse({'error': 'Credit card not found'}, status=404)

    # If artifact_id provided, update artifact's credit_card
    if artifact_id:
        from .models import CreditCardTransaction

        try:
            artifact = ExtractionArtifact.objects.select_related('extraction').get(artifact_id=artifact_id)
        except ExtractionArtifact.DoesNotExist:
            return JsonResponse({'error': 'Artifact not found'}, status=404)

        # Try to set artifact's credit_card (field may not exist if migration not run)
        try:
            artifact.credit_card = card
            artifact.save()
        except Exception:
            # Fall back to updating extraction's credit_card
            artifact.extraction.credit_card = card
            artifact.extraction.save()

        # Also update all transactions linked to this artifact
        transactions_updated = CreditCardTransaction.objects.filter(
            source_artifact=artifact
        ).update(credit_card=card)

        invalidate_cc_inconsistencies()
        return JsonResponse({
            'success': True,
            'artifact_id': artifact_id,
            'credit_card': {
                'id': card.id,
                'nickname': card.nickname,
            } if card else None,
            'transactions_updated': transactions_updated,
        })

    # Legacy: extraction_id updates extraction's credit_card
    if extraction_id is None:
        return JsonResponse({'error': 'artifact_id or extraction_id is required'}, status=400)

    try:
        extraction = CreditCardPDFExtraction.objects.get(id=extraction_id)
    except CreditCardPDFExtraction.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)

    extraction.credit_card = card
    extraction.save()

    # Also update the source file's credit card to keep them in sync
    if extraction.source_file:
        extraction.source_file.credit_card = extraction.credit_card
        extraction.source_file.save()

    invalidate_cc_inconsistencies()
    return JsonResponse({
        'success': True,
        'id': extraction_id,
        'credit_card': {
            'id': card.id,
            'nickname': card.nickname,
        } if card else None,
    })


@extend_schema(
    summary="Transform PDF extractions",
    description="Transform extracted artifacts to ingestable format using the transformer registry.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Transform extractions',
            value={'extraction_ids': [1, 2, 3]},
            request_only=True,
        ),
        OpenApiExample(
            'Force re-transform',
            value={'extraction_ids': [1], 'force': True},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_transform(request):
    """Transform extracted artifacts to ingestable format.

    Uses the transformer registry to transform artifacts based on their
    declared transformer_name.
    """
    from .transformers import transform_artifact

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_ids = data.get('extraction_ids', [])
    force = data.get('force', False)

    if not extraction_ids:
        return JsonResponse({'error': 'No extraction IDs provided'}, status=400)

    results = []
    for ext_id in extraction_ids:
        try:
            extraction = CreditCardPDFExtraction.objects.prefetch_related('artifacts').get(id=ext_id)

            # Skip if already transformed and not force
            if extraction.status == 'transformed' and not force:
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': 'Already transformed (use force=true to re-transform)',
                })
                continue

            # Skip if loaded
            if extraction.status == 'loaded':
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': 'Cannot transform loaded extraction',
                })
                continue

            # Get all transactions artifacts (handles multi-card PDFs)
            txn_artifacts = extraction.get_transactions_artifacts()
            if not txn_artifacts:
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': 'No transactions artifact found',
                })
                continue

            # Filter to transformable artifacts with transformer_name
            transformable_artifacts = [
                a for a in txn_artifacts
                if a.is_transformable and a.transformer_name
            ]

            if not transformable_artifacts:
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': 'No transformable artifacts found',
                })
                continue

            try:
                # If force, delete existing transformed artifacts first
                if force:
                    ExtractionArtifact.objects.filter(
                        extraction=extraction,
                        is_transformed=True
                    ).delete()

                # Transform all transaction artifacts
                transformed_artifacts = []
                total_rows = 0
                for txn_artifact in transformable_artifacts:
                    transformed = transform_artifact(txn_artifact)
                    if transformed:
                        transformed_artifacts.append(transformed)
                        total_rows += txn_artifact.row_count

                if transformed_artifacts:
                    extraction.status = 'transformed'
                    extraction.save()

                    results.append({
                        'id': ext_id,
                        'success': True,
                        'message': f'Transformed {total_rows} rows from {len(transformed_artifacts)} artifact(s)',
                        'row_count': total_rows,
                        'artifact_count': len(transformed_artifacts),
                        'artifact_types': [a.artifact_type for a in transformed_artifacts],
                    })
                else:
                    results.append({
                        'id': ext_id,
                        'success': False,
                        'message': 'Transformation returned no result',
                    })

            except Exception as e:
                extraction.status = 'error'
                extraction.error_message = str(e)
                extraction.save()
                results.append({
                    'id': ext_id,
                    'success': False,
                    'message': str(e),
                })

        except CreditCardPDFExtraction.DoesNotExist:
            results.append({
                'id': ext_id,
                'success': False,
                'message': 'Extraction not found',
            })

    return JsonResponse({'results': results})


@extend_schema(
    summary="List PDF source files",
    description="List PDF source files with extraction stats.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['GET'])
def pdf_source_files_list(request):
    """List PDF source files with extraction stats.

    Only returns files that have file_data blob stored in DB.
    """
    # Get PDF source files with file_data blob stored in DB
    pdf_files = CreditCardSourceFile.objects.filter(
        filename__iendswith='.pdf'
    ).exclude(
        file_data=b''
    ).exclude(
        file_data__isnull=True
    ).select_related('credit_card').prefetch_related('pdf_extractions')

    data = []
    for sf in pdf_files:
        extractions = sf.pdf_extractions.all()
        latest_extraction = extractions.order_by('-extracted_at').first()

        data.append({
            'id': sf.id,
            'filename': sf.filename,
            'credit_card': {
                'id': sf.credit_card.id,
                'nickname': sf.credit_card.nickname,
            } if sf.credit_card else None,
            'disabled': sf.disabled,
            'has_data': bool(sf.file_data),
            'file_size': sf.file_size,
            'has_password': sf.has_password,
            'pdf_password': sf.pdf_password,  # Return actual password for UI
            'extractions_count': extractions.count(),
            'last_extracted': latest_extraction.extracted_at.isoformat() if latest_extraction else None,
            'last_extraction_id': latest_extraction.id if latest_extraction else None,
        })

    return JsonResponse({'data': data})


@extend_schema(
    summary="Update PDF password",
    description="Update or clear the saved password for a PDF source file.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Set password',
            value={'password': 'new_password'},
            request_only=True,
        ),
        OpenApiExample(
            'Clear password',
            value={'password': ''},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_source_file_password(request, source_file_id):
    """Update or clear the saved password for a PDF source file."""
    import gzip

    try:
        source_file = CreditCardSourceFile.objects.get(id=source_file_id)
    except CreditCardSourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    password = data.get('password', '')

    # If setting a password (not clearing), validate it first
    if password:
        if not source_file.file_data:
            return JsonResponse({'error': 'Source file has no stored data'}, status=400)

        try:
            import pdfplumber
            import io

            file_bytes = gzip.decompress(source_file.file_data)

            # Try to open the PDF with the provided password
            try:
                pdf = pdfplumber.open(io.BytesIO(file_bytes), password=password)
                # Try to access a page to verify the password works
                if pdf.pages:
                    _ = pdf.pages[0]
                pdf.close()
            except Exception as pdf_err:
                error_str = str(pdf_err).lower()
                if 'password' in error_str or 'encrypted' in error_str:
                    return JsonResponse({'error': 'Invalid password'}, status=400)
                # If it's not a password error, re-raise
                raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'error': f'Failed to validate password: {str(e)}'}, status=400)

    source_file.pdf_password = password
    source_file.save()

    return JsonResponse({
        'success': True,
        'id': source_file.id,
        'has_password': source_file.has_password,
    })


@extend_schema(
    summary="Delete PDF extraction",
    description="Permanently delete a PDF extraction and all its artifacts. Transactions remain but lose their link to the extraction.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
    examples=[
        OpenApiExample(
            'Delete extraction',
            value={'extraction_id': 1},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def pdf_extraction_delete(request):
    """Permanently delete a PDF extraction and all its artifacts."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_id = data.get('extraction_id')
    if extraction_id is None:
        return JsonResponse({'error': 'extraction_id is required'}, status=400)

    try:
        extraction = CreditCardPDFExtraction.objects.get(id=extraction_id)
    except CreditCardPDFExtraction.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)

    # Count affected transactions before deletion
    transactions_affected = CreditCardTransaction.objects.filter(pdf_extraction=extraction).count()

    # Delete the extraction (CASCADE will delete artifacts, SET_NULL on transactions)
    extraction.delete()

    # Invalidate cache
    invalidate_cc_inconsistencies()

    return JsonResponse({
        'success': True,
        'id': extraction_id,
        'transactions_affected': transactions_affected,
    })


@extend_schema(
    summary="Delete all PDF extractions",
    description="Permanently delete all PDF extractions and their artifacts. Transactions remain but lose their link to extractions.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['POST'])
def pdf_extraction_delete_all(request):
    """Permanently delete all PDF extractions and their artifacts."""
    # Count affected transactions before deletion
    transactions_affected = CreditCardTransaction.objects.filter(pdf_extraction__isnull=False).count()

    # Delete all extractions (CASCADE will delete artifacts, SET_NULL on transactions)
    deleted_count, _ = CreditCardPDFExtraction.objects.all().delete()

    # Invalidate cache
    invalidate_cc_inconsistencies()

    return JsonResponse({
        'success': True,
        'deleted_count': deleted_count,
        'transactions_affected': transactions_affected,
    })


@extend_schema(
    summary="Delete PDF source file",
    description="Permanently delete a PDF source file and all its extractions. Transactions remain but lose their link.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['DELETE'])
def pdf_source_file_delete(request, source_file_id):
    """Permanently delete a PDF source file and all its extractions."""
    try:
        source_file = CreditCardSourceFile.objects.get(id=source_file_id)
    except CreditCardSourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    # Count extractions and affected transactions before deletion
    extractions = source_file.pdf_extractions.all()
    extractions_deleted = extractions.count()
    transactions_affected = CreditCardTransaction.objects.filter(
        pdf_extraction__in=extractions
    ).count()

    # Delete the source file (CASCADE will delete extractions and artifacts)
    source_file.delete()

    # Invalidate cache
    invalidate_cc_inconsistencies()

    return JsonResponse({
        'success': True,
        'id': source_file_id,
        'extractions_deleted': extractions_deleted,
        'transactions_affected': transactions_affected,
    })


@extend_schema(
    summary="List PDF extractions as data sources",
    description="Get transformed artifacts as loadable data sources for the settings page. Only shows transformed artifacts (outputs of transformation pipelines).",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card PDF Extractions'],
)
@api_view(['GET'])
def pdf_extraction_data_sources(request):
    """List transformed artifacts as data sources.

    Data sources are artifacts where is_transformed=True - these are outputs
    of transformation pipelines, ready for loading into the database.
    """
    from django.db.models import Count

    # Get all transformed artifacts (outputs of transformation pipelines)
    base_queryset = ExtractionArtifact.objects.filter(
        is_transformed=True,
        extraction__hidden=False,
    ).select_related('extraction', 'extraction__source_file', 'extraction__credit_card')

    # Try to include artifact's credit_card in query (migration may not have run yet)
    artifact_has_cc = False
    try:
        transformed_artifacts = list(base_queryset.select_related('credit_card').annotate(
            loaded_transaction_count=Count('transactions')
        ))
        artifact_has_cc = True
    except Exception:
        # credit_card column doesn't exist yet, use base query
        transformed_artifacts = list(base_queryset.annotate(
            loaded_transaction_count=Count('transactions')
        ))

    data = []
    for artifact in transformed_artifacts:
        ext = artifact.extraction
        # Name format: {extraction_name}__{artifact_type} for multi-card, otherwise just extraction_name
        name = f"{ext.name}__{artifact.artifact_type}" if '-' in artifact.artifact_type else ext.name
        # Use artifact's credit_card - NO fallback to extraction's card (allows explicit unlinking)
        artifact_cc = artifact.credit_card if artifact_has_cc else None
        cc = artifact_cc  # Don't fall back - respect explicit user choice
        # Check if artifact is loaded (has transactions linked to it)
        loaded_count = getattr(artifact, 'loaded_transaction_count', 0)
        is_loaded = loaded_count > 0
        data.append({
            'id': ext.id,
            'artifact_id': artifact.artifact_id,
            'name': name,
            'source_file': ext.source_file.filename,
            'credit_card': {
                'id': cc.id,
                'nickname': cc.nickname
            } if cc else None,
            'status': ext.status,
            'row_count': artifact.row_count,
            'artifact_type': artifact.artifact_type,
            'statement_date': ext.statement_date.isoformat() if ext.statement_date else None,
            'statement_period_begin': ext.statement_period_begin.isoformat() if ext.statement_period_begin else None,
            'statement_period_end': ext.statement_period_end.isoformat() if ext.statement_period_end else None,
            'extracted_at': ext.extracted_at.isoformat(),
            'loaded_at': ext.loaded_at.isoformat() if ext.loaded_at else None,
            'loaded': is_loaded,
            'loaded_transaction_count': loaded_count,
        })

    return JsonResponse({'data': data})


# === CSV Source Files and Extraction ===

@extend_schema(
    summary="List CSV source files",
    description="List CSV source files with extraction stats.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Credit Card CSV Extractions'],
)
@api_view(['GET'])
def csv_source_files_list(request):
    """List CSV source files with extraction stats.

    Only returns files that have file_data blob stored in DB.
    """
    # Get CSV source files with file_data blob stored in DB
    csv_files = CreditCardSourceFile.objects.filter(
        filename__iendswith='.csv'
    ).exclude(
        file_data=b''
    ).exclude(
        file_data__isnull=True
    ).select_related('credit_card').prefetch_related('pdf_extractions')

    data = []
    for sf in csv_files:
        extractions = sf.pdf_extractions.all()
        latest_extraction = extractions.order_by('-extracted_at').first()

        data.append({
            'id': sf.id,
            'filename': sf.filename,
            'credit_card': {
                'id': sf.credit_card.id,
                'nickname': sf.credit_card.nickname,
            } if sf.credit_card else None,
            'disabled': sf.disabled,
            'has_data': bool(sf.file_data),
            'file_size': sf.file_size,
            'extractions_count': extractions.count(),
            'last_extracted': latest_extraction.extracted_at.isoformat() if latest_extraction else None,
            'last_extraction_id': latest_extraction.id if latest_extraction else None,
            'last_extraction_status': latest_extraction.status if latest_extraction else None,
        })

    return JsonResponse({'data': data})


@extend_schema(
    summary="Trigger extraction for a CSV source file",
    description="Extract transactions from a CSV source file and create extraction artifacts.",
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Credit Card CSV Extractions'],
)
@api_view(['POST'])
def csv_extraction_extract(request, source_file_id):
    """Trigger extraction for a CSV source file.

    This creates:
    1. A CreditCardPDFExtraction record (used for unified handling)
    2. An ExtractionArtifact with the standardized CSV (marked transformable)
    3. A transformed ingestable artifact (ready to load)
    """
    import gzip
    import re
    from datetime import datetime
    from django.db import transaction as db_transaction

    from .extractors import extract_sbi_credit_card_csv
    from .transformers import transform_artifact
    from .pdf_extractor import compress_data, compute_hash

    try:
        source_file = CreditCardSourceFile.objects.get(id=source_file_id)
    except CreditCardSourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    # Check if it's a CSV
    if not source_file.filename.lower().endswith('.csv'):
        return JsonResponse({'error': 'Source file is not a CSV'}, status=400)

    # Check if file has data stored
    if not source_file.file_data:
        return JsonResponse({'error': 'Source file has no stored data'}, status=400)

    try:
        # Decompress and get file path to run extractor
        # The SBI extractor expects a file path, so we need to write to temp file
        import tempfile
        file_bytes = gzip.decompress(source_file.file_data)

        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            # Extract using SBI extractor
            csv_string = extract_sbi_credit_card_csv(tmp_path)
        finally:
            os.unlink(tmp_path)

        # Count rows
        lines = csv_string.strip().split('\n')
        row_count = max(0, len(lines) - 1)

        if row_count == 0:
            return JsonResponse({'error': 'No transactions found in CSV'}, status=400)

        # Parse date range from CSV
        dates = []
        for line in lines[1:]:
            if not line.strip():
                continue
            parts = line.split(',')
            if parts and parts[0]:
                try:
                    date = datetime.strptime(parts[0], '%Y-%m-%d').date()
                    dates.append(date)
                except ValueError:
                    continue

        period_start = min(dates) if dates else None
        period_end = max(dates) if dates else None

        with db_transaction.atomic():
            # Create extraction
            extraction = CreditCardPDFExtraction.objects.create(
                source_file=source_file,
                credit_card=source_file.credit_card,
                statement_period_begin=period_start,
                statement_period_end=period_end,
                extractor_version='csv_extraction_1.0',
                status='extracted',
            )

            # Create transactions artifact
            artifact = ExtractionArtifact.objects.create(
                extraction=extraction,
                artifact_type='transactions',
                content_type='csv',
                data=compress_data(csv_string),
                data_hash=compute_hash(csv_string),
                row_count=row_count,
                transformer_name='legacy_cc_transactions',
                is_transformable=True,
            )

            # Transform to ingestable format
            ingestable = transform_artifact(artifact)
            if ingestable:
                extraction.status = 'transformed'
                extraction.save()

        return JsonResponse({
            'success': True,
            'extraction': {
                'id': extraction.id,
                'name': extraction.name,
                'row_count': row_count,
                'status': extraction.status,
                'statement_period_begin': period_start.isoformat() if period_start else None,
                'statement_period_end': period_end.isoformat() if period_end else None,
            },
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=400)
