"""
First-class link models for durable, transferable links.

Links attach to ResolvedTransaction (display_group). They are not deleted when
the origin transaction or primary is deleted; they can be marked unused when
the display_group has no members.
"""
import secrets
from django.db import models


def generate_breakdown_id():
    return f"bkdn_{secrets.token_hex(4)}"


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


class EMILink(models.Model):
    COMPONENT_TYPE_CHOICES = [
        ('purchase', 'Original Purchase'),
        ('loan', 'Loan (EMI Conversion Credit)'),
        ('principal', 'Principal Installment'),
        ('interest', 'Interest Installment'),
        ('processing_fee', 'Processing Fee'),
        ('tax', 'Tax'),
        ('foreclosure', 'Foreclosure Charge'),
        ('other', 'Other'),
    ]

    resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='emi_links',
    )
    emi = models.ForeignKey(
        'credit_cards.CreditCardEMI',
        on_delete=models.CASCADE,
        related_name='emi_links',
    )
    component_type = models.CharField(max_length=20, choices=COMPONENT_TYPE_CHOICES, default='other')
    installment_number = models.IntegerField(null=True, blank=True)
    tax_parent_link = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tax_children',
    )
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    origin_transaction_type = models.CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = models.IntegerField(null=True, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_emilink'
        ordering = ['-added_at']
        unique_together = [['resolved_transaction', 'emi']]

    def __str__(self):
        return f"EMILink({self.emi_id} -> {self.resolved_transaction_id}, {self.component_type})"


class RefundLink(models.Model):
    original_resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refund_links_as_original',
    )
    refund_resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='refund_links_as_refund',
    )
    origin_original_type = models.CharField(max_length=20, blank=True, null=True)
    origin_refund_type = models.CharField(max_length=20, blank=True, null=True)
    origin_original_transaction_id = models.IntegerField(null=True, blank=True)
    origin_refund_transaction_id = models.IntegerField(null=True, blank=True)
    offset = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_refundlink'
        ordering = ['-created_at']

    def __str__(self):
        return f"RefundLink(original={self.original_resolved_transaction_id} -> refund={self.refund_resolved_transaction_id})"


class Breakdown(models.Model):
    breakdown_id = models.CharField(max_length=20, unique=True, default=generate_breakdown_id)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    resolved_transaction = models.OneToOneField(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='breakdown',
    )
    origin_transaction_type = models.CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'links_breakdown'
        ordering = ['-updated_at']

    def __str__(self):
        return f"Breakdown({self.name}, {self.breakdown_id})"


class BreakdownPart(models.Model):
    breakdown = models.ForeignKey(
        Breakdown,
        on_delete=models.CASCADE,
        related_name='parts',
    )
    label = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    rate = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    rate_reference = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rate_dependents',
    )
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'links_breakdownpart'
        ordering = ['order', 'id']

    def __str__(self):
        return f"BreakdownPart({self.label}: {self.amount})"
