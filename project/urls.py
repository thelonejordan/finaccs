"""
URL configuration for project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
import subprocess
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.http import JsonResponse


def get_git_commit():
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'],
            stderr=subprocess.DEVNULL
        ).decode('utf-8').strip()
    except Exception:
        return None


def health(request):
    return JsonResponse({
        'status': 'ok',
        'project': 'finaccs',
        'version': '1.0.0',
        'git_commit': get_git_commit(),
    })


urlpatterns = [
    path('api/health/', health, name='health'),
    path('admin/', admin.site.urls),
    path('', include('bank_accounts.urls')),
    path('', include('dashboard.urls')),
    path('', include('credit_cards.urls')),
    path('', include('extractions.urls')),
]

# API docs (dev only)
if settings.DEV_MODE:
    from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
    urlpatterns = [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    ] + urlpatterns
