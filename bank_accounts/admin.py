from django.contrib import admin
from .models import BankAccount


@admin.register(BankAccount)
class BankAccountAdmin(admin.ModelAdmin):
    list_display = ('nickname', 'bank_name', 'account_number', 'ifsc_code')
    search_fields = ('nickname', 'bank_name', 'account_number')
