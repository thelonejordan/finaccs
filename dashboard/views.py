import json

from django.db.models import Sum, Max, Subquery, OuterRef
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt

from .models import Transaction

# Categories to exclude from income/expense calculations (internal transfers)
EXCLUDED_CATEGORIES = ['Self Transfer']


def api_summary(request):
    all_transactions = Transaction.objects.all()

    # Exclude self transfers from income/expense totals
    transactions = all_transactions.exclude(category__in=EXCLUDED_CATEGORIES)

    total_credits = transactions.aggregate(total=Sum('credit_amount'))['total'] or 0
    total_debits = transactions.aggregate(total=Sum('debit_amount'))['total'] or 0
    net_flow = total_credits - total_debits

    # Calculate total balance as sum of latest closing balance from each account
    # Get the latest transaction for each bank_account
    from bank_accs.models import BankAccount

    total_balance = 0
    accounts = BankAccount.objects.all()

    if accounts.exists():
        for account in accounts:
            # Get latest transaction for this account's source file
            latest_txn = all_transactions.filter(
                bank_account=account
            ).first()
            if latest_txn:
                total_balance += float(latest_txn.closing_balance)
    else:
        # Fallback: if no accounts, use latest transaction balance
        latest_balance = all_transactions.first()
        total_balance = float(latest_balance.closing_balance) if latest_balance else 0

    return JsonResponse({
        'total_credits': float(total_credits),
        'total_debits': float(total_debits),
        'net_flow': float(net_flow),
        'current_balance': total_balance,
        'transaction_count': all_transactions.count(),
    })


def api_monthly(request):
    # Exclude self transfers from monthly breakdown
    transactions = Transaction.objects.exclude(category__in=EXCLUDED_CATEGORIES)

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


def api_categories(request):
    # Check if we should include all categories (for filtering purposes)
    include_all = request.GET.get('include_all', 'false').lower() == 'true'

    queryset = Transaction.objects.filter(debit_amount__gt=0)

    # Exclude self transfers from category breakdown unless include_all is set
    if not include_all:
        queryset = queryset.exclude(category__in=EXCLUDED_CATEGORIES)

    category_data = (
        queryset
        .values('category')
        .annotate(total=Sum('debit_amount'))
        .order_by('-total')
    )

    data = []
    for item in category_data:
        data.append({
            'category': item['category'] or 'Other',
            'amount': float(item['total'] or 0),
        })

    return JsonResponse({'data': data})


def api_transactions(request):
    transactions = Transaction.objects.select_related(
        'bank_account',
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


def api_top_expenses(request):
    limit = int(request.GET.get('limit', 10))

    # Exclude self transfers from top expenses
    top_expenses = (
        Transaction.objects
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


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
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
        transaction.category = data['category']
        transaction.save()

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
    potential_matches = Transaction.objects.filter(
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


@csrf_exempt
@require_http_methods(["POST", "DELETE"])
def api_link_transaction(request, transaction_id):
    """Link or unlink self-transfer transactions."""
    try:
        transaction = Transaction.objects.select_related('bank_account', 'linked_transaction').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)

    if request.method == 'DELETE':
        # Unlink the transaction
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
    transaction.category = 'Self Transfer'
    link_to.category = 'Self Transfer'
    transaction.save()
    link_to.save()

    return JsonResponse({
        'id': transaction.id,
        'linked_transaction': {
            'id': link_to.id,
            'date': link_to.date.isoformat(),
            'bank_account': link_to.bank_account.nickname if link_to.bank_account else None,
            'amount': float(link_to.debit_amount or link_to.credit_amount),
        },
    })
