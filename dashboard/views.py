import json

from django.core.cache import cache
from django.db.models import Sum, Max, Subquery, OuterRef
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from rest_framework.decorators import api_view

from project.cache_utils import get_bank_inconsistencies_key

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

from .models import Transaction, TransactionLog, AccountLog, FileLoadLog, CreditCardPaymentMatch
from credit_cards.views import get_active_cc_transactions

# Categories to exclude from income/expense calculations (internal transfers)
EXCLUDED_CATEGORIES = ['Self Transfer']


def get_active_transactions():
    """
    Get transactions that are active (from enabled, non-hidden ExtractedCSVs).

    Requires extracted_csv to be set and excludes:
    - Transactions without an extracted_csv link
    - Transactions from disabled ExtractedCSVs
    - Transactions from hidden ExtractedCSVs
    - Transactions from superseded ExtractedCSVs (archived data)
    """
    return Transaction.objects.filter(
        extracted_csv__isnull=False,
        extracted_csv__status__in=['extracted', 'transformed', 'loaded'],
        extracted_csv__disabled=False,
        extracted_csv__hidden=False,
    )


def get_active_transactions_experimental():
    """
    Get transactions from the new extraction system (DataSourceArtifact).

    Uses the revamped extraction pipeline (MODELLING-REVAMP.MD) where:
    - data_source_artifact links transactions to DataSourceArtifact
    - status='loaded' means the artifact data is loaded into transactions
    - enabled=True means the artifact is shown in views (not disabled)
    - hidden=False means the artifact is visible in UI lists
    """
    return Transaction.objects.filter(
        data_source_artifact__isnull=False,
        data_source_artifact__status='loaded',
        data_source_artifact__enabled=True,
        data_source_artifact__hidden=False,
    )


@extend_schema(
    summary="Get financial summary",
    description="Get comprehensive financial summary including balance, credits, debits, income/expense breakdown, and per-account statistics.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_summary(request):
    # Get active transactions (excludes disabled source files and superseded CSVs)
    all_transactions = get_active_transactions()
    from django.db.models import Q
    from bank_accs.models import BankAccount

    # For income/expense breakdown, exclude linked self transfers (both sides of the link)
    # Exclude transactions that link TO another (linked_transaction is set)
    # AND transactions that are linked FROM another (linked_from exists)
    filtered_transactions = all_transactions.exclude(
        Q(category__in=EXCLUDED_CATEGORIES) & (
            Q(linked_transaction__isnull=False) | Q(linked_from__isnull=False)
        )
    )

    # Income breakdown (excluding linked self transfers)
    income_categories = ['Salary/Income']
    salary_income = (
        filtered_transactions
        .filter(category__in=income_categories)
        .aggregate(total=Sum('credit_amount'))['total'] or 0
    )

    other_income = (
        filtered_transactions
        .exclude(category__in=income_categories)
        .aggregate(total=Sum('credit_amount'))['total'] or 0
    )

    expenses = filtered_transactions.aggregate(total=Sum('debit_amount'))['total'] or 0

    # For balance equation, exclude linked self transfers (consistent with income/expense)
    total_credits = filtered_transactions.aggregate(total=Sum('credit_amount'))['total'] or 0
    total_debits = filtered_transactions.aggregate(total=Sum('debit_amount'))['total'] or 0
    net_flow = total_credits - total_debits

    # Calculate per-account breakdown
    accounts = BankAccount.objects.all()
    per_account = []
    starting_balance = 0
    current_balance = 0

    for account in accounts:
        account_txns = list(all_transactions.filter(bank_account=account).order_by('date', 'source_file__date_range_start', 'row_number'))
        if not account_txns:
            continue

        # Filtered transactions for this account (excluding linked self transfers)
        account_filtered = filtered_transactions.filter(bank_account=account)

        # Latest transaction for current balance
        latest_txn = account_txns[-1]
        acc_current = float(latest_txn.closing_balance)

        # Earliest transaction for starting balance
        earliest_txn = account_txns[0]
        acc_starting = float(earliest_txn.closing_balance) - float(earliest_txn.credit_amount) + float(earliest_txn.debit_amount)

        # Credits and debits for this account (excluding linked self transfers)
        credits_agg = account_filtered.aggregate(total=Sum('credit_amount'))['total']
        acc_credits = float(credits_agg) if credits_agg is not None else 0.0

        debits_agg = account_filtered.aggregate(total=Sum('debit_amount'))['total']
        acc_debits = float(debits_agg) if debits_agg is not None else 0.0

        # Income breakdown per account
        salary_agg = account_filtered.filter(category__in=income_categories).aggregate(total=Sum('credit_amount'))['total']
        acc_salary_income = float(salary_agg) if salary_agg is not None else 0.0

        other_agg = account_filtered.exclude(category__in=income_categories).aggregate(total=Sum('credit_amount'))['total']
        acc_other_income = float(other_agg) if other_agg is not None else 0.0

        expenses_agg = account_filtered.aggregate(total=Sum('debit_amount'))['total']
        acc_expenses = float(expenses_agg) if expenses_agg is not None else 0.0

        # Unaccounted = sum of actual balance discontinuities (real missing transactions)
        # Self transfers don't cause discontinuities since their amounts are correct
        acc_unaccounted = 0.0
        for i, txn in enumerate(account_txns):
            if i == 0:
                continue
            prev = account_txns[i - 1]
            expected_balance = float(prev.closing_balance) + float(txn.credit_amount) - float(txn.debit_amount)
            if abs(float(txn.closing_balance) - expected_balance) > 0.001:
                acc_unaccounted += float(txn.closing_balance) - expected_balance

        per_account.append({
            'id': account.id,
            'nickname': account.nickname,
            'starting_balance': acc_starting,
            'current_balance': acc_current,
            'total_credits': acc_credits,
            'total_debits': acc_debits,
            'salary_income': acc_salary_income,
            'other_income': acc_other_income,
            'expenses': acc_expenses,
            'unaccounted': acc_unaccounted,
            'transaction_count': account_filtered.count(),
        })

        starting_balance += acc_starting
        current_balance += acc_current

    # Fallback if no accounts
    if not accounts.exists():
        latest = all_transactions.first()
        earliest = all_transactions.order_by('date', 'source_file__date_range_start', 'row_number').first()
        current_balance = float(latest.closing_balance) if latest else 0
        if earliest:
            starting_balance = float(earliest.closing_balance) - float(earliest.credit_amount) + float(earliest.debit_amount)

    # Total unaccounted = sum of per-account inconsistency gaps
    unaccounted = sum(acc['unaccounted'] for acc in per_account)

    return JsonResponse({
        'starting_balance': starting_balance,
        'current_balance': current_balance,
        'total_credits': float(total_credits),
        'total_debits': float(total_debits),
        'net_flow': float(net_flow),
        'salary_income': float(salary_income),
        'other_income': float(other_income),
        'expenses': float(expenses),
        'unaccounted': unaccounted,
        'transaction_count': all_transactions.count(),
        'per_account': per_account,
    })


@extend_schema(
    summary="Get monthly breakdown",
    description="Get monthly credit/debit breakdown, excluding self transfers.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_monthly(request):
    # Exclude self transfers from monthly breakdown
    transactions = get_active_transactions().exclude(category__in=EXCLUDED_CATEGORIES)

    monthly_data = (
        transactions
        .annotate(month=TruncMonth('date'))
        .values('month')
        .annotate(
            credits=Sum('credit_amount'),
            debits=Sum('debit_amount'),
        )
        .order_by('month')
    )

    data = []
    for item in monthly_data:
        data.append({
            'month': item['month'].strftime('%b %Y'),
            'credits': float(item['credits'] or 0),
            'debits': float(item['debits'] or 0),
        })

    return JsonResponse({'data': data})


@extend_schema(
    summary="Get expense categories",
    description="Get expense categories with totals.",
    parameters=[
        OpenApiParameter(
            name='include_all',
            type=OpenApiTypes.BOOL,
            location=OpenApiParameter.QUERY,
            description='Include self transfers if true (default: false)',
        ),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_categories(request):
    # Check if we should include all categories (for filtering purposes)
    include_all = request.GET.get('include_all', 'false').lower() == 'true'

    # Get active transactions with debits
    queryset = get_active_transactions().filter(debit_amount__gt=0)

    # Exclude self transfers from category breakdown unless include_all is set
    if not include_all:
        queryset = queryset.exclude(category__in=EXCLUDED_CATEGORIES)

    category_data = (
        queryset
        .values('category')
        .annotate(total=Sum('debit_amount'))
        .order_by('-total')
    )

    # Build a dict of existing categories with their amounts
    existing_categories = {}
    for item in category_data:
        cat_name = item['category'] or 'Other'
        existing_categories[cat_name] = float(item['total'] or 0)

    # Import predefined categories and add any missing ones
    from dashboard.management.commands.load_transactions import CATEGORY_PATTERNS
    for cat_name in CATEGORY_PATTERNS.keys():
        if cat_name not in existing_categories:
            existing_categories[cat_name] = 0

    # Convert to list and sort by amount (descending), with zero-amount categories at the end
    data = [
        {'category': cat, 'amount': amount}
        for cat, amount in existing_categories.items()
    ]
    data.sort(key=lambda x: (-x['amount'], x['category']))

    return JsonResponse({'data': data})


@extend_schema(
    summary="List transactions",
    description="List bank transactions with filtering and pagination.",
    parameters=[
        OpenApiParameter(name='source', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description="Data source: 'legacy' (default) or 'experimental' (new extraction system)"),
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='category', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by category'),
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by type: credit or debit'),
        OpenApiParameter(name='source_file', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by source file ID'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
        OpenApiParameter(name='month', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by month (1-12)'),
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search narration, category, or reference'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Transactions'],
)
@api_view(['GET'])
def api_transactions(request):
    from django.db.models import Q

    # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
    source = request.GET.get('source', 'legacy')
    if source == 'experimental':
        transactions = get_active_transactions_experimental()
    else:
        transactions = get_active_transactions()

    transactions = transactions.select_related(
        'bank_account',
        'source_file',
        'linked_transaction',
        'linked_transaction__bank_account',
        'cc_payment_match',
        'cc_payment_match__credit_card_transaction',
        'cc_payment_match__credit_card_transaction__credit_card',
        'data_source_artifact',
        'data_source_artifact__source_artifact',
        'data_source_artifact__source_artifact__extraction',
        'data_source_artifact__source_artifact__extraction__source_file',
    ).prefetch_related('linked_from')

    # Filter by bank account
    bank_account_id = request.GET.get('bank_account')
    if bank_account_id:
        transactions = transactions.filter(bank_account_id=bank_account_id)

    category = request.GET.get('category')
    if category:
        transactions = transactions.filter(category=category)

    transaction_type = request.GET.get('type')
    if transaction_type == 'credit':
        transactions = transactions.filter(credit_amount__gt=0)
    elif transaction_type == 'debit':
        transactions = transactions.filter(debit_amount__gt=0)

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

    # Search filter (narration, category, reference)
    search = request.GET.get('search')
    if search:
        transactions = transactions.filter(
            Q(narration__icontains=search) |
            Q(category__icontains=search) |
            Q(reference_number__icontains=search)
        )

    # Calculate aggregate stats based on filtered results
    total_credits = transactions.aggregate(total=Sum('credit_amount'))['total'] or 0
    total_debits = transactions.aggregate(total=Sum('debit_amount'))['total'] or 0

    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    total = transactions.count()
    transactions_page = transactions[offset:offset + limit]

    data = []
    for t in transactions_page:
        # Get linked transaction (either via linked_transaction or linked_from)
        linked = t.linked_transaction
        if not linked:
            try:
                linked = t.linked_from
            except Transaction.DoesNotExist:
                linked = None

        linked_data = None
        if linked:
            linked_data = {
                'id': linked.id,
                'date': linked.date.isoformat(),
                'narration': linked.narration,
                'bank_account': linked.bank_account.nickname if linked.bank_account else None,
                'amount': float(linked.debit_amount or linked.credit_amount),
            }

        # Get CC payment match if exists
        cc_match_data = None
        try:
            cc_match = t.cc_payment_match
            if cc_match:
                cc_txn = cc_match.credit_card_transaction
                cc_match_data = {
                    'id': cc_match.id,
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
                    'offset': float(cc_match.offset),
                    'confidence_score': cc_match.confidence_score,
                    'match_reasons': cc_match.match_reasons,
                }
        except CreditCardPaymentMatch.DoesNotExist:
            pass

        # Get source file info - from legacy source_file or from data_source_artifact
        source_file_data = None
        if t.source_file:
            source_file_data = {
                'id': t.source_file.id,
                'filename': t.source_file.filename,
            }
        elif t.data_source_artifact:
            # For experimental: get filename from the extraction's source file
            dsa = t.data_source_artifact
            if hasattr(dsa, 'source_artifact') and dsa.source_artifact:
                ext = dsa.source_artifact.extraction
                if ext and ext.source_file:
                    source_file_data = {
                        'id': ext.source_file.id,
                        'filename': ext.source_file.filename,
                    }

        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'narration': t.narration,
            'debit': float(t.debit_amount),
            'credit': float(t.credit_amount),
            'balance': float(t.closing_balance),
            'category': t.category,
            'reference': t.reference_number,
            'bank_account': {
                'id': t.bank_account.id,
                'nickname': t.bank_account.nickname,
            } if t.bank_account else None,
            'source_file': source_file_data,
            'linked_transaction': linked_data,
            'cc_payment_match': cc_match_data,
        })

    return JsonResponse({
        'data': data,
        'total': total,
        'limit': limit,
        'offset': offset,
        'stats': {
            'total_credits': float(total_credits),
            'total_debits': float(total_debits),
            'net_flow': float(total_credits - total_debits),
        }
    })


@extend_schema(
    summary="Get top expenses",
    description="Get top N expenses, excluding self transfers.",
    parameters=[
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of expenses to return (default: 10)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_top_expenses(request):
    limit = int(request.GET.get('limit', 10))

    # Exclude self transfers from top expenses
    top_expenses = (
        get_active_transactions()
        .select_related('bank_account')
        .filter(debit_amount__gt=0)
        .exclude(category__in=EXCLUDED_CATEGORIES)
        .order_by('-debit_amount')[:limit]
    )

    data = []
    for t in top_expenses:
        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'narration': t.narration,
            'amount': float(t.debit_amount),
            'category': t.category,
            'bank_account': {
                'id': t.bank_account.id,
                'nickname': t.bank_account.nickname,
            } if t.bank_account else None,
        })

    return JsonResponse({'data': data})


@extend_schema(
    summary="Update transaction category",
    description="Update a transaction's category and log the change.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Transactions'],
    examples=[
        OpenApiExample(
            'Update category',
            value={'category': 'Food & Dining'},
            request_only=True,
        )
    ],
)
@api_view(['PUT', 'PATCH'])
def api_transaction_update(request, transaction_id):
    try:
        transaction = Transaction.objects.get(id=transaction_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if 'category' in data:
        old_category = transaction.category or 'Uncategorized'
        new_category = data['category'] or 'Uncategorized'
        transaction.category = new_category
        transaction.save()

        # Log category change in WAL
        if old_category != new_category:
            TransactionLog.objects.create(
                transaction=transaction,
                action='CATEGORY_CHANGE',
                old_value=old_category,
                new_value=new_category,
            )

    return JsonResponse({
        'id': transaction.id,
        'date': transaction.date.isoformat(),
        'narration': transaction.narration,
        'debit': float(transaction.debit_amount),
        'credit': float(transaction.credit_amount),
        'balance': float(transaction.closing_balance),
        'category': transaction.category,
        'reference': transaction.reference_number,
    })


@extend_schema(
    summary="Get potential transaction links",
    description="Find potential matching transactions for linking based on amount, account, and date proximity.",
    parameters=[
        OpenApiParameter(name='days', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Date range window in days (default: 7)'),
    ],
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Transactions'],
)
@api_view(['GET'])
def api_potential_links(request, transaction_id):
    """Find potential matching transactions for linking based on amount, account, and date proximity."""
    from datetime import timedelta

    try:
        transaction = Transaction.objects.select_related('bank_account').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    # Must have a bank account
    if not transaction.bank_account:
        return JsonResponse({'data': []})

    # Date range: look within 7 days before and after
    date_range_days = int(request.GET.get('days', 7))
    date_start = transaction.date - timedelta(days=date_range_days)
    date_end = transaction.date + timedelta(days=date_range_days)

    # Find matching transactions:
    # - Different bank account
    # - Not already linked
    # - Amount matches (debit of one = credit of other)
    # - Within date proximity
    potential_matches = get_active_transactions().filter(
        date__gte=date_start,
        date__lte=date_end,
    ).exclude(
        bank_account=transaction.bank_account
    ).exclude(
        bank_account__isnull=True
    ).exclude(
        id=transaction.id
    ).filter(
        linked_transaction__isnull=True,
        linked_from__isnull=True
    ).select_related('bank_account')

    # Match amounts: if this is a debit, look for credits with matching amount
    if transaction.debit_amount > 0:
        potential_matches = potential_matches.filter(credit_amount=transaction.debit_amount)
    elif transaction.credit_amount > 0:
        potential_matches = potential_matches.filter(debit_amount=transaction.credit_amount)
    else:
        return JsonResponse({'data': []})

    # Order by date (closest to transaction date first)
    potential_matches = list(potential_matches[:20])
    # Sort by date proximity
    potential_matches.sort(key=lambda t: abs((t.date - transaction.date).days))

    data = []
    for t in potential_matches:
        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'narration': t.narration,
            'debit': float(t.debit_amount),
            'credit': float(t.credit_amount),
            'category': t.category,
            'bank_account': {
                'id': t.bank_account.id,
                'nickname': t.bank_account.nickname,
            } if t.bank_account else None,
        })

    return JsonResponse({'data': data})


@extend_schema(
    methods=['POST'],
    summary="Link transactions",
    description="Link transactions as self-transfers.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Transactions'],
    examples=[
        OpenApiExample(
            'Link transaction',
            value={'link_to': 123},
            request_only=True,
        )
    ],
)
@extend_schema(
    methods=['DELETE'],
    summary="Unlink transactions",
    description="Unlink self-transfer transactions.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Transactions'],
)
@api_view(['POST', 'DELETE'])
def api_link_transaction(request, transaction_id):
    """Link or unlink self-transfer transactions."""
    try:
        transaction = Transaction.objects.select_related('bank_account', 'linked_transaction').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    if request.method == 'DELETE':
        # Unlink the transaction
        other = None
        if transaction.linked_transaction:
            other = transaction.linked_transaction
            transaction.linked_transaction = None
            transaction.save()
            # Also clear the reverse link if it exists
            if hasattr(other, 'linked_from') and other.linked_from == transaction:
                pass  # OneToOne already handles this
        elif hasattr(transaction, 'linked_from') and transaction.linked_from:
            other = transaction.linked_from
            other.linked_transaction = None
            other.save()

        # Log unlink action in WAL for both transactions
        if other:
            TransactionLog.objects.create(
                transaction=transaction,
                action='UNLINK',
                old_value=str(other.id),
            )
            TransactionLog.objects.create(
                transaction=other,
                action='UNLINK',
                old_value=str(transaction.id),
            )

        return JsonResponse({
            'id': transaction.id,
            'linked_transaction': None,
        })

    # POST - Link transactions
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    link_to_id = data.get('link_to')
    if not link_to_id:
        return JsonResponse({'error': 'link_to is required'}, status=400)

    try:
        link_to = Transaction.objects.select_related('bank_account').get(id=link_to_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Target transaction not found'}, status=404)

    # Validate different bank accounts
    if transaction.bank_account == link_to.bank_account:
        return JsonResponse({'error': 'Transactions must be from different bank accounts'}, status=400)

    # Validate neither is already linked
    if transaction.linked_transaction or (hasattr(transaction, 'linked_from') and transaction.linked_from):
        return JsonResponse({'error': 'Transaction is already linked'}, status=400)
    if link_to.linked_transaction or (hasattr(link_to, 'linked_from') and link_to.linked_from):
        return JsonResponse({'error': 'Target transaction is already linked'}, status=400)

    # Create the link (only one direction needed with OneToOne)
    transaction.linked_transaction = link_to
    # Tag both transactions as Self Transfer
    old_category_1 = transaction.category or ''
    old_category_2 = link_to.category or ''
    transaction.category = 'Self Transfer'
    link_to.category = 'Self Transfer'
    transaction.save()
    link_to.save()

    # Log link action in WAL for both transactions
    TransactionLog.objects.create(
        transaction=transaction,
        action='LINK',
        new_value=str(link_to.id),
    )
    TransactionLog.objects.create(
        transaction=link_to,
        action='LINK',
        new_value=str(transaction.id),
    )
    # Also log category changes if they changed
    if old_category_1 != 'Self Transfer':
        TransactionLog.objects.create(
            transaction=transaction,
            action='CATEGORY_CHANGE',
            old_value=old_category_1,
            new_value='Self Transfer',
        )
    if old_category_2 != 'Self Transfer':
        TransactionLog.objects.create(
            transaction=link_to,
            action='CATEGORY_CHANGE',
            old_value=old_category_2,
            new_value='Self Transfer',
        )

    return JsonResponse({
        'id': transaction.id,
        'linked_transaction': {
            'id': link_to.id,
            'date': link_to.date.isoformat(),
            'bank_account': link_to.bank_account.nickname if link_to.bank_account else None,
            'amount': float(link_to.debit_amount or link_to.credit_amount),
        },
    })


@extend_schema(
    summary="Get transaction logs",
    description="Fetch all logs (file loads, transaction changes, and account changes) with filtering.",
    parameters=[
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Log type: all, transaction, account, or file_load (default: all)'),
        OpenApiParameter(name='action', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by specific action'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Logs'],
)
@api_view(['GET'])
def api_transaction_logs(request):
    """Fetch all logs (file loads, transaction changes, and account changes)."""
    log_type = request.GET.get('type', 'all')  # 'all', 'transaction', 'account', 'file_load'
    action = request.GET.get('action')
    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    # Collect all logs
    all_logs = []

    # File load logs (initial loads)
    if log_type in ('all', 'file_load') and (not action or action == 'LOAD'):
        file_logs = FileLoadLog.objects.select_related(
            'source_file',
            'bank_account'
        )
        for log in file_logs:
            all_logs.append({
                'id': f'file_{log.id}',
                'log_type': 'file_load',
                'action': 'LOAD',
                'action_display': 'File Loaded',
                'old_value': '',
                'new_value': '',
                'created_at': log.created_at,
                'transaction': None,
                'bank_account': {
                    'id': log.bank_account.id,
                    'nickname': log.bank_account.nickname,
                } if log.bank_account else None,
                'source_file': log.source_file.filename if log.source_file else None,
                'file_load': {
                    'transaction_count': log.transaction_count,
                    'category_summary': log.category_summary,
                    'file_hash': log.file_hash,
                    'source_file_id': log.source_file.id if log.source_file else None,
                    'link_source': log.link_source,
                    'link_source_display': log.get_link_source_display(),
                },
            })

    # Transaction logs (category changes, links, unlinks)
    if log_type in ('all', 'transaction') and (not action or action in ['CATEGORY_CHANGE', 'LINK', 'UNLINK']):
        txn_logs = TransactionLog.objects.select_related(
            'transaction',
            'transaction__bank_account',
        )
        if action and action in ['CATEGORY_CHANGE', 'LINK', 'UNLINK']:
            txn_logs = txn_logs.filter(action=action)

        for log in txn_logs:
            all_logs.append({
                'id': f'txn_{log.id}',
                'log_type': 'transaction',
                'action': log.action,
                'action_display': log.get_action_display(),
                'old_value': log.old_value,
                'new_value': log.new_value,
                'created_at': log.created_at,
                'transaction': {
                    'id': log.transaction.id,
                    'date': log.transaction.date.isoformat(),
                    'narration': log.transaction.narration[:50] + '...' if len(log.transaction.narration) > 50 else log.transaction.narration,
                    'bank_account': log.transaction.bank_account.nickname if log.transaction.bank_account else None,
                },
                'bank_account': None,
                'source_file': None,
                'file_load': None,
            })

    # Account logs
    if log_type in ('all', 'account') and (not action or action in ['CREATE', 'UPDATE', 'DELETE', 'LINK_SOURCE', 'UNLINK_SOURCE']):
        acc_logs = AccountLog.objects.select_related(
            'bank_account',
            'source_file'
        )
        if action and action in ['CREATE', 'UPDATE', 'DELETE', 'LINK_SOURCE', 'UNLINK_SOURCE']:
            acc_logs = acc_logs.filter(action=action)

        for log in acc_logs:
            all_logs.append({
                'id': f'acc_{log.id}',
                'log_type': 'account',
                'action': log.action,
                'action_display': log.get_action_display(),
                'old_value': log.old_value,
                'new_value': log.new_value,
                'created_at': log.created_at,
                'transaction': None,
                'bank_account': {
                    'id': log.bank_account.id,
                    'nickname': log.bank_account.nickname,
                } if log.bank_account else None,
                'source_file': log.source_file.filename if log.source_file else None,
                'file_load': None,
            })

    # Sort by created_at descending
    all_logs.sort(key=lambda x: x['created_at'], reverse=True)

    total = len(all_logs)
    logs_page = all_logs[offset:offset + limit]

    # Convert datetime to isoformat for JSON
    for log in logs_page:
        log['created_at'] = log['created_at'].isoformat()

    return JsonResponse({
        'data': logs_page,
        'total': total,
        'limit': limit,
        'offset': offset,
    })


@extend_schema(
    summary="Get date range",
    description="Get available years and months with transaction data, optionally filtered.",
    parameters=[
        OpenApiParameter(name='source', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description="Data source: 'legacy' (default) or 'experimental' (new extraction system)"),
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='category', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by category'),
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by type: credit or debit'),
        OpenApiParameter(name='source_file', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by source file ID'),
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search narration, category, or reference'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_date_range(request):
    """Get available years and months with transaction data, optionally filtered."""
    from django.db.models import Q

    # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
    source = request.GET.get('source', 'legacy')
    if source == 'experimental':
        transactions = get_active_transactions_experimental()
    else:
        transactions = get_active_transactions()

    # Apply filters
    bank_account_id = request.GET.get('bank_account')
    if bank_account_id:
        transactions = transactions.filter(bank_account_id=bank_account_id)

    category = request.GET.get('category')
    if category:
        transactions = transactions.filter(category=category)

    transaction_type = request.GET.get('type')
    if transaction_type == 'credit':
        transactions = transactions.filter(credit_amount__gt=0)
    elif transaction_type == 'debit':
        transactions = transactions.filter(debit_amount__gt=0)

    source_file_id = request.GET.get('source_file')
    if source_file_id:
        transactions = transactions.filter(source_file_id=source_file_id)

    search = request.GET.get('search')
    if search:
        transactions = transactions.filter(
            Q(narration__icontains=search) |
            Q(category__icontains=search) |
            Q(reference_number__icontains=search)
        )

    # Get all distinct months with matching transactions
    dates = transactions.dates('date', 'month', order='ASC')

    # Group by year
    years = {}
    for d in dates:
        year = str(d.year)
        month = d.month
        if year not in years:
            years[year] = []
        years[year].append(month)

    return JsonResponse({'years': years})


@extend_schema(
    summary="Get balance inconsistencies",
    description="Detect balance discontinuities in transactions by comparing expected vs actual closing balance.",
    parameters=[
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_inconsistencies(request):
    """Detect balance discontinuities in transactions.

    For consecutive transactions (ordered by date ASC, id ASC):
    expected_closing = previous_closing + credit - debit

    If actual closing_balance != expected_closing, it's an inconsistency.
    """
    from bank_accs.models import BankAccount

    bank_account_id = request.GET.get('bank_account')
    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    # Check cache first
    cache_key = get_bank_inconsistencies_key(bank_account_id, limit, offset)
    cached = cache.get(cache_key)
    if cached is not None:
        return JsonResponse(cached)

    # Get accounts to check
    if bank_account_id:
        accounts = BankAccount.objects.filter(id=bank_account_id)
    else:
        accounts = BankAccount.objects.all()

    inconsistencies = []

    for account in accounts:
        # Get active transactions ordered oldest to newest
        transactions = list(
            get_active_transactions()
            .filter(bank_account=account)
            .select_related('source_file')
            .order_by('date', 'source_file__date_range_start', 'row_number')  # Oldest first, preserving extraction order
        )

        for i, txn in enumerate(transactions):
            if i == 0:
                # First transaction - no previous to compare
                continue

            prev_txn = transactions[i - 1]
            expected_balance = (
                prev_txn.closing_balance
                + txn.credit_amount
                - txn.debit_amount
            )

            if txn.closing_balance != expected_balance:
                gap = txn.closing_balance - expected_balance
                inconsistencies.append({
                    'transaction_id': txn.id,
                    'date': txn.date.isoformat(),
                    'narration': txn.narration,
                    'debit': float(txn.debit_amount),
                    'credit': float(txn.credit_amount),
                    'actual_balance': float(txn.closing_balance),
                    'expected_balance': float(expected_balance),
                    'gap': float(gap),
                    'reference': txn.reference_number,
                    'bank_account': {
                        'id': account.id,
                        'nickname': account.nickname,
                    },
                    'source_file': {
                        'id': txn.source_file.id,
                        'filename': txn.source_file.filename,
                    } if txn.source_file else None,
                    'previous_transaction': {
                        'id': prev_txn.id,
                        'date': prev_txn.date.isoformat(),
                        'closing_balance': float(prev_txn.closing_balance),
                    }
                })

    # Sort by date descending (most recent first)
    inconsistencies.sort(key=lambda x: (x['date'], x['transaction_id']), reverse=True)

    total = len(inconsistencies)
    page = inconsistencies[offset:offset + limit]

    result = {
        'data': page,
        'total': total,
        'limit': limit,
        'offset': offset,
    }

    # Cache the result (no timeout, invalidated manually)
    cache.set(cache_key, result, None)

    return JsonResponse(result)


# ==================== Bank Inconsistencies API ====================


@extend_schema(
    summary="Get bank inconsistencies",
    description="Detect duplicates, cross-account matches, and balance gaps in bank transactions.",
    parameters=[
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='source', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description="Data source: 'legacy' (default) or 'experimental' (new extraction system)"),
        OpenApiParameter(name='type', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Filter by type: duplicate, cross_account, balance_gap'),
        OpenApiParameter(name='show_dismissed', type=OpenApiTypes.BOOL, location=OpenApiParameter.QUERY, description='Include dismissed inconsistencies'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['GET'])
def bank_inconsistencies(request):
    """Detect duplicates, cross-account matches, and balance gaps in bank transactions."""
    from bank_accs.models import BankAccount
    from .models import DismissedBankInconsistency

    # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
    source = request.GET.get('source', 'legacy')
    bank_account_id = request.GET.get('bank_account')
    type_filter = request.GET.get('type')
    show_dismissed = request.GET.get('show_dismissed', 'false').lower() == 'true'
    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    # Get accounts to check
    if bank_account_id:
        accounts = BankAccount.objects.filter(id=bank_account_id)
    else:
        accounts = BankAccount.objects.all()

    inconsistencies = []

    # Get all active transactions based on source
    if source == 'experimental':
        base_transactions = get_active_transactions_experimental()
    else:
        base_transactions = get_active_transactions()

    all_transactions = list(
        base_transactions
        .select_related('bank_account', 'source_file', 'extracted_csv', 'data_source_artifact')
        .order_by('date', 'row_number')
    )

    # Create lookup by account
    transactions_by_account = {}
    for txn in all_transactions:
        if txn.bank_account_id not in transactions_by_account:
            transactions_by_account[txn.bank_account_id] = []
        transactions_by_account[txn.bank_account_id].append(txn)

    # For experimental source, apply custom sorting to handle overlapping statements.
    #
    # Problem: When two bank statements overlap (e.g., statement downloaded on Jan 14 and Jan 15
    # both contain April 1st transactions), simple (date, row_number) ordering interleaves them
    # incorrectly, causing false balance gaps.
    #
    # Example - two HDFC statements with April 1st overlap:
    #   Statement 14012026.txt: row 250 (April 1) - end of statement, balance 57969.43
    #   Statement 15012026.txt: row 1, 2 (April 1) - start of statement, balance 23969.43, 23859.43
    #
    # Default ordering (date, row_number): 1, 2, 250
    #   → Balance gap: 23859.43 → 57969.43 (false positive!)
    #
    # Custom ordering: For same date, group by source, larger row numbers first across sources
    #   → Result: 250, 1, 2
    #   → Balance flow: 57969.43 → 23969.43 → 23859.43 (correct continuity)
    #
    # Rule: Same source = ascending row order; Different sources = larger row first
    if source == 'experimental':
        from itertools import groupby

        def sort_account_transactions(txns):
            if not txns:
                return txns

            # Sort by date first, then row_number (initial ordering)
            txns.sort(key=lambda t: (t.date, t.row_number))

            sorted_result = []
            # Group by date
            for date, date_group in groupby(txns, key=lambda t: t.date):
                date_txns = list(date_group)

                # Group by data_source_artifact_id
                artifact_groups = {}
                for txn in date_txns:
                    aid = txn.data_source_artifact_id
                    if aid not in artifact_groups:
                        artifact_groups[aid] = []
                    artifact_groups[aid].append(txn)

                # Sort each artifact group by row_number ascending
                for aid in artifact_groups:
                    artifact_groups[aid].sort(key=lambda t: t.row_number)

                # Sort artifact groups by min row_number descending (larger first)
                sorted_groups = sorted(
                    artifact_groups.values(),
                    key=lambda g: min(t.row_number for t in g),
                    reverse=True
                )

                # Flatten
                for group in sorted_groups:
                    sorted_result.extend(group)

            return sorted_result

        # Apply custom sorting to each account's transactions
        for account_id in transactions_by_account:
            transactions_by_account[account_id] = sort_account_transactions(
                transactions_by_account[account_id]
            )

    # 1. Detect same-account duplicates
    if not type_filter or type_filter == 'duplicate':
        seen = {}  # key -> list of transactions
        for txn in all_transactions:
            key = (
                txn.bank_account_id,
                txn.date,
                txn.narration,
                float(txn.debit_amount),
                float(txn.credit_amount),
                float(txn.closing_balance),
            )
            if key not in seen:
                seen[key] = []
            seen[key].append(txn)

        for key, txns in seen.items():
            if len(txns) > 1:
                txn_ids = [t.id for t in txns]
                is_dismissed = DismissedBankInconsistency.is_dismissed('duplicate', txn_ids)

                if show_dismissed or not is_dismissed:
                    inconsistencies.append({
                        'type': 'duplicate',
                        'transaction_ids': txn_ids,
                        'dismissed': is_dismissed,
                        'date': txns[0].date.isoformat(),
                        'narration': txns[0].narration,
                        'debit': float(txns[0].debit_amount),
                        'credit': float(txns[0].credit_amount),
                        'balance': float(txns[0].closing_balance),
                        'count': len(txns),
                        'bank_account': {
                            'id': txns[0].bank_account.id,
                            'nickname': txns[0].bank_account.nickname,
                        },
                        'transactions': [{
                            'id': t.id,
                            'source_file': t.source_file.filename if t.source_file else None,
                            'extracted_csv': t.extracted_csv.name if t.extracted_csv else None,
                        } for t in txns],
                    })

    # 2. Detect cross-account matches (same date, narration, amounts on different accounts)
    if not type_filter or type_filter == 'cross_account':
        cross_seen = {}  # key (without account) -> list of transactions
        for txn in all_transactions:
            key = (
                txn.date,
                txn.narration,
                float(txn.debit_amount),
                float(txn.credit_amount),
                float(txn.closing_balance),
            )
            if key not in cross_seen:
                cross_seen[key] = []
            cross_seen[key].append(txn)

        for key, txns in cross_seen.items():
            # Only if transactions span multiple accounts
            account_ids = set(t.bank_account_id for t in txns)
            if len(account_ids) > 1:
                txn_ids = [t.id for t in txns]
                is_dismissed = DismissedBankInconsistency.is_dismissed('cross_account', txn_ids)

                if show_dismissed or not is_dismissed:
                    inconsistencies.append({
                        'type': 'cross_account',
                        'transaction_ids': txn_ids,
                        'dismissed': is_dismissed,
                        'date': txns[0].date.isoformat(),
                        'narration': txns[0].narration,
                        'debit': float(txns[0].debit_amount),
                        'credit': float(txns[0].credit_amount),
                        'balance': float(txns[0].closing_balance),
                        'count': len(txns),
                        'accounts': [{
                            'id': t.bank_account.id,
                            'nickname': t.bank_account.nickname,
                        } for t in txns],
                        'transactions': [{
                            'id': t.id,
                            'bank_account': {
                                'id': t.bank_account.id,
                                'nickname': t.bank_account.nickname,
                            },
                            'source_file': t.source_file.filename if t.source_file else None,
                            'extracted_csv': t.extracted_csv.name if t.extracted_csv else None,
                        } for t in txns],
                    })

    # 3. Detect balance gaps (from existing api_inconsistencies logic)
    if not type_filter or type_filter == 'balance_gap':
        for account in accounts:
            txns = transactions_by_account.get(account.id, [])

            for i, txn in enumerate(txns):
                if i == 0:
                    continue

                prev_txn = txns[i - 1]
                expected_balance = (
                    prev_txn.closing_balance
                    + txn.credit_amount
                    - txn.debit_amount
                )

                if txn.closing_balance != expected_balance:
                    gap = txn.closing_balance - expected_balance
                    txn_ids = [prev_txn.id, txn.id]
                    is_dismissed = DismissedBankInconsistency.is_dismissed('balance_gap', txn_ids)

                    if show_dismissed or not is_dismissed:
                        inconsistencies.append({
                            'type': 'balance_gap',
                            'transaction_ids': txn_ids,
                            'dismissed': is_dismissed,
                            'transaction_id': txn.id,
                            'date': txn.date.isoformat(),
                            'narration': txn.narration,
                            'debit': float(txn.debit_amount),
                            'credit': float(txn.credit_amount),
                            'actual_balance': float(txn.closing_balance),
                            'expected_balance': float(expected_balance),
                            'gap': float(gap),
                            'reference': txn.reference_number,
                            'bank_account': {
                                'id': account.id,
                                'nickname': account.nickname,
                            },
                            'source_file': {
                                'id': txn.source_file.id,
                                'filename': txn.source_file.filename,
                            } if txn.source_file else None,
                            'previous_transaction': {
                                'id': prev_txn.id,
                                'date': prev_txn.date.isoformat(),
                                'closing_balance': float(prev_txn.closing_balance),
                            }
                        })

    # Sort by date descending
    inconsistencies.sort(key=lambda x: (x['date'], x.get('transaction_id', x['transaction_ids'][0])), reverse=True)

    # Count by type
    counts = {
        'duplicate': sum(1 for i in inconsistencies if i['type'] == 'duplicate' and not i['dismissed']),
        'cross_account': sum(1 for i in inconsistencies if i['type'] == 'cross_account' and not i['dismissed']),
        'balance_gap': sum(1 for i in inconsistencies if i['type'] == 'balance_gap' and not i['dismissed']),
    }

    total = len(inconsistencies)
    page = inconsistencies[offset:offset + limit]

    return JsonResponse({
        'data': page,
        'total': total,
        'counts': counts,
        'limit': limit,
        'offset': offset,
    })


@extend_schema(
    summary="Dismiss bank inconsistency",
    description="Mark a bank inconsistency as dismissed.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['POST'])
def dismiss_bank_inconsistency(request):
    """Dismiss a bank inconsistency."""
    from .models import DismissedBankInconsistency

    data = json.loads(request.body)
    inconsistency_type = data.get('type')
    transaction_ids = data.get('transaction_ids', [])
    reason = data.get('reason', '')

    if not inconsistency_type or not transaction_ids:
        return JsonResponse({'error': 'type and transaction_ids are required'}, status=400)

    key = DismissedBankInconsistency.make_key(transaction_ids)

    obj, created = DismissedBankInconsistency.objects.get_or_create(
        inconsistency_type=inconsistency_type,
        transaction_ids=key,
        defaults={'reason': reason}
    )

    if not created and reason:
        obj.reason = reason
        obj.save(update_fields=['reason'])

    return JsonResponse({
        'success': True,
        'id': obj.id,
        'created': created,
    })


@extend_schema(
    summary="Restore bank inconsistency",
    description="Restore a dismissed bank inconsistency.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT},
    tags=['Dashboard'],
)
@api_view(['POST'])
def restore_bank_inconsistency(request):
    """Restore a dismissed bank inconsistency."""
    from .models import DismissedBankInconsistency

    data = json.loads(request.body)
    inconsistency_type = data.get('type')
    transaction_ids = data.get('transaction_ids', [])

    if not inconsistency_type or not transaction_ids:
        return JsonResponse({'error': 'type and transaction_ids are required'}, status=400)

    key = DismissedBankInconsistency.make_key(transaction_ids)

    deleted, _ = DismissedBankInconsistency.objects.filter(
        inconsistency_type=inconsistency_type,
        transaction_ids=key,
    ).delete()

    return JsonResponse({
        'success': True,
        'deleted': deleted > 0,
    })


# ==================== Credit Card Payment Matching API ====================


def calculate_match_score(bank_txn, cc_txn):
    """
    Calculate matching score between bank CC payment and credit card payment.

    Returns (score, reasons, offset) tuple.

    Criteria:
    1. Amount proximity - Bank debit vs absolute CC payment amount
       - Exact match: +0.5 score
       - Within 5% (offset/rewards): +0.3 score
    2. Date proximity - Within 7-day window
       - Same day: +0.5 score
       - 1-3 days: +0.3 score
       - 4-7 days: +0.1 score
    """
    from decimal import Decimal

    score = 0.0
    reasons = []

    bank_amount = bank_txn.debit_amount
    cc_amount = abs(cc_txn.amount)  # CC payment is negative
    offset = bank_amount - cc_amount

    # Amount matching
    if offset == 0:
        score += 0.5
        reasons.append('exact_amount')
    elif cc_amount > 0 and abs(offset) / cc_amount <= Decimal('0.05'):
        score += 0.3
        reasons.append('amount_within_5%')

    # Date matching
    days_diff = abs((bank_txn.date - cc_txn.date).days)
    if days_diff == 0:
        score += 0.5
        reasons.append('same_day')
    elif days_diff <= 3:
        score += 0.3
        reasons.append('within_3_days')
    elif days_diff <= 7:
        score += 0.1
        reasons.append('within_7_days')

    return score, reasons, float(offset)


@extend_schema(
    summary="Get CC payment suggestions",
    description="Get unmatched bank CC payments with match suggestions from credit card transactions.",
    parameters=[
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_suggestions(request):
    """Get unmatched bank CC payments with match suggestions."""
    from datetime import timedelta
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions_experimental

    # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
    source = request.GET.get('source', 'legacy')

    # Get unlinked bank transactions tagged as "Credit Card Payment"
    # No amount filter - show all tagged transactions so incorrectly tagged ones can be re-categorized
    if source == 'experimental':
        bank_txns = get_active_transactions_experimental().filter(
            category='Credit Card Payment',
        ).exclude(
            cc_payment_match__is_active=True
        ).select_related('bank_account')
    else:
        bank_txns = get_active_transactions().filter(
            category='Credit Card Payment',
        ).exclude(
            cc_payment_match__is_active=True
        ).select_related('bank_account')

    # Apply filters
    bank_account_id = request.GET.get('bank_account')
    if bank_account_id:
        bank_txns = bank_txns.filter(bank_account_id=bank_account_id)

    year = request.GET.get('year')
    if year:
        bank_txns = bank_txns.filter(date__year=int(year))

    # Order by date desc
    bank_txns = bank_txns.order_by('-date')

    # Get unmatched CC payments (amount < 0 = payment) from active sources only
    # Exclude CC transactions that have an active match (is_active=True) pointing to an active bank transaction
    # CC transactions with inactive matches or orphaned bank transactions will appear here
    if source == 'experimental':
        unmatched_cc_payments = get_active_cc_transactions_experimental().filter(
            amount__lt=0
        ).exclude(
            bank_payment_match__is_active=True,
            bank_payment_match__bank_transaction__data_source_artifact__isnull=False
        ).select_related('credit_card', 'source_file')
    else:
        unmatched_cc_payments = get_active_cc_transactions().filter(
            amount__lt=0
        ).exclude(
            bank_payment_match__is_active=True,
            bank_payment_match__bank_transaction__extracted_csv__isnull=False
        ).select_related('credit_card', 'source_file')

    # Get offset threshold from query params (default 20%)
    offset_threshold = int(request.GET.get('offset_threshold', 20)) / 100.0

    data = []
    for bank_txn in bank_txns:
        # Find potential matches within 7 days before and after
        date_start = bank_txn.date - timedelta(days=7)
        date_end = bank_txn.date + timedelta(days=7)

        potential_matches = unmatched_cc_payments.filter(
            date__gte=date_start,
            date__lte=date_end,
        )

        suggestions = []
        target_amount = float(bank_txn.debit_amount)
        for cc_txn in potential_matches:
            score, reasons, offset = calculate_match_score(bank_txn, cc_txn)
            # Only include if there's some match AND offset is within threshold (100% = no filter)
            if score > 0 and (offset_threshold >= 1.0 or abs(offset) <= target_amount * offset_threshold):
                suggestions.append({
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
                    'offset': offset,
                    'confidence_score': score,
                    'match_reasons': reasons,
                })

        # Sort suggestions by score descending, then by absolute offset ascending, then prefer negative offsets
        suggestions.sort(key=lambda x: (-x['confidence_score'], abs(x['offset']), x['offset']))

        data.append({
            'bank_transaction': {
                'id': bank_txn.id,
                'date': bank_txn.date.isoformat(),
                'narration': bank_txn.narration,
                'amount': float(bank_txn.debit_amount or bank_txn.credit_amount),
                'is_debit': bank_txn.debit_amount > 0,
                'bank_account': {
                    'id': bank_txn.bank_account.id,
                    'nickname': bank_txn.bank_account.nickname,
                } if bank_txn.bank_account else None,
            },
            'suggestions': suggestions,
        })

    # Sort: entries with suggestions first (by highest confidence score), then entries without
    data.sort(key=lambda x: (
        0 if x['suggestions'] else 1,  # Has suggestions = 0 (first), no suggestions = 1 (last)
        -(x['suggestions'][0]['confidence_score'] if x['suggestions'] else 0),  # Higher score first
    ))

    return JsonResponse({
        'data': data,
        'total': len(data),
    })


@extend_schema(
    summary="Get CC payment suggestions (CC-first)",
    description="Get unmatched CC payments with match suggestions from bank transactions.",
    parameters=[
        OpenApiParameter(name='credit_card', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by credit card ID'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_suggestions_reverse(request):
    """Get unmatched CC payments with match suggestions from bank transactions."""
    from datetime import timedelta
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions_experimental

    # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
    source = request.GET.get('source', 'legacy')

    # Get the appropriate transaction query functions based on source
    if source == 'experimental':
        get_bank_txns = get_active_transactions_experimental
        get_cc_txns = get_active_cc_transactions_experimental
    else:
        get_bank_txns = get_active_transactions
        get_cc_txns = get_active_cc_transactions

    # Get unlinked CC transactions tagged as "Credit Card Payment"
    # No amount filter - show all tagged transactions so incorrectly tagged ones can be re-categorized
    if source == 'experimental':
        cc_payments = get_cc_txns().filter(
            category='Credit Card Payment',
        ).exclude(
            bank_payment_match__is_active=True,
            bank_payment_match__bank_transaction__data_source_artifact__isnull=False
        ).select_related('credit_card', 'source_file')
    else:
        cc_payments = get_cc_txns().filter(
            category='Credit Card Payment',
        ).exclude(
            bank_payment_match__is_active=True,
            bank_payment_match__bank_transaction__extracted_csv__isnull=False
        ).select_related('credit_card', 'source_file')

    # Apply filters
    credit_card_id = request.GET.get('credit_card')
    if credit_card_id:
        cc_payments = cc_payments.filter(credit_card_id=credit_card_id)

    year = request.GET.get('year')
    if year:
        cc_payments = cc_payments.filter(date__year=int(year))

    # Order by date desc
    cc_payments = cc_payments.order_by('-date')

    # Get unmatched bank transactions (any category, debit > 0)
    # Similar to bank-first mode which doesn't filter CC suggestions by category
    unmatched_bank_payments = get_bank_txns().filter(
        debit_amount__gt=0,
    ).exclude(
        cc_payment_match__credit_card_transaction_id__in=get_cc_txns().values_list('id', flat=True)
    ).select_related('bank_account')

    # Get offset threshold from query params (default 20%)
    offset_threshold = int(request.GET.get('offset_threshold', 20)) / 100.0

    data = []
    for cc_txn in cc_payments:
        # Find potential matches within 7 days before and after
        date_start = cc_txn.date - timedelta(days=7)
        date_end = cc_txn.date + timedelta(days=7)

        potential_matches = unmatched_bank_payments.filter(
            date__gte=date_start,
            date__lte=date_end,
        )

        suggestions = []
        target_amount = abs(float(cc_txn.amount))
        for bank_txn in potential_matches:
            score, reasons, offset = calculate_match_score(bank_txn, cc_txn)
            # Only include if there's some match AND offset is within threshold (100% = no filter)
            if score > 0 and (offset_threshold >= 1.0 or abs(offset) <= target_amount * offset_threshold):
                suggestions.append({
                    'bank_transaction': {
                        'id': bank_txn.id,
                        'date': bank_txn.date.isoformat(),
                        'narration': bank_txn.narration,
                        'amount': float(bank_txn.debit_amount or bank_txn.credit_amount),
                        'is_debit': bank_txn.debit_amount > 0,
                        'bank_account': {
                            'id': bank_txn.bank_account.id,
                            'nickname': bank_txn.bank_account.nickname,
                        } if bank_txn.bank_account else None,
                    },
                    'offset': offset,
                    'confidence_score': score,
                    'match_reasons': reasons,
                })

        # Sort suggestions by score descending, then by absolute offset ascending, then prefer negative offsets
        suggestions.sort(key=lambda x: (-x['confidence_score'], abs(x['offset']), x['offset']))

        data.append({
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
            'suggestions': suggestions,
        })

    # Sort: entries with suggestions first (by highest confidence score), then entries without
    data.sort(key=lambda x: (
        0 if x['suggestions'] else 1,
        -(x['suggestions'][0]['confidence_score'] if x['suggestions'] else 0),
    ))

    return JsonResponse({
        'data': data,
        'total': len(data),
    })


@extend_schema(
    methods=['GET'],
    summary="Get confirmed CC payment matches",
    description="Get confirmed credit card payment matches, filterable by year.",
    parameters=[
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@extend_schema(
    methods=['POST'],
    summary="Confirm a CC payment match",
    description="Create a new credit card payment match.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
    examples=[
        OpenApiExample(
            'Confirm match',
            value={
                'bank_transaction_id': 123,
                'credit_card_transaction_id': 456,
                'offset': 0.0,
                'confidence_score': 1.0,
                'match_reasons': ['exact_amount', 'same_day']
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def api_cc_payment_matches(request):
    """Get or create credit card payment matches."""
    if request.method == 'GET':
        from credit_cards.views import get_active_cc_transactions_experimental

        # Choose data source: 'legacy' (default) or 'experimental' (new extraction system)
        source = request.GET.get('source', 'legacy')

        # Get IDs of active transactions (bank and CC)
        if source == 'experimental':
            active_bank_txn_ids = get_active_transactions_experimental().values_list('id', flat=True)
            active_cc_txn_ids = get_active_cc_transactions_experimental().values_list('id', flat=True)
        else:
            active_bank_txn_ids = get_active_transactions().values_list('id', flat=True)
            active_cc_txn_ids = get_active_cc_transactions().values_list('id', flat=True)

        # Get confirmed matches (only active matches where both bank and CC transactions are from active sources)
        matches = CreditCardPaymentMatch.objects.filter(
            is_active=True,
            bank_transaction_id__in=active_bank_txn_ids,
            credit_card_transaction_id__in=active_cc_txn_ids
        ).select_related(
            'bank_transaction',
            'bank_transaction__bank_account',
            'credit_card_transaction',
            'credit_card_transaction__credit_card',
        )

        year = request.GET.get('year')
        if year:
            matches = matches.filter(bank_transaction__date__year=int(year))

        # Order by bank transaction date desc
        matches = matches.order_by('-bank_transaction__date')

        data = []
        for match in matches:
            data.append({
                'id': match.id,
                'bank_transaction': {
                    'id': match.bank_transaction.id,
                    'date': match.bank_transaction.date.isoformat(),
                    'narration': match.bank_transaction.narration,
                    'amount': float(match.bank_transaction.debit_amount or match.bank_transaction.credit_amount),
                    'is_debit': match.bank_transaction.debit_amount > 0,
                    'bank_account': {
                        'id': match.bank_transaction.bank_account.id,
                        'nickname': match.bank_transaction.bank_account.nickname,
                    } if match.bank_transaction.bank_account else None,
                },
                'credit_card_transaction': {
                    'id': match.credit_card_transaction.id,
                    'date': match.credit_card_transaction.date.isoformat(),
                    'description': match.credit_card_transaction.description,
                    'amount': float(match.credit_card_transaction.amount),
                    'credit_card': {
                        'id': match.credit_card_transaction.credit_card.id,
                        'nickname': match.credit_card_transaction.credit_card.nickname,
                    } if match.credit_card_transaction.credit_card else None,
                },
                'offset': float(match.offset),
                'confidence_score': match.confidence_score,
                'match_reasons': match.match_reasons,
                'created_at': match.created_at.isoformat(),
            })

        return JsonResponse({
            'data': data,
            'total': len(data),
        })

    # POST - Create a match
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions_experimental

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    bank_txn_id = body.get('bank_transaction_id')
    cc_txn_id = body.get('credit_card_transaction_id')
    source = body.get('source', 'legacy')

    if not bank_txn_id or not cc_txn_id:
        return JsonResponse({'error': 'bank_transaction_id and credit_card_transaction_id are required'}, status=400)

    # Get the appropriate transaction query functions based on source
    if source == 'experimental':
        get_bank_txns = get_active_transactions_experimental
        get_cc_txns = get_active_cc_transactions_experimental
    else:
        get_bank_txns = get_active_transactions
        get_cc_txns = get_active_cc_transactions

    try:
        bank_txn = get_bank_txns().get(id=bank_txn_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Bank transaction not found or not active'}, status=404)

    try:
        cc_txn = CreditCardTransaction.objects.get(id=cc_txn_id)
    except CreditCardTransaction.DoesNotExist:
        return JsonResponse({'error': 'Credit card transaction not found'}, status=404)

    # Check if already matched
    if hasattr(bank_txn, 'cc_payment_match'):
        # Check if the existing match is to an inactive CC source
        active_cc_txn_ids = set(get_cc_txns().values_list('id', flat=True))
        if bank_txn.cc_payment_match.credit_card_transaction_id in active_cc_txn_ids:
            return JsonResponse({'error': 'Bank transaction is already matched'}, status=400)
        # Delete the orphaned match so we can re-match
        bank_txn.cc_payment_match.delete()
    if hasattr(cc_txn, 'bank_payment_match'):
        # Check if the existing match is active AND points to an active bank transaction
        existing_match = cc_txn.bank_payment_match
        # For experimental, check data_source_artifact instead of extracted_csv
        if source == 'experimental':
            is_active_bank = existing_match.bank_transaction.data_source_artifact_id is not None
        else:
            is_active_bank = existing_match.bank_transaction.extracted_csv_id is not None
        if existing_match.is_active and is_active_bank:
            return JsonResponse({'error': 'Credit card transaction is already matched'}, status=400)
        # Delete the inactive/orphaned match so we can re-match
        existing_match.delete()

    # Create the match
    match = CreditCardPaymentMatch.objects.create(
        bank_transaction=bank_txn,
        credit_card_transaction=cc_txn,
        offset=body.get('offset', 0),
        confidence_score=body.get('confidence_score', 0),
        match_reasons=body.get('match_reasons', []),
    )

    # Tag both transactions as matched payments
    if cc_txn.category != 'Credit Card Payment':
        cc_txn.category = 'Credit Card Payment'
        cc_txn.save(update_fields=['category'])
    if bank_txn.category != 'Credit Card Payment':
        bank_txn.category = 'Credit Card Payment'
        bank_txn.save(update_fields=['category'])

    return JsonResponse({
        'id': match.id,
        'bank_transaction_id': match.bank_transaction_id,
        'credit_card_transaction_id': match.credit_card_transaction_id,
        'offset': float(match.offset),
        'confidence_score': match.confidence_score,
        'match_reasons': match.match_reasons,
        'created_at': match.created_at.isoformat(),
    })


@extend_schema(
    summary="Delete a CC payment match",
    description="Remove a confirmed credit card payment match.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['DELETE'])
def api_cc_payment_match_delete(request, match_id):
    """Delete a credit card payment match."""
    try:
        match = CreditCardPaymentMatch.objects.get(id=match_id)
    except CreditCardPaymentMatch.DoesNotExist:
        return JsonResponse({'error': 'Match not found'}, status=404)

    match.delete()
    return JsonResponse({'success': True})


@extend_schema(
    summary="Get CC payment match years",
    description="Get available years with match counts for filtering.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_match_years(request):
    """Get available years with match counts."""
    from django.db.models import Count
    from django.db.models.functions import ExtractYear

    # Get IDs of active transactions (consistent with matches endpoint)
    active_bank_txn_ids = get_active_transactions().values_list('id', flat=True)
    active_cc_txn_ids = get_active_cc_transactions().values_list('id', flat=True)

    # Count matches by year (only active matches where both bank and CC transactions are from active sources)
    year_counts = (
        CreditCardPaymentMatch.objects
        .filter(
            is_active=True,
            bank_transaction_id__in=active_bank_txn_ids,
            credit_card_transaction_id__in=active_cc_txn_ids
        )
        .annotate(year=ExtractYear('bank_transaction__date'))
        .values('year')
        .annotate(count=Count('id'))
        .order_by('-year')
    )

    years = {str(item['year']): item['count'] for item in year_counts}

    return JsonResponse({'years': years})
