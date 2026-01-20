import shortuuid
from django.db import models


class BankAccount(models.Model):
    nickname = models.CharField(max_length=100)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=20)
    ifsc_code = models.CharField(max_length=11)
    branch = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.nickname} ({self.bank_name})"


class ExtractionPipeline(models.Model):
    """Defines an extraction pipeline with its extractor and settings."""

    EXTRACTOR_CHOICES = [
        ('sbi_pdf', 'SBI PDF Statement'),
        ('icici_xlsx', 'ICICI Excel Statement'),
        ('hdfc_txt', 'HDFC Text Statement'),
        ('generic_xlsx', 'Generic Excel'),
        ('generic_txt', 'Generic CSV/TXT'),
    ]

    name = models.CharField(max_length=100, unique=True)
    extractor = models.CharField(max_length=50, choices=EXTRACTOR_CHOICES)
    file_pattern = models.CharField(max_length=100, blank=True)  # e.g., "8645*.pdf"
    password = models.CharField(max_length=100, blank=True)
    default_bank_account = models.ForeignKey(
        'BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='default_pipelines',
        help_text='Default bank account for new files matching this pipeline'
    )
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class SourceFile(models.Model):
    filename = models.CharField(max_length=255, unique=True)
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_files'
    )
    pipeline = models.ForeignKey(
        'ExtractionPipeline',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_files'
    )
    file_hash = models.CharField(max_length=64, blank=True)  # SHA-256 hash
    last_loaded_at = models.DateTimeField(null=True, blank=True)
    disabled = models.BooleanField(default=False)  # Exclude from calculations when True
    created_at = models.DateTimeField(auto_now_add=True)

    # Blob storage for original file
    file_data = models.BinaryField(null=True, blank=True)  # gzip compressed
    file_size = models.IntegerField(default=0)  # original size in bytes
    mime_type = models.CharField(max_length=100, blank=True)  # e.g., 'application/pdf'

    # Date range of transactions in this file (for sorting overlapping files)
    date_range_start = models.DateField(null=True, blank=True)
    date_range_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.filename


class ExtractedCSV(models.Model):
    """Stores extracted CSV data from source files."""
    source_file = models.ForeignKey(
        'SourceFile',
        on_delete=models.CASCADE,
        related_name='extracted_csvs'
    )
    pipeline = models.ForeignKey(
        'ExtractionPipeline',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    # Direct link to bank account (for UI linking)
    bank_account = models.ForeignKey(
        'BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='extracted_csvs'
    )

    # Unique identifier with clean format: extraction_DDMMYYYY_xxxxxxxx
    name = models.CharField(max_length=32, unique=True, blank=True)

    # Blob storage (gzip compressed) - kept for backward compatibility
    csv_data = models.BinaryField()
    csv_hash = models.CharField(max_length=64)  # SHA-256
    row_count = models.IntegerField(default=0)

    # Metadata
    extracted_at = models.DateTimeField(auto_now_add=True)
    extractor_version = models.CharField(max_length=20, default='1.0')

    # Status
    STATUS_CHOICES = [
        ('extracted', 'Extracted'),
        ('transformed', 'Transformed'),  # Ready for ingestion (has ingestable artifact)
        ('loading', 'Loading'),
        ('loaded', 'Loaded to DB'),
        ('error', 'Load Error'),
        ('superseded', 'Superseded'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='extracted')
    loaded_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    disabled = models.BooleanField(default=False)
    hidden = models.BooleanField(default=False)  # Hide from UI (but not deleted)

    class Meta:
        ordering = ['-extracted_at']

    @classmethod
    def generate_unique_name(cls):
        """Generate unique name in format: extraction_DDMMYYYY_xxxxxxxx"""
        from django.utils import timezone
        date_str = timezone.now().strftime('%d%m%Y')

        # Keep generating until we find a unique name
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"extraction_{date_str}_{short_id}"
            if not cls.objects.filter(name=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.name:
            self.name = self.generate_unique_name()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    def get_artifact(self, artifact_type: str):
        """Get artifact by type, returns None if not found."""
        return self.artifacts.filter(artifact_type=artifact_type).first()

    def get_ingestable_artifact(self):
        """Get the ingestable_transactions artifact if it exists."""
        return self.get_artifact('ingestable_transactions')


class BankExtractionArtifact(models.Model):
    """Stores individual artifacts from a bank extraction."""
    extraction = models.ForeignKey(
        'ExtractedCSV',
        on_delete=models.CASCADE,
        related_name='artifacts'
    )

    # Unique identifier (format: artifact_xxxxxxxx)
    artifact_id = models.CharField(max_length=20, unique=True, blank=True)

    # Artifact type (flexible naming like credit cards)
    artifact_type = models.CharField(max_length=50)

    # Content type: 'csv' or 'json'
    content_type = models.CharField(max_length=20, default='csv')

    # Blob storage (gzip compressed)
    data = models.BinaryField()
    data_hash = models.CharField(max_length=64)  # SHA-256
    row_count = models.IntegerField(default=0)

    # Bank account link
    bank_account = models.ForeignKey(
        BankAccount,
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
        return f"{self.artifact_id} ({self.artifact_type})"
