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
        'bank_accounts.BankAccount',
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
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='unloaded', db_index=True)
    error_message = models.TextField(blank=True)
    enabled = models.BooleanField(default=True, db_index=True)
    hidden = models.BooleanField(default=False, db_index=True)

    # Timestamps
    transformed_at = models.DateTimeField(auto_now_add=True)
    loaded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-transformed_at']
        indexes = [
            models.Index(fields=['status', 'enabled', 'hidden'], name='ds_art_status_enabled_hidden'),
        ]

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
        ('category', 'Category'),
        ('story', 'Story'),
        ('entity', 'Entity'),
    ]

    data_source_artifact = models.ForeignKey(
        'DataSourceArtifact',
        on_delete=models.CASCADE,
        related_name='link_snapshots'
    )

    link_type = models.CharField(max_length=20, choices=LINK_TYPE_CHOICES)
    source_row_id = models.CharField(max_length=50)
    target_row_id = models.CharField(max_length=50, blank=True)
    link_metadata = models.JSONField(default=dict, blank=True)

    # Timestamp
    snapshotted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-snapshotted_at']

    def __str__(self):
        return f"{self.link_type}: {self.source_row_id} -> {self.target_row_id}"


# =============================================================================
# Transaction Resolution Models
# =============================================================================

import uuid as uuid_lib


class ResolvedTransaction(models.Model):
    """
    Logical identity for a real-world transaction, grouping multiple source records.

    Multiple BankTransaction or CreditCardTransaction records can link to the same
    ResolvedTransaction when they represent the same real-world transaction from
    different source files.
    """

    TRANSACTION_TYPE_CHOICES = [
        ('bank', 'Bank Transaction'),
        ('credit_card', 'Credit Card Transaction'),
    ]

    # Unique identifier - copyable, searchable
    uuid = models.UUIDField(default=uuid_lib.uuid4, unique=True, editable=False)

    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPE_CHOICES)

    # The source transaction to use for display (narration, reference, etc.)
    primary_transaction_id = models.IntegerField()

    # Denormalized fields from primary (for efficient querying/display)
    date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    bank_account = models.ForeignKey(
        'bank_accounts.BankAccount',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='resolved_transactions'
    )
    credit_card = models.ForeignKey(
        'credit_cards.CreditCard',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='resolved_transactions'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date']
        indexes = [
            models.Index(fields=['bank_account', 'date']),
            models.Index(fields=['credit_card', 'date']),
            models.Index(fields=['uuid']),
        ]

    def __str__(self):
        return f"{self.uuid} - {self.date} {self.amount}"

    @property
    def short_id(self) -> str:
        """Short copyable ID (first 8 chars of UUID)."""
        return str(self.uuid)[:8]

    @property
    def source_count(self) -> int:
        """Number of source transactions linked to this resolved transaction."""
        if self.transaction_type == 'bank':
            return self.bank_transactions.count()
        else:
            return self.credit_card_transactions.count()

    def get_stories(self):
        """Stories attached to this display group (from StoryLink, then StoryTransaction)."""
        from stories.models import Story

        try:
            from links.models import StoryLink
            links = StoryLink.objects.filter(resolved_transaction_id=self.id).select_related('story')
            if links.exists():
                return Story.objects.filter(id__in=[sl.story_id for sl in links])
        except ImportError:
            pass
        from stories.models import StoryTransaction
        story_ids = set()
        if self.transaction_type == 'bank':
            for txn in self.bank_transactions.all():
                story_ids.update(
                    StoryTransaction.objects
                    .filter(transaction_type='bank', transaction_id=txn.id)
                    .values_list('story_id', flat=True)
                )
        else:
            for txn in self.credit_card_transactions.all():
                story_ids.update(
                    StoryTransaction.objects
                    .filter(transaction_type='credit_card', transaction_id=txn.id)
                    .values_list('story_id', flat=True)
                )
        return Story.objects.filter(id__in=story_ids)

    def get_entities(self):
        """Entities attached to this display group (from EntityLink, then EntityTransaction)."""
        from entities.models import Entity

        try:
            from links.models import EntityLink
            links = EntityLink.objects.filter(resolved_transaction_id=self.id).select_related('entity')
            if links.exists():
                return Entity.objects.filter(id__in=[el.entity_id for el in links])
        except ImportError:
            pass
        from entities.models import EntityTransaction
        entity_ids = set()
        if self.transaction_type == 'bank':
            for txn in self.bank_transactions.all():
                entity_ids.update(
                    EntityTransaction.objects
                    .filter(transaction_type='bank', transaction_id=txn.id)
                    .values_list('entity_id', flat=True)
                )
        else:
            for txn in self.credit_card_transactions.all():
                entity_ids.update(
                    EntityTransaction.objects
                    .filter(transaction_type='credit_card', transaction_id=txn.id)
                    .values_list('entity_id', flat=True)
                )
        return Entity.objects.filter(id__in=entity_ids)

    def get_effective_category(self):
        """Category for this display group (from CategoryLink, then primary txn)."""
        try:
            from links.models import CategoryLink
            link = CategoryLink.objects.filter(resolved_transaction_id=self.id).order_by('-created_at').first()
            if link:
                return link.category
        except ImportError:
            pass
        if self.transaction_type == 'bank':
            primary = self.bank_transactions.filter(is_primary=True).first()
            if primary:
                return primary.category
        else:
            primary = self.credit_card_transactions.filter(is_primary=True).first()
            if primary:
                return primary.category
        return None

    def get_linked_resolved_transaction(self):
        """Linked resolved transaction for self-transfers (from SelfTransferLink, then BankTransaction.linked_transaction)."""
        if self.transaction_type != 'bank':
            return None
        try:
            from links.models import SelfTransferLink
            link = SelfTransferLink.objects.filter(
                resolved_transaction_a_id=self.id
            ).select_related('resolved_transaction_b').first()
            if link and link.resolved_transaction_b_id:
                return link.resolved_transaction_b
            link = SelfTransferLink.objects.filter(
                resolved_transaction_b_id=self.id
            ).select_related('resolved_transaction_a').first()
            if link and link.resolved_transaction_a_id:
                return link.resolved_transaction_a
        except ImportError:
            pass
        for txn in self.bank_transactions.all():
            if txn.linked_transaction_id:
                from bank_accounts.models import BankTransaction
                try:
                    linked_txn = BankTransaction.objects.get(id=txn.linked_transaction_id)
                    if linked_txn.resolved_transaction_id:
                        return linked_txn.resolved_transaction
                except BankTransaction.DoesNotExist:
                    pass
        return None


class OverlappingSourceGroup(models.Model):
    """
    User-defined group of source files that contain overlapping transactions.
    This is the TRIGGER for resolution - marking sources as overlapping initiates matching.
    """

    RESOLUTION_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]

    # Unique identifier: osg_xxxxxxxx
    group_id = models.CharField(max_length=20, unique=True, blank=True)

    name = models.CharField(max_length=200)

    # All artifacts in this group are considered to have overlapping transactions
    data_source_artifacts = models.ManyToManyField(
        'DataSourceArtifact',
        related_name='overlapping_groups'
    )

    # Target account (all sources must be for same account)
    bank_account = models.ForeignKey(
        'bank_accounts.BankAccount',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='overlapping_groups'
    )
    credit_card = models.ForeignKey(
        'credit_cards.CreditCard',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='overlapping_groups'
    )

    resolution_status = models.CharField(
        max_length=20,
        choices=RESOLUTION_STATUS_CHOICES,
        default='pending'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def generate_group_id(cls):
        """Generate unique group_id: osg_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"osg_{short_id}"
            if not cls.objects.filter(group_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.group_id:
            self.group_id = self.generate_group_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.group_id} - {self.name}"


class ResolutionSession(models.Model):
    """Tracks a transaction resolution operation for an overlapping group."""

    STATUS_CHOICES = [
        ('suggesting', 'Generating Suggestions'),
        ('review', 'In Review'),
        ('executing', 'Executing'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    # Unique identifier: rs_xxxxxxxx
    session_id = models.CharField(max_length=20, unique=True, blank=True)

    # The overlapping group being resolved
    overlapping_group = models.ForeignKey(
        'OverlappingSourceGroup',
        on_delete=models.CASCADE,
        related_name='sessions'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='suggesting')

    # Summary statistics
    stats = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    @classmethod
    def generate_session_id(cls):
        """Generate unique session_id: rs_xxxxxxxx"""
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"rs_{short_id}"
            if not cls.objects.filter(session_id=candidate).exists():
                return candidate

    def save(self, *args, **kwargs):
        if not self.session_id:
            self.session_id = self.generate_session_id()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.session_id} - {self.status}"


class ResolutionSuggestion(models.Model):
    """Suggested grouping of transactions during a resolution session."""

    STATUS_CHOICES = [
        ('pending', 'Pending Review'),
        ('confirmed', 'Confirmed'),
        ('modified', 'Modified'),
        ('rejected', 'Rejected'),
    ]

    session = models.ForeignKey(
        'ResolutionSession',
        on_delete=models.CASCADE,
        related_name='suggestions'
    )

    # Transactions suggested to be grouped
    suggested_transaction_ids = models.JSONField()  # [{"type": "bank", "id": 123}, ...]

    # Suggestion info
    suggestion_score = models.FloatField(default=0.0)
    match_signals = models.JSONField(default=dict)  # {"date": true, "amount": true, ...}

    # User decision
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # If confirmed/modified, which transaction is primary
    confirmed_primary_id = models.IntegerField(null=True, blank=True)
    confirmed_transaction_ids = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-suggestion_score']

    def __str__(self):
        return f"Suggestion {self.id} - {self.status} ({self.suggestion_score:.2f})"
