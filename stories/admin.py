from django.contrib import admin
from .models import Story, StoryTransaction


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = ('icon', 'name', 'story_id', 'created_at', 'updated_at')
    search_fields = ('name', 'story_id', 'description')
    readonly_fields = ('story_id', 'created_at', 'updated_at')


@admin.register(StoryTransaction)
class StoryTransactionAdmin(admin.ModelAdmin):
    list_display = ('story', 'transaction_type', 'transaction_id', 'added_at')
    list_filter = ('transaction_type', 'story')
    search_fields = ('story__name', 'transaction_id')
