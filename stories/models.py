import secrets
from django.db import models


def generate_story_id():
    """Generate a unique story ID like 'story_xxxxxxxx'."""
    return f"story_{secrets.token_hex(4)}"


class Story(models.Model):
    story_id = models.CharField(max_length=20, unique=True, default=generate_story_id)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=10, default='📁')  # Emoji
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        db_table = 'stories_story'
        verbose_name_plural = 'Stories'

    def __str__(self):
        return f"{self.icon} {self.name}"
