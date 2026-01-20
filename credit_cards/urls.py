from django.urls import path
from . import views

urlpatterns = [
    # Credit cards
    path('api/credit-cards/', views.credit_card_list, name='credit_card_list'),
    path('api/credit-cards/<int:card_id>/', views.credit_card_detail, name='credit_card_detail'),

    # Credit card source files
    path('api/credit-card-source-files/<int:source_file_id>/', views.credit_card_source_file_toggle, name='credit_card_source_file_toggle'),

    # Credit card transactions
    path('api/credit-card-transactions/', views.credit_card_transactions, name='credit_card_transactions'),
    path('api/credit-card-transactions/<int:transaction_id>/category/', views.credit_card_transaction_category, name='credit_card_transaction_category'),

    # Aggregates
    path('api/credit-card-date-range/', views.credit_card_date_range, name='credit_card_date_range'),
    path('api/credit-card-categories/', views.credit_card_categories, name='credit_card_categories'),

    # Inconsistencies
    path('api/credit-card-inconsistencies/', views.credit_card_inconsistencies, name='credit_card_inconsistencies'),
    path('api/credit-card-inconsistencies/dismiss/', views.dismiss_credit_card_inconsistency, name='dismiss_credit_card_inconsistency'),
    path('api/credit-card-inconsistencies/restore/', views.restore_credit_card_inconsistency, name='restore_credit_card_inconsistency'),

    # PDF Extractions
    path('api/cc-pdf-data-sources/', views.pdf_extraction_data_sources, name='pdf_extraction_data_sources'),
    path('api/cc-pdf-extractions/', views.pdf_extraction_list, name='pdf_extraction_list'),
    path('api/cc-pdf-extractions/<int:extraction_id>/', views.pdf_extraction_detail, name='pdf_extraction_detail'),
    path('api/cc-pdf-extractions/load/', views.pdf_extraction_load, name='pdf_extraction_load'),
    path('api/cc-pdf-extractions/unload/', views.pdf_extraction_unload, name='pdf_extraction_unload'),
    path('api/cc-pdf-extractions/transform/', views.pdf_extraction_transform, name='pdf_extraction_transform'),
    path('api/cc-pdf-extractions/toggle-hidden/', views.pdf_extraction_toggle_hidden, name='pdf_extraction_toggle_hidden'),
    path('api/cc-pdf-extractions/update-card/', views.pdf_extraction_update_card, name='pdf_extraction_update_card'),
    path('api/cc-pdf-extractions/delete/', views.pdf_extraction_delete, name='pdf_extraction_delete'),
    path('api/cc-pdf-extractions/delete-all/', views.pdf_extraction_delete_all, name='pdf_extraction_delete_all'),
    path('api/cc-source-files/', views.pdf_source_files_list, name='pdf_source_files_list'),
    path('api/cc-source-files/sync/', views.cc_source_files_sync, name='cc_source_files_sync'),
    path('api/cc-source-files/<int:source_file_id>/', views.pdf_source_file_delete, name='pdf_source_file_delete'),
    path('api/cc-source-files/<int:source_file_id>/extract/', views.pdf_extraction_extract, name='pdf_extraction_extract'),
    path('api/cc-source-files/<int:source_file_id>/password/', views.pdf_source_file_password, name='pdf_source_file_password'),

    # Artifacts (new endpoints)
    # Note: load/unload/delete must come before <str:artifact_id>/ to avoid matching as an artifact_id
    path('api/artifacts/load/', views.artifact_load, name='artifact_load'),
    path('api/artifacts/unload/', views.artifact_unload, name='artifact_unload'),
    path('api/artifacts/delete/', views.artifact_delete, name='artifact_delete'),
    path('api/artifacts/<str:artifact_id>/', views.artifact_download, name='artifact_download'),
    path('api/artifacts/<str:artifact_id>/preview/', views.artifact_preview, name='artifact_preview'),

    # CSV Extractions
    path('api/cc-csv-source-files/', views.csv_source_files_list, name='csv_source_files_list'),
    path('api/cc-csv-source-files/<int:source_file_id>/extract/', views.csv_extraction_extract, name='csv_extraction_extract'),
]
