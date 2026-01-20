from django.urls import path

from . import views

app_name = 'dashboard'

urlpatterns = [
    path('api/summary/', views.api_summary, name='api_summary'),
    path('api/monthly/', views.api_monthly, name='api_monthly'),
    path('api/categories/', views.api_categories, name='api_categories'),
    path('api/transactions/', views.api_transactions, name='api_transactions'),
    path('api/transactions/<int:transaction_id>/', views.api_transaction_update, name='api_transaction_update'),
    path('api/transactions/<int:transaction_id>/potential-links/', views.api_potential_links, name='api_potential_links'),
    path('api/transactions/<int:transaction_id>/link/', views.api_link_transaction, name='api_link_transaction'),
    path('api/top-expenses/', views.api_top_expenses, name='api_top_expenses'),
    path('api/logs/', views.api_transaction_logs, name='api_transaction_logs'),
    path('api/inconsistencies/', views.api_inconsistencies, name='api_inconsistencies'),
    path('api/bank-inconsistencies/', views.bank_inconsistencies, name='bank_inconsistencies'),
    path('api/bank-inconsistencies/dismiss/', views.dismiss_bank_inconsistency, name='dismiss_bank_inconsistency'),
    path('api/bank-inconsistencies/restore/', views.restore_bank_inconsistency, name='restore_bank_inconsistency'),
    path('api/date-range/', views.api_date_range, name='api_date_range'),
    # CC Payment Matching
    path('api/cc-payment-suggestions/', views.api_cc_payment_suggestions, name='api_cc_payment_suggestions'),
    path('api/cc-payment-suggestions/reverse/', views.api_cc_payment_suggestions_reverse, name='api_cc_payment_suggestions_reverse'),
    path('api/cc-payment-matches/', views.api_cc_payment_matches, name='api_cc_payment_matches'),
    path('api/cc-payment-matches/<int:match_id>/', views.api_cc_payment_match_delete, name='api_cc_payment_match_delete'),
    path('api/cc-payment-matches/years/', views.api_cc_payment_match_years, name='api_cc_payment_match_years'),
]
