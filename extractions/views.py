"""
API views for the unified extraction system.
"""
import json
import gzip
import hashlib
import mimetypes
import os
import csv as csv_module
import io
from pathlib import Path
from django.http import JsonResponse, HttpResponse
from django.conf import settings
from django.db.models import Min, Max
from rest_framework.decorators import api_view

# DRF Spectacular imports (optional - gracefully degrade if not installed)
try:
    from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
    from drf_spectacular.types import OpenApiTypes
except ImportError:
    def extend_schema(*args, **kwargs):
        def decorator(func):
            return func
        return decorator
    OpenApiParameter = None
    OpenApiExample = None
    OpenApiTypes = None

from .models import (
    SourceFile,
    Extraction,
    ExtractionArtifact,
    DataSourceArtifact,
)
from .extractors import (
    get_extractor,
    detect_extractor,
    create_extraction,
    decompress_data,
    compress_data,
    EXTRACTORS,
)
from .transformers import transform_artifact, get_transformer
from .loader import load_artifact, unload_artifact, delete_artifact, reload_artifact

from bank_accounts.models import BankAccount
from credit_cards.models import CreditCard
from project.cache_utils import invalidate_all_inconsistencies


# Supported file extensions
SUPPORTED_EXTENSIONS = ['.txt', '.xlsx', '.xls', '.pdf', '.csv']


def _serialize_source_file(sf, include_extractions=False):
    """Serialize a SourceFile to dict."""
    # Compute extraction_status dynamically based on whether extractions exist
    # Use prefetched data if available to avoid extra queries
    if hasattr(sf, '_prefetched_objects_cache') and 'extractions' in sf._prefetched_objects_cache:
        has_extractions = len(sf.extractions.all()) > 0
    else:
        has_extractions = sf.extractions.exists()
    extraction_status = 'extracted' if has_extractions else 'not_extracted'

    result = {
        'id': sf.id,
        'source_file_id': sf.source_file_id,
        'filename': sf.filename,
        'file_path': sf.file_path,
        'file_hash': sf.file_hash,
        'file_size': sf.file_size,
        'mime_type': sf.mime_type,
        'domain': sf.domain,
        'password': sf.password,
        'extractor': sf.extractor,
        'extraction_status': extraction_status,
        'hidden': sf.hidden,
        'created_at': sf.created_at.isoformat() if sf.created_at else None,
        'updated_at': sf.updated_at.isoformat() if sf.updated_at else None,
        'auto_detected_extractor': detect_extractor(sf.filename, sf.domain),
    }

    if include_extractions:
        result['extractions'] = [
            _serialize_extraction(e, include_artifacts=True) for e in sf.extractions.all()
        ]

    return result


def _serialize_extraction(extraction, include_artifacts=False):
    """Serialize an Extraction to dict."""
    result = {
        'id': extraction.id,
        'extraction_id': extraction.extraction_id,
        'source_file_id': extraction.source_file.source_file_id,  # Use UUID, not FK ID
        'source_filename': extraction.source_file.filename,
        'extractor_name': extraction.extractor_name,
        'extractor_version': extraction.extractor_version,
        'status': extraction.status,
        'error_message': extraction.error_message,
        'hidden': extraction.hidden,
        'extracted_at': extraction.extracted_at.isoformat() if extraction.extracted_at else None,
    }

    if include_artifacts:
        result['artifacts'] = [
            _serialize_artifact(a) for a in extraction.artifacts.all()
        ]

    return result


def _serialize_artifact(artifact):
    """Serialize an ExtractionArtifact to dict."""
    return {
        'id': artifact.id,
        'artifact_id': artifact.artifact_id,
        'artifact_type': artifact.artifact_type,
        'artifact_key': artifact.artifact_key,
        'content_format': artifact.content_format,
        'content_hash': artifact.content_hash,
        'row_count': artifact.row_count,
        'data_source_target': artifact.data_source_target,
        'transformer': artifact.transformer,
        'transformation_status': artifact.transformation_status,
        'created_at': artifact.created_at.isoformat() if artifact.created_at else None,
        'data_source_artifacts_count': artifact.data_source_artifacts.count(),
    }


def _serialize_data_source_artifact(dsa):
    """Serialize a DataSourceArtifact to dict."""
    return {
        'id': dsa.id,
        'artifact_id': dsa.artifact_id,
        'source_artifact_id': dsa.source_artifact.artifact_id,
        'source_artifact_type': dsa.source_artifact.artifact_type,
        'source_artifact_key': dsa.source_artifact.artifact_key,
        'source_extraction_id': dsa.source_artifact.extraction.extraction_id,
        'source_filename': dsa.source_artifact.extraction.source_file.filename,
        'data_source_target': dsa.data_source_target,
        'content_hash': dsa.content_hash,
        'row_count': dsa.row_count,
        'bank_account_id': dsa.bank_account_id,
        'bank_account_name': dsa.bank_account.nickname if dsa.bank_account else None,
        'credit_card_id': dsa.credit_card_id,
        'credit_card_name': dsa.credit_card.nickname if dsa.credit_card else None,
        'transformer': dsa.transformer,
        'status': dsa.status,
        'error_message': dsa.error_message,
        'enabled': dsa.enabled,
        'hidden': dsa.hidden,
        'transformed_at': dsa.transformed_at.isoformat() if dsa.transformed_at else None,
        'loaded_at': dsa.loaded_at.isoformat() if dsa.loaded_at else None,
    }


# ==================== Source Files API ====================

@extend_schema(
    summary="List source files",
    description="List source files with visibility and domain filtering.",
    parameters=[
        OpenApiParameter(name='visibility', description="Filter: 'visible', 'hidden', 'all'", required=False, type=str, default='visible'),
        OpenApiParameter(name='domain', description="Filter: 'bank_account', 'credit_card', 'all'", required=False, type=str, default='all'),
    ],
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Source Files List',
            value={
                'data': [{
                    'id': 1,
                    'source_file_id': 'sf_a1b2c3d4',
                    'filename': 'statement_2024.pdf',
                    'file_path': '/data/bank_accounts/statement_2024.pdf',
                    'file_hash': 'abc123...',
                    'file_size': 125000,
                    'mime_type': 'application/pdf',
                    'domain': 'bank_account',
                    'password': '',
                    'extractor': 'hdfc_bank_pdf',
                    'extraction_status': 'extracted',
                    'hidden': False,
                    'created_at': '2024-01-15T10:30:00Z',
                    'updated_at': '2024-01-15T10:30:00Z',
                    'auto_detected_extractor': 'hdfc_bank_pdf',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['GET'])
def source_file_list(request):
    """
    GET /api/extractions/source-files/
    List source files with visibility filter.

    Query params:
    - visibility: 'visible' (default) | 'hidden' | 'all'
    - domain: 'bank_account' | 'credit_card' | 'all'
    """
    visibility = request.GET.get('visibility', 'visible')
    domain = request.GET.get('domain', 'all')

    queryset = SourceFile.objects.select_related().prefetch_related('extractions')

    if visibility == 'visible':
        queryset = queryset.filter(hidden=False)
    elif visibility == 'hidden':
        queryset = queryset.filter(hidden=True)

    if domain != 'all':
        queryset = queryset.filter(domain=domain)

    files = [_serialize_source_file(sf) for sf in queryset.order_by('-created_at')]
    return JsonResponse({'data': files})


@extend_schema(
    summary="Refresh source files",
    description="Scan directories and create SourceFile records for new files.",
    request=dict,
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Refresh Result',
            value={'created': 5, 'skipped': 10, 'errors': []},
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['POST'])
def source_file_refresh(request):
    """
    POST /api/extractions/source-files/refresh/
    Scan directories and create SourceFile records for new files.

    Request body (optional):
    - bank_account_dir: str (default: 'bank_accounts/data')
    - credit_card_dir: str (default: 'credit_cards/data')
    """
    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    bank_dir = Path(settings.BASE_DIR) / data.get('bank_account_dir', 'bank_accounts/data')
    cc_dir = Path(settings.BASE_DIR) / data.get('credit_card_dir', 'credit_cards/data')

    created = 0
    skipped = 0
    errors = []

    def process_directory(directory, domain):
        nonlocal created, skipped, errors

        if not directory.exists():
            return

        for f in directory.iterdir():
            if not f.is_file():
                continue

            ext = f.suffix.lower()
            if ext not in SUPPORTED_EXTENSIONS:
                continue

            try:
                # Check if file already exists
                existing = SourceFile.objects.filter(filename=f.name).first()
                if existing:
                    # Update file data if not present
                    if not existing.file_data:
                        with open(f, 'rb') as file:
                            file_data = file.read()
                        existing.file_data = gzip.compress(file_data)
                        existing.file_size = len(file_data)
                        existing.file_hash = hashlib.sha256(file_data).hexdigest()
                        mime_type, _ = mimetypes.guess_type(str(f))
                        existing.mime_type = mime_type or 'application/octet-stream'
                        existing.file_path = str(f)
                        existing.save()
                        created += 1
                    else:
                        skipped += 1
                    continue

                # Read and compress file data
                with open(f, 'rb') as file:
                    file_data = file.read()

                SourceFile.objects.create(
                    filename=f.name,
                    file_path=str(f),
                    file_hash=hashlib.sha256(file_data).hexdigest(),
                    file_data=gzip.compress(file_data),
                    file_size=len(file_data),
                    mime_type=mimetypes.guess_type(str(f))[0] or 'application/octet-stream',
                    domain=domain,
                )
                created += 1

            except Exception as e:
                errors.append({'file': f.name, 'error': str(e)})

    process_directory(bank_dir, 'bank_account')
    process_directory(cc_dir, 'credit_card')

    return JsonResponse({
        'created': created,
        'skipped': skipped,
        'errors': errors,
    })


@extend_schema(
    summary="Bulk update source files",
    description="Bulk update source files: hide, unhide, set_extractor, set_password, set_domain.",
    request=dict,
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Bulk Update Request',
            value={'ids': [1, 2, 3], 'action': 'set_extractor', 'value': 'hdfc_bank_pdf'},
            request_only=True,
        ),
        OpenApiExample(
            'Bulk Update Response',
            value={'success': True, 'updated_count': 3},
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['POST'])
def source_file_bulk_update(request):
    """
    POST /api/extractions/source-files/bulk-update/
    Bulk update source files.

    Request body:
    - ids: list[int]
    - action: 'hide' | 'unhide' | 'set_extractor' | 'set_password' | 'set_domain'
    - value: str (for set_* actions)
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    ids = data.get('ids', [])
    action = data.get('action')
    value = data.get('value')

    if not ids:
        return JsonResponse({'error': 'No IDs provided'}, status=400)

    queryset = SourceFile.objects.filter(id__in=ids)

    if action == 'hide':
        queryset.update(hidden=True)
    elif action == 'unhide':
        queryset.update(hidden=False)
    elif action == 'set_extractor':
        queryset.update(extractor=value or '')
    elif action == 'set_password':
        queryset.update(password=value or '')
    elif action == 'set_domain':
        if value in ['bank_account', 'credit_card']:
            queryset.update(domain=value)
        else:
            return JsonResponse({'error': 'Invalid domain value'}, status=400)
    else:
        return JsonResponse({'error': f'Unknown action: {action}'}, status=400)

    return JsonResponse({
        'success': True,
        'updated_count': queryset.count(),
    })


@extend_schema(
    summary="Get or update source file",
    description="GET: Retrieve source file with extractions. PATCH: Update password, extractor, domain, hidden.",
    responses={200: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Source File Detail',
            value={
                'id': 1,
                'source_file_id': 'sf_a1b2c3d4',
                'filename': 'statement_2024.pdf',
                'file_path': '/data/bank_accounts/statement_2024.pdf',
                'file_hash': 'abc123def456...',
                'file_size': 125000,
                'mime_type': 'application/pdf',
                'domain': 'bank_account',
                'password': '',
                'extractor': 'hdfc_bank_pdf',
                'extraction_status': 'extracted',
                'hidden': False,
                'created_at': '2024-01-15T10:30:00Z',
                'updated_at': '2024-01-15T10:30:00Z',
                'auto_detected_extractor': 'hdfc_bank_pdf',
                'extractions': [{
                    'id': 1,
                    'extraction_id': 'ex_xyz789',
                    'source_file_id': 'sf_a1b2c3d4',
                    'source_filename': 'statement_2024.pdf',
                    'extractor_name': 'hdfc_bank_pdf',
                    'extractor_version': '1.0',
                    'status': 'completed',
                    'error_message': None,
                    'hidden': False,
                    'extracted_at': '2024-01-15T10:31:00Z',
                    'artifacts': [{
                        'id': 1,
                        'artifact_id': 'art_abc123',
                        'artifact_type': 'transactions',
                        'artifact_key': 'main',
                        'content_format': 'csv',
                        'content_hash': 'hash123...',
                        'row_count': 150,
                        'data_source_target': 'bank_account_transactions',
                        'transformer': 'hdfc_bank_transactions',
                        'transformation_status': 'transformed',
                        'created_at': '2024-01-15T10:31:00Z',
                        'data_source_artifacts_count': 1,
                    }],
                }],
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['GET', 'PATCH'])
def source_file_detail(request, source_file_id):
    """
    GET/PATCH /api/extractions/source-files/<id>/
    Get or update a single source file.
    """
    try:
        sf = SourceFile.objects.prefetch_related('extractions').get(source_file_id=source_file_id)
    except SourceFile.DoesNotExist:
        try:
            sf = SourceFile.objects.prefetch_related('extractions').get(id=source_file_id)
        except SourceFile.DoesNotExist:
            return JsonResponse({'error': 'Source file not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse(_serialize_source_file(sf, include_extractions=True))

    elif request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        if 'password' in data:
            sf.password = data['password']
        if 'extractor' in data:
            sf.extractor = data['extractor']
        if 'domain' in data:
            sf.domain = data['domain']
        if 'hidden' in data:
            sf.hidden = data['hidden']

        sf.save()
        return JsonResponse(_serialize_source_file(sf))


@extend_schema(
    summary="Validate file password",
    description="Validate a password for an encrypted file without extracting.",
    request=dict,
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Validate Password Request',
            value={'password': 'mypassword123'},
            request_only=True,
        ),
        OpenApiExample(
            'Valid Password Response',
            value={'valid': True},
            response_only=True,
        ),
        OpenApiExample(
            'Invalid Password Response',
            value={'valid': False, 'error': 'Invalid password'},
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['POST'])
def source_file_validate_password(request, source_file_id):
    """
    POST /api/extractions/source-files/<id>/validate-password/
    Validate a password for an encrypted file without extracting.

    Request body:
    - password: str (required)

    Returns:
    - valid: bool
    - error: str (if invalid)
    """
    try:
        sf = SourceFile.objects.get(source_file_id=source_file_id)
    except SourceFile.DoesNotExist:
        try:
            sf = SourceFile.objects.get(id=source_file_id)
        except SourceFile.DoesNotExist:
            return JsonResponse({'error': 'Source file not found'}, status=404)

    if not sf.file_data:
        return JsonResponse({'error': 'File has no data'}, status=400)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    password = data.get('password', '')

    # Determine extractor
    extractor_name = sf.extractor or detect_extractor(sf.filename, sf.domain)
    if not extractor_name:
        return JsonResponse({'error': f'No extractor found for file: {sf.filename}'}, status=400)

    extractor = get_extractor(extractor_name)
    if not extractor:
        return JsonResponse({'error': f'Unknown extractor: {extractor_name}'}, status=400)

    try:
        # Decompress file data
        try:
            file_bytes = gzip.decompress(sf.file_data)
        except Exception:
            file_bytes = sf.file_data

        # Try extraction with password (validates without saving)
        result = extractor.extract(file_bytes, password=password)

        if result.error:
            if 'password' in result.error.lower() or 'decrypt' in result.error.lower():
                return JsonResponse({
                    'valid': False,
                    'error': 'Invalid password',
                })
            return JsonResponse({
                'valid': False,
                'error': result.error,
            })

        # Password is valid (extraction succeeded)
        return JsonResponse({'valid': True})

    except Exception as e:
        return JsonResponse({
            'valid': False,
            'error': str(e),
        })


@extend_schema(
    summary="Extract source file",
    description="Trigger extraction for a source file. Returns extraction with artifacts.",
    request=dict,
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Extract Request',
            value={'password': 'optional_password', 'extractor': 'hdfc_bank_pdf'},
            request_only=True,
        ),
        OpenApiExample(
            'Extract Success Response',
            value={
                'success': True,
                'extraction': {
                    'id': 1,
                    'extraction_id': 'ex_xyz789',
                    'source_file_id': 'sf_a1b2c3d4',
                    'source_filename': 'statement_2024.pdf',
                    'extractor_name': 'hdfc_bank_pdf',
                    'extractor_version': '1.0',
                    'status': 'completed',
                    'error_message': None,
                    'hidden': False,
                    'extracted_at': '2024-01-15T10:31:00Z',
                    'artifacts': [{
                        'id': 1,
                        'artifact_id': 'art_abc123',
                        'artifact_type': 'transactions',
                        'artifact_key': 'main',
                        'content_format': 'csv',
                        'content_hash': 'hash123...',
                        'row_count': 150,
                        'data_source_target': 'bank_account_transactions',
                        'transformer': 'hdfc_bank_transactions',
                        'transformation_status': 'not_transformed',
                        'created_at': '2024-01-15T10:31:00Z',
                        'data_source_artifacts_count': 0,
                    }],
                },
            },
            response_only=True,
        ),
        OpenApiExample(
            'Password Required Error',
            value={'success': False, 'error': 'File is encrypted', 'needs_password': True},
            response_only=True,
        ),
    ],
    tags=['Extractions - Source Files'],
)
@api_view(['POST'])
def source_file_extract(request, source_file_id):
    """
    POST /api/extractions/source-files/<id>/extract/
    Trigger extraction for a source file.

    Request body (optional):
    - password: str
    - extractor: str (override auto-detection)
    """
    try:
        sf = SourceFile.objects.get(source_file_id=source_file_id)
    except SourceFile.DoesNotExist:
        try:
            sf = SourceFile.objects.get(id=source_file_id)
        except SourceFile.DoesNotExist:
            return JsonResponse({'error': 'Source file not found'}, status=404)

    if not sf.file_data:
        return JsonResponse({'error': 'File has no data. Run refresh first.'}, status=400)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    password = data.get('password') or sf.password
    extractor_name = data.get('extractor') or sf.extractor or detect_extractor(sf.filename, sf.domain)

    if not extractor_name:
        return JsonResponse({'error': f'No extractor found for file: {sf.filename}'}, status=400)

    # Guard against duplicate extractions
    existing = Extraction.objects.filter(
        source_file=sf, extractor_name=extractor_name, status='completed',
    ).first()
    if existing:
        force = data.get('force', False)
        if not force:
            return JsonResponse({
                'error': f'File already has a completed extraction (#{existing.id}) with extractor "{extractor_name}". '
                         f'Pass "force": true to re-extract.',
                'existing_extraction_id': existing.id,
            }, status=409)

    extractor = get_extractor(extractor_name)
    if not extractor:
        return JsonResponse({'error': f'Unknown extractor: {extractor_name}'}, status=400)

    try:
        # Decompress file data
        try:
            file_bytes = gzip.decompress(sf.file_data)
        except Exception:
            file_bytes = sf.file_data

        # Run extraction
        result = extractor.extract(file_bytes, password=password)

        if result.error:
            # Check for password-related errors
            if 'password' in result.error.lower() or 'decrypt' in result.error.lower():
                return JsonResponse({
                    'success': False,
                    'error': result.error,
                    'needs_password': True,
                }, status=400)
            return JsonResponse({'success': False, 'error': result.error}, status=400)

        # Create Extraction record
        extraction = Extraction.objects.create(
            source_file=sf,
            extractor_name=extractor_name,
            extractor_version=extractor.version,
            status='completed',
        )

        # Create artifacts
        for spec in result.artifacts:
            ExtractionArtifact.objects.create(
                extraction=extraction,
                artifact_type=spec.artifact_type,
                artifact_key=spec.artifact_key,
                content_format=spec.content_format,
                content=compress_data(spec.content),
                content_hash=hashlib.sha256(spec.content.encode()).hexdigest(),
                row_count=spec.row_count,
                data_source_target=spec.data_source_target,
                transformer=spec.transformer,
                transformation_status='not_transformed' if spec.transformer else 'not_applicable',
            )

        # Update source file status
        sf.extraction_status = 'extracted'
        sf.extractor = extractor_name
        sf.save()

        return JsonResponse({
            'success': True,
            'extraction': _serialize_extraction(extraction, include_artifacts=True),
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ==================== Extractions API ====================

@extend_schema(
    summary="List extractions",
    description="List extractions with visibility, domain, and status filtering.",
    parameters=[
        OpenApiParameter(name='visibility', description="Filter: 'visible', 'hidden', 'all'", required=False, type=str, default='visible'),
        OpenApiParameter(name='domain', description="Filter: 'bank_account', 'credit_card', 'all'", required=False, type=str, default='all'),
        OpenApiParameter(name='status', description="Filter: 'pending', 'completed', 'error', 'all'", required=False, type=str, default='all'),
    ],
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Extractions List',
            value={
                'data': [{
                    'id': 1,
                    'extraction_id': 'ex_xyz789',
                    'source_file_id': 'sf_a1b2c3d4',
                    'source_filename': 'statement_2024.pdf',
                    'extractor_name': 'hdfc_bank_pdf',
                    'extractor_version': '1.0',
                    'status': 'completed',
                    'error_message': None,
                    'hidden': False,
                    'extracted_at': '2024-01-15T10:31:00Z',
                    'artifacts': [{
                        'id': 1,
                        'artifact_id': 'art_abc123',
                        'artifact_type': 'transactions',
                        'artifact_key': 'main',
                        'content_format': 'csv',
                        'content_hash': 'hash123...',
                        'row_count': 150,
                        'data_source_target': 'bank_account_transactions',
                        'transformer': 'hdfc_bank_transactions',
                        'transformation_status': 'transformed',
                        'created_at': '2024-01-15T10:31:00Z',
                        'data_source_artifacts_count': 1,
                    }],
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions'],
)
@api_view(['GET'])
def extraction_list(request):
    """
    GET /api/extractions/
    List extractions with visibility filter.

    Query params:
    - visibility: 'visible' (default) | 'hidden' | 'all'
    - domain: 'bank_account' | 'credit_card' | 'all'
    - status: 'pending' | 'completed' | 'error' | 'all'
    """
    visibility = request.GET.get('visibility', 'visible')
    domain = request.GET.get('domain', 'all')
    status = request.GET.get('status', 'all')

    queryset = Extraction.objects.select_related('source_file').prefetch_related('artifacts')

    if visibility == 'visible':
        queryset = queryset.filter(hidden=False)
    elif visibility == 'hidden':
        queryset = queryset.filter(hidden=True)

    if domain != 'all':
        queryset = queryset.filter(source_file__domain=domain)

    if status != 'all':
        queryset = queryset.filter(status=status)

    extractions = [_serialize_extraction(e, include_artifacts=True) for e in queryset.order_by('-extracted_at')]
    return JsonResponse({'data': extractions})


@extend_schema(
    summary="Bulk update extractions",
    description="Bulk update extractions: hide, unhide, delete.",
    request=dict,
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Bulk Update Request',
            value={'ids': [1, 2, 3], 'action': 'hide'},
            request_only=True,
        ),
        OpenApiExample(
            'Bulk Update Response',
            value={'success': True, 'updated_count': 3},
            response_only=True,
        ),
        OpenApiExample(
            'Bulk Delete Response',
            value={'success': True, 'deleted_count': 3},
            response_only=True,
        ),
    ],
    tags=['Extractions'],
)
@api_view(['POST'])
def extraction_bulk_update(request):
    """
    POST /api/extractions/bulk-update/
    Bulk update extractions.

    Request body:
    - ids: list[int]
    - action: 'hide' | 'unhide' | 'delete'
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    ids = data.get('ids', [])
    action = data.get('action')

    if not ids:
        return JsonResponse({'error': 'No IDs provided'}, status=400)

    queryset = Extraction.objects.filter(id__in=ids)

    if action == 'hide':
        queryset.update(hidden=True)
    elif action == 'unhide':
        queryset.update(hidden=False)
    elif action == 'delete':
        count = queryset.count()
        queryset.delete()
        return JsonResponse({'success': True, 'deleted_count': count})
    else:
        return JsonResponse({'error': f'Unknown action: {action}'}, status=400)

    return JsonResponse({'success': True, 'updated_count': queryset.count()})


@extend_schema(
    summary="Get, update, or delete extraction",
    description="GET: Retrieve extraction with artifacts. PATCH: Update hidden status. DELETE: Delete extraction.",
    responses={200: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Extraction Detail',
            value={
                'id': 1,
                'extraction_id': 'ex_xyz789',
                'source_file_id': 'sf_a1b2c3d4',
                'source_filename': 'statement_2024.pdf',
                'extractor_name': 'hdfc_bank_pdf',
                'extractor_version': '1.0',
                'status': 'completed',
                'error_message': None,
                'hidden': False,
                'extracted_at': '2024-01-15T10:31:00Z',
                'artifacts': [{
                    'id': 1,
                    'artifact_id': 'art_abc123',
                    'artifact_type': 'transactions',
                    'artifact_key': 'main',
                    'content_format': 'csv',
                    'content_hash': 'hash123...',
                    'row_count': 150,
                    'data_source_target': 'bank_account_transactions',
                    'transformer': 'hdfc_bank_transactions',
                    'transformation_status': 'transformed',
                    'created_at': '2024-01-15T10:31:00Z',
                    'data_source_artifacts_count': 1,
                }],
            },
            response_only=True,
        ),
    ],
    tags=['Extractions'],
)
@api_view(['GET', 'PATCH', 'DELETE'])
def extraction_detail(request, extraction_id):
    """
    GET/PATCH/DELETE /api/extractions/<id>/
    Get, update, or delete an extraction.
    """
    try:
        extraction = Extraction.objects.select_related('source_file').prefetch_related('artifacts').get(extraction_id=extraction_id)
    except Extraction.DoesNotExist:
        try:
            extraction = Extraction.objects.select_related('source_file').prefetch_related('artifacts').get(id=extraction_id)
        except Extraction.DoesNotExist:
            return JsonResponse({'error': 'Extraction not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse(_serialize_extraction(extraction, include_artifacts=True))

    elif request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        if 'hidden' in data:
            extraction.hidden = data['hidden']
            extraction.save()

        return JsonResponse(_serialize_extraction(extraction))

    elif request.method == 'DELETE':
        # Invalidate inconsistency caches since transactions may be affected
        invalidate_all_inconsistencies()
        extraction.delete()
        return JsonResponse({'success': True})


# ==================== Extraction Artifacts API ====================

@extend_schema(
    summary="Get artifact details",
    description="Retrieve extraction artifact details.",
    responses={200: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Artifact Detail',
            value={
                'id': 1,
                'artifact_id': 'art_abc123',
                'artifact_type': 'transactions',
                'artifact_key': 'main',
                'content_format': 'csv',
                'content_hash': 'hash123...',
                'row_count': 150,
                'data_source_target': 'bank_account_transactions',
                'transformer': 'hdfc_bank_transactions',
                'transformation_status': 'transformed',
                'created_at': '2024-01-15T10:31:00Z',
                'data_source_artifacts_count': 1,
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Artifacts'],
)
@api_view(['GET'])
def artifact_detail(request, artifact_id):
    """
    GET /api/extractions/artifacts/<id>/
    Get artifact details.
    """
    try:
        artifact = ExtractionArtifact.objects.select_related('extraction__source_file').get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        try:
            artifact = ExtractionArtifact.objects.select_related('extraction__source_file').get(id=artifact_id)
        except ExtractionArtifact.DoesNotExist:
            return JsonResponse({'error': 'Artifact not found'}, status=404)

    return JsonResponse(_serialize_artifact(artifact))


@extend_schema(
    summary="Preview artifact content",
    description="Preview artifact content (CSV, JSON, or text).",
    parameters=[
        OpenApiParameter(name='limit', description="Number of rows to return", required=False, type=int, default=50),
    ],
    responses={200: dict, 404: dict},
    examples=[
        OpenApiExample(
            'CSV Preview',
            value={
                'data': [
                    {'date': '2024-01-15', 'description': 'ATM Withdrawal', 'amount': '-5000.00', 'balance': '45000.00'},
                    {'date': '2024-01-16', 'description': 'Salary Credit', 'amount': '50000.00', 'balance': '95000.00'},
                ],
                'total': 150,
                'columns': ['date', 'description', 'amount', 'balance'],
                'format': 'csv',
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Artifacts'],
)
@api_view(['GET'])
def artifact_preview(request, artifact_id):
    """
    GET /api/extractions/artifacts/<id>/preview/
    Preview artifact content.

    Query params:
    - limit: int (default: 50)
    """
    try:
        artifact = ExtractionArtifact.objects.get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        try:
            artifact = ExtractionArtifact.objects.get(id=artifact_id)
        except ExtractionArtifact.DoesNotExist:
            return JsonResponse({'error': 'Artifact not found'}, status=404)

    limit = request.GET.get('limit', 50)
    try:
        limit = int(limit)
    except ValueError:
        limit = 50

    content = decompress_data(artifact.content)

    if artifact.content_format == 'csv':
        reader = csv_module.DictReader(io.StringIO(content))
        rows = []
        for i, row in enumerate(reader):
            if i >= limit:
                break
            rows.append(row)
        return JsonResponse({
            'data': rows,
            'total': artifact.row_count,
            'columns': reader.fieldnames or [],
            'format': 'csv',
        })
    elif artifact.content_format == 'json':
        try:
            data = json.loads(content)
            return JsonResponse({
                'data': data,
                'format': 'json',
            })
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON content'}, status=500)
    else:
        return JsonResponse({
            'data': content[:5000],  # Limit text preview
            'format': 'text',
        })


@extend_schema(
    summary="Transform artifact",
    description="Transform artifact to create DataSourceArtifact for loading.",
    request=dict,
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Transform Request',
            value={'bank_account_id': 1},
            request_only=True,
        ),
        OpenApiExample(
            'Transform Response',
            value={
                'success': True,
                'data_source_artifact': {
                    'id': 1,
                    'artifact_id': 'dsa_xyz789',
                    'source_artifact_id': 'art_abc123',
                    'source_artifact_type': 'transactions',
                    'source_artifact_key': 'main',
                    'source_extraction_id': 'ex_xyz789',
                    'source_filename': 'statement_2024.pdf',
                    'data_source_target': 'bank_account_transactions',
                    'content_hash': 'hash456...',
                    'row_count': 150,
                    'bank_account_id': 1,
                    'bank_account_name': 'HDFC Savings',
                    'credit_card_id': None,
                    'credit_card_name': None,
                    'transformer': 'hdfc_bank_transactions',
                    'status': 'unloaded',
                    'error_message': None,
                    'enabled': True,
                    'hidden': False,
                    'transformed_at': '2024-01-15T10:32:00Z',
                    'loaded_at': None,
                },
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Artifacts'],
)
@api_view(['POST'])
def artifact_transform(request, artifact_id):
    """
    POST /api/extractions/artifacts/<id>/transform/
    Transform a single artifact to create DataSourceArtifact.

    Request body (optional):
    - bank_account_id: int
    - credit_card_id: int
    """
    try:
        artifact = ExtractionArtifact.objects.select_related('extraction__source_file').get(artifact_id=artifact_id)
    except ExtractionArtifact.DoesNotExist:
        try:
            artifact = ExtractionArtifact.objects.select_related('extraction__source_file').get(id=artifact_id)
        except ExtractionArtifact.DoesNotExist:
            return JsonResponse({'error': 'Artifact not found'}, status=404)

    if artifact.transformation_status == 'not_applicable':
        return JsonResponse({'error': 'Artifact is not transformable'}, status=400)

    if not artifact.transformer:
        return JsonResponse({'error': 'No transformer specified for artifact'}, status=400)

    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    try:
        dsa = transform_artifact(artifact)

        # Set entity if provided
        if data.get('bank_account_id'):
            try:
                dsa.bank_account = BankAccount.objects.get(id=data['bank_account_id'])
                dsa.save()
            except BankAccount.DoesNotExist:
                pass

        if data.get('credit_card_id'):
            try:
                dsa.credit_card = CreditCard.objects.get(id=data['credit_card_id'])
                dsa.save()
            except CreditCard.DoesNotExist:
                pass

        return JsonResponse({
            'success': True,
            'data_source_artifact': _serialize_data_source_artifact(dsa),
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@extend_schema(
    summary="Bulk transform artifacts",
    description="Transform multiple artifacts to create DataSourceArtifacts.",
    request=dict,
    responses={200: dict, 400: dict},
    examples=[
        OpenApiExample(
            'Bulk Transform Request',
            value={'artifact_ids': ['art_abc123', 'art_def456'], 'bank_account_id': 1},
            request_only=True,
        ),
        OpenApiExample(
            'Bulk Transform Response',
            value={
                'results': [
                    {'artifact_id': 'art_abc123', 'success': True, 'data_source_artifact_id': 'dsa_xyz789'},
                    {'artifact_id': 'art_def456', 'success': True, 'data_source_artifact_id': 'dsa_abc012'},
                ]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Artifacts'],
)
@api_view(['POST'])
def artifact_bulk_transform(request):
    """
    POST /api/extractions/artifacts/bulk-transform/
    Bulk transform artifacts.

    Request body:
    - artifact_ids: list[str] (artifact_id values)
    - bank_account_id: int (optional, for bank artifacts)
    - credit_card_id: int (optional, for CC artifacts)
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    artifact_ids = data.get('artifact_ids', [])
    bank_account_id = data.get('bank_account_id')
    credit_card_id = data.get('credit_card_id')

    if not artifact_ids:
        return JsonResponse({'error': 'No artifact IDs provided'}, status=400)

    results = []
    for aid in artifact_ids:
        try:
            artifact = ExtractionArtifact.objects.get(artifact_id=aid)
        except ExtractionArtifact.DoesNotExist:
            results.append({'artifact_id': aid, 'success': False, 'error': 'Not found'})
            continue

        if not artifact.transformer or artifact.transformation_status == 'not_applicable':
            results.append({'artifact_id': aid, 'success': False, 'error': 'Not transformable'})
            continue

        try:
            dsa = transform_artifact(artifact)

            if bank_account_id:
                try:
                    dsa.bank_account = BankAccount.objects.get(id=bank_account_id)
                    dsa.save()
                except BankAccount.DoesNotExist:
                    pass

            if credit_card_id:
                try:
                    dsa.credit_card = CreditCard.objects.get(id=credit_card_id)
                    dsa.save()
                except CreditCard.DoesNotExist:
                    pass

            results.append({
                'artifact_id': aid,
                'success': True,
                'data_source_artifact_id': dsa.artifact_id,
            })
        except Exception as e:
            results.append({'artifact_id': aid, 'success': False, 'error': str(e)})

    return JsonResponse({'results': results})


# ==================== Data Source Artifacts API ====================

@extend_schema(
    summary="List data sources",
    description="List data source artifacts with visibility, domain, and status filtering.",
    parameters=[
        OpenApiParameter(name='visibility', description="Filter: 'visible', 'hidden', 'all'", required=False, type=str, default='visible'),
        OpenApiParameter(name='domain', description="Filter: 'bank_account_transactions', 'credit_card_transactions', 'all'", required=False, type=str, default='all'),
        OpenApiParameter(name='status', description="Filter: 'unloaded', 'loading', 'loaded', 'error', 'all'", required=False, type=str, default='all'),
    ],
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Data Sources List',
            value={
                'data': [{
                    'id': 1,
                    'artifact_id': 'dsa_xyz789',
                    'source_artifact_id': 'art_abc123',
                    'source_artifact_type': 'transactions',
                    'source_artifact_key': 'main',
                    'source_extraction_id': 'ex_xyz789',
                    'source_filename': 'statement_2024.pdf',
                    'data_source_target': 'bank_account_transactions',
                    'content_hash': 'hash456...',
                    'row_count': 150,
                    'bank_account_id': 1,
                    'bank_account_name': 'HDFC Savings',
                    'credit_card_id': None,
                    'credit_card_name': None,
                    'transformer': 'hdfc_bank_transactions',
                    'status': 'loaded',
                    'error_message': None,
                    'enabled': True,
                    'hidden': False,
                    'transformed_at': '2024-01-15T10:32:00Z',
                    'loaded_at': '2024-01-15T10:33:00Z',
                }]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['GET'])
def data_source_list(request):
    """
    GET /api/extractions/data-sources/
    List data source artifacts with visibility filter.

    Query params:
    - visibility: 'visible' (default) | 'hidden' | 'all'
    - domain: 'bank_account_transactions' | 'credit_card_transactions' | 'all'
    - status: 'unloaded' | 'loading' | 'loaded' | 'error' | 'all'
    """
    visibility = request.GET.get('visibility', 'visible')
    domain = request.GET.get('domain', 'all')
    status = request.GET.get('status', 'all')

    queryset = DataSourceArtifact.objects.select_related(
        'source_artifact__extraction__source_file',
        'bank_account',
        'credit_card',
    )

    if visibility == 'visible':
        queryset = queryset.filter(hidden=False)
    elif visibility == 'hidden':
        queryset = queryset.filter(hidden=True)

    if domain != 'all':
        queryset = queryset.filter(data_source_target=domain)

    if status != 'all':
        queryset = queryset.filter(status=status)

    artifacts = [_serialize_data_source_artifact(dsa) for dsa in queryset.order_by('-transformed_at')]
    return JsonResponse({'data': artifacts})


@extend_schema(
    summary="Bulk update data sources",
    description="Bulk update data sources: hide, unhide, enable, disable, set_bank_account, set_credit_card, load, unload, delete.",
    request=dict,
    responses={200: dict, 400: dict},
    examples=[
        OpenApiExample(
            'Bulk Update Request',
            value={'ids': [1, 2, 3], 'action': 'set_bank_account', 'value': 1},
            request_only=True,
        ),
        OpenApiExample(
            'Bulk Update Response',
            value={'success': True, 'updated_count': 3},
            response_only=True,
        ),
        OpenApiExample(
            'Bulk Load Response',
            value={
                'results': [
                    {'id': 1, 'artifact_id': 'dsa_xyz789', 'success': True, 'count': 150, 'error': None},
                    {'id': 2, 'artifact_id': 'dsa_abc012', 'success': True, 'count': 200, 'error': None},
                ]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['POST'])
def data_source_bulk_update(request):
    """
    POST /api/extractions/data-sources/bulk-update/
    Bulk update data source artifacts.

    Request body:
    - ids: list[int]
    - action: 'hide' | 'unhide' | 'enable' | 'disable' | 'set_bank_account' | 'set_credit_card' | 'load' | 'unload' | 'delete'
    - value: int (for set_bank_account/set_credit_card)
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    ids = data.get('ids', [])
    action = data.get('action')
    value = data.get('value')

    if not ids:
        return JsonResponse({'error': 'No IDs provided'}, status=400)

    queryset = DataSourceArtifact.objects.filter(id__in=ids)

    if action == 'hide':
        queryset.update(hidden=True)
    elif action == 'unhide':
        queryset.update(hidden=False)
    elif action == 'enable':
        queryset.update(enabled=True)
    elif action == 'disable':
        queryset.update(enabled=False)
    elif action == 'set_bank_account':
        if value:
            try:
                account = BankAccount.objects.get(id=value)
                queryset.update(bank_account=account, credit_card=None)
            except BankAccount.DoesNotExist:
                return JsonResponse({'error': 'Bank account not found'}, status=400)
        else:
            queryset.update(bank_account=None)
    elif action == 'set_credit_card':
        if value:
            try:
                card = CreditCard.objects.get(id=value)
                queryset.update(credit_card=card, bank_account=None)
            except CreditCard.DoesNotExist:
                return JsonResponse({'error': 'Credit card not found'}, status=400)
        else:
            queryset.update(credit_card=None)
    elif action == 'load':
        results = []
        for dsa in queryset:
            count, error = load_artifact(dsa)
            results.append({
                'id': dsa.id,
                'artifact_id': dsa.artifact_id,
                'success': error is None,
                'count': count,
                'error': error,
            })
        return JsonResponse({'results': results})
    elif action == 'unload':
        results = []
        for dsa in queryset:
            count, error = unload_artifact(dsa)
            results.append({
                'id': dsa.id,
                'artifact_id': dsa.artifact_id,
                'success': error is None,
                'count': count,
                'error': error,
            })
        return JsonResponse({'results': results})
    elif action == 'delete':
        results = []
        for dsa in queryset:
            success, error = delete_artifact(dsa)
            results.append({
                'id': dsa.id,
                'success': success,
                'error': error,
            })
        return JsonResponse({'results': results})
    else:
        return JsonResponse({'error': f'Unknown action: {action}'}, status=400)

    return JsonResponse({'success': True, 'updated_count': queryset.count()})


@extend_schema(
    summary="Get, update, or delete data source",
    description="GET: Retrieve data source. PATCH: Update enabled, hidden, bank_account_id, credit_card_id. DELETE: Delete data source.",
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Data Source Detail',
            value={
                'id': 1,
                'artifact_id': 'dsa_xyz789',
                'source_artifact_id': 'art_abc123',
                'source_artifact_type': 'transactions',
                'source_artifact_key': 'main',
                'source_extraction_id': 'ex_xyz789',
                'source_filename': 'statement_2024.pdf',
                'data_source_target': 'bank_account_transactions',
                'content_hash': 'hash456...',
                'row_count': 150,
                'bank_account_id': 1,
                'bank_account_name': 'HDFC Savings',
                'credit_card_id': None,
                'credit_card_name': None,
                'transformer': 'hdfc_bank_transactions',
                'status': 'loaded',
                'error_message': None,
                'enabled': True,
                'hidden': False,
                'transformed_at': '2024-01-15T10:32:00Z',
                'loaded_at': '2024-01-15T10:33:00Z',
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['GET', 'PATCH', 'DELETE'])
def data_source_detail(request, artifact_id):
    """
    GET/PATCH/DELETE /api/extractions/data-sources/<id>/
    Get, update, or delete a data source artifact.
    """
    try:
        dsa = DataSourceArtifact.objects.select_related(
            'source_artifact__extraction__source_file',
            'bank_account',
            'credit_card',
        ).get(artifact_id=artifact_id)
    except DataSourceArtifact.DoesNotExist:
        try:
            dsa = DataSourceArtifact.objects.select_related(
                'source_artifact__extraction__source_file',
                'bank_account',
                'credit_card',
            ).get(id=artifact_id)
        except DataSourceArtifact.DoesNotExist:
            return JsonResponse({'error': 'Data source artifact not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse(_serialize_data_source_artifact(dsa))

    elif request.method == 'PATCH':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        needs_cache_invalidation = False
        if 'enabled' in data:
            dsa.enabled = data['enabled']
            needs_cache_invalidation = True
        if 'hidden' in data:
            dsa.hidden = data['hidden']
            needs_cache_invalidation = True
        if 'bank_account_id' in data:
            if data['bank_account_id']:
                try:
                    dsa.bank_account = BankAccount.objects.get(id=data['bank_account_id'])
                    dsa.credit_card = None
                except BankAccount.DoesNotExist:
                    return JsonResponse({'error': 'Bank account not found'}, status=400)
            else:
                dsa.bank_account = None
        if 'credit_card_id' in data:
            if data['credit_card_id']:
                try:
                    dsa.credit_card = CreditCard.objects.get(id=data['credit_card_id'])
                    dsa.bank_account = None
                except CreditCard.DoesNotExist:
                    return JsonResponse({'error': 'Credit card not found'}, status=400)
            else:
                dsa.credit_card = None

        dsa.save()

        # Invalidate caches if visibility changed
        if needs_cache_invalidation:
            invalidate_all_inconsistencies()

        return JsonResponse(_serialize_data_source_artifact(dsa))

    elif request.method == 'DELETE':
        success, error = delete_artifact(dsa)
        if success:
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': error}, status=400)


@extend_schema(
    summary="Load data source",
    description="Load data source artifact into transactions table.",
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Load Success Response',
            value={
                'success': True,
                'count': 150,
                'data_source_artifact': {
                    'id': 1,
                    'artifact_id': 'dsa_xyz789',
                    'source_artifact_id': 'art_abc123',
                    'source_artifact_type': 'transactions',
                    'source_artifact_key': 'main',
                    'source_extraction_id': 'ex_xyz789',
                    'source_filename': 'statement_2024.pdf',
                    'data_source_target': 'bank_account_transactions',
                    'content_hash': 'hash456...',
                    'row_count': 150,
                    'bank_account_id': 1,
                    'bank_account_name': 'HDFC Savings',
                    'credit_card_id': None,
                    'credit_card_name': None,
                    'transformer': 'hdfc_bank_transactions',
                    'status': 'loaded',
                    'error_message': None,
                    'enabled': True,
                    'hidden': False,
                    'transformed_at': '2024-01-15T10:32:00Z',
                    'loaded_at': '2024-01-15T10:33:00Z',
                },
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['POST'])
def data_source_load(request, artifact_id):
    """
    POST /api/extractions/data-sources/<id>/load/
    Load a data source artifact into transactions.
    """
    try:
        dsa = DataSourceArtifact.objects.get(artifact_id=artifact_id)
    except DataSourceArtifact.DoesNotExist:
        try:
            dsa = DataSourceArtifact.objects.get(id=artifact_id)
        except DataSourceArtifact.DoesNotExist:
            return JsonResponse({'error': 'Data source artifact not found'}, status=404)

    count, error = load_artifact(dsa)
    if error:
        return JsonResponse({'success': False, 'error': error}, status=400)

    return JsonResponse({
        'success': True,
        'count': count,
        'data_source_artifact': _serialize_data_source_artifact(dsa),
    })


@extend_schema(
    summary="Unload data source",
    description="Unload data source artifact (delete transactions, keep artifact).",
    responses={200: dict, 400: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Unload Success Response',
            value={
                'success': True,
                'count': 150,
                'data_source_artifact': {
                    'id': 1,
                    'artifact_id': 'dsa_xyz789',
                    'source_artifact_id': 'art_abc123',
                    'source_artifact_type': 'transactions',
                    'source_artifact_key': 'main',
                    'source_extraction_id': 'ex_xyz789',
                    'source_filename': 'statement_2024.pdf',
                    'data_source_target': 'bank_account_transactions',
                    'content_hash': 'hash456...',
                    'row_count': 150,
                    'bank_account_id': 1,
                    'bank_account_name': 'HDFC Savings',
                    'credit_card_id': None,
                    'credit_card_name': None,
                    'transformer': 'hdfc_bank_transactions',
                    'status': 'unloaded',
                    'error_message': None,
                    'enabled': True,
                    'hidden': False,
                    'transformed_at': '2024-01-15T10:32:00Z',
                    'loaded_at': None,
                },
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['POST'])
def data_source_unload(request, artifact_id):
    """
    POST /api/extractions/data-sources/<id>/unload/
    Unload a data source artifact (delete transactions, keep artifact).
    """
    try:
        dsa = DataSourceArtifact.objects.get(artifact_id=artifact_id)
    except DataSourceArtifact.DoesNotExist:
        try:
            dsa = DataSourceArtifact.objects.get(id=artifact_id)
        except DataSourceArtifact.DoesNotExist:
            return JsonResponse({'error': 'Data source artifact not found'}, status=404)

    count, error = unload_artifact(dsa)
    if error:
        return JsonResponse({'success': False, 'error': error}, status=400)

    dsa.refresh_from_db()
    return JsonResponse({
        'success': True,
        'count': count,
        'data_source_artifact': _serialize_data_source_artifact(dsa),
    })


@extend_schema(
    summary="Preview data source content",
    description="Preview data source artifact content as CSV.",
    parameters=[
        OpenApiParameter(name='limit', description="Number of rows to return", required=False, type=int, default=50),
    ],
    responses={200: dict, 404: dict},
    examples=[
        OpenApiExample(
            'Data Source Preview',
            value={
                'data': [
                    {'date': '2024-01-15', 'description': 'ATM Withdrawal', 'withdrawal_amount': '5000.00', 'deposit_amount': '', 'balance': '45000.00'},
                    {'date': '2024-01-16', 'description': 'Salary Credit', 'withdrawal_amount': '', 'deposit_amount': '50000.00', 'balance': '95000.00'},
                ],
                'total': 150,
                'columns': ['date', 'description', 'withdrawal_amount', 'deposit_amount', 'balance'],
                'format': 'csv',
            },
            response_only=True,
        ),
    ],
    tags=['Extractions - Data Sources'],
)
@api_view(['GET'])
def data_source_preview(request, artifact_id):
    """
    GET /api/extractions/data-sources/<id>/preview/
    Preview data source artifact content.

    Query params:
    - limit: int (default: 50)
    """
    try:
        dsa = DataSourceArtifact.objects.get(artifact_id=artifact_id)
    except DataSourceArtifact.DoesNotExist:
        try:
            dsa = DataSourceArtifact.objects.get(id=artifact_id)
        except DataSourceArtifact.DoesNotExist:
            return JsonResponse({'error': 'Data source artifact not found'}, status=404)

    limit = request.GET.get('limit', 50)
    try:
        limit = int(limit)
    except ValueError:
        limit = 50

    content = decompress_data(dsa.content)

    # Data source artifacts always store CSV
    reader = csv_module.DictReader(io.StringIO(content))
    rows = []
    for i, row in enumerate(reader):
        if i >= limit:
            break
        rows.append(row)

    return JsonResponse({
        'data': rows,
        'total': dsa.row_count,
        'columns': reader.fieldnames or [],
        'format': 'csv',
    })


# ==================== Utility Endpoints ====================

@extend_schema(
    summary="List extractors",
    description="List available extractors with their version, domain, and supported extensions.",
    responses={200: dict},
    examples=[
        OpenApiExample(
            'Extractors List',
            value={
                'data': [
                    {
                        'name': 'hdfc_bank_pdf',
                        'version': '1.0',
                        'domain': 'bank_account',
                        'supported_extensions': ['.pdf'],
                    },
                    {
                        'name': 'sbi_bank_excel',
                        'version': '1.0',
                        'domain': 'bank_account',
                        'supported_extensions': ['.xlsx', '.xls'],
                    },
                    {
                        'name': 'hdfc_cc_pdf',
                        'version': '1.0',
                        'domain': 'credit_card',
                        'supported_extensions': ['.pdf'],
                    },
                ]
            },
            response_only=True,
        ),
    ],
    tags=['Extractions'],
)
@api_view(['GET'])
def extractor_list(request):
    """
    GET /api/extractions/extractors/
    List available extractors.
    """
    extractors = []
    for name, cls in EXTRACTORS.items():
        extractors.append({
            'name': name,
            'version': cls.version,
            'domain': cls.domain,
            'supported_extensions': cls.supported_extensions,
        })
    return JsonResponse({'data': extractors})


# =============================================================================
# Transaction Resolution API Views
# =============================================================================

from .models import (
    ResolvedTransaction,
    OverlappingSourceGroup,
    ResolutionSession,
    ResolutionSuggestion,
)


def _serialize_overlapping_group(group):
    """Serialize an OverlappingSourceGroup to dict."""
    # Get active session if exists (in-progress)
    active_session = group.sessions.exclude(status__in=['completed', 'cancelled']).first()
    # Get completed session if exists
    completed_session = group.sessions.filter(status='completed').order_by('-completed_at').first()

    return {
        'id': group.id,
        'group_id': group.group_id,
        'name': group.name,
        'resolution_status': group.resolution_status,
        'bank_account_id': group.bank_account_id,
        'credit_card_id': group.credit_card_id,
        'artifact_count': group.data_source_artifacts.count(),
        'artifacts': [
            {
                'artifact_id': a.artifact_id,
                'filename': a.source_artifact.extraction.source_file.filename if a.source_artifact else None,
                'row_count': a.row_count,
            }
            for a in group.data_source_artifacts.all()
        ],
        'active_session_id': active_session.session_id if active_session else None,
        'completed_session_id': completed_session.session_id if completed_session else None,
        'created_at': group.created_at.isoformat() if group.created_at else None,
        'updated_at': group.updated_at.isoformat() if group.updated_at else None,
    }


def _serialize_resolved_transaction(resolved, include_sources=True):
    """Serialize a ResolvedTransaction to dict."""
    result = {
        'id': resolved.id,
        'uuid': str(resolved.uuid),
        'short_id': resolved.short_id,
        'transaction_type': resolved.transaction_type,
        'primary_transaction_id': resolved.primary_transaction_id,
        'date': resolved.date.isoformat() if resolved.date else None,
        'amount': str(resolved.amount),
        'bank_account_id': resolved.bank_account_id,
        'credit_card_id': resolved.credit_card_id,
        'source_count': resolved.source_count,
        'created_at': resolved.created_at.isoformat() if resolved.created_at else None,
    }

    if include_sources:
        if resolved.transaction_type == 'bank':
            sources = []
            for txn in resolved.bank_transactions.all():
                sources.append({
                    'id': txn.id,
                    'narration': txn.narration,
                    'reference_number': txn.reference_number,
                    'value_date': txn.value_date.isoformat() if txn.value_date else None,
                    'closing_balance': str(txn.closing_balance),
                    'is_primary': txn.is_primary,
                    'source_file': txn.data_source_artifact.source_artifact.extraction.source_file.filename if txn.data_source_artifact and txn.data_source_artifact.source_artifact else None,
                })
            result['sources'] = sources
        else:
            sources = []
            for txn in resolved.credit_card_transactions.all():
                sources.append({
                    'id': txn.id,
                    'description': txn.description,
                    'is_primary': txn.is_primary,
                    'source_file': txn.data_source_artifact.source_artifact.extraction.source_file.filename if txn.data_source_artifact and txn.data_source_artifact.source_artifact else None,
                })
            result['sources'] = sources

        # Aggregated linkages
        result['stories'] = [{'id': s.id, 'name': s.name, 'icon': s.icon} for s in resolved.get_stories()]
        result['entities'] = [{'id': e.id, 'name': e.name, 'icon': e.icon} for e in resolved.get_entities()]

        # Linked transaction
        linked = resolved.get_linked_resolved_transaction()
        if linked:
            result['linked_resolved_transaction'] = {
                'uuid': str(linked.uuid),
                'short_id': linked.short_id,
                'date': linked.date.isoformat() if linked.date else None,
                'amount': str(linked.amount),
            }
        else:
            result['linked_resolved_transaction'] = None

    return result


@api_view(['GET', 'POST'])
def overlapping_group_list_create(request):
    """
    GET /api/sources/overlapping-groups/?bank_account_id=X or credit_card_id=X
    List overlapping groups for an account.

    POST /api/sources/overlapping-groups/
    Create a new overlapping group.
    """
    if request.method == 'GET':
        bank_account_id = request.GET.get('bank_account_id')
        credit_card_id = request.GET.get('credit_card_id')

        groups = OverlappingSourceGroup.objects.all()
        if bank_account_id:
            groups = groups.filter(bank_account_id=bank_account_id)
        if credit_card_id:
            groups = groups.filter(credit_card_id=credit_card_id)

        return JsonResponse({'groups': [_serialize_overlapping_group(g) for g in groups]})

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        artifact_ids = data.get('artifact_ids', [])
        name = data.get('name', 'Untitled Group')

        if len(artifact_ids) < 2:
            return JsonResponse({'error': 'At least 2 artifacts required'}, status=400)

        # Fetch artifacts
        artifacts = list(DataSourceArtifact.objects.filter(artifact_id__in=artifact_ids))
        if len(artifacts) != len(artifact_ids):
            return JsonResponse({'error': 'Some artifacts not found'}, status=404)

        # Validate all same account
        bank_accounts = set(a.bank_account_id for a in artifacts if a.bank_account_id)
        credit_cards = set(a.credit_card_id for a in artifacts if a.credit_card_id)

        if len(bank_accounts) > 1 or len(credit_cards) > 1:
            return JsonResponse({'error': 'All artifacts must be for the same account'}, status=400)

        if bank_accounts and credit_cards:
            return JsonResponse({'error': 'Cannot mix bank and credit card artifacts'}, status=400)

        # Create group
        group = OverlappingSourceGroup.objects.create(
            name=name,
            bank_account_id=list(bank_accounts)[0] if bank_accounts else None,
            credit_card_id=list(credit_cards)[0] if credit_cards else None,
        )
        group.data_source_artifacts.add(*artifacts)

        return JsonResponse(_serialize_overlapping_group(group), status=201)


def _cleanup_group_resolved_transactions(group):
    """Unmerge resolved transactions and route links back to individual transactions."""
    from django.db import IntegrityError, transaction

    is_bank = group.bank_account_id is not None
    if is_bank:
        from bank_accounts.models import BankTransaction
        TxnModel = BankTransaction
    else:
        from credit_cards.models import CreditCardTransaction
        TxnModel = CreditCardTransaction

    resolved_ids = set()
    for session in group.sessions.filter(status='completed'):
        for suggestion in session.suggestions.filter(status='confirmed'):
            txn_ids = [t['id'] for t in suggestion.confirmed_transaction_ids or suggestion.suggested_transaction_ids]
            txns = TxnModel.objects.filter(id__in=txn_ids, resolved_transaction__isnull=False)
            resolved_ids.update(txns.values_list('resolved_transaction_id', flat=True))

    if not resolved_ids:
        return

    from links.models import CategoryLink, StoryLink, EntityLink, SelfTransferLink, CreditCardPaymentLink

    for merged_rt in ResolvedTransaction.objects.filter(id__in=resolved_ids):
        with transaction.atomic():
            source_txns = list(TxnModel.objects.filter(resolved_transaction=merged_rt))
            if not source_txns:
                merged_rt.delete()
                continue

            # Create individual RTs for each source transaction
            txn_to_new_rt = {}
            primary_new_rt = None
            for txn in source_txns:
                new_rt = ResolvedTransaction.objects.create(
                    transaction_type='bank' if is_bank else 'credit_card',
                    primary_transaction_id=txn.id,
                    date=txn.date,
                    amount=(txn.credit_amount - txn.debit_amount) if is_bank else txn.amount,
                    bank_account_id=group.bank_account_id,
                    credit_card_id=group.credit_card_id,
                )
                txn.resolved_transaction = new_rt
                txn.is_primary = True
                txn.save()
                txn_to_new_rt[txn.id] = new_rt.id
                if txn.id == merged_rt.primary_transaction_id:
                    primary_new_rt = new_rt.id

            if primary_new_rt is None:
                primary_new_rt = txn_to_new_rt[source_txns[0].id]

            # Route CategoryLink by origin_transaction_id
            for link in CategoryLink.objects.filter(resolved_transaction=merged_rt):
                target_rt = txn_to_new_rt.get(link.origin_transaction_id, primary_new_rt)
                link.resolved_transaction_id = target_rt
                link.save()

            # Route StoryLink by origin_transaction_id (unique_together on resolved_transaction + story)
            for link in StoryLink.objects.filter(resolved_transaction=merged_rt):
                target_rt = txn_to_new_rt.get(link.origin_transaction_id, primary_new_rt)
                link.resolved_transaction_id = target_rt
                try:
                    with transaction.atomic():
                        link.save()
                except IntegrityError:
                    link.delete()

            # Route EntityLink by origin_transaction_id (unique_together on resolved_transaction + entity)
            for link in EntityLink.objects.filter(resolved_transaction=merged_rt):
                target_rt = txn_to_new_rt.get(link.origin_transaction_id, primary_new_rt)
                link.resolved_transaction_id = target_rt
                try:
                    with transaction.atomic():
                        link.save()
                except IntegrityError:
                    link.delete()

            # Route SelfTransferLink sides independently
            for stl in SelfTransferLink.objects.filter(resolved_transaction_a=merged_rt):
                stl.resolved_transaction_a_id = txn_to_new_rt.get(stl.origin_transaction_id_a, primary_new_rt)
                stl.save()
            for stl in SelfTransferLink.objects.filter(resolved_transaction_b=merged_rt):
                stl.resolved_transaction_b_id = txn_to_new_rt.get(stl.origin_transaction_id_b, primary_new_rt)
                stl.save()

            # Route CreditCardPaymentLink sides independently
            for cpl in CreditCardPaymentLink.objects.filter(bank_resolved_transaction=merged_rt):
                cpl.bank_resolved_transaction_id = txn_to_new_rt.get(cpl.origin_bank_transaction_id, primary_new_rt)
                cpl.save()
            for cpl in CreditCardPaymentLink.objects.filter(cc_resolved_transaction=merged_rt):
                cpl.cc_resolved_transaction_id = txn_to_new_rt.get(cpl.origin_cc_transaction_id, primary_new_rt)
                cpl.save()

            # Safe to delete — all links rerouted, all txns re-pointed
            merged_rt.delete()


@api_view(['GET', 'DELETE'])
def overlapping_group_detail(request, group_id):
    """
    GET /api/sources/overlapping-groups/{group_id}/
    Get overlapping group details.

    DELETE /api/sources/overlapping-groups/{group_id}/
    Delete an overlapping group (only if pending).
    """
    try:
        group = OverlappingSourceGroup.objects.get(group_id=group_id)
    except OverlappingSourceGroup.DoesNotExist:
        return JsonResponse({'error': 'Group not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse(_serialize_overlapping_group(group))

    elif request.method == 'DELETE':
        if group.resolution_status == 'completed':
            _cleanup_group_resolved_transactions(group)
        group.delete()  # cascades to sessions + suggestions
        return JsonResponse({}, status=204)


@api_view(['POST'])
def overlapping_group_resolve(request, group_id):
    """
    POST /api/sources/overlapping-groups/{group_id}/resolve/
    Start a resolution session for this group.
    """
    try:
        group = OverlappingSourceGroup.objects.get(group_id=group_id)
    except OverlappingSourceGroup.DoesNotExist:
        return JsonResponse({'error': 'Group not found'}, status=404)

    if group.resolution_status == 'completed':
        return JsonResponse({'error': 'Group already resolved'}, status=400)

    # Create session
    session = ResolutionSession.objects.create(overlapping_group=group)
    group.resolution_status = 'in_progress'
    group.save()

    return JsonResponse({
        'session_id': session.session_id,
        'status': session.status,
    }, status=201)


@api_view(['GET'])
def resolution_session_detail(request, session_id):
    """
    GET /api/transactions/resolve/{session_id}/
    Get resolution session details.
    """
    try:
        session = ResolutionSession.objects.get(session_id=session_id)
    except ResolutionSession.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)

    return JsonResponse({
        'session_id': session.session_id,
        'status': session.status,
        'stats': session.stats,
        'group_id': session.overlapping_group.group_id,
        'created_at': session.created_at.isoformat() if session.created_at else None,
    })


@api_view(['POST'])
def resolution_session_suggest(request, session_id):
    """
    POST /api/transactions/resolve/{session_id}/suggest/
    Generate match suggestions for the session.
    """
    try:
        session = ResolutionSession.objects.get(session_id=session_id)
    except ResolutionSession.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)

    group = session.overlapping_group

    # Get all transactions from the artifacts in this group
    if group.bank_account_id:
        from bank_accounts.models import BankTransaction
        transactions = list(BankTransaction.objects.filter(
            data_source_artifact__in=group.data_source_artifacts.all()
        ).select_related('data_source_artifact'))
        txn_type = 'bank'
    else:
        from credit_cards.models import CreditCardTransaction
        transactions = list(CreditCardTransaction.objects.filter(
            data_source_artifact__in=group.data_source_artifacts.all()
        ).select_related('data_source_artifact'))
        txn_type = 'credit_card'

    # Group by date + amount
    from collections import defaultdict
    groups_by_key = defaultdict(list)
    for txn in transactions:
        if txn_type == 'bank':
            key = (txn.date, txn.debit_amount - txn.credit_amount, txn.closing_balance)
        else:
            key = (txn.date, txn.amount)
        groups_by_key[key].append(txn)

    # Precompute neighbor balances per source for tiebreaking
    # When multiple transactions share the same (date, amount, closing_balance),
    # we use the closing_balance of contiguous prev/next rows to disambiguate.
    # See docs/RESOLUTION-NEIGHBOR-TIEBREAKER.md for a real example.
    neighbor_balances = {}  # txn.id -> (prev_bal, next_bal)
    if txn_type == 'bank':
        txns_by_source = defaultdict(list)
        for txn in transactions:
            txns_by_source[txn.data_source_artifact_id].append(txn)
        for source_id, source_txns in txns_by_source.items():
            source_txns.sort(key=lambda t: t.row_number)
            for i, t in enumerate(source_txns):
                prev_bal = source_txns[i-1].closing_balance if i > 0 and source_txns[i-1].row_number == t.row_number - 1 else None
                next_bal = source_txns[i+1].closing_balance if i < len(source_txns)-1 and source_txns[i+1].row_number == t.row_number + 1 else None
                neighbor_balances[t.id] = (prev_bal, next_bal)

    def _create_suggestion(match_candidates, balance_match, neighbor_match=False):
        score = 1.0 if balance_match else 0.7
        if balance_match and neighbor_match:
            score = 0.95
        return ResolutionSuggestion.objects.create(
            session=session,
            suggested_transaction_ids=[{'type': txn_type, 'id': t.id} for t in match_candidates],
            suggestion_score=score,
            match_signals={
                'date': True,
                'amount': True,
                'closing_balance': balance_match,
                'neighbor_balance': neighbor_match,
            }
        )

    def _create_paired_suggestions(by_source_dict, balance_match, neighbor_match=False):
        """Pair transactions across sources by index (sorted by row_number).
        Creates min(N, M, ...) suggestions for N:M:... mappings."""
        count = 0
        sorted_lists = [sorted(v, key=lambda t: t.row_number) for v in by_source_dict.values()]
        pair_count = min(len(sl) for sl in sorted_lists)
        for i in range(pair_count):
            match_candidates = [sl[i] for sl in sorted_lists]
            _create_suggestion(match_candidates, balance_match, neighbor_match)
            count += 1
        return count

    # Create suggestions for groups with multiple transactions FROM DIFFERENT SOURCES
    suggestions_created = 0
    for key, txns in groups_by_key.items():
        if len(txns) > 1:
            # Group transactions by their source artifact
            by_source = defaultdict(list)
            for t in txns:
                source_id = t.data_source_artifact_id if t.data_source_artifact_id else 'unknown'
                by_source[source_id].append(t)

            # Only create suggestion if transactions come from DIFFERENT sources
            if len(by_source) < 2:
                continue

            # Check if this is a simple 1:1 mapping (one txn per source)
            is_one_to_one = all(len(v) == 1 for v in by_source.values())

            if is_one_to_one:
                match_candidates = [v[0] for v in by_source.values()]
                balance_match = False
                if txn_type == 'bank':
                    balances = [t.closing_balance for t in match_candidates]
                    if all(b is not None for b in balances):
                        balance_match = len(set(balances)) == 1
                _create_suggestion(match_candidates, balance_match)
                suggestions_created += 1
            elif txn_type == 'bank' and neighbor_balances:
                # N:M case — refine using neighbor balances as tiebreaker
                refined = defaultdict(lambda: defaultdict(list))
                for src_id, src_txns in by_source.items():
                    for t in src_txns:
                        nb = neighbor_balances.get(t.id, (None, None))
                        refined[nb][src_id].append(t)

                for nb_key, nb_by_source in refined.items():
                    if len(nb_by_source) < 2:
                        continue
                    suggestions_created += _create_paired_suggestions(
                        nb_by_source, balance_match=True, neighbor_match=True
                    )
            else:
                # Fallback: pair by row_number order
                balance_match = False
                if txn_type == 'bank':
                    sample = [v[0] for v in by_source.values()]
                    balances = [t.closing_balance for t in sample]
                    if all(b is not None for b in balances):
                        balance_match = len(set(balances)) == 1
                suggestions_created += _create_paired_suggestions(
                    by_source, balance_match
                )

    session.status = 'review'
    session.stats = {
        'total_transactions': len(transactions),
        'suggestions_created': suggestions_created,
        'unmatched': len([g for g in groups_by_key.values() if len(g) == 1]),
    }
    session.save()

    return JsonResponse({
        'session_id': session.session_id,
        'status': session.status,
        'stats': session.stats,
    })


@api_view(['GET'])
def resolution_session_review(request, session_id):
    """
    GET /api/transactions/resolve/{session_id}/review/
    Get suggestions for review with transaction details.
    """
    try:
        session = ResolutionSession.objects.get(session_id=session_id)
    except ResolutionSession.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)

    group = session.overlapping_group
    is_bank = group.bank_account_id is not None

    # Preload transactions
    if is_bank:
        from bank_accounts.models import BankTransaction
        all_txn_ids = []
        for s in session.suggestions.all():
            for t in s.suggested_transaction_ids:
                if t['type'] == 'bank':
                    all_txn_ids.append(t['id'])
        txn_map = {t.id: t for t in BankTransaction.objects.filter(id__in=all_txn_ids).select_related(
            'data_source_artifact__source_artifact__extraction__source_file'
        )}
    else:
        from credit_cards.models import CreditCardTransaction
        all_txn_ids = []
        for s in session.suggestions.all():
            for t in s.suggested_transaction_ids:
                if t['type'] == 'credit_card':
                    all_txn_ids.append(t['id'])
        txn_map = {t.id: t for t in CreditCardTransaction.objects.filter(id__in=all_txn_ids).select_related(
            'data_source_artifact__source_artifact__extraction__source_file'
        )}

    def get_source_filename(txn):
        """Get filename from nested relationship."""
        try:
            if txn.data_source_artifact and txn.data_source_artifact.source_artifact:
                return txn.data_source_artifact.source_artifact.extraction.source_file.filename
        except AttributeError:
            pass
        return None

    suggestions = []
    for s in session.suggestions.all():
        # Build transaction details
        transactions = []
        for t in s.suggested_transaction_ids:
            txn = txn_map.get(t['id'])
            if txn:
                if is_bank:
                    transactions.append({
                        'id': txn.id,
                        'type': 'bank',
                        'date': txn.date.isoformat() if txn.date else None,
                        'narration': txn.narration,
                        'amount': float(txn.debit_amount - txn.credit_amount),
                        'reference': txn.reference_number,
                        'source_file': get_source_filename(txn),
                    })
                else:
                    transactions.append({
                        'id': txn.id,
                        'type': 'credit_card',
                        'date': txn.date.isoformat() if txn.date else None,
                        'narration': txn.description,
                        'amount': float(txn.amount),
                        'reference': None,
                        'source_file': get_source_filename(txn),
                    })

        suggestions.append({
            'id': s.id,
            'suggested_transaction_ids': s.suggested_transaction_ids,
            'transactions': transactions,
            'suggestion_score': s.suggestion_score,
            'match_signals': s.match_signals,
            'status': s.status,
            'confirmed_primary_id': s.confirmed_primary_id,
        })

    return JsonResponse({
        'session_id': session.session_id,
        'status': session.status,
        'suggestions': suggestions,
    })


@api_view(['POST'])
def resolution_session_confirm(request, session_id):
    """
    POST /api/transactions/resolve/{session_id}/confirm-group/
    Confirm a suggestion with selected primary.
    For completed sessions, also updates the underlying resolved transaction.
    """
    try:
        session = ResolutionSession.objects.get(session_id=session_id)
    except ResolutionSession.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    suggestion_id = data.get('suggestion_id')
    primary_id = data.get('primary_transaction_id')

    try:
        suggestion = ResolutionSuggestion.objects.get(id=suggestion_id, session=session)
    except ResolutionSuggestion.DoesNotExist:
        return JsonResponse({'error': 'Suggestion not found'}, status=404)

    suggestion.status = 'confirmed'
    suggestion.confirmed_primary_id = primary_id
    suggestion.confirmed_transaction_ids = suggestion.suggested_transaction_ids
    suggestion.save()

    # For completed sessions, also update the actual resolved transaction primary
    if session.status == 'completed' and primary_id:
        group = session.overlapping_group
        is_bank = group.bank_account_id is not None

        if is_bank:
            from bank_accounts.models import BankTransaction
            # Find the resolved transaction that contains this primary
            try:
                txn = BankTransaction.objects.get(id=primary_id)
                if txn.resolved_transaction:
                    # Update is_primary flags
                    txn.resolved_transaction.bank_transactions.update(is_primary=False)
                    BankTransaction.objects.filter(id=primary_id).update(is_primary=True)
            except BankTransaction.DoesNotExist:
                pass
        else:
            from credit_cards.models import CreditCardTransaction
            try:
                txn = CreditCardTransaction.objects.get(id=primary_id)
                if txn.resolved_transaction:
                    txn.resolved_transaction.credit_card_transactions.update(is_primary=False)
                    CreditCardTransaction.objects.filter(id=primary_id).update(is_primary=True)
            except CreditCardTransaction.DoesNotExist:
                pass

    return JsonResponse({'status': 'confirmed'})


@api_view(['POST'])
def resolution_session_execute(request, session_id):
    """
    POST /api/transactions/resolve/{session_id}/execute/
    Execute the resolution - create ResolvedTransaction records.
    """
    try:
        session = ResolutionSession.objects.get(session_id=session_id)
    except ResolutionSession.DoesNotExist:
        return JsonResponse({'error': 'Session not found'}, status=404)

    group = session.overlapping_group
    is_bank = group.bank_account_id is not None

    if is_bank:
        from bank_accounts.models import BankTransaction
        TxnModel = BankTransaction
    else:
        from credit_cards.models import CreditCardTransaction
        TxnModel = CreditCardTransaction

    session.status = 'executing'
    session.save()

    resolved_created = 0

    # Process confirmed suggestions
    for suggestion in session.suggestions.filter(status='confirmed'):
        txn_ids = [t['id'] for t in suggestion.confirmed_transaction_ids or suggestion.suggested_transaction_ids]
        primary_id = suggestion.confirmed_primary_id or txn_ids[0]

        transactions = list(TxnModel.objects.filter(id__in=txn_ids))
        if not transactions:
            continue

        primary_txn = next((t for t in transactions if t.id == primary_id), transactions[0])
        old_resolved_ids = set(t.resolved_transaction_id for t in transactions if t.resolved_transaction_id)

        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank' if is_bank else 'credit_card',
            primary_transaction_id=primary_id,
            date=primary_txn.date,
            amount=primary_txn.amount if not is_bank else (primary_txn.credit_amount - primary_txn.debit_amount),
            bank_account_id=group.bank_account_id,
            credit_card_id=group.credit_card_id,
        )

        for txn in transactions:
            txn.resolved_transaction = resolved
            txn.is_primary = (txn.id == primary_id)
            txn.save()

        try:
            from links.models import CategoryLink, StoryLink, EntityLink, SelfTransferLink, CreditCardPaymentLink
            for old_rid in old_resolved_ids:
                if old_rid == resolved.id:
                    continue
                CategoryLink.objects.filter(resolved_transaction_id=old_rid).update(resolved_transaction_id=resolved.id)
                for sl in StoryLink.objects.filter(resolved_transaction_id=old_rid):
                    if not StoryLink.objects.filter(resolved_transaction_id=resolved.id, story_id=sl.story_id).exists():
                        sl.resolved_transaction_id = resolved.id
                        sl.save()
                    else:
                        sl.delete()
                for el in EntityLink.objects.filter(resolved_transaction_id=old_rid):
                    if not EntityLink.objects.filter(resolved_transaction_id=resolved.id, entity_id=el.entity_id).exists():
                        el.resolved_transaction_id = resolved.id
                        el.save()
                    else:
                        el.delete()
                SelfTransferLink.objects.filter(resolved_transaction_a_id=old_rid).update(resolved_transaction_a_id=resolved.id)
                SelfTransferLink.objects.filter(resolved_transaction_b_id=old_rid).update(resolved_transaction_b_id=resolved.id)
                CreditCardPaymentLink.objects.filter(bank_resolved_transaction_id=old_rid).update(bank_resolved_transaction_id=resolved.id)
                CreditCardPaymentLink.objects.filter(cc_resolved_transaction_id=old_rid).update(cc_resolved_transaction_id=resolved.id)
        except ImportError:
            pass

        resolved_created += 1

    session.status = 'completed'
    session.stats['resolved_created'] = resolved_created
    session.save()

    group.resolution_status = 'completed'
    group.save()

    return JsonResponse({
        'session_id': session.session_id,
        'status': session.status,
        'stats': session.stats,
    })


def _find_resolved_by_uuid_or_short(uuid_or_short):
    """Find ResolvedTransaction by full UUID or short ID prefix."""
    # Try full UUID first
    try:
        import uuid as uuid_module
        uuid_obj = uuid_module.UUID(uuid_or_short)
        return ResolvedTransaction.objects.get(uuid=uuid_obj)
    except (ValueError, ResolvedTransaction.DoesNotExist):
        pass

    # Try short ID (prefix match)
    matches = ResolvedTransaction.objects.filter(uuid__startswith=uuid_or_short)
    if matches.count() == 1:
        return matches.first()
    elif matches.count() > 1:
        raise ValueError('Multiple matches found')

    raise ResolvedTransaction.DoesNotExist()


@api_view(['GET'])
def resolved_transaction_detail(request, uuid_or_short):
    """
    GET /api/transactions/resolved/{uuid}/
    Get resolved transaction details.
    """
    try:
        resolved = _find_resolved_by_uuid_or_short(uuid_or_short)
    except ResolvedTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    return JsonResponse(_serialize_resolved_transaction(resolved))


@api_view(['PATCH'])
def resolved_transaction_primary(request, uuid_or_short):
    """
    PATCH /api/transactions/resolved/{uuid}/primary/
    Change the primary source for display.
    """
    try:
        resolved = _find_resolved_by_uuid_or_short(uuid_or_short)
    except ResolvedTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    new_primary_id = data.get('primary_transaction_id')
    if not new_primary_id:
        return JsonResponse({'error': 'primary_transaction_id required'}, status=400)

    if resolved.transaction_type == 'bank':
        from bank_accounts.models import BankTransaction
        # Verify the transaction belongs to this resolved group
        if not resolved.bank_transactions.filter(id=new_primary_id).exists():
            return JsonResponse({'error': 'Transaction not in this group'}, status=400)

        # Update is_primary flags
        resolved.bank_transactions.update(is_primary=False)
        BankTransaction.objects.filter(id=new_primary_id).update(is_primary=True)
    else:
        from credit_cards.models import CreditCardTransaction
        if not resolved.credit_card_transactions.filter(id=new_primary_id).exists():
            return JsonResponse({'error': 'Transaction not in this group'}, status=400)

        resolved.credit_card_transactions.update(is_primary=False)
        CreditCardTransaction.objects.filter(id=new_primary_id).update(is_primary=True)

    resolved.primary_transaction_id = new_primary_id
    resolved.save()

    return JsonResponse(_serialize_resolved_transaction(resolved))


@api_view(['POST'])
def resolved_transaction_unlink(request, uuid_or_short):
    """
    POST /api/transactions/resolved/{uuid}/unlink/
    Remove a source transaction from the group.
    """
    try:
        resolved = _find_resolved_by_uuid_or_short(uuid_or_short)
    except ResolvedTransaction.DoesNotExist:
        return JsonResponse({'error': 'Transaction not found'}, status=404)
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=400)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    txn_id = data.get('transaction_id')
    if not txn_id:
        return JsonResponse({'error': 'transaction_id required'}, status=400)

    if resolved.transaction_type == 'bank':
        from bank_accounts.models import BankTransaction
        try:
            txn = BankTransaction.objects.get(id=txn_id, resolved_transaction=resolved)
        except BankTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not in this group'}, status=400)

        # Create new single-member resolved transaction for this txn
        new_resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=txn.credit_amount - txn.debit_amount,
            bank_account=resolved.bank_account,
        )
        txn.resolved_transaction = new_resolved
        txn.is_primary = True
        txn.save()

        # If original was primary, promote another
        if resolved.primary_transaction_id == txn_id:
            remaining = resolved.bank_transactions.first()
            if remaining:
                resolved.primary_transaction_id = remaining.id
                remaining.is_primary = True
                remaining.save()
                resolved.save()
    else:
        from credit_cards.models import CreditCardTransaction
        try:
            txn = CreditCardTransaction.objects.get(id=txn_id, resolved_transaction=resolved)
        except CreditCardTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not in this group'}, status=400)

        new_resolved = ResolvedTransaction.objects.create(
            transaction_type='credit_card',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=txn.amount,
            credit_card=resolved.credit_card,
        )
        txn.resolved_transaction = new_resolved
        txn.is_primary = True
        txn.save()

        if resolved.primary_transaction_id == txn_id:
            remaining = resolved.credit_card_transactions.first()
            if remaining:
                resolved.primary_transaction_id = remaining.id
                remaining.is_primary = True
                remaining.save()
                resolved.save()

    return JsonResponse({
        'unlinked_transaction_id': txn_id,
        'new_resolved_uuid': str(new_resolved.uuid),
    })


@api_view(['GET'])
def resolved_transaction_search(request):
    """
    GET /api/transactions/resolved/search/?q=prefix
    Search resolved transactions by UUID prefix.
    """
    query = request.GET.get('q', '')
    if not query:
        return JsonResponse({'error': 'q parameter required'}, status=400)

    # Search by UUID prefix
    results = ResolvedTransaction.objects.filter(
        uuid__startswith=query
    )[:20]

    return JsonResponse([
        _serialize_resolved_transaction(r, include_sources=False)
        for r in results
    ], safe=False)


@api_view(['GET'])
def resolved_transaction_list(request):
    """
    GET /api/transactions/resolved/
    List all resolved transactions with pagination.
    Optional filters: bank_account_id, credit_card_id
    """
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 50))
    bank_account_id = request.GET.get('bank_account_id')
    credit_card_id = request.GET.get('credit_card_id')

    queryset = ResolvedTransaction.objects.all().order_by('-created_at')

    if bank_account_id:
        queryset = queryset.filter(bank_account_id=bank_account_id)
    if credit_card_id:
        queryset = queryset.filter(credit_card_id=credit_card_id)

    total = queryset.count()
    offset = (page - 1) * page_size
    results = queryset[offset:offset + page_size]

    return JsonResponse({
        'total': total,
        'page': page,
        'page_size': page_size,
        'results': [
            _serialize_resolved_transaction(r, include_sources=False)
            for r in results
        ]
    })
