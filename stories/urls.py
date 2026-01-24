from django.urls import path
from . import views

urlpatterns = [
    path('api/stories/', views.story_list, name='story_list'),
    # Specific paths must come before parameterized paths
    path('api/stories/compare/', views.compare_stories, name='compare_stories'),
    path('api/stories/transaction-stories/', views.get_transaction_stories, name='get_transaction_stories'),
    path('api/stories/<str:story_id>/', views.story_detail, name='story_detail'),
    path('api/stories/<str:story_id>/transactions/', views.story_transactions, name='story_transactions'),
]
