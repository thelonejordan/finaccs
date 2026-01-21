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

from bank_accs.models import BankAccount
from credit_cards.models import CreditCard


# Supported file extensions
SUPPORTED_EXTENSIONS = ['.txt', '.xlsx', '.xls', '.pdf', '.csv']


def _serialize_source_file(sf, include_extractions=False):
    """Serialize a SourceFile to dict."""
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
        'extraction_status': sf.extraction_status,
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


@api_view(['POST'])
def source_file_refresh(request):
    """
    POST /api/extractions/source-files/refresh/
    Scan directories and create SourceFile records for new files.

    Request body (optional):
    - bank_account_dir: str (default: 'bank_accs/data')
    - credit_card_dir: str (default: 'credit_cards/data')
    """
    try:
        data = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        data = {}

    bank_dir = Path(settings.BASE_DIR) / data.get('bank_account_dir', 'bank_accs/data')
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
        extraction.delete()
        return JsonResponse({'success': True})


# ==================== Extraction Artifacts API ====================

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

        if 'enabled' in data:
            dsa.enabled = data['enabled']
        if 'hidden' in data:
            dsa.hidden = data['hidden']
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
        return JsonResponse(_serialize_data_source_artifact(dsa))

    elif request.method == 'DELETE':
        success, error = delete_artifact(dsa)
        if success:
            return JsonResponse({'success': True})
        else:
            return JsonResponse({'error': error}, status=400)


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
