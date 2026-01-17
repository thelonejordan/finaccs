from django.db import models


class CreditCard(models.Model):
    """Credit card account."""
    nickname = models.CharField(max_length=100)
    card_name = models.CharField(max_length=100)  # e.g., "SBI SimplySAVE"
    card_number_mask = models.CharField(max_length=20)  # e.g., "4315 XXXX XXXX 6004"
    issuer = models.CharField(max_length=100)  # e.g., "SBI Card"
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.nickname} ({self.issuer})"


class CreditCardSourceFile(models.Model):
    """Source file for credit card transactions (CSV statements)."""
    filename = models.CharField(max_length=255, unique=True)
    credit_card = models.ForeignKey(
        CreditCard,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_files'
    )
    file_hash = models.CharField(max_length=64, blank=True)
    last_loaded_at = models.DateTimeField(null=True, blank=True)
    disabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # Blob storage for original file
    file_data = models.BinaryField(null=True, blank=True)  # gzip compressed
    file_size = models.IntegerField(default=0)  # original size in bytes
    mime_type = models.CharField(max_length=100, blank=True)  # e.g., 'text/csv'

    # Date range of transactions in this file (for sorting overlapping files)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.filename


class CreditCardExtractedCSV(models.Model):
    """Stores extracted CSV data from credit card source files."""
    source_file = models.ForeignKey(
        'CreditCardSourceFile',
        on_delete=models.CASCADE,
        related_name='extracted_csvs'
    )

    # Blob storage (gzip compressed)
    csv_data = models.BinaryField()
    csv_hash = models.CharField(max_length=64)  # SHA-256
    row_count = models.IntegerField(default=0)

    # Metadata
    extracted_at = models.DateTimeField(auto_now_add=True)
    extractor_version = models.CharField(max_length=20, default='1.0')

    # Status
    STATUS_CHOICES = [
        ('extracted', 'Extracted'),
        ('loaded', 'Loaded to DB'),
        ('error', 'Load Error'),
        ('superseded', 'Superseded'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='extracted')
    loaded_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-extracted_at']

    def __str__(self):
        return f"CSV from {self.source_file.filename} ({self.status})"


class CreditCardTransaction(models.Model):
    """Individual credit card transaction."""
    date = models.DateField()
    description = models.TextField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # positive=charge, negative=payment
    intl_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    category = models.CharField(max_length=50, blank=True)
    credit_card = models.ForeignKey(
        CreditCard,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='transactions'
    )
    source_file = models.ForeignKey(
        CreditCardSourceFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )
    extracted_csv = models.ForeignKey(
        CreditCardExtractedCSV,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )
    row_number = models.IntegerField(default=0)  # Position in extracted CSV for ordering

    class Meta:
        ordering = ['-date', '-row_number']

    def __str__(self):
        return f"{self.date} - {self.description[:50]}"

    @property
    def is_payment(self):
        """Returns True if this is a payment/credit (negative amount)."""
        return self.amount < 0

    @property
    def is_charge(self):
        """Returns True if this is a charge/debit (positive amount)."""
        return self.amount > 0


class DismissedCreditCardInconsistency(models.Model):
    """Track dismissed credit card inconsistencies (false positives)."""
    INCONSISTENCY_TYPES = [
        ('duplicate', 'Duplicate Transaction'),
        ('cross_card', 'Cross-Card Match'),
        ('missing_description', 'Missing Description'),
    ]

    inconsistency_type = models.CharField(max_length=20, choices=INCONSISTENCY_TYPES)
    # For duplicates: store the transaction IDs as a sorted comma-separated string
    # This allows us to match regardless of which transaction is queried
    transaction_ids = models.CharField(max_length=255)
    reason = models.TextField(blank=True)  # Optional note about why dismissed
    dismissed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-dismissed_at']
        # Ensure we don't dismiss the same set of transactions twice
        unique_together = [['inconsistency_type', 'transaction_ids']]

    def __str__(self):
        return f"{self.get_inconsistency_type_display()} - {self.transaction_ids}"

    @classmethod
    def make_key(cls, transaction_ids):
        """Create a consistent key from a list of transaction IDs."""
        return ','.join(str(tid) for tid in sorted(transaction_ids))

    @classmethod
    def is_dismissed(cls, inconsistency_type, transaction_ids):
        """Check if this inconsistency has been dismissed."""
        key = cls.make_key(transaction_ids)
        return cls.objects.filter(
            inconsistency_type=inconsistency_type,
            transaction_ids=key
        ).exists()
