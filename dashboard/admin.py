from django.contrib import admin
from .models import Transaction, TransactionLog, FileLoadLog, AccountLog


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('date', 'narration_short', 'debit_amount', 'credit_amount', 'closing_balance', 'category', 'bank_account')
    list_filter = ('category', 'bank_account')
    search_fields = ('narration', 'reference_number')
    date_hierarchy = 'date'
    ordering = ('-date', '-id')

    def narration_short(self, obj):
        return obj.narration[:50] + '...' if len(obj.narration) > 50 else obj.narration
    narration_short.short_description = 'Narration'


@admin.register(TransactionLog)
class TransactionLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'transaction', 'action', 'old_value', 'new_value')
    list_filter = ('action', 'created_at')
    search_fields = ('transaction__narration',)
    ordering = ('-created_at',)


@admin.register(FileLoadLog)
class FileLoadLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'data_source_artifact', 'bank_account', 'transaction_count', 'link_source')
    list_filter = ('link_source', 'bank_account', 'created_at')
    ordering = ('-created_at',)


@admin.register(AccountLog)
class AccountLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'bank_account', 'action', 'old_value', 'new_value')
    list_filter = ('action', 'created_at')
    ordering = ('-created_at',)
