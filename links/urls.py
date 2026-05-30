from django.urls import path
from . import breakdown_views

urlpatterns = [
    path('api/breakdowns/', breakdown_views.breakdown_list, name='breakdown_list'),
    path('api/breakdowns/transaction-breakdowns/', breakdown_views.transaction_breakdowns, name='transaction_breakdowns'),
    path('api/breakdowns/<str:breakdown_id>/', breakdown_views.breakdown_detail, name='breakdown_detail'),
    path('api/breakdowns/<str:breakdown_id>/parts/', breakdown_views.breakdown_parts, name='breakdown_parts'),
    path('api/breakdowns/<str:breakdown_id>/parts/<int:part_id>/', breakdown_views.breakdown_part_delete, name='breakdown_part_delete'),
]
