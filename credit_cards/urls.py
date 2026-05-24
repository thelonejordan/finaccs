from django.urls import path
from . import views
from . import emi_views

urlpatterns = [
    # Credit cards
    path('api/credit-cards/', views.credit_card_list, name='credit_card_list'),
    path('api/credit-cards/<int:card_id>/', views.credit_card_detail, name='credit_card_detail'),

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

    # EMIs
    path('api/emis/', emi_views.emi_list, name='emi_list'),
    path('api/emis/suggestions/', emi_views.emi_suggestions, name='emi_suggestions'),
    path('api/emis/transaction-emis/', emi_views.transaction_emis, name='transaction_emis'),
    path('api/emis/<str:emi_id>/', emi_views.emi_detail, name='emi_detail'),
    path('api/emis/<str:emi_id>/transactions/', emi_views.emi_transactions, name='emi_transactions'),
    path('api/emis/<str:emi_id>/links/<int:link_id>/', emi_views.emi_link_update, name='emi_link_update'),
]
