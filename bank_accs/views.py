import json
import os
from django.http import JsonResponse
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

from .models import BankAccount, SourceFile, ExtractionPipeline, ExtractedCSV, BankExtractionArtifact
from dashboard.models import AccountLog, Transaction, CreditCardPaymentMatch


def update_cc_payment_matches_for_extraction(extraction, is_active):
    """Update CC payment match status for all transactions in an extraction."""
    CreditCardPaymentMatch.objects.filter(
        bank_transaction__extracted_csv=extraction
    ).update(is_active=is_active)

# Supported file extensions for extraction
SUPPORTED_EXTENSIONS = ['.txt', '.xlsx', '.xls', '.pdf']


def get_extracted_csvs_with_stats():
    """Get list of extracted CSVs with transaction stats."""
    from dashboard.models import Transaction

    csvs = []
    # Query ExtractedCSVs with status in extracted, transformed, loading, loaded, error
    # Exclude hidden extractions from data sources
    for csv in ExtractedCSV.objects.filter(
        status__in=['extracted', 'transformed', 'loading', 'loaded', 'error'],
        hidden=False
    ).select_related('source_file', 'bank_account').prefetch_related('artifacts').order_by('-extracted_at'):
        # Serialize artifacts
        artifacts = []
        for artifact in csv.artifacts.all():
            artifacts.append({
                'artifact_id': artifact.artifact_id,
                'artifact_type': artifact.artifact_type,
                'content_type': artifact.content_type,
                'row_count': artifact.row_count,
                'data_hash': artifact.data_hash,
            })

        csv_info = {
            'id': csv.id,
            'name': csv.name,
            'source_filename': csv.source_file.filename,
            'source_file_id': csv.source_file.id,
            'status': csv.status,
            'bank_account_id': csv.bank_account.id if csv.bank_account else None,
            'disabled': csv.disabled,
            'hidden': csv.hidden,
            'row_count': csv.row_count,
            'extracted_at': csv.extracted_at.isoformat() if csv.extracted_at else None,
            'loaded_at': csv.loaded_at.isoformat() if csv.loaded_at else None,
            'error_message': csv.error_message or '',
            'first_transaction_date': None,
            'last_transaction_date': None,
            'transaction_count': 0,
            'artifacts': artifacts,
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

        # Update linked transactions and artifacts' bank_account when changing linkage
        if old_bank_account_id != csv.bank_account_id:
            Transaction.objects.filter(extracted_csv=csv).update(
                bank_account_id=csv.bank_account_id
            )
            # Also update artifacts' bank_account
            csv.artifacts.update(bank_account=csv.bank_account)
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
        # Update CC payment matches: soft delete when disabling, restore when enabling
        update_cc_payment_matches_for_extraction(csv, is_active=not csv.disabled)
        # Invalidate caches since transactions are now included/excluded
        invalidate_all_inconsistencies()

    # Build response with updated account stats for affected accounts
    response = {
        'id': csv.id,
        'source_filename': csv.source_file.filename,
        'source_file_id': csv.source_file.id,
        'status': csv.status,
        'bank_account_id': csv.bank_account.id if csv.bank_account else None,
        'disabled': csv.disabled,
        'affected_accounts': {},
    }

    # Include updated stats for affected accounts
    if csv.bank_account:
        response['affected_accounts'][csv.bank_account.id] = get_account_stats(csv.bank_account)
    if old_bank_account_id and old_bank_account_id != csv.bank_account_id:
        try:
            old_account = BankAccount.objects.get(id=old_bank_account_id)
            response['affected_accounts'][old_bank_account_id] = get_account_stats(old_account)
        except BankAccount.DoesNotExist:
            pass

    return JsonResponse(response)


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
    # Include 'loaded' status to allow re-loading (will re-link unlinked transactions)
    csvs = ExtractedCSV.objects.filter(id__in=csv_ids, status__in=['extracted', 'transformed', 'loading', 'error', 'loaded'])
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


# ==================== Bank Extractions API ====================

@extend_schema(
    summary="List bank source files",
    description="Get all bank statement source files with extraction statistics.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['GET'])
def bank_source_files_list(request):
    """List source files with extraction stats for the bank extractions page."""
    from .extractors import detect_extractor

    files = []
    # Only return SourceFiles that have file_data blob stored in DB
    for sf in SourceFile.objects.select_related('bank_account', 'pipeline').exclude(file_data=b'').exclude(file_data__isnull=True):
        ext = os.path.splitext(sf.filename)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        # Get file size from DB (stored during upload)
        file_size = sf.file_size or 0
        has_data = bool(sf.file_data)

        # Get extraction count and last extracted date
        extractions = ExtractedCSV.objects.filter(source_file=sf).order_by('-extracted_at')
        extractions_count = extractions.count()
        last_extracted = extractions.first().extracted_at if extractions.exists() else None

        # Determine extractor (from pipeline or auto-detect)
        extractor = None
        if sf.pipeline:
            extractor = sf.pipeline.extractor
        else:
            extractor = detect_extractor(sf.filename)

        files.append({
            'id': sf.id,
            'filename': sf.filename,
            'pipeline': {
                'id': sf.pipeline.id,
                'name': sf.pipeline.name,
                'extractor': sf.pipeline.extractor,
            } if sf.pipeline else None,
            'bank_account': {
                'id': sf.bank_account.id,
                'nickname': sf.bank_account.nickname,
            } if sf.bank_account else None,
            'extractions_count': extractions_count,
            'last_extracted': last_extracted.isoformat() if last_extracted else None,
            'has_password': bool(sf.pipeline and sf.pipeline.password),
            'pipeline_password': sf.pipeline.password if sf.pipeline else '',
            'file_size': file_size,
            'has_data': has_data,
            'extractor': extractor,
            'disabled': sf.disabled,
        })

    # Sort by extractions_count (unextracted first), then by filename
    files.sort(key=lambda f: (f['extractions_count'] > 0, f['filename']))

    return JsonResponse({'data': files})


@extend_schema(
    summary="Sync bank source files from disk",
    description="Scan bank_accs/data/ directory and sync files to database with file_data blobs.",
    responses={200: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['POST'])
def bank_source_files_sync(request):
    """Sync source files from bank_accs/data/ directory to database."""
    import gzip
    import mimetypes
    from pathlib import Path
    from django.conf import settings

    data_dir = Path(settings.BASE_DIR) / 'bank_accs' / 'data'
    if not data_dir.exists():
        return JsonResponse({'error': 'Data directory not found', 'synced': 0, 'skipped': 0})

    synced = 0
    skipped = 0

    for f in data_dir.iterdir():
        ext = f.suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        # Get or create source file record
        source_file, created = SourceFile.objects.get_or_create(filename=f.name)

        # Skip if already has file_data
        if source_file.file_data and not created:
            skipped += 1
            continue

        # Read and compress file data
        with open(f, 'rb') as file:
            file_data = file.read()

        source_file.file_data = gzip.compress(file_data)
        source_file.file_size = len(file_data)
        mime_type, _ = mimetypes.guess_type(str(f))
        source_file.mime_type = mime_type or 'application/octet-stream'
        source_file.save()
        synced += 1

    return JsonResponse({'synced': synced, 'skipped': skipped})


@extend_schema(
    summary="Get extracted CSV content",
    description="Get the raw CSV content of an extracted CSV. Supports artifact_id query param.",
    parameters=[
        OpenApiParameter(name='artifact_id', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Optional artifact ID to fetch specific artifact'),
    ],
    responses={200: OpenApiTypes.STR, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['GET'])
def extracted_csv_content(request, csv_id):
    """Get the raw CSV content of an ExtractedCSV or specific artifact."""
    import gzip

    try:
        csv_obj = ExtractedCSV.objects.prefetch_related('artifacts').get(id=csv_id)
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extracted CSV not found'}, status=404)

    # Check if specific artifact requested
    artifact_id = request.GET.get('artifact_id')
    data_to_decompress = None
    filename = csv_obj.name

    if artifact_id:
        # Get specific artifact
        artifact = csv_obj.artifacts.filter(artifact_id=artifact_id).first()
        if not artifact:
            return JsonResponse({'error': 'Artifact not found'}, status=404)
        data_to_decompress = artifact.data
        filename = f"{csv_obj.name}_{artifact.artifact_type}"
    else:
        # Check for ingestable artifact first, fall back to csv_data
        artifact = csv_obj.get_ingestable_artifact()
        if artifact:
            data_to_decompress = artifact.data
        else:
            data_to_decompress = csv_obj.csv_data

    # Decompress CSV data
    try:
        csv_content = gzip.decompress(data_to_decompress).decode('utf-8')
    except Exception as e:
        return JsonResponse({'error': f'Failed to decompress CSV: {str(e)}'}, status=500)

    from django.http import HttpResponse
    response = HttpResponse(csv_content, content_type='text/csv')
    response['Content-Disposition'] = f'inline; filename="{filename}.csv"'
    return response


@extend_schema(
    summary="Preview extracted CSV",
    description="Get a preview of the extracted CSV data with optional row limit. Supports artifact_id query param.",
    parameters=[
        OpenApiParameter(name='limit', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, description='Max rows to return'),
        OpenApiParameter(name='artifact_id', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, description='Optional artifact ID to preview specific artifact'),
    ],
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['GET'])
def extracted_csv_preview(request, csv_id):
    """Get a preview of the extracted CSV data or specific artifact."""
    import gzip
    import csv as csv_module
    import io

    try:
        csv_obj = ExtractedCSV.objects.prefetch_related('artifacts').get(id=csv_id)
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extracted CSV not found'}, status=404)

    limit = request.GET.get('limit')
    if limit:
        try:
            limit = int(limit)
        except ValueError:
            limit = None

    # Check if specific artifact requested
    artifact_id = request.GET.get('artifact_id')
    data_to_decompress = None
    row_count = csv_obj.row_count

    if artifact_id:
        # Get specific artifact
        artifact = csv_obj.artifacts.filter(artifact_id=artifact_id).first()
        if not artifact:
            return JsonResponse({'error': 'Artifact not found'}, status=404)
        data_to_decompress = artifact.data
        row_count = artifact.row_count
    else:
        # Check for ingestable artifact first, fall back to csv_data
        artifact = csv_obj.get_ingestable_artifact()
        if artifact:
            data_to_decompress = artifact.data
            row_count = artifact.row_count
        else:
            data_to_decompress = csv_obj.csv_data

    # Decompress CSV data
    try:
        csv_content = gzip.decompress(data_to_decompress).decode('utf-8')
    except Exception as e:
        return JsonResponse({'error': f'Failed to decompress CSV: {str(e)}'}, status=500)

    # Parse CSV
    reader = csv_module.DictReader(io.StringIO(csv_content))
    rows = []
    for i, row in enumerate(reader):
        if limit and i >= limit:
            break
        rows.append(row)

    return JsonResponse({
        'data': rows,
        'total': row_count,
        'columns': reader.fieldnames or [],
    })


@extend_schema(
    summary="Extract bank source file",
    description="Trigger extraction for a bank statement source file.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
    examples=[
        OpenApiExample(
            'Extract with password',
            value={'password': 'mypassword'},
            request_only=True,
        )
    ],
)
@api_view(['POST'])
def bank_source_file_extract(request, source_file_id):
    """Trigger extraction for a bank statement source file."""
    import gzip
    import hashlib
    import tempfile
    from .extractors import get_extractor, detect_extractor

    try:
        sf = SourceFile.objects.select_related('pipeline', 'bank_account').get(id=source_file_id)
    except SourceFile.DoesNotExist:
        return JsonResponse({'error': 'Source file not found'}, status=404)

    # Check if file data exists in DB
    if not sf.file_data:
        return JsonResponse({'error': f'File not uploaded: {sf.filename}. Please upload the file first.'}, status=400)

    # Parse request body for password
    password = None
    try:
        data = json.loads(request.body) if request.body else {}
        password = data.get('password')
    except json.JSONDecodeError:
        pass

    # Use pipeline password if no password provided
    if not password and sf.pipeline and sf.pipeline.password:
        password = sf.pipeline.password

    # Determine extractor
    extractor_name = sf.pipeline.extractor if sf.pipeline else detect_extractor(sf.filename)
    if not extractor_name:
        return JsonResponse({'error': f'No extractor found for file: {sf.filename}'}, status=400)

    extractor_fn = get_extractor(extractor_name)
    if not extractor_fn:
        return JsonResponse({'error': f'Unknown extractor: {extractor_name}'}, status=400)

    # Decompress file data from DB and write to temp file for extraction
    try:
        file_bytes = gzip.decompress(sf.file_data)
    except Exception:
        # If not gzip compressed, use as-is
        file_bytes = sf.file_data

    # Get file extension for temp file
    ext = os.path.splitext(sf.filename)[1]

    try:
        # Create temp file with proper extension (extractors may rely on it)
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            # Run extraction
            csv_content = extractor_fn(tmp_path, password=password)
        finally:
            # Clean up temp file
            os.unlink(tmp_path)

        if not csv_content or not csv_content.strip():
            return JsonResponse({'error': 'Extraction produced no data'}, status=400)

        # Count rows (excluding header)
        lines = csv_content.strip().split('\n')
        row_count = len(lines) - 1 if len(lines) > 1 else 0

        # Compute hash of CSV content
        csv_hash = hashlib.sha256(csv_content.encode('utf-8')).hexdigest()

        # Compress CSV data
        csv_data = gzip.compress(csv_content.encode('utf-8'))

        # Create ExtractedCSV record with 'transformed' status
        # (legacy extractors produce ingestable CSV directly)
        extracted_csv = ExtractedCSV.objects.create(
            source_file=sf,
            pipeline=sf.pipeline,
            bank_account=sf.bank_account,
            csv_data=csv_data,  # Keep for backward compatibility
            csv_hash=csv_hash,
            row_count=row_count,
            status='transformed',  # Mark as transformed since legacy extractors produce ingestable CSV
        )

        # Create artifact for the ingestable CSV
        BankExtractionArtifact.objects.create(
            extraction=extracted_csv,
            artifact_type='ingestable_transactions',
            content_type='csv',
            data=csv_data,
            data_hash=csv_hash,
            row_count=row_count,
            bank_account=sf.bank_account,
        )

        return JsonResponse({
            'success': True,
            'extraction': {
                'id': extracted_csv.id,
                'name': extracted_csv.name,
                'row_count': row_count,
                'status': extracted_csv.status,
                'extracted_at': extracted_csv.extracted_at.isoformat(),
            }
        })

    except Exception as e:
        error_msg = str(e)
        # Check for password-related errors
        if 'password' in error_msg.lower() or 'decrypt' in error_msg.lower() or 'encrypted' in error_msg.lower():
            return JsonResponse({
                'success': False,
                'error': 'Password required or incorrect password',
                'needs_password': True,
            }, status=400)
        return JsonResponse({'success': False, 'error': error_msg}, status=400)


@extend_schema(
    summary="List bank extraction artifacts",
    description="Get all artifacts for a specific bank extraction.",
    responses={200: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['GET'])
def bank_extraction_artifacts(request, extraction_id):
    """List artifacts for a bank extraction."""
    try:
        extraction = ExtractedCSV.objects.prefetch_related('artifacts').get(id=extraction_id)
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)

    artifacts = []
    for artifact in extraction.artifacts.all():
        artifacts.append({
            'artifact_id': artifact.artifact_id,
            'artifact_type': artifact.artifact_type,
            'content_type': artifact.content_type,
            'row_count': artifact.row_count,
            'data_hash': artifact.data_hash,
            'bank_account': {
                'id': artifact.bank_account.id,
                'nickname': artifact.bank_account.nickname,
            } if artifact.bank_account else None,
            'created_at': artifact.created_at.isoformat(),
        })

    return JsonResponse({
        'extraction_id': extraction.id,
        'extraction_name': extraction.name,
        'artifacts': artifacts,
    })


@extend_schema(
    summary="Toggle bank extraction hidden",
    description="Toggle the hidden status of a bank extraction.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['POST'])
def bank_extraction_toggle_hidden(request):
    """Toggle hidden status for a bank extraction."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_id = data.get('extraction_id')
    hidden = data.get('hidden')

    if extraction_id is None:
        return JsonResponse({'error': 'extraction_id is required'}, status=400)

    if hidden is None:
        return JsonResponse({'error': 'hidden is required'}, status=400)

    try:
        extraction = ExtractedCSV.objects.get(id=extraction_id)
        extraction.hidden = hidden
        extraction.save(update_fields=['hidden'])
        # Update CC payment matches: soft delete when hiding, restore when unhiding
        update_cc_payment_matches_for_extraction(extraction, is_active=not extraction.hidden)
        # Invalidate caches since transactions are now included/excluded
        invalidate_all_inconsistencies()

        return JsonResponse({
            'success': True,
            'id': extraction_id,
            'hidden': extraction.hidden,
        })
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)


@extend_schema(
    summary="Delete bank extraction",
    description="Permanently delete a bank extraction and all its artifacts. Transactions remain but lose their link.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiTypes.OBJECT, 400: OpenApiTypes.OBJECT, 404: OpenApiTypes.OBJECT},
    tags=['Bank Extractions'],
)
@api_view(['POST'])
def bank_extraction_delete(request):
    """Permanently delete a bank extraction and all its artifacts."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    extraction_id = data.get('extraction_id')
    if extraction_id is None:
        return JsonResponse({'error': 'extraction_id is required'}, status=400)

    try:
        extraction = ExtractedCSV.objects.get(id=extraction_id)
    except ExtractedCSV.DoesNotExist:
        return JsonResponse({'error': 'Extraction not found'}, status=404)

    # Count affected transactions before deletion
    transactions_affected = Transaction.objects.filter(extracted_csv=extraction).count()

    # Delete the extraction (CASCADE will delete artifacts, SET_NULL on transactions)
    extraction.delete()

    return JsonResponse({
        'success': True,
        'id': extraction_id,
        'transactions_affected': transactions_affected,
    })
