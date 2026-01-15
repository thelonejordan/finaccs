from django.contrib import admin
from .models import BankAccount, SourceFile


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('nickname', 'bank_name', 'account_number', 'ifsc_code')
    search_fields = ('nickname', 'bank_name', 'account_number')


@admin.register(SourceFile)
class SourceFileAdmin(admin.ModelAdmin):
    list_display = ('filename', 'bank_account', 'created_at')
    list_filter = ('bank_account',)
    search_fields = ('filename',)
