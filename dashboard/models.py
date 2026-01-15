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
    source_file = models.ForeignKey(
        'bank_accs.SourceFile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )
    linked_transaction = models.OneToOneField(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='linked_from'
    )

    class Meta:
        ordering = ['-date', '-id']

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

    source_file = models.ForeignKey(
        'bank_accs.SourceFile',
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
        filename = self.source_file.filename if self.source_file else 'Unknown'
        return f"{self.created_at} - Loaded {self.transaction_count} from {filename}"


class AccountLog(models.Model):
    """Write-Ahead Log for tracking bank account changes."""
    ACTION_CHOICES = [
        ('CREATE', 'Account Created'),
        ('UPDATE', 'Account Updated'),
        ('DELETE', 'Account Deleted'),
        ('LINK_SOURCE', 'Source File Linked'),
        ('UNLINK_SOURCE', 'Source File Unlinked'),
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
    source_file = models.ForeignKey(
        'bank_accs.SourceFile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at} - {self.action} - Account {self.bank_account_id}"
