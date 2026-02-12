"""URL configuration for extractions app."""
from django.urls import path
from . import views

urlpatterns = [
    # Source Files
    path('api/extractions/source-files/', views.source_file_list, name='source_file_list'),
    path('api/extractions/source-files/refresh/', views.source_file_refresh, name='source_file_refresh'),
    path('api/extractions/source-files/bulk-update/', views.source_file_bulk_update, name='source_file_bulk_update'),
    path('api/extractions/source-files/<str:source_file_id>/', views.source_file_detail, name='source_file_detail'),
    path('api/extractions/source-files/<str:source_file_id>/extract/', views.source_file_extract, name='source_file_extract'),
    path('api/extractions/source-files/<str:source_file_id>/validate-password/', views.source_file_validate_password, name='source_file_validate_password'),

    # Utilities (must come before generic extraction_id pattern)
    path('api/extractions/extractors/', views.extractor_list, name='extractor_list'),

    # Extraction Artifacts (bulk-transform must come before artifact_id pattern)
    path('api/extractions/artifacts/bulk-transform/', views.artifact_bulk_transform, name='artifact_bulk_transform'),
    path('api/extractions/artifacts/<str:artifact_id>/', views.artifact_detail, name='artifact_detail'),
    path('api/extractions/artifacts/<str:artifact_id>/preview/', views.artifact_preview, name='artifact_preview'),
    path('api/extractions/artifacts/<str:artifact_id>/transform/', views.artifact_transform, name='artifact_transform'),

    # Data Source Artifacts (bulk-update must come before artifact_id pattern)
    path('api/extractions/data-sources/', views.data_source_list, name='data_source_list'),
    path('api/extractions/data-sources/bulk-update/', views.data_source_bulk_update, name='data_source_bulk_update'),
    path('api/extractions/data-sources/<str:artifact_id>/', views.data_source_detail, name='data_source_detail'),
    path('api/extractions/data-sources/<str:artifact_id>/load/', views.data_source_load, name='data_source_load'),
    path('api/extractions/data-sources/<str:artifact_id>/unload/', views.data_source_unload, name='data_source_unload'),
    path('api/extractions/data-sources/<str:artifact_id>/preview/', views.data_source_preview, name='data_source_preview'),

    # Extractions (generic patterns last)
    path('api/extractions/', views.extraction_list, name='extraction_list'),
    path('api/extractions/bulk-update/', views.extraction_bulk_update, name='extraction_bulk_update'),
    path('api/extractions/<str:extraction_id>/', views.extraction_detail, name='extraction_detail'),

    # Transaction Resolution - Overlapping Source Groups
    path('api/sources/overlapping-groups/', views.overlapping_group_list_create, name='overlapping_group_list_create'),
    path('api/sources/overlapping-groups/<str:group_id>/', views.overlapping_group_detail, name='overlapping_group_detail'),
    path('api/sources/overlapping-groups/<str:group_id>/resolve/', views.overlapping_group_resolve, name='overlapping_group_resolve'),

    # Transaction Resolution - Resolution Sessions
    path('api/transactions/resolve/<str:session_id>/', views.resolution_session_detail, name='resolution_session_detail'),
    path('api/transactions/resolve/<str:session_id>/suggest/', views.resolution_session_suggest, name='resolution_session_suggest'),
    path('api/transactions/resolve/<str:session_id>/review/', views.resolution_session_review, name='resolution_session_review'),
    path('api/transactions/resolve/<str:session_id>/confirm-group/', views.resolution_session_confirm, name='resolution_session_confirm'),
    path('api/transactions/resolve/<str:session_id>/execute/', views.resolution_session_execute, name='resolution_session_execute'),

    # Transaction Resolution - Resolved Transactions
    path('api/transactions/resolved/', views.resolved_transaction_list, name='resolved_transaction_list'),
    path('api/transactions/resolved/search/', views.resolved_transaction_search, name='resolved_transaction_search'),
    path('api/transactions/resolved/<str:uuid_or_short>/', views.resolved_transaction_detail, name='resolved_transaction_detail'),
    path('api/transactions/resolved/<str:uuid_or_short>/primary/', views.resolved_transaction_primary, name='resolved_transaction_primary'),
    path('api/transactions/resolved/<str:uuid_or_short>/unlink/', views.resolved_transaction_unlink, name='resolved_transaction_unlink'),
]
