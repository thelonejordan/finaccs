import json
from django.http import JsonResponse
from rest_framework.decorators import api_view

# Conditional import for API docs (dev only)
try:
    from drf_spectacular.utils import extend_schema, OpenApiExample
    from drf_spectacular.types import OpenApiTypes
except ImportError:
    # No-op decorator and mocks when drf-spectacular is not installed
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

from .models import BankAccount, AccountLog


def get_account_stats(account):
    """Get transaction stats for a bank account."""
    from dashboard.views import get_active_transactions

    transactions = get_active_transactions().filter(bank_account=account)

    if not transactions.exists():
        return {
            'current_balance': None,
            'last_transaction_date': None,
            'starting_balance': None,
            'first_transaction_date': None,
            'transaction_count': 0
        }

    # Latest transaction (first due to ordering by -date, -id)
    latest = transactions.first()
    # Earliest transaction (last in the queryset)
    earliest = transactions.order_by('date', 'id').first()

    # Calculate starting balance by reversing the first transaction
    # closing_balance = opening_balance + credit - debit
    # So: opening_balance = closing_balance - credit + debit
    starting_balance = None
    if earliest:
        starting_balance = float(earliest.closing_balance) - float(earliest.credit_amount) + float(earliest.debit_amount)

    return {
        'current_balance': float(latest.closing_balance) if latest else None,
        'last_transaction_date': latest.date.isoformat() if latest else None,
        'starting_balance': starting_balance,
        'first_transaction_date': earliest.date.isoformat() if earliest else None,
        'transaction_count': transactions.count()
    }


@extend_schema(
    methods=['GET'],
    operation_id='accounts_list',
    summary="List bank accounts",
    description="Get all bank accounts with their transaction statistics.",
    responses={200: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Bank Accounts List',
            value={
                'accounts': [{
                    'id': 1,
                    'nickname': 'HDFC Savings',
                    'bank_name': 'HDFC Bank',
                    'account_number': '1234567890',
                    'ifsc_code': 'HDFC0001234',
                    'branch': 'Main Branch',
                    'created_at': '2024-01-15T10:30:00Z',
                    'updated_at': '2024-01-15T10:30:00Z',
                    'current_balance': 125000.0,
                    'last_transaction_date': '2024-01-20',
                    'starting_balance': 50000.0,
                    'first_transaction_date': '2023-06-01',
                    'transaction_count': 250,
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['POST'],
    summary="Create bank account",
    description="Create a new bank account.",
    request=OpenApiTypes.OBJECT,
    responses={201: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
    examples=[
        OpenApiExample(
            'Create account',
            value={
                'nickname': 'My Savings',
                'bank_name': 'HDFC Bank',
                'account_number': '1234567890',
                'ifsc_code': 'HDFC0001234',
                'branch': 'Main Branch',
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def account_list(request):
    if request.method == "GET":
        accounts_data = []
        for account in BankAccount.objects.all():
            acc_dict = {
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'created_at': account.created_at.isoformat() if account.created_at else None,
                'updated_at': account.updated_at.isoformat() if account.updated_at else None,
            }
            # Add transaction stats
            acc_dict.update(get_account_stats(account))
            accounts_data.append(acc_dict)

        return JsonResponse({
            'accounts': accounts_data,
        })

    elif request.method == "POST":
        try:
            data = json.loads(request.body)
            account = BankAccount.objects.create(
                nickname=data.get('nickname', ''),
                bank_name=data.get('bank_name', ''),
                account_number=data.get('account_number', ''),
                ifsc_code=data.get('ifsc_code', ''),
                branch=data.get('branch', ''),
            )

            # Log account creation
            AccountLog.objects.create(
                bank_account=account,
                action='CREATE',
                new_value=account.nickname,
            )

            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='accounts_detail',
    summary="Get bank account",
    description="Get details of a specific bank account.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Bank Account Detail',
            value={
                'id': 1,
                'nickname': 'HDFC Savings',
                'bank_name': 'HDFC Bank',
                'account_number': '1234567890',
                'ifsc_code': 'HDFC0001234',
                'branch': 'Main Branch',
                'current_balance': 125000.0,
                'last_transaction_date': '2024-01-20',
                'starting_balance': 50000.0,
                'first_transaction_date': '2023-06-01',
                'transaction_count': 250,
            },
            response_only=True,
        ),
    ],
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update bank account",
    description="Update bank account details.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Update Bank Account',
            value={'nickname': 'Updated Name', 'branch': 'New Branch'},
            request_only=True,
        ),
    ],
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete bank account",
    description="Delete a bank account.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    examples=[
        OpenApiExample(
            'Delete Success',
            value={'success': True},
            response_only=True,
        ),
    ],
    tags=['Bank Accounts'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def account_detail(request, account_id):
    try:
        account = BankAccount.objects.get(id=account_id)
    except BankAccount.DoesNotExist:
        return JsonResponse({'error': 'Account not found'}, status=404)

    if request.method == "GET":
        return JsonResponse({
            'id': account.id,
            'nickname': account.nickname,
            'bank_name': account.bank_name,
            'account_number': account.account_number,
            'ifsc_code': account.ifsc_code,
            'branch': account.branch,
        })

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            old_nickname = account.nickname
            account.nickname = data.get('nickname', account.nickname)
            account.bank_name = data.get('bank_name', account.bank_name)
            account.account_number = data.get('account_number', account.account_number)
            account.ifsc_code = data.get('ifsc_code', account.ifsc_code)
            account.branch = data.get('branch', account.branch)
            account.save()

            # Log account update if nickname changed
            if old_nickname != account.nickname:
                AccountLog.objects.create(
                    bank_account=account,
                    action='UPDATE',
                    old_value=old_nickname,
                    new_value=account.nickname,
                )

            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        # Log account deletion before deleting
        AccountLog.objects.create(
            bank_account=None,  # Will be null after deletion
            action='DELETE',
            old_value=account.nickname,
        )
        account.delete()
        return JsonResponse({'success': True})
