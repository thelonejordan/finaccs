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
