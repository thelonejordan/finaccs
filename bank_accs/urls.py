from django.urls import path
from . import views

urlpatterns = [
    path('api/accounts/', views.account_list, name='account_list'),
    path('api/accounts/<int:account_id>/', views.account_detail, name='account_detail'),
    path('api/source-files/<int:source_file_id>/', views.source_file_toggle, name='source_file_toggle'),
    path('api/pipelines/', views.pipeline_list, name='pipeline_list'),
    path('api/extracted-csvs/<int:csv_id>/', views.extracted_csv_detail, name='extracted_csv_detail'),
    path('api/extracted-csvs/load/', views.load_extracted_csvs, name='load_extracted_csvs'),
    # Bank Extractions
    path('api/bank-source-files/', views.bank_source_files_list, name='bank_source_files_list'),
    path('api/bank-source-files/sync/', views.bank_source_files_sync, name='bank_source_files_sync'),
    path('api/bank-source-files/<int:source_file_id>/extract/', views.bank_source_file_extract, name='bank_source_file_extract'),
    path('api/bank-extracted-csvs/<int:csv_id>/content/', views.extracted_csv_content, name='extracted_csv_content'),
    path('api/bank-extracted-csvs/<int:csv_id>/preview/', views.extracted_csv_preview, name='extracted_csv_preview'),
    path('api/bank-extractions/<int:extraction_id>/artifacts/', views.bank_extraction_artifacts, name='bank_extraction_artifacts'),
    path('api/bank-extractions/toggle-hidden/', views.bank_extraction_toggle_hidden, name='bank_extraction_toggle_hidden'),
    path('api/bank-extractions/delete/', views.bank_extraction_delete, name='bank_extraction_delete'),
]
