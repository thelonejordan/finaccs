import secrets
from django.db import models


def generate_entity_id():
    """Generate a unique entity ID like 'entity_xxxxxxxx'."""
    return f"entity_{secrets.token_hex(4)}"


class Entity(models.Model):
    ENTITY_TYPE_CHOICES = [
        ('person', 'Person'),
        ('business', 'Business'),
    ]

    entity_id = models.CharField(max_length=20, unique=True, default=generate_entity_id)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=10, default='👤')  # Emoji
    entity_type = models.CharField(max_length=20, choices=ENTITY_TYPE_CHOICES, default='person')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        db_table = 'entities_entity'
        verbose_name_plural = 'Entities'

    def __str__(self):
        return f"{self.icon} {self.name}"


class EntityTransaction(models.Model):
    TRANSACTION_TYPE_CHOICES = [
        ('bank', 'Bank Transaction'),
        ('credit_card', 'Credit Card Transaction'),
    ]

    entity = models.ForeignKey(
        Entity,
        on_delete=models.CASCADE,
        related_name='entity_transactions'
    )
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)
    transaction_id = models.IntegerField()
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-added_at']
        db_table = 'entities_entitytransaction'
        unique_together = [['entity', 'transaction_type', 'transaction_id']]

    def __str__(self):
        return f"{self.entity.name} - {self.transaction_type}:{self.transaction_id}"
