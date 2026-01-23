from django.db import models


class Transaction(models.Model):
    date = models.DateField()
    narration = models.TextField()
    value_date = models.DateField()
    debit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference_number = models.CharField(max_length=50)
    closing_balance = models.DecimalField(max_digits=12, decimal_places=2)
    category = models.CharField(max_length=50, blank=True)
    bank_account = models.ForeignKey(
        'bank_accs.BankAccount',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='transactions'
    )
    data_source_artifact = models.ForeignKey(
        'extractions.DataSourceArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bank_transactions',
        db_index=True
    )
    artifact_row_id = models.CharField(max_length=50, blank=True)  # For link snapshot matching
    linked_transaction = models.OneToOneField(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='linked_from'
    )
    row_number = models.IntegerField(default=0)  # Position in extracted CSV for ordering

    class Meta:
        ordering = ['-date', '-row_number']

    def __str__(self):
        return f"{self.date} - {self.narration[:50]}"

    @property
    def amount(self):
        return self.credit_amount - self.debit_amount

    @property
    def is_credit(self):
        return self.credit_amount > 0


class TransactionLog(models.Model):
    """Write-Ahead Log for tracking transaction changes (excludes initial load)."""
    ACTION_CHOICES = [
        ('CATEGORY_CHANGE', 'Category Change'),
        ('LINK', 'Transaction Linked'),
        ('UNLINK', 'Transaction Unlinked'),
    ]

    transaction = models.ForeignKey(
        Transaction,
        on_delete=models.CASCADE,
        related_name='logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at} - {self.action} - Transaction {self.transaction_id}"


class FileLoadLog(models.Model):
    """Log for tracking file load operations (one entry per file load)."""
    LINK_SOURCE_CHOICES = [
        ('pre_existing', 'Pre-existing Link'),
        ('none', 'No Link'),
    ]

    data_source_artifact = models.ForeignKey(
        'extractions.DataSourceArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='load_logs'
    )
    bank_account = models.ForeignKey(
        'bank_accs.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    transaction_count = models.IntegerField(default=0)
    file_hash = models.CharField(max_length=64, blank=True)
    category_summary = models.JSONField(default=dict, blank=True)  # {"Uncategorized": 10, "Food": 5, ...}
    link_source = models.CharField(max_length=20, choices=LINK_SOURCE_CHOICES, default='none')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        artifact_id = self.data_source_artifact.artifact_id if self.data_source_artifact else 'Unknown'
        return f"{self.created_at} - Loaded {self.transaction_count} from {artifact_id}"


class AccountLog(models.Model):
    """Write-Ahead Log for tracking bank account changes."""
    ACTION_CHOICES = [
        ('CREATE', 'Account Created'),
        ('UPDATE', 'Account Updated'),
        ('DELETE', 'Account Deleted'),
    ]

    bank_account = models.ForeignKey(
        'bank_accs.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    old_value = models.CharField(max_length=255, blank=True)
    new_value = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at} - {self.action} - Account {self.bank_account_id}"


class CreditCardPaymentMatch(models.Model):
    """Links bank CC payment to corresponding credit card payment transaction."""

    bank_transaction = models.OneToOneField(
        'Transaction',
        on_delete=models.CASCADE,
        related_name='cc_payment_match'
    )
    credit_card_transaction = models.OneToOneField(
        'credit_cards.CreditCardTransaction',
        on_delete=models.CASCADE,
        related_name='bank_payment_match'
    )
    offset = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # Rewards cashout difference
    confidence_score = models.FloatField(default=0.0)
    match_reasons = models.JSONField(default=list)  # ["exact_amount", "same_day"]
    is_active = models.BooleanField(default=True)  # Soft delete when bank extraction is disabled
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Match: Bank {self.bank_transaction_id} <-> CC {self.credit_card_transaction_id}"


class DismissedBankInconsistency(models.Model):
    """Track dismissed bank transaction inconsistencies."""
    INCONSISTENCY_TYPES = [
        ('duplicate', 'Duplicate Transaction'),
        ('cross_account', 'Cross-Account Match'),
        ('balance_gap', 'Balance Discontinuity'),
    ]

    inconsistency_type = models.CharField(max_length=20, choices=INCONSISTENCY_TYPES)
    transaction_ids = models.CharField(max_length=255)  # Sorted comma-separated
    reason = models.TextField(blank=True)
    dismissed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-dismissed_at']
        unique_together = [['inconsistency_type', 'transaction_ids']]

    def __str__(self):
        return f"{self.get_inconsistency_type_display()}: {self.transaction_ids}"

    @classmethod
    def make_key(cls, transaction_ids):
        return ','.join(str(tid) for tid in sorted(transaction_ids))

    @classmethod
    def is_dismissed(cls, inconsistency_type, transaction_ids):
        key = cls.make_key(transaction_ids)
        return cls.objects.filter(
            inconsistency_type=inconsistency_type,
            transaction_ids=key
        ).exists()
