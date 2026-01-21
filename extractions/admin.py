from django.contrib import admin
from .models import (
    SourceFile,
    Extraction,
    ExtractionArtifact,
    DataSourceArtifact,
    TransactionLinkSnapshot,
)


@admin.register(SourceFile)
class SourceFileAdmin(admin.ModelAdmin):
    list_display = ['source_file_id', 'filename', 'domain', 'extraction_status', 'hidden', 'created_at']
    list_filter = ['domain', 'extraction_status', 'hidden']
    search_fields = ['source_file_id', 'filename']
    readonly_fields = ['source_file_id', 'file_hash', 'file_size', 'created_at', 'updated_at']


@admin.register(Extraction)
class ExtractionAdmin(admin.ModelAdmin):
    list_display = ['extraction_id', 'source_file', 'extractor_name', 'status', 'hidden', 'extracted_at']
    list_filter = ['status', 'hidden', 'extractor_name']
    search_fields = ['extraction_id', 'source_file__filename']
    readonly_fields = ['extraction_id', 'extracted_at']


@admin.register(ExtractionArtifact)
class ExtractionArtifactAdmin(admin.ModelAdmin):
    list_display = ['artifact_id', 'extraction', 'artifact_type', 'content_format', 'row_count', 'transformation_status']
    list_filter = ['artifact_type', 'content_format', 'transformation_status']
    search_fields = ['artifact_id', 'extraction__extraction_id']
    readonly_fields = ['artifact_id', 'content_hash', 'created_at']


@admin.register(DataSourceArtifact)
class DataSourceArtifactAdmin(admin.ModelAdmin):
    list_display = ['artifact_id', 'data_source_target', 'status', 'enabled', 'hidden', 'bank_account', 'credit_card']
    list_filter = ['data_source_target', 'status', 'enabled', 'hidden']
    search_fields = ['artifact_id', 'source_artifact__artifact_id']
    readonly_fields = ['artifact_id', 'content_hash', 'transformed_at', 'loaded_at']


@admin.register(TransactionLinkSnapshot)
class TransactionLinkSnapshotAdmin(admin.ModelAdmin):
    list_display = ['data_source_artifact', 'link_type', 'source_row_id', 'target_row_id', 'snapshotted_at']
    list_filter = ['link_type']
    search_fields = ['source_row_id', 'target_row_id']
    readonly_fields = ['snapshotted_at']
