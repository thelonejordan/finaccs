from django.contrib import admin
from .models import Story


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = ('icon', 'name', 'story_id', 'created_at', 'updated_at')
    search_fields = ('name', 'story_id', 'description')
    readonly_fields = ('story_id', 'created_at', 'updated_at')
