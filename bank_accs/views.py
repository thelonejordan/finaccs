import json
import os
from django.http import JsonResponse
from django.conf import settings
from django.db.models import Min, Max
from rest_framework.decorators import api_view

from project.cache_utils import invalidate_all_inconsistencies

# Conditional import for API docs (dev only)
try:
    from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
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

    OpenApiParameter = _MockCallable
    OpenApiExample = _MockCallable
    OpenApiTypes = type('OpenApiTypes', (), {'OBJECT': object, 'INT': int, 'STR': str, 'BOOL': bool})()

from .models import BankAccount, SourceFile, ExtractionPipeline, ExtractedCSV
from dashboard.models import AccountLog, Transaction

# Supported file extensions
PARSED_EXTENSIONS = ['.txt', '.xlsx', '.xls', '.pdf']  # Supported formats
PENDING_EXTENSIONS = ['.csv']  # Waiting to be parsed


def sync_source_files():
    """Sync SourceFile model with actual files in data directory."""
    data_dir = os.path.join(settings.BASE_DIR, 'bank_accs', 'data')
    if not os.path.exists(data_dir):
        return

    # Get all files in data directory
    for f in os.listdir(data_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in PARSED_EXTENSIONS or ext in PENDING_EXTENSIONS:
            # Create SourceFile if it doesn't exist
            SourceFile.objects.get_or_create(filename=f)


def get_source_files_with_stats():
    """Get list of bank statement files with transaction date ranges."""
    from dashboard.models import Transaction

    # Sync files from disk to database
    sync_source_files()

    files = []
    for sf in SourceFile.objects.select_related('bank_account').all():
        ext = os.path.splitext(sf.filename)[1].lower()

        if ext in PARSED_EXTENSIONS:
            file_info = {
                'id': sf.id,
                'filename': sf.filename,
                'status': 'parsed',
                'bank_account_id': sf.bank_account.id if sf.bank_account else None,
                'disabled': sf.disabled,
            }

            # Get date range from transactions linked to this source file
            date_range = Transaction.objects.filter(
                source_file=sf
            ).aggregate(
                first_date=Min('date'),
                last_date=Max('date')
            )
            file_info['first_transaction_date'] = date_range['first_date'].isoformat() if date_range['first_date'] else None
            file_info['last_transaction_date'] = date_range['last_date'].isoformat() if date_range['last_date'] else None
            file_info['transaction_count'] = Transaction.objects.filter(source_file=sf).count()

            files.append(file_info)
        elif ext in PENDING_EXTENSIONS:
            files.append({
                'id': sf.id,
                'filename': sf.filename,
                'status': 'pending',
                'bank_account_id': sf.bank_account.id if sf.bank_account else None,
                'disabled': sf.disabled,
                'first_transaction_date': None,
                'last_transaction_date': None,
                'transaction_count': 0
            })

    # Sort by first_transaction_date descending (newest first, files without transactions go to the end)
    files.sort(key=lambda f: (f['first_transaction_date'] is not None, f['first_transaction_date'] or ''), reverse=True)

    return files


def get_extracted_csvs_with_stats():
    """Get list of extracted CSVs with transaction stats."""
    from dashboard.models import Transaction

    # Sync source files from disk first (to detect new extractions)
    sync_source_files()

    csvs = []
    # Query ExtractedCSVs with status in extracted, loading, loaded, error
    for csv in ExtractedCSV.objects.filter(
        status__in=['extracted', 'loading', 'loaded', 'error']
    ).select_related('source_file', 'bank_account').order_by('-extracted_at'):
        csv_info = {
            'id': csv.id,
            'name': csv.name,
            'source_filename': csv.source_file.filename,
            'source_file_id': csv.source_file.id,
            'status': csv.status,
            'bank_account_id': csv.bank_account.id if csv.bank_account else None,
            'disabled': csv.disabled,
            'row_count': csv.row_count,
            'extracted_at': csv.extracted_at.isoformat() if csv.extracted_at else None,
            'loaded_at': csv.loaded_at.isoformat() if csv.loaded_at else None,
            'error_message': csv.error_message or '',
            'first_transaction_date': None,
            'last_transaction_date': None,
            'transaction_count': 0,
        }

        # Get transaction stats if loaded
        if csv.status == 'loaded':
            date_range = Transaction.objects.filter(
                extracted_csv=csv
            ).aggregate(
                first_date=Min('date'),
                last_date=Max('date')
            )
            csv_info['first_transaction_date'] = date_range['first_date'].isoformat() if date_range['first_date'] else None
            csv_info['last_transaction_date'] = date_range['last_date'].isoformat() if date_range['last_date'] else None
            csv_info['transaction_count'] = Transaction.objects.filter(extracted_csv=csv).count()

        csvs.append(csv_info)

    return csvs


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
    description="Get all bank accounts with their transaction statistics and linked source files.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['POST'],
    summary="Create bank account",
    description="Create a new bank account and optionally link source files.",
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
                'source_files': ['statement1.pdf']
            },
            request_only=True,
        )
    ],
)
@api_view(['GET', 'POST'])
def account_list(request):
    if request.method == "GET":
        accounts_data = []
        for account in BankAccount.objects.prefetch_related('source_files').all():
            acc_dict = {
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'source_files': [sf.filename for sf in account.source_files.all()],
                'created_at': account.created_at.isoformat() if account.created_at else None,
                'updated_at': account.updated_at.isoformat() if account.updated_at else None,
            }
            # Add transaction stats
            acc_dict.update(get_account_stats(account))
            accounts_data.append(acc_dict)

        extracted_csvs = get_extracted_csvs_with_stats()
        return JsonResponse({
            'accounts': accounts_data,
            'extracted_csvs': extracted_csvs
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

            # Link source files to the account
            source_files = data.get('source_files', [])
            if isinstance(source_files, str):
                source_files = [source_files] if source_files else []
            for filename in source_files:
                sf, _ = SourceFile.objects.get_or_create(filename=filename)
                sf.bank_account = account
                sf.save()
                # Update transactions from this source file to link to account
                Transaction.objects.filter(source_file=sf).update(bank_account=account)
                # Log source file linking
                AccountLog.objects.create(
                    bank_account=account,
                    action='LINK_SOURCE',
                    new_value=filename,
                    source_file=sf,
                )

            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'source_files': [sf.filename for sf in account.source_files.all()],
            }, status=201)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@extend_schema(
    methods=['GET'],
    operation_id='accounts_detail',
    summary="Get bank account",
    description="Get details of a specific bank account.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['PUT'],
    summary="Update bank account",
    description="Update bank account details and source file linkage.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
)
@extend_schema(
    methods=['DELETE'],
    summary="Delete bank account",
    description="Delete a bank account.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
)
@api_view(['GET', 'PUT', 'DELETE'])
def account_detail(request, account_id):
    try:
        account = BankAccount.objects.prefetch_related('source_files').get(id=account_id)
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
            'source_files': [sf.filename for sf in account.source_files.all()],
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

            # Update source files if provided
            if 'source_files' in data:
                new_source_files = data['source_files']
                if isinstance(new_source_files, str):
                    new_source_files = [new_source_files] if new_source_files else []

                # Get current filenames
                current_filenames = set(sf.filename for sf in account.source_files.all())
                new_filenames = set(new_source_files)

                # Unlink files that are no longer associated
                for sf in account.source_files.all():
                    if sf.filename not in new_filenames:
                        # Log source file unlinking
                        AccountLog.objects.create(
                            bank_account=account,
                            action='UNLINK_SOURCE',
                            old_value=sf.filename,
                            source_file=sf,
                        )
                        # Update transactions from this source file to unlink from account
                        Transaction.objects.filter(source_file=sf).update(bank_account=None)
                        sf.bank_account = None
                        sf.save()

                # Link new files
                for filename in new_filenames - current_filenames:
                    sf, _ = SourceFile.objects.get_or_create(filename=filename)
                    sf.bank_account = account
                    sf.save()
                    # Update transactions from this source file to link to account
                    Transaction.objects.filter(source_file=sf).update(bank_account=account)
                    # Log source file linking
                    AccountLog.objects.create(
                        bank_account=account,
                        action='LINK_SOURCE',
                        new_value=filename,
                        source_file=sf,
                    )

            return JsonResponse({
                'id': account.id,
                'nickname': account.nickname,
                'bank_name': account.bank_name,
                'account_number': account.account_number,
                'ifsc_code': account.ifsc_code,
                'branch': account.branch,
                'source_files': [sf.filename for sf in account.source_files.all()],
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


@extend_schema(
    summary="Toggle source file",
    description="Toggle the disabled state of a bank account source file.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
    examples=[
        OpenApiExample(
            'Toggle disabled',
            value={'disabled': True},
            request_only=True,
        )
    ],
)
@api_view(['PATCH'])
def source_file_toggle(request, source_file_id):
    """Toggle the disabled state of a source file."""
    try:
        source_file = SourceFile.objects.get(id=source_file_id)
    except SourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    if 'disabled' in data:
        source_file.disabled = data['disabled']
        source_file.save()

    return JsonResponse({
        'id': source_file.id,
        'filename': source_file.filename,
        'disabled': source_file.disabled,
    })


@extend_schema(
    summary="List extraction pipelines",
    description="Get all extraction pipelines with their associated source files.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
)
@api_view(['GET'])
def pipeline_list(request):
    """List all extraction pipelines with their associated source files."""
    pipelines = []
    for pipeline in ExtractionPipeline.objects.select_related('default_bank_account').prefetch_related('source_files').all():
        pipelines.append({
            'id': pipeline.id,
            'name': pipeline.name,
            'extractor': pipeline.extractor,
            'file_pattern': pipeline.file_pattern,
            'has_password': bool(pipeline.password),
            'default_bank_account_id': pipeline.default_bank_account.id if pipeline.default_bank_account else None,
            'default_bank_account_name': pipeline.default_bank_account.nickname if pipeline.default_bank_account else None,
            'description': pipeline.description,
            'source_file_count': pipeline.source_files.count(),
            'source_files': [sf.filename for sf in pipeline.source_files.all()],
        })

    return JsonResponse({'pipelines': pipelines})


@extend_schema(
    summary="Update extracted CSV",
    description="Update bank account linkage or disabled state of an extracted CSV.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
    examples=[
        OpenApiExample(
            'Update linkage',
            value={'bank_account_id': 1, 'disabled': False},
            request_only=True,
        )
    ],
)
@api_view(['PATCH'])
def extracted_csv_detail(request, csv_id):
    """Update bank account linkage or disabled state of an extracted CSV."""
    try:
        csv = ExtractedCSV.objects.select_related('bank_account').get(id=csv_id)
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extracted CSV not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    old_bank_account_id = csv.bank_account_id

    # Update bank_account_id if provided
    if 'bank_account_id' in data:
        new_bank_account_id = data['bank_account_id']
        if new_bank_account_id is not None:
            try:
                new_account = BankAccount.objects.get(id=new_bank_account_id)
                csv.bank_account = new_account
            except BankAccount.DoesNotExist:
                return JsonResponse({'error': 'Bank account not found'}, status=400)
        else:
            csv.bank_account = None
        csv.save(update_fields=['bank_account'])

        # Update linked transactions' bank_account when changing linkage
        if old_bank_account_id != csv.bank_account_id:
            Transaction.objects.filter(extracted_csv=csv).update(
                bank_account_id=csv.bank_account_id
            )
            # Log the change
            if csv.bank_account:
                AccountLog.objects.create(
                    bank_account=csv.bank_account,
                    action='LINK_SOURCE',
                    new_value=csv.source_file.filename,
                    source_file=csv.source_file,
                )
            elif old_bank_account_id:
                try:
                    old_account = BankAccount.objects.get(id=old_bank_account_id)
                    AccountLog.objects.create(
                        bank_account=old_account,
                        action='UNLINK_SOURCE',
                        old_value=csv.source_file.filename,
                        source_file=csv.source_file,
                    )
                except BankAccount.DoesNotExist:
                    pass

    # Update disabled if provided
    if 'disabled' in data:
        csv.disabled = data['disabled']
        csv.save(update_fields=['disabled'])

    return JsonResponse({
        'id': csv.id,
        'source_filename': csv.source_file.filename,
        'source_file_id': csv.source_file.id,
        'status': csv.status,
        'bank_account_id': csv.bank_account.id if csv.bank_account else None,
        'disabled': csv.disabled,
    })


@extend_schema(
    summary="Load extracted CSVs",
    description="Trigger loading of extracted CSVs into transactions.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT},
    tags=['Bank Accounts'],
    examples=[
        OpenApiExample(
            'Load CSVs',
            value={'csv_ids': [1, 2, 3]},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def load_extracted_csvs(request):
    """Trigger loading of extracted CSVs into transactions."""
    from django.core.management import call_command
    from django.utils import timezone
    import io

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    csv_ids = data.get('csv_ids', [])
    if not csv_ids:
        return JsonResponse({'error': 'No CSV IDs provided'}, status=400)

    # Validate and get CSVs
    csvs = ExtractedCSV.objects.filter(id__in=csv_ids, status__in=['extracted', 'error'])
    if not csvs.exists():
        return JsonResponse({'error': 'No valid CSVs found to load'}, status=400)

    # Set status to 'loading'
    csvs.update(status='loading', error_message='')

    results = []
    for csv in csvs:
        try:
            # Call the load_transactions command for this CSV
            stdout = io.StringIO()
            call_command('load_transactions', csv_id=csv.id, stdout=stdout)
            output = stdout.getvalue()

            # Refresh from DB
            csv.refresh_from_db()
            results.append({
                'id': csv.id,
                'source_filename': csv.source_file.filename,
                'status': csv.status,
                'success': csv.status == 'loaded',
                'message': output.strip() if output else 'Loaded successfully',
            })
        except Exception as e:
            csv.status = 'error'
            csv.error_message = str(e)
            csv.save(update_fields=['status', 'error_message'])
            results.append({
                'id': csv.id,
                'source_filename': csv.source_file.filename,
                'status': 'error',
                'success': False,
                'message': str(e),
            })

    # Invalidate all inconsistency caches after loading data
    # (bank transactions affect bank inconsistencies,
    # could indirectly affect credit card matching)
    invalidate_all_inconsistencies()

    return JsonResponse({'results': results})
