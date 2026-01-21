"""
Unified extraction models for the MODELLING-REVAMP architecture.

This module provides a unified, format-agnostic, data-agnostic extraction system
that replaces the current domain-specific (bank_accs and credit_cards) extraction systems.
"""
import shortuuid
from django.db import models


class SourceFile(models.Model):
    """Unified source file storage for both bank and credit card statements."""

    DOMAIN_CHOICES = [
        ('bank_account', 'Bank Account'),
        ('credit_card', 'Credit Card'),
    ]

    EXTRACTION_STATUS_CHOICES = [
        ('not_extracted', 'Not Extracted'),
        ('extracted', 'Extracted'),
    ]

    # Unique identifier: sf_xxxxxxxx
    source_file_id = models.CharField(max_length=20, unique=True, blank=True)

    # File identification
    filename = models.CharField(max_length=255, unique=True)
    file_path = models.CharField(max_length=512, blank=True)
    file_hash = models.CharField(max_length=64, blank=True)  # SHA-256

    # Blob storage (gzip compressed)
    file_data = models.BinaryField(null=True, blank=True)
    file_size = models.IntegerField(default=0)  # original size in bytes
    mime_type = models.CharField(max_length=100, blank=True)

    # Domain classification
    domain = models.CharField(max_length=20, choices=DOMAIN_CHOICES)

    # Extraction settings
    password = models.CharField(max_length=255, blank=True)
    extractor = models.CharField(max_length=50, blank=True)

    # Status
    extraction_status = models.CharField(
        max_length=20,
        choices=EXTRACTION_STATUS_CHOICES,
        default='not_extracted'
    )
    hidden = models.BooleanField(default=False)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def generate_source_file_id(cls):
        """Generate unique source_file_id: sf_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"sf_{short_id}"
            if not cls.objects.filter(source_file_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.source_file_id:
            self.source_file_id = self.generate_source_file_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.source_file_id} - {self.filename}"


class Extraction(models.Model):
    """Extraction record linking source file to extracted artifacts."""

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('completed', 'Completed'),
        ('error', 'Error'),
    ]

    # Unique identifier: ext_DDMMYYYY_xxxxxxxx
    extraction_id = models.CharField(max_length=32, unique=True, blank=True)

    # Source
    source_file = models.ForeignKey(
        'SourceFile',
        on_delete=models.CASCADE,
        related_name='extractions'
    )

    # Extractor info
    extractor_name = models.CharField(max_length=50)
    extractor_version = models.CharField(max_length=20, default='1.0')

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(blank=True)
    hidden = models.BooleanField(default=False)

    # Timestamps
    extracted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-extracted_at']

    @classmethod
    def generate_extraction_id(cls):
        """Generate unique extraction_id: ext_DDMMYYYY_xxxxxxxx"""
        from django.utils import timezone
        date_str = timezone.now().strftime('%d%m%Y')

        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"ext_{date_str}_{short_id}"
            if not cls.objects.filter(extraction_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.extraction_id:
            self.extraction_id = self.generate_extraction_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.extraction_id} ({self.status})"

    def get_artifact(self, artifact_type: str):
        """Get artifact by type prefix (startswith matching)."""
        return self.artifacts.filter(artifact_type__startswith=artifact_type).first()

    def get_artifacts(self, artifact_type: str):
        """Get all artifacts matching type prefix."""
        return list(self.artifacts.filter(artifact_type__startswith=artifact_type))


class ExtractionArtifact(models.Model):
    """Individual artifact produced by an extraction."""

    CONTENT_FORMAT_CHOICES = [
        ('csv', 'CSV'),
        ('json', 'JSON'),
        ('txt', 'Plain Text'),
    ]

    TRANSFORMATION_STATUS_CHOICES = [
        ('not_applicable', 'Not Applicable'),
        ('not_transformed', 'Not Transformed'),
        ('transformed', 'Transformed'),
    ]

    # Unique identifier: ext_art_xxxxxxxx
    artifact_id = models.CharField(max_length=20, unique=True, blank=True)

    # Parent extraction
    extraction = models.ForeignKey(
        'Extraction',
        on_delete=models.CASCADE,
        related_name='artifacts'
    )

    # Artifact metadata
    artifact_type = models.CharField(max_length=50)  # 'transactions', 'emi', 'metadata'
    artifact_key = models.CharField(max_length=100, blank=True)  # e.g., card number for multi-card PDFs

    # Content
    content_format = models.CharField(max_length=10, choices=CONTENT_FORMAT_CHOICES, default='csv')
    content = models.BinaryField()  # gzip compressed
    content_hash = models.CharField(max_length=64)  # SHA-256
    row_count = models.IntegerField(default=0)

    # Data source target
    data_source_target = models.CharField(max_length=50, blank=True)  # 'bank_account_transactions' | 'credit_card_transactions'

    # Transformation
    transformer = models.CharField(max_length=50, blank=True)
    transformation_status = models.CharField(
        max_length=20,
        choices=TRANSFORMATION_STATUS_CHOICES,
        default='not_applicable'
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['artifact_type']

    @classmethod
    def generate_artifact_id(cls):
        """Generate unique artifact_id: ext_art_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"ext_art_{short_id}"
            if not cls.objects.filter(artifact_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.artifact_id:
            self.artifact_id = self.generate_artifact_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.artifact_id} ({self.artifact_type})"


class DataSourceArtifact(models.Model):
    """
    Transformed artifact ready for loading into data source tables.

    Links to BankAccount or CreditCard and tracks loading status.
    """

    STATUS_CHOICES = [
        ('unloaded', 'Unloaded'),
        ('loading', 'Loading'),
        ('loaded', 'Loaded'),
        ('error', 'Error'),
    ]

    DATA_SOURCE_TARGET_CHOICES = [
        ('bank_account_transactions', 'Bank Account Transactions'),
        ('credit_card_transactions', 'Credit Card Transactions'),
    ]

    # Unique identifier: ds_art_xxxxxxxx
    artifact_id = models.CharField(max_length=20, unique=True, blank=True)

    # Source
    source_artifact = models.ForeignKey(
        'ExtractionArtifact',
        on_delete=models.CASCADE,
        related_name='data_source_artifacts'
    )

    # Target
    data_source_target = models.CharField(max_length=50, choices=DATA_SOURCE_TARGET_CHOICES)

    # Content (spec-conformant, gzip compressed)
    content = models.BinaryField()
    content_hash = models.CharField(max_length=64)
    row_count = models.IntegerField(default=0)

    # Entity links (mutually exclusive)
    bank_account = models.ForeignKey(
        'bank_accs.BankAccount',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='data_source_artifacts'
    )
    credit_card = models.ForeignKey(
        'credit_cards.CreditCard',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='data_source_artifacts'
    )

    # Transformation info
    transformer = models.CharField(max_length=50)

    # Status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unloaded')
    error_message = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    hidden = models.BooleanField(default=False)

    # Timestamps
    transformed_at = models.DateTimeField(auto_now_add=True)
    loaded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-transformed_at']

    @classmethod
    def generate_artifact_id(cls):
        """Generate unique artifact_id: ds_art_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"ds_art_{short_id}"
            if not cls.objects.filter(artifact_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.artifact_id:
            self.artifact_id = self.generate_artifact_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.artifact_id} ({self.data_source_target}) - {self.status}"

    @property
    def entity(self):
        """Get the linked entity (BankAccount or CreditCard)."""
        return self.bank_account or self.credit_card

    @property
    def entity_name(self):
        """Get the name of the linked entity."""
        entity = self.entity
        return str(entity) if entity else 'Unassigned'


class TransactionLinkSnapshot(models.Model):
    """
    Snapshot of transaction links for optimistic reapply after reload.

    Stores link information before unloading a DataSourceArtifact so that
    links can be restored when the data is reloaded.
    """

    LINK_TYPE_CHOICES = [
        ('self_transfer', 'Self Transfer'),
        ('cc_payment', 'Credit Card Payment'),
    ]

    # Parent artifact
    data_source_artifact = models.ForeignKey(
        'DataSourceArtifact',
        on_delete=models.CASCADE,
        related_name='link_snapshots'
    )

    # Link info
    link_type = models.CharField(max_length=20, choices=LINK_TYPE_CHOICES)
    source_row_id = models.CharField(max_length=50)
    target_row_id = models.CharField(max_length=50)
    link_metadata = models.JSONField(default=dict, blank=True)

    # Timestamp
    snapshotted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-snapshotted_at']

    def __str__(self):
        return f"{self.link_type}: {self.source_row_id} -> {self.target_row_id}"
