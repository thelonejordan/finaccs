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


class SourceFile(models.Model):
    filename = models.CharField(max_length=255, unique=True)
    bank_account = models.ForeignKey(
        BankAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_files'
    )
    file_hash = models.CharField(max_length=64, blank=True)  # SHA-256 hash
    last_loaded_at = models.DateTimeField(null=True, blank=True)
    disabled = models.BooleanField(default=False)  # Exclude from calculations when True
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.filename
