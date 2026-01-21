import shortuuid
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

    # PDF password (for password-protected PDFs)
    pdf_password = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.filename

    @property
    def has_password(self):
        """Check if a password is saved for this file."""
        return bool(self.pdf_password)


class CreditCardPDFExtraction(models.Model):
    """Stores extraction results from a credit card PDF statement."""
    source_file = models.ForeignKey(
        'CreditCardSourceFile',
        on_delete=models.CASCADE,
        related_name='pdf_extractions'
    )
    credit_card = models.ForeignKey(
        'CreditCard',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    # Unique identifier (format: cc_pdf_DDMMYYYY_xxxxxxxx)
    name = models.CharField(max_length=48, unique=True, blank=True)

    # Parsed metadata fields (quick access without decompression)
    statement_date = models.DateField(null=True, blank=True)
    statement_period_begin = models.DateField(null=True, blank=True)
    statement_period_end = models.DateField(null=True, blank=True)
    payment_due_date = models.DateField(null=True, blank=True)
    card_number_mask = models.CharField(max_length=100, blank=True)  # Comma-separated if multiple cards
    invoice_number = models.CharField(max_length=50, blank=True)
    total_amount_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    minimum_amount_due = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Extraction metadata
    extracted_at = models.DateTimeField(auto_now_add=True)
    extractor_version = models.CharField(max_length=20, default='1.0')

    # Status: extracted → transformed → loading → loaded/error/superseded
    STATUS_CHOICES = [
        ('extracted', 'Extracted'),
        ('transformed', 'Transformed'),  # Has ingestable artifact, ready to load
        ('loading', 'Loading'),
        ('loaded', 'Loaded to DB'),
        ('error', 'Load Error'),
        ('superseded', 'Superseded'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='extracted')
    loaded_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    # Hidden/archived flag
    hidden = models.BooleanField(default=False)

    class Meta:
        ordering = ['-extracted_at']

    @classmethod
    def generate_unique_name(cls, source_file=None):
        """Generate unique name based on source file type.

        PDF files: cc_pdf_DDMMYYYY_xxxxxxxx
        CSV files: cc_csv_DDMMYYYY_xxxxxxxx
        """
        from django.utils import timezone
        date_str = timezone.now().strftime('%d%m%Y')

        # Determine prefix based on source file type
        prefix = 'cc_pdf'
        if source_file and source_file.filename.lower().endswith('.csv'):
            prefix = 'cc_csv'

        # Keep generating until we find a unique name
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"{prefix}_{date_str}_{short_id}"
            if not cls.objects.filter(name=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = self.generate_unique_name(self.source_file)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    # Helper methods to access artifacts
    def get_artifact(self, artifact_type):
        """Get first artifact matching type prefix.

        Uses startswith matching so 'transactions' matches:
        - 'transactions'
        - 'transactions-4375XXXXXXXX8007'
        """
        return self.artifacts.filter(artifact_type__startswith=artifact_type).first()

    def get_artifacts(self, artifact_type):
        """Get all artifacts matching type prefix.

        Uses startswith matching so 'transactions' matches:
        - 'transactions'
        - 'transactions-4375XXXXXXXX8007'
        """
        return list(self.artifacts.filter(artifact_type__startswith=artifact_type))

    def get_transactions_artifacts(self):
        """Get all transaction artifacts (handles multi-card PDFs).

        Returns artifacts with types:
        - 'transactions' (single card/legacy)
        - 'transactions-{card_no}' (multi-card)
        """
        return self.get_artifacts('transactions')

    def get_ingestable_artifacts(self):
        """Get all ingestable artifacts (handles multi-card PDFs).

        Returns artifacts with types:
        - 'ingestable_transactions' (single card/legacy)
        - 'ingestable_transactions-{card_no}' (multi-card)
        """
        return self.get_artifacts('ingestable_transactions')

    @property
    def transactions_artifact(self):
        """Get first transactions artifact (backward compatible)."""
        return self.get_artifact('transactions')

    @property
    def emi_artifact(self):
        return self.get_artifact('emi')

    @property
    def metadata_artifact(self):
        return self.get_artifact('metadata')

    @property
    def ingestable_artifact(self):
        """Get first ingestable artifact (backward compatible)."""
        return self.get_artifact('ingestable_transactions')


class ExtractionArtifact(models.Model):
    """Stores individual artifacts from a PDF extraction."""
    extraction = models.ForeignKey(
        'CreditCardPDFExtraction',
        on_delete=models.CASCADE,
        related_name='artifacts'
    )

    # Unique identifier (format: artifact_xxxxxxxx)
    artifact_id = models.CharField(max_length=20, unique=True, blank=True)

    # Artifact type (no choices - flexible naming)
    artifact_type = models.CharField(max_length=50)

    # Content type: 'csv' or 'json'
    content_type = models.CharField(max_length=20, default='csv')

    # Blob storage (gzip compressed)
    data = models.BinaryField()
    data_hash = models.CharField(max_length=64)  # SHA-256
    row_count = models.IntegerField(default=0)  # For CSV artifacts

    # Transformation metadata
    transformer_name = models.CharField(max_length=50, blank=True, default='')
    is_transformable = models.BooleanField(default=False)
    is_transformed = models.BooleanField(default=False)
    source_artifact = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='derived_artifacts'
    )

    # Credit card link (for multi-card PDFs, each artifact can link to different card)
    credit_card = models.ForeignKey(
        CreditCard,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='artifacts'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['artifact_type']

    @classmethod
    def generate_artifact_id(cls):
        """Generate unique artifact_id: artifact_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"artifact_{short_id}"
            if not cls.objects.filter(artifact_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.artifact_id:
            self.artifact_id = self.generate_artifact_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.extraction.name}_{self.artifact_type} ({self.artifact_id})"


class CreditCardTransaction(models.Model):
    """Individual credit card transaction."""
    date = models.DateField()
    description = models.TextField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # positive=charge, negative=payment
    intl_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    intl_currency = models.CharField(max_length=3, blank=True, default='')  # e.g., USD, EUR
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)  # INR per foreign unit
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
    pdf_extraction = models.ForeignKey(
        'CreditCardPDFExtraction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )
    source_artifact = models.ForeignKey(
        'ExtractionArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions'
    )
    # New unified extraction system
    data_source_artifact = models.ForeignKey(
        'extractions.DataSourceArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cc_transactions'
    )
    artifact_row_id = models.CharField(max_length=50, blank=True)  # For link snapshot matching
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
