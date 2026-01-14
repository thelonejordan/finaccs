import json
import os
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from .models import BankAccount

# Supported file extensions
PARSED_EXTENSIONS = ['.txt']  # Already parsed/supported formats
PENDING_EXTENSIONS = ['.xlsx', '.xls', '.csv']  # Waiting to be parsed


def get_source_files():
    """Get list of bank statement files from the data directory with their status."""
    data_dir = os.path.join(settings.BASE_DIR, 'bank_accs', 'data')
    if not os.path.exists(data_dir):
        return []

    files = []
    for f in os.listdir(data_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in PARSED_EXTENSIONS:
            files.append({'filename': f, 'status': 'parsed'})
        elif ext in PENDING_EXTENSIONS:
            files.append({'filename': f, 'status': 'pending'})

    return files


@csrf_exempt
@require_http_methods(["GET", "POST"])
def account_list(request):
    if request.method == "GET":
        accounts = list(BankAccount.objects.values(
            'id', 'nickname', 'bank_name', 'account_number',
            'ifsc_code', 'branch', 'source_file', 'created_at', 'updated_at'
        ))
        source_files = get_source_files()
        return JsonResponse({
            'accounts': accounts,
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
