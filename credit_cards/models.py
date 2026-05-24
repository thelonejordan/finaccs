import secrets
from django.db import models


def generate_emi_id():
    return f"emi_{secrets.token_hex(4)}"


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
    data_source_artifact = models.ForeignKey(
        'extractions.DataSourceArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cc_transactions'
    )
    artifact_row_id = models.CharField(max_length=50, blank=True)  # For link snapshot matching
    row_number = models.IntegerField(default=0)  # Position in extracted CSV for ordering

    # Transaction Resolution fields
    resolved_transaction = models.ForeignKey(
        'extractions.ResolvedTransaction',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='credit_card_transactions'
    )
    is_primary = models.BooleanField(default=False)  # Is this the display source?

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


class CreditCardPaymentMatch(models.Model):
    """Links bank CC payment to corresponding credit card payment transaction."""

    bank_transaction = models.OneToOneField(
        'bank_accounts.BankTransaction',
        on_delete=models.CASCADE,
        related_name='cc_payment_match'
    )
    credit_card_transaction = models.OneToOneField(
        'CreditCardTransaction',
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
        db_table = 'credit_cards_creditcardpaymentmatch'

    def __str__(self):
        return f"Match: Bank {self.bank_transaction_id} <-> CC {self.credit_card_transaction_id}"


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


class CreditCardEMI(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('foreclosed', 'Foreclosed'),
    ]

    emi_id = models.CharField(max_length=20, unique=True, default=generate_emi_id)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    credit_card = models.ForeignKey(
        CreditCard,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='emis',
    )

    original_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    num_installments = models.IntegerField(null=True, blank=True)
    monthly_installment = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    creation_date = models.DateField(null=True, blank=True)
    finish_date = models.DateField(null=True, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    source_artifact = models.ForeignKey(
        'extractions.ExtractionArtifact',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='emis',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'credit_cards_creditcardemi'

    def __str__(self):
        return f"{self.name} ({self.emi_id})"
