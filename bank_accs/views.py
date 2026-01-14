import json
import os
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.db.models import Min, Max
from .models import BankAccount

# Supported file extensions
PARSED_EXTENSIONS = ['.txt', '.xlsx', '.xls']  # Supported formats
PENDING_EXTENSIONS = ['.csv']  # Waiting to be parsed


def get_source_files_with_stats():
    """Get list of bank statement files with transaction date ranges."""
    from dashboard.models import Transaction

    data_dir = os.path.join(settings.BASE_DIR, 'bank_accs', 'data')
    if not os.path.exists(data_dir):
        return []

    # Get all accounts to map source files to accounts
    accounts = {acc.source_file: acc for acc in BankAccount.objects.all()}

    files = []
    for f in os.listdir(data_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in PARSED_EXTENSIONS:
            file_info = {'filename': f, 'status': 'parsed'}

            # Get date range from transactions linked to this file's account
            account = accounts.get(f)
            if account:
                date_range = Transaction.objects.filter(
                    bank_account=account
                ).aggregate(
                    first_date=Min('date'),
                    last_date=Max('date')
                )
                file_info['first_transaction_date'] = date_range['first_date'].isoformat() if date_range['first_date'] else None
                file_info['last_transaction_date'] = date_range['last_date'].isoformat() if date_range['last_date'] else None
                file_info['transaction_count'] = Transaction.objects.filter(bank_account=account).count()
            else:
                file_info['first_transaction_date'] = None
                file_info['last_transaction_date'] = None
                file_info['transaction_count'] = 0

            files.append(file_info)
        elif ext in PENDING_EXTENSIONS:
            files.append({
                'filename': f,
                'status': 'pending',
                'first_transaction_date': None,
                'last_transaction_date': None,
                'transaction_count': 0
            })

    return files


def get_account_stats(account):
    """Get transaction stats for a bank account."""
    from dashboard.models import Transaction

    transactions = Transaction.objects.filter(bank_account=account)

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

    return {
        'current_balance': float(latest.closing_balance) if latest else None,
        'last_transaction_date': latest.date.isoformat() if latest else None,
        'starting_balance': float(earliest.closing_balance) if earliest else None,
        'first_transaction_date': earliest.date.isoformat() if earliest else None,
        'transaction_count': transactions.count()
    }


@csrf_exempt
@require_http_methods(["GET", "POST"])
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
                'source_file': account.source_file,
                'created_at': account.created_at.isoformat() if account.created_at else None,
                'updated_at': account.updated_at.isoformat() if account.updated_at else None,
            }
            # Add transaction stats
            acc_dict.update(get_account_stats(account))
            accounts_data.append(acc_dict)

        source_files = get_source_files_with_stats()
        return JsonResponse({
            'accounts': accounts_data,
            'source_files': source_files
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
                source_file=data.get('source_file', ''),
            )
            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'source_file': account.source_file,
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
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
            'source_file': account.source_file,
        })

    elif request.method == "PUT":
        try:
            data = json.loads(request.body)
            account.nickname = data.get('nickname', account.nickname)
            account.bank_name = data.get('bank_name', account.bank_name)
            account.account_number = data.get('account_number', account.account_number)
            account.ifsc_code = data.get('ifsc_code', account.ifsc_code)
            account.branch = data.get('branch', account.branch)
            account.source_file = data.get('source_file', account.source_file)
            account.save()
            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'source_file': account.source_file,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

    elif request.method == "DELETE":
        account.delete()
        return JsonResponse({'success': True})
