from django.urls import path
from . import views

urlpatterns = [
    path('api/accounts/', views.account_list, name='account_list'),
    path('api/accounts/<int:account_id>/', views.account_detail, name='account_detail'),
]
