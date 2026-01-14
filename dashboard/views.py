from django.db.models import Sum
from django.db.models.functions import TruncMonth
from django.http import JsonResponse

from .models import Transaction


def api_summary(request):
    transactions = Transaction.objects.all()

    total_credits = transactions.aggregate(total=Sum('credit_amount'))['total'] or 0
    total_debits = transactions.aggregate(total=Sum('debit_amount'))['total'] or 0
    net_flow = total_credits - total_debits

    latest_balance = transactions.first()
    current_balance = float(latest_balance.closing_balance) if latest_balance else 0

    return JsonResponse({
        'total_credits': float(total_credits),
        'total_debits': float(total_debits),
        'net_flow': float(net_flow),
        'current_balance': current_balance,
        'transaction_count': transactions.count(),
    })


def api_monthly(request):
    transactions = Transaction.objects.all()

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
    category_data = (
        Transaction.objects
        .filter(debit_amount__gt=0)
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

    top_expenses = (
        Transaction.objects
        .filter(debit_amount__gt=0)
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
