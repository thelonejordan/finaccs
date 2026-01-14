from django.urls import path

from . import views

app_name = 'dashboard'

urlpatterns = [
    path('api/summary/', views.api_summary, name='api_summary'),
    path('api/monthly/', views.api_monthly, name='api_monthly'),
    path('api/categories/', views.api_categories, name='api_categories'),
    path('api/transactions/', views.api_transactions, name='api_transactions'),
    path('api/top-expenses/', views.api_top_expenses, name='api_top_expenses'),
]
