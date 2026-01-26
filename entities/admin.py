from django.contrib import admin
from .models import Entity, EntityTransaction


@admin.register(Entity)
class EntityAdmin(admin.ModelAdmin):
    list_display = ('icon', 'name', 'entity_type', 'entity_id', 'created_at', 'updated_at')
    list_filter = ('entity_type',)
    search_fields = ('name', 'entity_id', 'description')
    readonly_fields = ('entity_id', 'created_at', 'updated_at')


@admin.register(EntityTransaction)
class EntityTransactionAdmin(admin.ModelAdmin):
    list_display = ('entity', 'transaction_type', 'transaction_id', 'added_at')
    list_filter = ('transaction_type', 'entity')
    search_fields = ('entity__name', 'transaction_id')
