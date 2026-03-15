"""
First-class link models for durable, transferable links.

Links attach to ResolvedTransaction (display_group). They are not deleted when
the origin transaction or primary is deleted; they can be marked unused when
the display_group has no members.
"""
from django.db import models


class CategoryLink(models.Model):
    resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='category_links',
    )
    category = models.CharField(max_length=50)
    origin_transaction_type = models.CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_categorylink'
        ordering = ['-created_at']

    def __str__(self):
        return f"CategoryLink({self.category} -> {self.resolved_transaction_id})"


class StoryLink(models.Model):
    resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='story_links',
    )
    story = models.ForeignKey(
        'stories.Story',
        on_delete=models.CASCADE,
        related_name='story_links',
    )
    origin_transaction_type = models.CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = models.IntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_storylink'
        ordering = ['-added_at']
        unique_together = [['resolved_transaction', 'story']]

    def __str__(self):
        return f"StoryLink({self.story_id} -> {self.resolved_transaction_id})"


class EntityLink(models.Model):
    resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='entity_links',
    )
    entity = models.ForeignKey(
        'entities.Entity',
        on_delete=models.CASCADE,
        related_name='entity_links',
    )
    origin_transaction_type = models.CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = models.IntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_entitylink'
        ordering = ['-added_at']
        unique_together = [['resolved_transaction', 'entity']]

    def __str__(self):
        return f"EntityLink({self.entity_id} -> {self.resolved_transaction_id})"


class SelfTransferLink(models.Model):
    resolved_transaction_a = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='self_transfer_links_as_a',
    )
    resolved_transaction_b = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='self_transfer_links_as_b',
    )
    origin_transaction_id_a = models.IntegerField(null=True, blank=True)
    origin_transaction_id_b = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_selftransferlink'
        ordering = ['-created_at']

    def __str__(self):
        return f"SelfTransferLink({self.resolved_transaction_a_id} <-> {self.resolved_transaction_b_id})"


class CreditCardPaymentLink(models.Model):
    bank_resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cc_payment_links_bank',
    )
    cc_resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cc_payment_links_cc',
    )
    offset = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    confidence_score = models.FloatField(default=0.0)
    match_reasons = models.JSONField(default=list)
    origin_bank_transaction_id = models.IntegerField(null=True, blank=True)
    origin_cc_transaction_id = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_creditcardpaymentlink'
        ordering = ['-created_at']

    def __str__(self):
        return f"CCPaymentLink(bank={self.bank_resolved_transaction_id} <-> cc={self.cc_resolved_transaction_id})"
