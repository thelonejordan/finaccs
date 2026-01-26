from django.urls import path
from . import views

urlpatterns = [
    path('api/entities/', views.entity_list, name='entity_list'),
    # Specific paths must come before parameterized paths
    path('api/entities/compare/', views.compare_entities, name='compare_entities'),
    path('api/entities/transaction-entities/', views.get_transaction_entities, name='get_transaction_entities'),
    path('api/entities/<str:entity_id>/', views.entity_detail, name='entity_detail'),
    path('api/entities/<str:entity_id>/transactions/', views.entity_transactions, name='entity_transactions'),
]
