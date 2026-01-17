from django.urls import path
from . import views

urlpatterns = [
    path('api/accounts/', views.account_list, name='account_list'),
    path('api/accounts/<int:account_id>/', views.account_detail, name='account_detail'),
    path('api/source-files/<int:source_file_id>/', views.source_file_toggle, name='source_file_toggle'),
    path('api/pipelines/', views.pipeline_list, name='pipeline_list'),
    path('api/extracted-csvs/<int:csv_id>/', views.extracted_csv_detail, name='extracted_csv_detail'),
    path('api/extracted-csvs/load/', views.load_extracted_csvs, name='load_extracted_csvs'),
]
