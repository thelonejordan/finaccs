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
    path('api/cc-payment-suggestions/for-bank-transaction/<int:bank_txn_id>/', views.api_cc_suggestions_for_bank_transaction, name='api_cc_suggestions_for_bank_transaction'),
    path('api/cc-payment-suggestions/for-cc-transaction/<int:cc_txn_id>/', views.api_bank_suggestions_for_cc_transaction, name='api_bank_suggestions_for_cc_transaction'),
    path('api/cc-payment-matches/', views.api_cc_payment_matches, name='api_cc_payment_matches'),
    path('api/cc-payment-matches/<int:match_id>/', views.api_cc_payment_match_delete, name='api_cc_payment_match_delete'),
    path('api/cc-payment-matches/years/', views.api_cc_payment_match_years, name='api_cc_payment_match_years'),
    # Self Transfer Matching
    path('api/self-transfer-suggestions/', views.api_self_transfer_suggestions, name='api_self_transfer_suggestions'),
    path('api/self-transfer-links/', views.api_self_transfer_links, name='api_self_transfer_links'),
    path('api/self-transfer-links/years/', views.api_self_transfer_link_years, name='api_self_transfer_link_years'),
    path('api/self-transfer-links/<int:link_id>/', views.api_self_transfer_link_delete, name='api_self_transfer_link_delete'),
    # Refund Matching
    path('api/refund-suggestions/', views.api_refund_suggestions, name='api_refund_suggestions'),
    path('api/refund-links/', views.api_refund_links, name='api_refund_links'),
    path('api/refund-links/years/', views.api_refund_link_years, name='api_refund_link_years'),
    path('api/refund-links/<int:link_id>/', views.api_refund_link_delete, name='api_refund_link_delete'),
]
