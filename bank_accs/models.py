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
