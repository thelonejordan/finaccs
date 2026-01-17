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
]
