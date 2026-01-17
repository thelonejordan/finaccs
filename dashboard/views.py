import json

from django.db.models import Sum, Max, Subquery, OuterRef
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from rest_framework.decorators import api_view

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

from .models import Transaction, TransactionLog, AccountLog, FileLoadLog

# Categories to exclude from income/expense calculations (internal transfers)
EXCLUDED_CATEGORIES = ['Self Transfer']


def get_active_transactions():
    """
    Get transactions that are active (not from superseded ExtractedCSVs or disabled source files).

    Excludes:
    - Transactions from disabled source files
    - Transactions from superseded ExtractedCSVs (archived data)
    """
    from django.db.models import Q
    return Transaction.objects.filter(
        Q(source_file__isnull=True) | Q(source_file__disabled=False)
    ).filter(
        Q(extracted_csv__isnull=True) | Q(extracted_csv__status__in=['extracted', 'loaded'])
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
    transactions = get_active_transactions().select_related(
        'bank_account',
        'source_file',
        'linked_transaction',
        'linked_transaction__bank_account'
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
            'source_file': {
                'id': t.source_file.id,
                'filename': t.source_file.filename,
            } if t.source_file else None,
            'linked_transaction': linked_data,
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

    return JsonResponse({
        'data': page,
        'total': total,
        'limit': limit,
        'offset': offset,
    })
