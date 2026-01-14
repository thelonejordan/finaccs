from django.db.models import Sum, Max, Subquery, OuterRef
from django.db.models.functions import TruncMonth
from django.http import JsonResponse

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
    transactions = Transaction.objects.all()

    category = request.GET.get('category')
    if category:
        transactions = transactions.filter(category=category)

    transaction_type = request.GET.get('type')
    if transaction_type == 'credit':
        transactions = transactions.filter(credit_amount__gt=0)
    elif transaction_type == 'debit':
        transactions = transactions.filter(debit_amount__gt=0)

    limit = int(request.GET.get('limit', 100))
    offset = int(request.GET.get('offset', 0))

    total = transactions.count()
    transactions = transactions[offset:offset + limit]

    data = []
    for t in transactions:
        data.append({
            'id': t.id,
            'date': t.date.isoformat(),
            'narration': t.narration,
            'debit': float(t.debit_amount),
            'credit': float(t.credit_amount),
            'balance': float(t.closing_balance),
            'category': t.category,
            'reference': t.reference_number,
        })

    return JsonResponse({
        'data': data,
        'total': total,
        'limit': limit,
        'offset': offset,
    })


def api_top_expenses(request):
    limit = int(request.GET.get('limit', 10))

    # Exclude self transfers from top expenses
    top_expenses = (
        Transaction.objects
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
        })

    return JsonResponse({'data': data})
