from django.contrib import admin
from .models import Entity


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ('icon', 'name', 'entity_type', 'entity_id', 'created_at', 'updated_at')
    list_filter = ('entity_type',)
    search_fields = ('name', 'entity_id', 'description')
    readonly_fields = ('entity_id', 'created_at', 'updated_at')
