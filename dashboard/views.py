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

from bank_accounts.models import BankTransaction, TransactionLog, AccountLog, FileLoadLog, DismissedBankInconsistency
from credit_cards.models import CreditCardPaymentMatch, CreditCardTransaction
from credit_cards.views import get_active_cc_transactions

# Categories to exclude from income/expense calculations (internal transfers)
EXCLUDED_CATEGORIES = ['Self Transfer', 'Refund']

# Predefined expense categories for consistent display
PREDEFINED_CATEGORIES = [
    'Food & Dining',
    'Transport',
    'Shopping',
    'Entertainment',
    'Utilities',
    'Rent',
    'Medical',
    'Travel',
    'Education',
    'Groceries',
    'Personal Care',
    'Credit Card Payment',
    'Investment',
    'Insurance',
    'Self Transfer',
    'Refund',
    'Salary/Income',
    'Other',
]


def get_active_transactions():
    """
    Return bank transactions from loaded, enabled, visible data sources.
    Excludes non-primary duplicates from resolved overlapping source groups.
    Transactions without a resolved_transaction (legacy) are always included.
    """
    from django.db.models import Q
    return BankTransaction.objects.filter(
        data_source_artifact__isnull=False,
        data_source_artifact__status='loaded',
        data_source_artifact__enabled=True,
        data_source_artifact__hidden=False,
    ).filter(
        Q(resolved_transaction__isnull=True) | Q(is_primary=True)
    )


def _build_category_map(resolved_transaction_ids):
    """Build a map of resolved_transaction_id -> category from CategoryLinks (latest wins)."""
    from links.models import CategoryLink
    category_map = {}
    for link in CategoryLink.objects.filter(
        resolved_transaction_id__in=resolved_transaction_ids
    ).order_by('created_at'):
        category_map[link.resolved_transaction_id] = link.category
    return category_map


@extend_schema(
    summary="Get financial summary",
    description="Get comprehensive financial summary including balance, credits, debits, income/expense breakdown, and per-account statistics.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Financial Summary',
            value={
                'starting_balance': 50000.0,
                'current_balance': 125000.0,
                'total_credits': 200000.0,
                'total_debits': 125000.0,
                'net_flow': 75000.0,
                'salary_income': 150000.0,
                'other_income': 50000.0,
                'expenses': 125000.0,
                'unaccounted': 0.0,
                'transaction_count': 250,
                'per_account': [{
                    'id': 1,
                    'nickname': 'HDFC Savings',
                    'starting_balance': 50000.0,
                    'current_balance': 125000.0,
                    'total_credits': 200000.0,
                    'total_debits': 125000.0,
                    'salary_income': 150000.0,
                    'other_income': 50000.0,
                    'expenses': 125000.0,
                    'unaccounted': 0.0,
                    'transaction_count': 250,
                }],
            },
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_summary(request):
    # Get active transactions (excludes disabled source files)
    all_transactions = get_active_transactions()
    from django.db.models import Q
    from bank_accounts.models import BankAccount

    # For income/expense breakdown, exclude linked self transfers and refunds
    from links.models import SelfTransferLink, RefundLink
    self_transfer_rt_ids = set(
        SelfTransferLink.objects.values_list('resolved_transaction_a_id', flat=True)
    ) | set(
        SelfTransferLink.objects.values_list('resolved_transaction_b_id', flat=True)
    )
    self_transfer_rt_ids.discard(None)
    refund_rt_ids = set(
        RefundLink.objects.values_list('refund_resolved_transaction_id', flat=True)
    )
    refund_rt_ids.discard(None)
    excluded_rt_ids = self_transfer_rt_ids | refund_rt_ids

    filtered_transactions = all_transactions.exclude(
        Q(category__in=EXCLUDED_CATEGORIES) &
        Q(resolved_transaction_id__in=excluded_rt_ids)
    )

    filtered_with_resolved = filtered_transactions.select_related(
        'resolved_transaction'
    ).prefetch_related('resolved_transaction__category_links')

    # Pre-fetch category map to avoid N+1 queries
    all_rt_ids = set(all_transactions.exclude(
        resolved_transaction_id__isnull=True
    ).values_list('resolved_transaction_id', flat=True))
    category_map = _build_category_map(all_rt_ids)

    # Income breakdown using aggregated category
    income_categories = ['Salary/Income']
    salary_income = 0.0
    other_income = 0.0
    expenses = 0.0
    total_credits = 0.0
    total_debits = 0.0

    for txn in filtered_with_resolved:
        effective_category = category_map.get(txn.resolved_transaction_id)

        # Check if this is an excluded self transfer that wasn't caught by the query filter
        is_excluded_link = txn.resolved_transaction_id in excluded_rt_ids
        if effective_category in EXCLUDED_CATEGORIES and is_excluded_link:
            continue

        credit_amt = float(txn.credit_amount)
        debit_amt = float(txn.debit_amount)

        total_credits += credit_amt
        total_debits += debit_amt
        expenses += debit_amt

        if effective_category in income_categories:
            salary_income += credit_amt
        else:
            other_income += credit_amt

    net_flow = total_credits - total_debits

    # Calculate per-account breakdown
    accounts = BankAccount.objects.all()
    per_account = []
    starting_balance = 0
    current_balance = 0

    for account in accounts:
        account_txns = list(all_transactions.filter(bank_account=account).order_by('date', 'row_number').select_related(
            'resolved_transaction'
        ).prefetch_related('resolved_transaction__bank_transactions'))
        if not account_txns:
            continue

        # Latest transaction for current balance
        latest_txn = account_txns[-1]
        acc_current = float(latest_txn.closing_balance)

        # Earliest transaction for starting balance
        earliest_txn = account_txns[0]
        acc_starting = float(earliest_txn.closing_balance) - float(earliest_txn.credit_amount) + float(earliest_txn.debit_amount)

        # Income/expense breakdown per account using aggregated category
        acc_salary_income = 0.0
        acc_other_income = 0.0
        acc_expenses = 0.0
        acc_credits = 0.0
        acc_debits = 0.0
        filtered_count = 0

        for txn in account_txns:
            effective_category = category_map.get(txn.resolved_transaction_id)

            # Check if this is an excluded self transfer
            is_self_transfer = txn.resolved_transaction_id in self_transfer_rt_ids
            if effective_category in EXCLUDED_CATEGORIES and is_self_transfer:
                continue

            filtered_count += 1
            credit_amt = float(txn.credit_amount)
            debit_amt = float(txn.debit_amount)

            acc_credits += credit_amt
            acc_debits += debit_amt
            acc_expenses += debit_amt

            if effective_category in income_categories:
                acc_salary_income += credit_amt
            else:
                acc_other_income += credit_amt

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
            'transaction_count': filtered_count,
        })

        starting_balance += acc_starting
        current_balance += acc_current

    # Fallback if no accounts
    if not accounts.exists():
        latest = all_transactions.first()
        earliest = all_transactions.order_by('date', 'row_number').first()
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
    examples=[
        OpenApiExample(
            'Monthly Breakdown',
            value={
                'data': [
                    {'month': 'Jan 2024', 'credits': 50000.0, 'debits': 35000.0},
                    {'month': 'Feb 2024', 'credits': 55000.0, 'debits': 40000.0},
                    {'month': 'Mar 2024', 'credits': 60000.0, 'debits': 45000.0},
                ]
            },
            response_only=True,
        ),
    ],
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
    examples=[
        OpenApiExample(
            'Expense Categories',
            value={
                'data': [
                    {'category': 'Food & Dining', 'amount': 25000.0},
                    {'category': 'Shopping', 'amount': 15000.0},
                    {'category': 'Transport', 'amount': 8000.0},
                    {'category': 'Utilities', 'amount': 5000.0},
                    {'category': 'Entertainment', 'amount': 3000.0},
                ]
            },
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_categories(request):
    # Check if we should include all categories (for filtering purposes)
    include_all = request.GET.get('include_all', 'false').lower() == 'true'

    # Get active transactions with debits, including resolved transaction data
    queryset = get_active_transactions().filter(debit_amount__gt=0).select_related(
        'resolved_transaction'
    ).prefetch_related('resolved_transaction__bank_transactions')

    # Build category totals using aggregated (effective) category
    existing_categories = {}
    for txn in queryset:
        # Get effective category (aggregate from resolved members if primary has none)
        effective_category = txn.category
        if not effective_category and txn.resolved_transaction:
            for member in txn.resolved_transaction.bank_transactions.all():
                if member.category:
                    effective_category = member.category
                    break

        cat_name = effective_category or 'Other'

        # Skip excluded categories unless include_all is set
        if not include_all and cat_name in EXCLUDED_CATEGORIES:
            continue

        if cat_name not in existing_categories:
            existing_categories[cat_name] = 0.0
        existing_categories[cat_name] += float(txn.debit_amount)

    # Add predefined categories with zero amount if not present
    for cat_name in PREDEFINED_CATEGORIES:
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
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
        OpenApiParameter(name='month', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by month (1-12)'),
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search narration, category, or reference'),
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Number of results (default: 100)'),
        OpenApiParameter(name='offset', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Pagination offset (default: 0)'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Transactions List',
            value={
                'data': [{
                    'id': 1,
                    'date': '2024-01-15',
                    'narration': 'ATM Withdrawal',
                    'debit': 5000.0,
                    'credit': 0.0,
                    'balance': 45000.0,
                    'category': 'Other',
                    'reference': 'REF123456',
                    'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                    'source_file': {'id': 1, 'filename': 'statement_2024.pdf'},
                    'linked_transaction': None,
                    'cc_payment_match': None,
                }],
                'total': 250,
                'limit': 100,
                'offset': 0,
                'stats': {
                    'total_credits': 200000.0,
                    'total_debits': 125000.0,
                    'net_flow': 75000.0,
                },
            },
            response_only=True,
        ),
    ],
    tags=['Transactions'],
)
@api_view(['GET'])
def api_transactions(request):
    from django.db.models import Q
    from itertools import groupby

    transactions = get_active_transactions().select_related(
        'bank_account',
        'data_source_artifact',
        'data_source_artifact__source_artifact',
        'data_source_artifact__source_artifact__extraction',
        'data_source_artifact__source_artifact__extraction__source_file',
        'resolved_transaction',
    ).prefetch_related(
        'resolved_transaction__bank_transactions',
        'resolved_transaction__category_links',
        'resolved_transaction__self_transfer_links_as_a__resolved_transaction_b',
        'resolved_transaction__self_transfer_links_as_b__resolved_transaction_a',
        'resolved_transaction__cc_payment_links_bank',
        'resolved_transaction__cc_payment_links_bank__cc_resolved_transaction',
        'resolved_transaction__refund_links_as_original',
        'resolved_transaction__refund_links_as_original__refund_resolved_transaction',
        'resolved_transaction__refund_links_as_refund',
        'resolved_transaction__refund_links_as_refund__original_resolved_transaction',
    )

    # Filter by bank account
    bank_account_id = request.GET.get('bank_account')
    if bank_account_id:
        transactions = transactions.filter(bank_account_id=bank_account_id)

    # Filter by data source artifact
    data_source_artifact_id = request.GET.get('data_source_artifact')
    if data_source_artifact_id:
        transactions = transactions.filter(data_source_artifact_id=data_source_artifact_id)

    category = request.GET.get('category')
    if category:
        transactions = transactions.filter(
            Q(category=category) |
            Q(resolved_transaction__bank_transactions__category=category) |
            Q(resolved_transaction__category_links__category=category)
        ).distinct()

    transaction_type = request.GET.get('type')
    if transaction_type == 'credit':
        transactions = transactions.filter(credit_amount__gt=0)
    elif transaction_type == 'debit':
        transactions = transactions.filter(debit_amount__gt=0)

    # Filter by year and month
    year = request.GET.get('year')
    month = request.GET.get('month')
    if year:
        transactions = transactions.filter(date__year=int(year))
    if month:
        transactions = transactions.filter(date__month=int(month))

    # Search filter (narration, category, reference)
    # For resolved transactions, also search in member transaction categories
    search = request.GET.get('search')
    if search:
        transactions = transactions.filter(
            Q(narration__icontains=search) |
            Q(category__icontains=search) |
            Q(reference_number__icontains=search) |
            Q(resolved_transaction__bank_transactions__category__icontains=search) |
            Q(resolved_transaction__category_links__category__icontains=search)
        ).distinct()

    # Calculate aggregate stats based on filtered results
    total_credits = transactions.aggregate(total=Sum('credit_amount'))['total'] or 0
    total_debits = transactions.aggregate(total=Sum('debit_amount'))['total'] or 0

    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    total = transactions.count()

    # Custom sorting for overlapping data sources
    # For descending display: within same date, smaller row numbers first (newer data sources),
    # larger row numbers last (older data sources)
    # Fetch all transactions for custom sorting, then paginate
    all_txns = list(transactions.order_by('-date', 'row_number'))

    # Sort by date descending first
    all_txns.sort(key=lambda t: t.date, reverse=True)

    sorted_result = []
    # Group by date
    for date, date_group in groupby(all_txns, key=lambda t: t.date):
        date_txns = list(date_group)

        # Group by data_source_artifact_id
        artifact_groups = {}
        for txn in date_txns:
            aid = txn.data_source_artifact_id
            if aid not in artifact_groups:
                artifact_groups[aid] = []
            artifact_groups[aid].append(txn)

        # Sort each artifact group by row_number descending (for display)
        for aid in artifact_groups:
            artifact_groups[aid].sort(key=lambda t: t.row_number, reverse=True)

        # Sort artifact groups by min row_number ascending (smaller/newer first)
        sorted_groups = sorted(
            artifact_groups.values(),
            key=lambda g: min(t.row_number for t in g),
            reverse=False
        )

        # Flatten
        for group in sorted_groups:
            sorted_result.extend(group)

    transactions_page = sorted_result[offset:offset + limit]

    active_cc_txn_ids = set(get_active_cc_transactions().values_list('id', flat=True))
    page_rt_ids = {t.resolved_transaction_id for t in transactions_page if t.resolved_transaction_id}
    category_map = _build_category_map(page_rt_ids)
    data = []
    for t in transactions_page:
        member_txns = [t]
        if t.resolved_transaction:
            member_txns = list(t.resolved_transaction.bank_transactions.all())

        linked = None
        linked_data = None
        rt = t.resolved_transaction
        if rt:
            link = rt.self_transfer_links_as_a.select_related('resolved_transaction_b').first()
            if link and link.resolved_transaction_b_id:
                other = link.resolved_transaction_b
                primary_id = getattr(other, 'primary_transaction_id', None)
                if primary_id:
                    linked = BankTransaction.objects.filter(id=primary_id).select_related('bank_account').first()
            if not linked:
                link = rt.self_transfer_links_as_b.select_related('resolved_transaction_a').first()
                if link and link.resolved_transaction_a_id:
                    other = link.resolved_transaction_a
                    primary_id = getattr(other, 'primary_transaction_id', None)
                    if primary_id:
                        linked = BankTransaction.objects.filter(id=primary_id).select_related('bank_account').first()
        if linked:
            linked_data = {
                'id': linked.id,
                'date': linked.date.isoformat(),
                'narration': linked.narration,
                'bank_account': linked.bank_account.nickname if linked.bank_account else None,
                'amount': float(linked.debit_amount or linked.credit_amount),
            }

        cc_match_data = None
        rt = t.resolved_transaction
        if rt:
            for ccl in rt.cc_payment_links_bank.all():
                if not ccl.is_active:
                    continue
                cc_resolved = getattr(ccl, 'cc_resolved_transaction', None)
                if cc_resolved and cc_resolved.primary_transaction_id in active_cc_txn_ids:
                    cc_txn = CreditCardTransaction.objects.filter(
                        id=cc_resolved.primary_transaction_id
                    ).select_related('credit_card', 'data_source_artifact').first()
                    if cc_txn:
                        cc_source = cc_txn.data_source_artifact
                        is_active_cc_source = (
                            cc_source and cc_source.status == 'loaded' and cc_source.enabled and not cc_source.hidden
                        )
                        if is_active_cc_source:
                            cc_match_data = {
                                'id': ccl.id,
                                'credit_card_transaction': {
                                    'id': cc_txn.id,
                                    'date': cc_txn.date.isoformat(),
                                    'description': cc_txn.description,
                                    'amount': float(cc_txn.amount),
                                    'credit_card': {'id': cc_txn.credit_card.id, 'nickname': cc_txn.credit_card.nickname} if cc_txn.credit_card else None,
                                },
                                'offset': float(ccl.offset),
                                'confidence_score': ccl.confidence_score,
                                'match_reasons': ccl.match_reasons or [],
                            }
                            break

        refund_link_data = None
        rt = t.resolved_transaction
        if rt:
            for rl in rt.refund_links_as_original.all():
                other_rt = rl.refund_resolved_transaction
                if other_rt:
                    other_txn = _get_txn_by_type(other_rt.primary_transaction_id, other_rt.transaction_type)
                    if other_txn:
                        refund_link_data = {
                            'id': rl.id,
                            'role': 'original',
                            'other_transaction': _serialize_any_txn(other_txn, other_rt.transaction_type),
                        }
                        break
            if not refund_link_data:
                for rl in rt.refund_links_as_refund.all():
                    other_rt = rl.original_resolved_transaction
                    if other_rt:
                        other_txn = _get_txn_by_type(other_rt.primary_transaction_id, other_rt.transaction_type)
                        if other_txn:
                            refund_link_data = {
                                'id': rl.id,
                                'role': 'refund',
                                'other_transaction': _serialize_any_txn(other_txn, other_rt.transaction_type),
                            }
                            break

        aggregated_category = category_map.get(t.resolved_transaction_id) if t.resolved_transaction_id else t.category
        if not aggregated_category:
            for member in member_txns:
                if member.category:
                    aggregated_category = member.category
                    break

        # Get source file info from data_source_artifact
        source_file_data = None
        if t.data_source_artifact:
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
            'category': aggregated_category,  # Use aggregated category from all member transactions
            'reference': t.reference_number,
            'bank_account': {
                'id': t.bank_account.id,
                'nickname': t.bank_account.nickname,
            } if t.bank_account else None,
            'source_file': source_file_data,
            'linked_transaction': linked_data,
            'cc_payment_match': cc_match_data,
            'refund_link': refund_link_data,
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
    examples=[
        OpenApiExample(
            'Top Expenses',
            value={
                'data': [{
                    'id': 1,
                    'date': '2024-01-15',
                    'narration': 'Online Shopping - Amazon',
                    'amount': 25000.0,
                    'category': 'Shopping',
                    'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_top_expenses(request):
    limit = int(request.GET.get('limit', 10))

    # Exclude self transfers from top expenses
    top_expenses = (
        get_active_transactions()
        .select_related('bank_account', 'resolved_transaction')
        .prefetch_related('resolved_transaction__bank_transactions')
        .filter(debit_amount__gt=0)
        .exclude(category__in=EXCLUDED_CATEGORIES)
        .order_by('-debit_amount')[:limit]
    )

    data = []
    for t in top_expenses:
        # Aggregate category from member transactions
        # Use the first non-empty category found (primary transaction's category takes precedence)
        aggregated_category = t.category
        if not aggregated_category and t.resolved_transaction:
            for member in t.resolved_transaction.bank_transactions.all():
                if member.category:
                    aggregated_category = member.category
                    break

        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'narration': t.narration,
            'amount': float(t.debit_amount),
            'category': aggregated_category,
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
        transaction = BankTransaction.objects.get(id=transaction_id)
    except BankTransaction.DoesNotExist:
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

        if transaction.resolved_transaction_id:
            from links.models import CategoryLink
            CategoryLink.objects.filter(resolved_transaction_id=transaction.resolved_transaction_id).delete()
            CategoryLink.objects.create(
                resolved_transaction_id=transaction.resolved_transaction_id,
                category=new_category,
                origin_transaction_type='bank',
                origin_transaction_id=transaction.id,
            )

        if old_category != new_category:
            TransactionLog.objects.create(
                transaction=transaction,
                action='CATEGORY_CHANGE',
                old_value=old_category,
                new_value=new_category,
            )

    effective_category = transaction.category
    if transaction.resolved_transaction_id:
        from links.models import CategoryLink
        link = CategoryLink.objects.filter(resolved_transaction_id=transaction.resolved_transaction_id).order_by('-created_at').first()
        if link:
            effective_category = link.category

    return JsonResponse({
        'id': transaction.id,
        'date': transaction.date.isoformat(),
        'narration': transaction.narration,
        'debit': float(transaction.debit_amount),
        'credit': float(transaction.credit_amount),
        'balance': float(transaction.closing_balance),
        'category': effective_category,
        'reference': transaction.reference_number,
    })


@extend_schema(
    summary="Get potential transaction links",
    description="Find potential matching transactions for linking based on amount, account, and date proximity.",
    parameters=[
        OpenApiParameter(name='days', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Date range window in days (default: 7)'),
    ],
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Potential Links',
            value={
                'data': [{
                    'id': 2,
                    'date': '2024-01-15',
                    'narration': 'IMPS Transfer',
                    'debit': 0.0,
                    'credit': 10000.0,
                    'category': None,
                    'bank_account': {'id': 2, 'nickname': 'SBI Savings'},
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Transactions'],
)
@api_view(['GET'])
def api_potential_links(request, transaction_id):
    """Find potential matching transactions for linking based on amount, account, and date proximity."""
    from datetime import timedelta

    try:
        transaction = BankTransaction.objects.select_related('bank_account').get(id=transaction_id)
    except BankTransaction.DoesNotExist:
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
    # - Not already linked (either directly or via resolved members)
    # - Amount matches (debit of one = credit of other)
    # - Within date proximity
    from django.db.models import Q, Exists, OuterRef
    from bank_accounts.models import BankTransaction as BT

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
        # Direct links must be null
        linked_transaction__isnull=True,
        linked_from__isnull=True
    ).exclude(
        Q(resolved_transaction__isnull=False) & (
            Q(resolved_transaction__bank_transactions__linked_transaction__isnull=False) |
            Q(resolved_transaction__bank_transactions__linked_from__isnull=False)
        )
    )
    from links.models import SelfTransferLink
    potential_matches = potential_matches.exclude(
        Q(resolved_transaction__self_transfer_links_as_a__id__isnull=False) |
        Q(resolved_transaction__self_transfer_links_as_b__id__isnull=False)
    )
    potential_matches = potential_matches.select_related('bank_account').distinct()

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
def _create_self_transfer(transaction, link_to):
    """Create a self-transfer link between two bank transactions.
    Both must be loaded with select_related('bank_account').
    Returns the created SelfTransferLink."""
    from django.db.models import Q
    from links.models import SelfTransferLink, CategoryLink

    transaction.linked_transaction = link_to
    old_category_1 = transaction.category or ''
    old_category_2 = link_to.category or ''
    transaction.category = 'Self Transfer'
    link_to.category = 'Self Transfer'
    transaction.save()
    link_to.save()

    _ensure_resolved_transaction(transaction, 'bank')
    _ensure_resolved_transaction(link_to, 'bank')
    ra, rb = transaction.resolved_transaction_id, link_to.resolved_transaction_id
    link = None
    if ra != rb and not SelfTransferLink.objects.filter(
        Q(resolved_transaction_a_id=ra, resolved_transaction_b_id=rb) |
        Q(resolved_transaction_a_id=rb, resolved_transaction_b_id=ra)
    ).exists():
        link = SelfTransferLink.objects.create(
            resolved_transaction_a_id=ra,
            resolved_transaction_b_id=rb,
            origin_transaction_id_a=transaction.id,
            origin_transaction_id_b=link_to.id,
        )
    if not link:
        link = SelfTransferLink.objects.filter(
            Q(resolved_transaction_a_id=ra, resolved_transaction_b_id=rb) |
            Q(resolved_transaction_a_id=rb, resolved_transaction_b_id=ra)
        ).first()
    for rid in (ra, rb):
        CategoryLink.objects.filter(resolved_transaction_id=rid).delete()
        CategoryLink.objects.create(
            resolved_transaction_id=rid,
            category='Self Transfer',
            origin_transaction_type='bank',
            origin_transaction_id=transaction.id if rid == ra else link_to.id,
        )

    TransactionLog.objects.create(
        transaction=transaction, action='LINK', new_value=str(link_to.id),
    )
    TransactionLog.objects.create(
        transaction=link_to, action='LINK', new_value=str(transaction.id),
    )
    if old_category_1 != 'Self Transfer':
        TransactionLog.objects.create(
            transaction=transaction, action='CATEGORY_CHANGE',
            old_value=old_category_1, new_value='Self Transfer',
        )
    if old_category_2 != 'Self Transfer':
        TransactionLog.objects.create(
            transaction=link_to, action='CATEGORY_CHANGE',
            old_value=old_category_2, new_value='Self Transfer',
        )
    return link


def _remove_self_transfer(transaction):
    """Remove a self-transfer link from a bank transaction.
    Transaction must be loaded with select_related('bank_account', 'linked_transaction').
    Returns the other transaction or None."""
    from django.db.models import Q
    from links.models import SelfTransferLink

    other = None
    if transaction.linked_transaction:
        other = transaction.linked_transaction
        transaction.linked_transaction = None
        transaction.save()
    elif hasattr(transaction, 'linked_from') and transaction.linked_from:
        other = transaction.linked_from
        other.linked_transaction = None
        other.save()

    if transaction.resolved_transaction_id and other and other.resolved_transaction_id:
        ra, rb = transaction.resolved_transaction_id, other.resolved_transaction_id
        SelfTransferLink.objects.filter(
            Q(resolved_transaction_a_id=ra, resolved_transaction_b_id=rb) |
            Q(resolved_transaction_a_id=rb, resolved_transaction_b_id=ra)
        ).delete()

    if other:
        TransactionLog.objects.create(
            transaction=transaction, action='UNLINK', old_value=str(other.id),
        )
        TransactionLog.objects.create(
            transaction=other, action='UNLINK', old_value=str(transaction.id),
        )
    return other


@api_view(['POST', 'DELETE'])
def api_link_transaction(request, transaction_id):
    """Link or unlink self-transfer transactions."""
    try:
        transaction = BankTransaction.objects.select_related('bank_account', 'linked_transaction').get(id=transaction_id)
    except BankTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    if request.method == 'DELETE':
        _remove_self_transfer(transaction)
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
        link_to = BankTransaction.objects.select_related('bank_account').get(id=link_to_id)
    except BankTransaction.DoesNotExist:
        return JsonResponse({'error': 'Target transaction not found'}, status=404)

    if transaction.bank_account == link_to.bank_account:
        return JsonResponse({'error': 'Transactions must be from different bank accounts'}, status=400)

    if transaction.linked_transaction or (hasattr(transaction, 'linked_from') and transaction.linked_from):
        return JsonResponse({'error': 'Transaction is already linked'}, status=400)
    if link_to.linked_transaction or (hasattr(link_to, 'linked_from') and link_to.linked_from):
        return JsonResponse({'error': 'Target transaction is already linked'}, status=400)

    _create_self_transfer(transaction, link_to)

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
    examples=[
        OpenApiExample(
            'Transaction Logs',
            value={
                'data': [{
                    'id': 'txn_1',
                    'log_type': 'transaction',
                    'action': 'CATEGORY_CHANGE',
                    'action_display': 'Category Changed',
                    'old_value': 'Other',
                    'new_value': 'Food & Dining',
                    'created_at': '2024-01-15T10:30:00Z',
                    'transaction': {
                        'id': 1,
                        'date': '2024-01-15',
                        'narration': 'Restaurant payment',
                        'bank_account': 'HDFC Savings',
                    },
                    'bank_account': None,
                    'source_file': None,
                    'file_load': None,
                }],
                'total': 50,
                'limit': 100,
                'offset': 0,
            },
            response_only=True,
        ),
    ],
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
            'data_source_artifact',
            'bank_account'
        )
        for log in file_logs:
            artifact_id = log.data_source_artifact.artifact_id if log.data_source_artifact else None
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
                'source_file': artifact_id,
                'file_load': {
                    'transaction_count': log.transaction_count,
                    'category_summary': log.category_summary,
                    'file_hash': log.file_hash,
                    'artifact_id': artifact_id,
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
    if log_type in ('all', 'account') and (not action or action in ['CREATE', 'UPDATE', 'DELETE']):
        acc_logs = AccountLog.objects.select_related('bank_account')
        if action and action in ['CREATE', 'UPDATE', 'DELETE']:
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
                'source_file': None,
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
        OpenApiParameter(name='search', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Search narration, category, or reference'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Date Range',
            value={
                'years': {
                    '2024': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                    '2023': [6, 7, 8, 9, 10, 11, 12],
                }
            },
            response_only=True,
        ),
    ],
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
        transactions = transactions.filter(
            Q(category=category) |
            Q(resolved_transaction__bank_transactions__category=category) |
            Q(resolved_transaction__category_links__category=category)
        ).distinct()

    transaction_type = request.GET.get('type')
    if transaction_type == 'credit':
        transactions = transactions.filter(credit_amount__gt=0)
    elif transaction_type == 'debit':
        transactions = transactions.filter(debit_amount__gt=0)

    search = request.GET.get('search')
    if search:
        # For resolved transactions, also search in member transaction categories
        transactions = transactions.filter(
            Q(narration__icontains=search) |
            Q(category__icontains=search) |
            Q(reference_number__icontains=search) |
            Q(resolved_transaction__bank_transactions__category__icontains=search) |
            Q(resolved_transaction__category_links__category__icontains=search)
        ).distinct()

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
    examples=[
        OpenApiExample(
            'Balance Inconsistencies',
            value={
                'data': [{
                    'transaction_id': 1,
                    'date': '2024-01-15',
                    'narration': 'ATM Withdrawal',
                    'debit': 5000.0,
                    'credit': 0.0,
                    'actual_balance': 45000.0,
                    'expected_balance': 50000.0,
                    'gap': -5000.0,
                    'reference': 'REF123456',
                    'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                    'previous_transaction': {
                        'id': 0,
                        'date': '2024-01-14',
                        'closing_balance': 50000.0,
                    },
                }],
                'total': 5,
                'limit': 100,
                'offset': 0,
            },
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['GET'])
def api_inconsistencies(request):
    """Detect balance discontinuities in transactions.

    For consecutive transactions (ordered by date ASC, id ASC):
    expected_closing = previous_closing + credit - debit

    If actual closing_balance != expected_closing, it's an inconsistency.
    """
    from bank_accounts.models import BankAccount

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
            .order_by('date', 'row_number')  # Oldest first, preserving extraction order
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
    examples=[
        OpenApiExample(
            'Bank Inconsistencies',
            value={
                'data': [{
                    'type': 'duplicate',
                    'transaction_ids': [1, 2],
                    'dismissed': False,
                    'date': '2024-01-15',
                    'narration': 'ATM Withdrawal',
                    'debit': 5000.0,
                    'credit': 0.0,
                    'balance': 45000.0,
                    'count': 2,
                    'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                    'transactions': [
                        {'id': 1, 'artifact_id': 'dsa_abc123'},
                        {'id': 2, 'artifact_id': 'dsa_def456'},
                    ],
                }],
                'total': 10,
                'counts': {'duplicate': 3, 'cross_account': 2, 'balance_gap': 5},
                'limit': 100,
                'offset': 0,
            },
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['GET'])
def bank_inconsistencies(request):
    """Detect duplicates, cross-account matches, and balance gaps in bank transactions."""
    from bank_accounts.models import BankAccount

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

    # Get all active transactions
    base_transactions = get_active_transactions()

    all_transactions = list(
        base_transactions
        .select_related('bank_account', 'data_source_artifact')
        .order_by('date', 'row_number')
    )

    # Create lookup by account
    transactions_by_account = {}
    for txn in all_transactions:
        if txn.bank_account_id not in transactions_by_account:
            transactions_by_account[txn.bank_account_id] = []
        transactions_by_account[txn.bank_account_id].append(txn)

    # Apply custom sorting to handle overlapping statements.
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

    # Deduplicate transactions that have identical fingerprints but were resolved
    # into separate resolved_transactions (both marked is_primary=True).
    # This can happen when overlapping sources aren't properly linked during resolution.
    # Only dedup across different artifacts — same-artifact duplicates with identical
    # fingerprints are legitimate (e.g., a payment and its reversal yielding the same balance).
    def dedup_account_transactions(txns):
        seen = {}  # fingerprint -> set of artifact_ids
        result = []
        for txn in txns:
            key = (txn.date, float(txn.debit_amount), float(txn.credit_amount), float(txn.closing_balance))
            artifacts = seen.get(key)
            if artifacts is None:
                seen[key] = {txn.data_source_artifact_id}
                result.append(txn)
            elif txn.data_source_artifact_id in artifacts:
                result.append(txn)
            # else: different artifact with same fingerprint — cross-source duplicate, skip
        return result

    # Dedup only affects balance gap detection below; the duplicate detection
    # section intentionally uses the original all_transactions list.
    for account_id in transactions_by_account:
        transactions_by_account[account_id] = dedup_account_transactions(
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
                            'artifact_id': t.data_source_artifact.artifact_id if t.data_source_artifact else None,
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
                            'artifact_id': t.data_source_artifact.artifact_id if t.data_source_artifact else None,
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
    examples=[
        OpenApiExample(
            'Dismiss Request',
            value={'type': 'duplicate', 'transaction_ids': [1, 2], 'reason': 'Known duplicate from overlapping statements'},
            request_only=True,
        ),
        OpenApiExample(
            'Dismiss Response',
            value={'success': True, 'id': 1, 'created': True},
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['POST'])
def dismiss_bank_inconsistency(request):
    """Dismiss a bank inconsistency."""
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
    examples=[
        OpenApiExample(
            'Restore Request',
            value={'type': 'duplicate', 'transaction_ids': [1, 2]},
            request_only=True,
        ),
        OpenApiExample(
            'Restore Response',
            value={'success': True, 'deleted': True},
            response_only=True,
        ),
    ],
    tags=['Dashboard'],
)
@api_view(['POST'])
def restore_bank_inconsistency(request):
    """Restore a dismissed bank inconsistency."""
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
    examples=[
        OpenApiExample(
            'CC Payment Suggestions',
            value={
                'data': [{
                    'bank_transaction': {
                        'id': 1,
                        'date': '2024-01-15',
                        'narration': 'HDFC CC Payment',
                        'amount': 25000.0,
                        'is_debit': True,
                        'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                    },
                    'suggestions': [{
                        'credit_card_transaction': {
                            'id': 10,
                            'date': '2024-01-15',
                            'description': 'Payment Received',
                            'amount': -25000.0,
                            'credit_card': {'id': 1, 'nickname': 'HDFC Credit Card'},
                        },
                        'offset': 0.0,
                        'confidence_score': 1.0,
                        'match_reasons': ['exact_amount', 'same_day'],
                    }],
                }],
                'total': 5,
            },
            response_only=True,
        ),
    ],
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_suggestions(request):
    """Get unmatched bank CC payments with match suggestions."""
    from datetime import timedelta
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions

    # Get unlinked bank transactions tagged as "Credit Card Payment"
    # No amount filter - show all tagged transactions so incorrectly tagged ones can be re-categorized
    from django.db.models import Q
    bank_txns = get_active_transactions().filter(
        category='Credit Card Payment',
    ).exclude(
        # Direct active CC match
        cc_payment_match__is_active=True
    ).exclude(
        # Exclude resolved transactions where ANY member has active CC match
        Q(resolved_transaction__isnull=False) &
        Q(resolved_transaction__bank_transactions__cc_payment_match__is_active=True)
    ).select_related('bank_account').distinct()

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
    unmatched_cc_payments = get_active_cc_transactions().filter(
        amount__lt=0
    ).exclude(
        bank_payment_match__is_active=True,
        bank_payment_match__bank_transaction__data_source_artifact__isnull=False
    ).exclude(
        # Exclude CC txns whose resolved group has any member with an active match
        Q(resolved_transaction__isnull=False) &
        Q(resolved_transaction__credit_card_transactions__bank_payment_match__is_active=True)
    ).select_related('credit_card').distinct()

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

    # Sort by date descending (latest first)
    data.sort(key=lambda x: x['bank_transaction']['date'], reverse=True)

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
    examples=[
        OpenApiExample(
            'CC Payment Suggestions (Reverse)',
            value={
                'data': [{
                    'credit_card_transaction': {
                        'id': 10,
                        'date': '2024-01-15',
                        'description': 'Payment Received',
                        'amount': -25000.0,
                        'credit_card': {'id': 1, 'nickname': 'HDFC Credit Card'},
                    },
                    'suggestions': [{
                        'bank_transaction': {
                            'id': 1,
                            'date': '2024-01-15',
                            'narration': 'HDFC CC Payment',
                            'amount': 25000.0,
                            'is_debit': True,
                            'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                        },
                        'offset': 0.0,
                        'confidence_score': 1.0,
                        'match_reasons': ['exact_amount', 'same_day'],
                    }],
                }],
                'total': 5,
            },
            response_only=True,
        ),
    ],
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_suggestions_reverse(request):
    """Get unmatched CC payments with match suggestions from bank transactions."""
    from datetime import timedelta
    from django.db.models import Q
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions

    # Get unlinked CC transactions tagged as "Credit Card Payment"
    # No amount filter - show all tagged transactions so incorrectly tagged ones can be re-categorized
    cc_payments = get_active_cc_transactions().filter(
        category='Credit Card Payment',
    ).exclude(
        bank_payment_match__is_active=True,
        bank_payment_match__bank_transaction__data_source_artifact__isnull=False
    ).exclude(
        # Exclude CC txns whose resolved group has any member with an active match
        Q(resolved_transaction__isnull=False) &
        Q(resolved_transaction__credit_card_transactions__bank_payment_match__is_active=True)
    ).select_related('credit_card').distinct()

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
    unmatched_bank_payments = get_active_transactions().filter(
        debit_amount__gt=0,
    ).exclude(
        cc_payment_match__is_active=True
    ).exclude(
        Q(resolved_transaction__isnull=False) &
        Q(resolved_transaction__bank_transactions__cc_payment_match__is_active=True)
    ).select_related('bank_account').distinct()

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

    # Sort by date descending (latest first)
    data.sort(key=lambda x: x['credit_card_transaction']['date'], reverse=True)

    return JsonResponse({
        'data': data,
        'total': len(data),
    })


@extend_schema(
    summary="Get CC suggestions for a specific bank transaction",
    description="Get credit card payment suggestions for a specific bank transaction.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_suggestions_for_bank_transaction(request, bank_txn_id):
    """Get CC payment suggestions for a specific bank transaction."""
    from datetime import timedelta
    from credit_cards.views import get_active_cc_transactions

    # Get the specific bank transaction
    try:
        bank_txn = get_active_transactions().select_related('bank_account').get(id=bank_txn_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Bank transaction not found'}, status=404)

    # Get unmatched CC payments (amount < 0 = payment) from active sources
    unmatched_cc_payments = get_active_cc_transactions().filter(
        amount__lt=0
    ).exclude(
        bank_payment_match__is_active=True,
        bank_payment_match__bank_transaction__data_source_artifact__isnull=False
    ).select_related('credit_card')

    # Find potential matches within 7 days before and after
    date_start = bank_txn.date - timedelta(days=7)
    date_end = bank_txn.date + timedelta(days=7)

    potential_matches = unmatched_cc_payments.filter(
        date__gte=date_start,
        date__lte=date_end,
    )

    suggestions = []
    target_amount = float(bank_txn.debit_amount) if bank_txn.debit_amount else 0
    offset_threshold = int(request.GET.get('offset_threshold', 100)) / 100.0  # Default 100% = no filter

    for cc_txn in potential_matches:
        score, reasons, offset = calculate_match_score(bank_txn, cc_txn)
        if score > 0 and (offset_threshold >= 1.0 or (target_amount > 0 and abs(offset) <= target_amount * offset_threshold)):
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
                'offset': float(offset),
                'confidence_score': score,
                'match_reasons': reasons,
            })

    # Sort by score descending, then by absolute offset ascending
    suggestions.sort(key=lambda x: (-x['confidence_score'], abs(x['offset']), x['offset']))

    return JsonResponse({'suggestions': suggestions})


@extend_schema(
    summary="Get bank suggestions for a specific CC transaction",
    description="Get bank payment suggestions for a specific credit card transaction.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_bank_suggestions_for_cc_transaction(request, cc_txn_id):
    """Get bank payment suggestions for a specific CC transaction."""
    from datetime import timedelta
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions

    # Get the specific CC transaction
    try:
        cc_txn = get_active_cc_transactions().select_related('credit_card').get(id=cc_txn_id)
    except CreditCardTransaction.DoesNotExist:
        return JsonResponse({'error': 'Credit card transaction not found'}, status=404)

    # Get unmatched bank transactions (debit > 0)
    unmatched_bank_payments = get_active_transactions().filter(
        debit_amount__gt=0,
    ).exclude(
        cc_payment_match__is_active=True
    ).select_related('bank_account')

    # Find potential matches within 7 days before and after
    date_start = cc_txn.date - timedelta(days=7)
    date_end = cc_txn.date + timedelta(days=7)

    potential_matches = unmatched_bank_payments.filter(
        date__gte=date_start,
        date__lte=date_end,
    )

    suggestions = []
    target_amount = abs(float(cc_txn.amount))
    offset_threshold = int(request.GET.get('offset_threshold', 100)) / 100.0  # Default 100% = no filter

    for bank_txn in potential_matches:
        score, reasons, offset = calculate_match_score(bank_txn, cc_txn)
        if score > 0 and (offset_threshold >= 1.0 or (target_amount > 0 and abs(offset) <= target_amount * offset_threshold)):
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
                'offset': float(offset),
                'confidence_score': score,
                'match_reasons': reasons,
            })

    # Sort by score descending, then by absolute offset ascending
    suggestions.sort(key=lambda x: (-x['confidence_score'], abs(x['offset']), x['offset']))

    return JsonResponse({'suggestions': suggestions})


from links.utils import ensure_resolved_transaction as _ensure_resolved_transaction


def _ensure_cc_payment_links_synced():
    """Ensure CreditCardPaymentLink exists for all active CreditCardPaymentMatch."""
    from links.models import CreditCardPaymentLink

    matches = CreditCardPaymentMatch.objects.filter(
        is_active=True,
    ).select_related('bank_transaction', 'credit_card_transaction')

    # Ensure resolved transactions exist for all matched transactions
    for m in matches:
        _ensure_resolved_transaction(m.bank_transaction, 'bank')
        _ensure_resolved_transaction(m.credit_card_transaction, 'credit_card')

    active_pairs = set(
        CreditCardPaymentLink.objects.filter(is_active=True)
        .values_list('bank_resolved_transaction_id', 'cc_resolved_transaction_id')
    )

    inactive_links = {
        (link.bank_resolved_transaction_id, link.cc_resolved_transaction_id): link
        for link in CreditCardPaymentLink.objects.filter(is_active=False)
    }

    to_create = []
    for m in matches:
        pair = (m.bank_transaction.resolved_transaction_id,
                m.credit_card_transaction.resolved_transaction_id)
        if pair not in active_pairs:
            if pair in inactive_links:
                # Reactivate existing inactive link
                link = inactive_links[pair]
                link.is_active = True
                link.offset = m.offset
                link.confidence_score = m.confidence_score
                link.match_reasons = m.match_reasons
                link.origin_bank_transaction_id = m.bank_transaction_id
                link.origin_cc_transaction_id = m.credit_card_transaction_id
                link.save()
            else:
                to_create.append(CreditCardPaymentLink(
                    bank_resolved_transaction_id=pair[0],
                    cc_resolved_transaction_id=pair[1],
                    offset=m.offset,
                    confidence_score=m.confidence_score,
                    match_reasons=m.match_reasons,
                    origin_bank_transaction_id=m.bank_transaction_id,
                    origin_cc_transaction_id=m.credit_card_transaction_id,
                ))
            active_pairs.add(pair)

    if to_create:
        CreditCardPaymentLink.objects.bulk_create(to_create, ignore_conflicts=True)


@extend_schema(
    methods=['GET'],
    summary="Get confirmed CC payment matches",
    description="Get confirmed credit card payment matches, filterable by year.",
    parameters=[
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'CC Payment Matches',
            value={
                'data': [{
                    'id': 1,
                    'bank_transaction': {
                        'id': 1,
                        'date': '2024-01-15',
                        'narration': 'HDFC CC Payment',
                        'amount': 25000.0,
                        'is_debit': True,
                        'bank_account': {'id': 1, 'nickname': 'HDFC Savings'},
                    },
                    'credit_card_transaction': {
                        'id': 10,
                        'date': '2024-01-15',
                        'description': 'Payment Received',
                        'amount': -25000.0,
                        'credit_card': {'id': 1, 'nickname': 'HDFC Credit Card'},
                    },
                    'offset': 0.0,
                    'confidence_score': 1.0,
                    'match_reasons': ['exact_amount', 'same_day'],
                    'created_at': '2024-01-16T10:30:00Z',
                }],
                'total': 10,
            },
            response_only=True,
        ),
    ],
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
        from credit_cards.views import get_active_cc_transactions
        from links.models import CreditCardPaymentLink

        # Get IDs of active transactions (bank and CC)
        active_bank_txn_ids = set(get_active_transactions().values_list('id', flat=True))
        active_cc_txn_ids = set(get_active_cc_transactions().values_list('id', flat=True))

        # Query durable links with DB-level filtering on active transaction IDs
        links = CreditCardPaymentLink.objects.filter(
            is_active=True,
            bank_resolved_transaction__isnull=False,
            cc_resolved_transaction__isnull=False,
            bank_resolved_transaction__primary_transaction_id__in=active_bank_txn_ids,
            cc_resolved_transaction__primary_transaction_id__in=active_cc_txn_ids,
        ).select_related(
            'bank_resolved_transaction',
            'cc_resolved_transaction',
        )

        year = request.GET.get('year')
        if year:
            links = links.filter(bank_resolved_transaction__date__year=int(year))

        # Evaluate queryset once to avoid double DB hit
        links = list(links)

        # Fetch primary transactions for serialization
        bank_txn_ids = {l.bank_resolved_transaction.primary_transaction_id for l in links}
        cc_txn_ids = {l.cc_resolved_transaction.primary_transaction_id for l in links}

        from credit_cards.models import CreditCardTransaction
        bank_txns = {t.id: t for t in BankTransaction.objects.filter(id__in=bank_txn_ids).select_related('bank_account')}
        cc_txns = {t.id: t for t in CreditCardTransaction.objects.filter(id__in=cc_txn_ids).select_related('credit_card')}

        data = []
        for link in links:
            bank_txn = bank_txns.get(link.bank_resolved_transaction.primary_transaction_id)
            cc_txn = cc_txns.get(link.cc_resolved_transaction.primary_transaction_id)
            if not bank_txn or not cc_txn:
                continue
            data.append({
                'id': link.id,
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
                'created_at': link.created_at.isoformat(),
            })

        # Sort by bank transaction date desc
        data.sort(key=lambda d: d['bank_transaction']['date'], reverse=True)

        return JsonResponse({
            'data': data,
            'total': len(data),
        })

    # POST - Create a match
    from credit_cards.models import CreditCardTransaction
    from credit_cards.views import get_active_cc_transactions

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    bank_txn_id = body.get('bank_transaction_id')
    cc_txn_id = body.get('credit_card_transaction_id')

    if not bank_txn_id or not cc_txn_id:
        return JsonResponse({'error': 'bank_transaction_id and credit_card_transaction_id are required'}, status=400)

    try:
        bank_txn = get_active_transactions().get(id=bank_txn_id)
    except BankTransaction.DoesNotExist:
        return JsonResponse({'error': 'Bank transaction not found or not active'}, status=404)

    try:
        cc_txn = CreditCardTransaction.objects.get(id=cc_txn_id)
    except CreditCardTransaction.DoesNotExist:
        return JsonResponse({'error': 'Credit card transaction not found'}, status=404)

    # Check if already matched
    if hasattr(bank_txn, 'cc_payment_match'):
        # Check if the existing match is to an inactive CC source
        active_cc_txn_ids = set(get_active_cc_transactions().values_list('id', flat=True))
        if bank_txn.cc_payment_match.credit_card_transaction_id in active_cc_txn_ids:
            return JsonResponse({'error': 'Bank transaction is already matched'}, status=400)
        # Delete the orphaned match so we can re-match
        bank_txn.cc_payment_match.delete()
    if hasattr(cc_txn, 'bank_payment_match'):
        # Check if the existing match is active AND points to an active bank transaction
        existing_match = cc_txn.bank_payment_match
        is_active_bank = existing_match.bank_transaction.data_source_artifact_id is not None
        if existing_match.is_active and is_active_bank:
            return JsonResponse({'error': 'Credit card transaction is already matched'}, status=400)
        # Delete the inactive/orphaned match so we can re-match
        existing_match.delete()

    from django.db import transaction as db_transaction

    with db_transaction.atomic():
        match = CreditCardPaymentMatch.objects.create(
            bank_transaction=bank_txn,
            credit_card_transaction=cc_txn,
            offset=body.get('offset', 0),
            confidence_score=body.get('confidence_score', 0),
            match_reasons=body.get('match_reasons', []),
        )

        # Ensure both transactions have ResolvedTransaction records
        _ensure_resolved_transaction(bank_txn, 'bank')
        _ensure_resolved_transaction(cc_txn, 'credit_card')

        # Sync any legacy matches that don't have links yet, then create link for this match
        _ensure_cc_payment_links_synced()

        from links.models import CreditCardPaymentLink
        existing_link = CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction_id=bank_txn.resolved_transaction_id,
            cc_resolved_transaction_id=cc_txn.resolved_transaction_id,
            is_active=True,
        ).first()
        if not existing_link:
            # Reactivate an inactive link if one exists, otherwise create
            inactive = CreditCardPaymentLink.objects.filter(
                bank_resolved_transaction_id=bank_txn.resolved_transaction_id,
                cc_resolved_transaction_id=cc_txn.resolved_transaction_id,
                is_active=False,
            ).first()
            if inactive:
                inactive.is_active = True
                inactive.offset = match.offset
                inactive.confidence_score = match.confidence_score
                inactive.match_reasons = match.match_reasons or []
                inactive.origin_bank_transaction_id = bank_txn.id
                inactive.origin_cc_transaction_id = cc_txn.id
                inactive.save()
            else:
                CreditCardPaymentLink.objects.create(
                    bank_resolved_transaction_id=bank_txn.resolved_transaction_id,
                    cc_resolved_transaction_id=cc_txn.resolved_transaction_id,
                    offset=match.offset,
                    confidence_score=match.confidence_score,
                    match_reasons=match.match_reasons or [],
                    origin_bank_transaction_id=bank_txn.id,
                    origin_cc_transaction_id=cc_txn.id,
                )

        # Tag both transactions as matched payments
        if cc_txn.category != 'Credit Card Payment':
            cc_txn.category = 'Credit Card Payment'
            cc_txn.save(update_fields=['category'])
        if bank_txn.category != 'Credit Card Payment':
            bank_txn.category = 'Credit Card Payment'
            bank_txn.save(update_fields=['category'])

        # Also create CategoryLink on resolved_transactions for durable category filtering
        from links.models import CategoryLink
        if bank_txn.resolved_transaction_id:
            CategoryLink.objects.update_or_create(
                resolved_transaction_id=bank_txn.resolved_transaction_id,
                defaults={
                    'category': 'Credit Card Payment',
                    'origin_transaction_type': 'bank',
                    'origin_transaction_id': bank_txn.id,
                },
            )
        if cc_txn.resolved_transaction_id:
            CategoryLink.objects.update_or_create(
                resolved_transaction_id=cc_txn.resolved_transaction_id,
                defaults={
                    'category': 'Credit Card Payment',
                    'origin_transaction_type': 'credit_card',
                    'origin_transaction_id': cc_txn.id,
                },
            )

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
    examples=[
        OpenApiExample(
            'Delete Success',
            value={'success': True},
            response_only=True,
        ),
    ],
    tags=['CC Payment Matching'],
)
@api_view(['DELETE'])
def api_cc_payment_match_delete(request, match_id):
    """Delete a credit card payment match."""
    try:
        match = CreditCardPaymentMatch.objects.get(id=match_id)
    except CreditCardPaymentMatch.DoesNotExist:
        from links.models import CreditCardPaymentLink
        link = CreditCardPaymentLink.objects.filter(id=match_id).first()
        if link:
            link.is_active = False
            link.save()
            return JsonResponse({'success': True})
        return JsonResponse({'error': 'Match not found'}, status=404)

    if match.bank_transaction_id and match.credit_card_transaction_id:
        bt = match.bank_transaction
        ct = match.credit_card_transaction
        if bt.resolved_transaction_id and ct.resolved_transaction_id:
            from links.models import CreditCardPaymentLink
            CreditCardPaymentLink.objects.filter(
                bank_resolved_transaction_id=bt.resolved_transaction_id,
                cc_resolved_transaction_id=ct.resolved_transaction_id,
            ).update(is_active=False)

    match.delete()
    return JsonResponse({'success': True})


@extend_schema(
    summary="Get CC payment match years",
    description="Get available years with match counts for filtering.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Match Years',
            value={'years': {'2024': 15, '2023': 12}},
            response_only=True,
        ),
    ],
    tags=['CC Payment Matching'],
)
@api_view(['GET'])
def api_cc_payment_match_years(request):
    """Get available years with match counts."""
    from django.db.models import Count
    from django.db.models.functions import ExtractYear
    from credit_cards.views import get_active_cc_transactions
    from links.models import CreditCardPaymentLink

    active_bank_txn_ids = set(get_active_transactions().values_list('id', flat=True))
    active_cc_txn_ids = set(get_active_cc_transactions().values_list('id', flat=True))

    year_counts = (
        CreditCardPaymentLink.objects.filter(
            is_active=True,
            bank_resolved_transaction__isnull=False,
            cc_resolved_transaction__isnull=False,
            bank_resolved_transaction__primary_transaction_id__in=active_bank_txn_ids,
            cc_resolved_transaction__primary_transaction_id__in=active_cc_txn_ids,
        )
        .annotate(year=ExtractYear('bank_resolved_transaction__date'))
        .values('year')
        .annotate(count=Count('id'))
        .order_by('-year')
    )

    years = {str(item['year']): item['count'] for item in year_counts}

    return JsonResponse({'years': years})


# ──────────────────────────────────────────────────────────
# Self Transfer Matching
# ──────────────────────────────────────────────────────────


def _serialize_bank_txn(txn):
    return {
        'id': txn.id,
        'date': txn.date.isoformat(),
        'narration': txn.narration,
        'amount': float(txn.debit_amount or txn.credit_amount),
        'is_debit': txn.debit_amount > 0,
        'bank_account': {
            'id': txn.bank_account.id,
            'nickname': txn.bank_account.nickname,
        } if txn.bank_account else None,
    }


@extend_schema(
    summary="Get self-transfer suggestions",
    description="Get unlinked bank transactions categorized as Self Transfer with potential matches.",
    parameters=[
        OpenApiParameter(name='bank_account', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by bank account ID'),
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Self Transfer Matching'],
)
@api_view(['GET'])
def api_self_transfer_suggestions(request):
    """Get unlinked Self Transfer transactions with potential matches."""
    from datetime import timedelta
    from django.db.models import Q

    bank_txns = get_active_transactions().filter(
        category='Self Transfer',
    ).exclude(
        linked_transaction__isnull=False,
    ).exclude(
        linked_from__isnull=False,
    ).exclude(
        Q(resolved_transaction__self_transfer_links_as_a__id__isnull=False) |
        Q(resolved_transaction__self_transfer_links_as_b__id__isnull=False)
    ).select_related('bank_account').distinct()

    bank_account_id = request.GET.get('bank_account')
    if bank_account_id:
        bank_txns = bank_txns.filter(bank_account_id=bank_account_id)

    year = request.GET.get('year')
    if year:
        bank_txns = bank_txns.filter(date__year=int(year))

    bank_txns = bank_txns.order_by('-date')

    all_active = get_active_transactions().select_related('bank_account')

    data = []
    for txn in bank_txns:
        date_start = txn.date - timedelta(days=7)
        date_end = txn.date + timedelta(days=7)

        potential = all_active.filter(
            date__gte=date_start,
            date__lte=date_end,
        ).exclude(
            bank_account=txn.bank_account,
        ).exclude(
            bank_account__isnull=True,
        ).exclude(
            id=txn.id,
        ).exclude(
            linked_transaction__isnull=False,
        ).exclude(
            linked_from__isnull=False,
        ).exclude(
            Q(resolved_transaction__self_transfer_links_as_a__id__isnull=False) |
            Q(resolved_transaction__self_transfer_links_as_b__id__isnull=False)
        ).distinct()

        if txn.debit_amount > 0:
            potential = potential.filter(credit_amount=txn.debit_amount)
        elif txn.credit_amount > 0:
            potential = potential.filter(debit_amount=txn.credit_amount)
        else:
            data.append({
                'bank_transaction': _serialize_bank_txn(txn),
                'suggestions': [],
            })
            continue

        matches = list(potential[:20])
        matches.sort(key=lambda t: abs((t.date - txn.date).days))

        suggestions = []
        for m in matches:
            suggestions.append({
                'id': m.id,
                'date': m.date.isoformat(),
                'narration': m.narration,
                'debit': float(m.debit_amount),
                'credit': float(m.credit_amount),
                'bank_account': {
                    'id': m.bank_account.id,
                    'nickname': m.bank_account.nickname,
                } if m.bank_account else None,
            })

        data.append({
            'bank_transaction': _serialize_bank_txn(txn),
            'suggestions': suggestions,
        })

    return JsonResponse({
        'data': data,
        'total': len(data),
    })


@extend_schema(
    methods=['GET'],
    summary="Get confirmed self-transfer links",
    description="Get confirmed self-transfer links, filterable by year.",
    parameters=[
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Self Transfer Matching'],
)
@extend_schema(
    methods=['POST'],
    summary="Create a self-transfer link",
    description="Link two bank transactions as a self-transfer.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Self Transfer Matching'],
)
@api_view(['GET', 'POST'])
def api_self_transfer_links(request):
    """Get or create self-transfer links."""
    from links.models import SelfTransferLink

    if request.method == 'GET':
        active_bank_txn_ids = set(get_active_transactions().values_list('id', flat=True))

        links = SelfTransferLink.objects.filter(
            resolved_transaction_a__isnull=False,
            resolved_transaction_b__isnull=False,
            resolved_transaction_a__primary_transaction_id__in=active_bank_txn_ids,
            resolved_transaction_b__primary_transaction_id__in=active_bank_txn_ids,
        ).select_related(
            'resolved_transaction_a',
            'resolved_transaction_b',
        )

        year = request.GET.get('year')
        if year:
            links = links.filter(resolved_transaction_a__date__year=int(year))

        links = list(links)

        txn_ids_a = {l.resolved_transaction_a.primary_transaction_id for l in links}
        txn_ids_b = {l.resolved_transaction_b.primary_transaction_id for l in links}
        all_txn_ids = txn_ids_a | txn_ids_b

        txns = {t.id: t for t in BankTransaction.objects.filter(id__in=all_txn_ids).select_related('bank_account')}

        data = []
        for link in links:
            txn_a = txns.get(link.resolved_transaction_a.primary_transaction_id)
            txn_b = txns.get(link.resolved_transaction_b.primary_transaction_id)
            if not txn_a or not txn_b:
                continue
            data.append({
                'id': link.id,
                'transaction_a': _serialize_bank_txn(txn_a),
                'transaction_b': _serialize_bank_txn(txn_b),
                'created_at': link.created_at.isoformat(),
            })

        data.sort(key=lambda d: d['transaction_a']['date'], reverse=True)

        return JsonResponse({
            'data': data,
            'total': len(data),
        })

    # POST - Create a self-transfer link
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    txn_id = body.get('transaction_id')
    link_to_id = body.get('link_to')

    if not txn_id or not link_to_id:
        return JsonResponse({'error': 'transaction_id and link_to are required'}, status=400)

    try:
        transaction = get_active_transactions().select_related('bank_account', 'linked_transaction').get(id=txn_id)
    except BankTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found or not active'}, status=404)

    try:
        link_to = get_active_transactions().select_related('bank_account', 'linked_transaction').get(id=link_to_id)
    except BankTransaction.DoesNotExist:
        return JsonResponse({'error': 'Target transaction not found or not active'}, status=404)

    if transaction.bank_account == link_to.bank_account:
        return JsonResponse({'error': 'Transactions must be from different bank accounts'}, status=400)

    if transaction.linked_transaction or (hasattr(transaction, 'linked_from') and transaction.linked_from):
        return JsonResponse({'error': 'Transaction is already linked'}, status=400)
    if link_to.linked_transaction or (hasattr(link_to, 'linked_from') and link_to.linked_from):
        return JsonResponse({'error': 'Target transaction is already linked'}, status=400)

    link = _create_self_transfer(transaction, link_to)

    return JsonResponse({
        'id': link.id if link else 0,
        'transaction_a': _serialize_bank_txn(transaction),
        'transaction_b': _serialize_bank_txn(link_to),
        'created_at': link.created_at.isoformat() if link else '',
    })


@extend_schema(
    summary="Delete a self-transfer link",
    description="Remove a confirmed self-transfer link.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Self Transfer Matching'],
)
@api_view(['DELETE'])
def api_self_transfer_link_delete(request, link_id):
    """Delete a self-transfer link."""
    from links.models import SelfTransferLink

    try:
        link = SelfTransferLink.objects.get(id=link_id)
    except SelfTransferLink.DoesNotExist:
        return JsonResponse({'error': 'Link not found'}, status=404)

    txn_a = None
    txn_b = None
    if link.origin_transaction_id_a:
        txn_a = BankTransaction.objects.select_related('bank_account', 'linked_transaction').filter(
            id=link.origin_transaction_id_a
        ).first()
    if link.origin_transaction_id_b:
        txn_b = BankTransaction.objects.select_related('bank_account', 'linked_transaction').filter(
            id=link.origin_transaction_id_b
        ).first()

    if txn_a and txn_b:
        if txn_a.linked_transaction_id == txn_b.id:
            txn_a.linked_transaction = None
            txn_a.save()
        elif txn_b.linked_transaction_id == txn_a.id:
            txn_b.linked_transaction = None
            txn_b.save()

        TransactionLog.objects.create(
            transaction=txn_a, action='UNLINK', old_value=str(txn_b.id),
        )
        TransactionLog.objects.create(
            transaction=txn_b, action='UNLINK', old_value=str(txn_a.id),
        )

    link.delete()
    return JsonResponse({'success': True})


@extend_schema(
    summary="Get self-transfer link years",
    description="Get available years with link counts for filtering.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Self Transfer Matching'],
)
@api_view(['GET'])
def api_self_transfer_link_years(request):
    """Get available years with self-transfer link counts."""
    from django.db.models import Count
    from django.db.models.functions import ExtractYear
    from links.models import SelfTransferLink

    active_bank_txn_ids = set(get_active_transactions().values_list('id', flat=True))

    year_counts = (
        SelfTransferLink.objects.filter(
            resolved_transaction_a__isnull=False,
            resolved_transaction_b__isnull=False,
            resolved_transaction_a__primary_transaction_id__in=active_bank_txn_ids,
            resolved_transaction_b__primary_transaction_id__in=active_bank_txn_ids,
        )
        .annotate(year=ExtractYear('resolved_transaction_a__date'))
        .values('year')
        .annotate(count=Count('id'))
        .order_by('-year')
    )

    years = {str(item['year']): item['count'] for item in year_counts}

    return JsonResponse({'years': years})


# ──────────────────────────────────────────────────────────
# Refund Matching
# ──────────────────────────────────────────────────────────


def _get_refund_amount(txn, txn_type):
    if txn_type == 'bank':
        return txn.credit_amount or txn.debit_amount
    return abs(txn.amount)


def _get_original_amount(txn, txn_type):
    if txn_type == 'bank':
        return txn.debit_amount or txn.credit_amount
    return abs(txn.amount)


def _is_before(candidate_txn, refund_date, refund_row_number):
    """Check that a candidate original charge happened before the refund."""
    if candidate_txn.date < refund_date:
        return True
    if candidate_txn.date == refund_date and candidate_txn.row_number < refund_row_number:
        return True
    return False


def calculate_refund_match_score(refund_amount, candidate_txn, candidate_type, refund_date):
    """
    Score a candidate original-charge transaction against a refund.

    Returns (score, reasons, offset) tuple.

    Criteria:
    1. Amount proximity — refund amount vs candidate amount
       - Exact match: +0.5
       - Within 5%: +0.3
       - Within 20%: +0.1
    2. Date proximity — original charge before the refund
       - Within 7 days: +0.5
       - Within 30 days: +0.3
       - Within 90 days: +0.1
    """
    from decimal import Decimal

    score = 0.0
    reasons = []

    candidate_amount = _get_original_amount(candidate_txn, candidate_type)
    offset = refund_amount - candidate_amount

    if offset == 0:
        score += 0.5
        reasons.append('exact_amount')
    elif candidate_amount > 0 and abs(offset) / candidate_amount <= Decimal('0.05'):
        score += 0.3
        reasons.append('amount_within_5%')
    elif candidate_amount > 0 and abs(offset) / candidate_amount <= Decimal('0.20'):
        score += 0.1
        reasons.append('amount_within_20%')

    days_diff = (refund_date - candidate_txn.date).days
    if 0 <= days_diff <= 7:
        score += 0.5
        reasons.append('within_7_days')
    elif 0 <= days_diff <= 30:
        score += 0.3
        reasons.append('within_30_days')
    elif 0 <= days_diff <= 90:
        score += 0.1
        reasons.append('within_90_days')

    return score, reasons, float(offset)


def _serialize_any_txn(txn, txn_type):
    """Unified serializer for bank or CC transactions."""
    if txn_type == 'bank':
        return {
            'id': txn.id,
            'type': 'bank',
            'date': txn.date.isoformat(),
            'description': txn.narration,
            'amount': float(txn.debit_amount or txn.credit_amount),
            'is_debit': txn.debit_amount > 0,
            'account': {
                'id': txn.bank_account.id,
                'nickname': txn.bank_account.nickname,
                'type': 'bank',
            } if txn.bank_account else None,
        }
    else:
        return {
            'id': txn.id,
            'type': 'credit_card',
            'date': txn.date.isoformat(),
            'description': txn.description,
            'amount': float(abs(txn.amount)),
            'is_debit': txn.amount > 0,
            'account': {
                'id': txn.credit_card.id,
                'nickname': txn.credit_card.nickname,
                'type': 'credit_card',
            } if txn.credit_card else None,
        }


def _get_txn_by_type(txn_id, txn_type):
    """Fetch a transaction by type, with account relation pre-loaded."""
    if txn_type == 'bank':
        return BankTransaction.objects.select_related('bank_account').filter(id=txn_id).first()
    else:
        return CreditCardTransaction.objects.select_related('credit_card').filter(id=txn_id).first()


@extend_schema(
    summary="Get refund suggestions",
    description="Get unlinked transactions categorized as Refund with potential original matches.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@api_view(['GET'])
def api_refund_suggestions(request):
    """Get unlinked Refund-tagged transactions with potential original matches."""
    from datetime import timedelta
    from django.db.models import Q
    from links.models import RefundLink

    already_linked_rt_ids = set(
        RefundLink.objects.filter(refund_resolved_transaction__isnull=False)
        .values_list('refund_resolved_transaction_id', flat=True)
    )

    # Bank transactions tagged as Refund
    bank_refunds = list(
        get_active_transactions()
        .filter(category='Refund')
        .exclude(resolved_transaction_id__in=already_linked_rt_ids)
        .select_related('bank_account')
        .order_by('-date')
    )
    # CC transactions tagged as Refund
    cc_refunds = list(
        get_active_cc_transactions()
        .filter(category='Refund')
        .exclude(resolved_transaction_id__in=already_linked_rt_ids)
        .select_related('credit_card')
        .order_by('-date')
    )

    all_bank = get_active_transactions().select_related('bank_account')
    all_cc = get_active_cc_transactions().select_related('credit_card')

    data = []

    def _find_suggestions(txn, txn_type):
        refund_amount = _get_refund_amount(txn, txn_type)
        date_start = txn.date - timedelta(days=180)

        suggestions = []
        bank_candidates = all_bank.filter(
            date__gte=date_start, date__lte=txn.date,
        ).exclude(category='Refund')
        if txn_type == 'bank':
            bank_candidates = bank_candidates.exclude(id=txn.id)
        for m in bank_candidates:
            if not _is_before(m, txn.date, txn.row_number):
                continue
            score, reasons, offset = calculate_refund_match_score(refund_amount, m, 'bank', txn.date)
            if score > 0:
                suggestions.append({
                    'transaction': _serialize_any_txn(m, 'bank'),
                    'offset': offset,
                    'confidence_score': score,
                    'match_reasons': reasons,
                })

        cc_candidates = all_cc.filter(
            date__gte=date_start, date__lte=txn.date,
        ).exclude(category='Refund')
        if txn_type == 'credit_card':
            cc_candidates = cc_candidates.exclude(id=txn.id)
        for m in cc_candidates:
            if not _is_before(m, txn.date, txn.row_number):
                continue
            score, reasons, offset = calculate_refund_match_score(refund_amount, m, 'credit_card', txn.date)
            if score > 0:
                suggestions.append({
                    'transaction': _serialize_any_txn(m, 'credit_card'),
                    'offset': offset,
                    'confidence_score': score,
                    'match_reasons': reasons,
                })

        suggestions.sort(key=lambda s: (-s['confidence_score'], abs(s['offset'])))
        return suggestions[:20]

    for txn in bank_refunds:
        data.append({
            'refund_transaction': _serialize_any_txn(txn, 'bank'),
            'suggestions': _find_suggestions(txn, 'bank'),
        })

    for txn in cc_refunds:
        data.append({
            'refund_transaction': _serialize_any_txn(txn, 'credit_card'),
            'suggestions': _find_suggestions(txn, 'credit_card'),
        })

    data.sort(key=lambda d: d['refund_transaction']['date'], reverse=True)

    return JsonResponse({
        'data': data,
        'total': len(data),
    })


@extend_schema(
    methods=['GET'],
    summary="Get confirmed refund links",
    description="Get confirmed refund links, filterable by year.",
    parameters=[
        OpenApiParameter(name='year', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Filter by year'),
    ],
    responses={200: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@extend_schema(
    methods=['POST'],
    summary="Create a refund link",
    description="Link a refund transaction to its original transaction.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@api_view(['GET', 'POST'])
def api_refund_links(request):
    """Get or create refund links."""
    from links.models import RefundLink, CategoryLink
    from links.utils import ensure_resolved_transaction

    if request.method == 'GET':
        active_bank_txn_ids = set(get_active_transactions().values_list('id', flat=True))
        active_cc_txn_ids = set(get_active_cc_transactions().values_list('id', flat=True))

        links = RefundLink.objects.filter(
            original_resolved_transaction__isnull=False,
            refund_resolved_transaction__isnull=False,
        ).select_related(
            'original_resolved_transaction',
            'refund_resolved_transaction',
        )

        year = request.GET.get('year')
        if year:
            links = links.filter(refund_resolved_transaction__date__year=int(year))

        links = list(links)

        # Collect all transaction IDs grouped by type
        bank_txn_ids = set()
        cc_txn_ids = set()
        for link in links:
            for rt in [link.original_resolved_transaction, link.refund_resolved_transaction]:
                if rt.transaction_type == 'bank':
                    bank_txn_ids.add(rt.primary_transaction_id)
                else:
                    cc_txn_ids.add(rt.primary_transaction_id)

        # Only include links where both sides have active transactions
        bank_txn_ids &= active_bank_txn_ids
        cc_txn_ids &= active_cc_txn_ids
        active_ids = {'bank': bank_txn_ids, 'credit_card': cc_txn_ids}

        bank_txns = {t.id: t for t in BankTransaction.objects.filter(id__in=bank_txn_ids).select_related('bank_account')}
        cc_txns = {t.id: t for t in CreditCardTransaction.objects.filter(id__in=cc_txn_ids).select_related('credit_card')}
        txn_map = {'bank': bank_txns, 'credit_card': cc_txns}

        data = []
        for link in links:
            orig_rt = link.original_resolved_transaction
            ref_rt = link.refund_resolved_transaction
            if orig_rt.primary_transaction_id not in active_ids.get(orig_rt.transaction_type, set()):
                continue
            if ref_rt.primary_transaction_id not in active_ids.get(ref_rt.transaction_type, set()):
                continue

            orig_txn = txn_map.get(orig_rt.transaction_type, {}).get(orig_rt.primary_transaction_id)
            ref_txn = txn_map.get(ref_rt.transaction_type, {}).get(ref_rt.primary_transaction_id)
            if not orig_txn or not ref_txn:
                continue

            data.append({
                'id': link.id,
                'original_transaction': _serialize_any_txn(orig_txn, orig_rt.transaction_type),
                'refund_transaction': _serialize_any_txn(ref_txn, ref_rt.transaction_type),
                'offset': float(link.offset),
                'created_at': link.created_at.isoformat(),
            })

        data.sort(key=lambda d: d['refund_transaction']['date'], reverse=True)

        return JsonResponse({
            'data': data,
            'total': len(data),
        })

    # POST — create a refund link
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    refund_id = body.get('refund_transaction_id')
    refund_type = body.get('refund_type')
    original_id = body.get('original_transaction_id')
    original_type = body.get('original_type')

    if not all([refund_id, refund_type, original_id, original_type]):
        return JsonResponse({'error': 'refund_transaction_id, refund_type, original_transaction_id, original_type are required'}, status=400)

    if refund_type not in ('bank', 'credit_card') or original_type not in ('bank', 'credit_card'):
        return JsonResponse({'error': 'Type must be bank or credit_card'}, status=400)

    refund_txn = _get_txn_by_type(refund_id, refund_type)
    original_txn = _get_txn_by_type(original_id, original_type)
    if not refund_txn:
        return JsonResponse({'error': 'Refund transaction not found'}, status=404)
    if not original_txn:
        return JsonResponse({'error': 'Original transaction not found'}, status=404)

    refund_rt_id = ensure_resolved_transaction(refund_txn, refund_type)
    original_rt_id = ensure_resolved_transaction(original_txn, original_type)

    if RefundLink.objects.filter(refund_resolved_transaction_id=refund_rt_id).exists():
        return JsonResponse({'error': 'Refund transaction is already linked'}, status=400)

    if refund_type == 'bank':
        refund_amount = refund_txn.credit_amount or refund_txn.debit_amount
    else:
        refund_amount = abs(refund_txn.amount)
    if original_type == 'bank':
        original_amount = original_txn.debit_amount or original_txn.credit_amount
    else:
        original_amount = abs(original_txn.amount)
    offset_value = refund_amount - original_amount

    from django.db import transaction as db_transaction
    with db_transaction.atomic():
        link = RefundLink.objects.create(
            original_resolved_transaction_id=original_rt_id,
            refund_resolved_transaction_id=refund_rt_id,
            origin_original_type=original_type,
            origin_refund_type=refund_type,
            origin_original_transaction_id=original_id,
            origin_refund_transaction_id=refund_id,
            offset=offset_value,
        )

        CategoryLink.objects.get_or_create(
            resolved_transaction_id=refund_rt_id,
            category='Refund',
            defaults={
                'origin_transaction_type': refund_type,
                'origin_transaction_id': refund_id,
            },
        )

        if refund_type == 'bank':
            TransactionLog.objects.create(
                transaction_id=refund_id, action='LINK', new_value=f'refund_of:{original_type}:{original_id}',
            )
        if original_type == 'bank':
            TransactionLog.objects.create(
                transaction_id=original_id, action='LINK', new_value=f'refunded_by:{refund_type}:{refund_id}',
            )

    return JsonResponse({
        'id': link.id,
        'original_transaction': _serialize_any_txn(original_txn, original_type),
        'refund_transaction': _serialize_any_txn(refund_txn, refund_type),
        'offset': float(link.offset),
        'created_at': link.created_at.isoformat(),
    })


@extend_schema(
    summary="Delete a refund link",
    description="Remove a confirmed refund link.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@api_view(['DELETE'])
def api_refund_link_delete(request, link_id):
    """Delete a refund link."""
    from links.models import RefundLink, CategoryLink

    try:
        link = RefundLink.objects.get(id=link_id)
    except RefundLink.DoesNotExist:
        return JsonResponse({'error': 'Link not found'}, status=404)

    if link.origin_refund_type == 'bank' and link.origin_refund_transaction_id:
        TransactionLog.objects.create(
            transaction_id=link.origin_refund_transaction_id, action='UNLINK',
            old_value=f'refund_of:{link.origin_original_type}:{link.origin_original_transaction_id}',
        )
    if link.origin_original_type == 'bank' and link.origin_original_transaction_id:
        TransactionLog.objects.create(
            transaction_id=link.origin_original_transaction_id, action='UNLINK',
            old_value=f'refunded_by:{link.origin_refund_type}:{link.origin_refund_transaction_id}',
        )

    if link.refund_resolved_transaction_id:
        CategoryLink.objects.filter(
            resolved_transaction_id=link.refund_resolved_transaction_id,
            category='Refund',
        ).delete()

    link.delete()
    return JsonResponse({'success': True})


@extend_schema(
    summary="Get refund link years",
    description="Get available years with refund link counts for filtering.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@api_view(['GET'])
def api_refund_link_years(request):
    """Get available years with refund link counts."""
    from django.db.models import Count
    from django.db.models.functions import ExtractYear
    from links.models import RefundLink

    year_counts = (
        RefundLink.objects.filter(
            original_resolved_transaction__isnull=False,
            refund_resolved_transaction__isnull=False,
        )
        .annotate(year=ExtractYear('refund_resolved_transaction__date'))
        .values('year')
        .annotate(count=Count('id'))
        .order_by('-year')
    )

    years = {str(item['year']): item['count'] for item in year_counts}

    return JsonResponse({'years': years})


@extend_schema(
    summary="Get refund suggestions for a specific transaction",
    description="Get potential original-charge matches for a transaction tagged as Refund.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Refund Matching'],
)
@api_view(['GET'])
def api_refund_suggestions_for_transaction(request, txn_type, txn_id):
    """Get refund suggestions for a specific transaction."""
    if txn_type not in ('bank', 'credit_card'):
        return JsonResponse({'error': 'txn_type must be bank or credit_card'}, status=400)

    from datetime import timedelta

    txn = _get_txn_by_type(txn_id, txn_type)
    if not txn:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    refund_amount = _get_refund_amount(txn, txn_type)
    date_start = txn.date - timedelta(days=180)

    all_bank = get_active_transactions().select_related('bank_account')
    all_cc = get_active_cc_transactions().select_related('credit_card')

    suggestions = []

    bank_candidates = all_bank.filter(
        date__gte=date_start, date__lte=txn.date,
    ).exclude(category='Refund')
    if txn_type == 'bank':
        bank_candidates = bank_candidates.exclude(id=txn_id)
    for m in bank_candidates:
        if not _is_before(m, txn.date, txn.row_number):
            continue
        score, reasons, offset = calculate_refund_match_score(refund_amount, m, 'bank', txn.date)
        if score > 0:
            suggestions.append({
                'transaction': _serialize_any_txn(m, 'bank'),
                'offset': offset,
                'confidence_score': score,
                'match_reasons': reasons,
            })

    cc_candidates = all_cc.filter(
        date__gte=date_start, date__lte=txn.date,
    ).exclude(category='Refund')
    if txn_type == 'credit_card':
        cc_candidates = cc_candidates.exclude(id=txn_id)
    for m in cc_candidates:
        if not _is_before(m, txn.date, txn.row_number):
            continue
        score, reasons, offset = calculate_refund_match_score(refund_amount, m, 'credit_card', txn.date)
        if score > 0:
            suggestions.append({
                'transaction': _serialize_any_txn(m, 'credit_card'),
                'offset': offset,
                'confidence_score': score,
                'match_reasons': reasons,
            })

    suggestions.sort(key=lambda s: (-s['confidence_score'], abs(s['offset'])))

    return JsonResponse({'suggestions': suggestions[:20]})
