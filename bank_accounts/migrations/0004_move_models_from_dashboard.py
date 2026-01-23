# Generated manually for moving models from dashboard to bank_accounts

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Move Transaction, TransactionLog, FileLoadLog, AccountLog,
    CreditCardPaymentMatch, and DismissedBankInconsistency models
    from dashboard app to bank_accounts app.

    Uses SeparateDatabaseAndState to update Django's model registry
    without modifying the actual database tables.
    """

    dependencies = [
        ('bank_accounts', '0003_delete_bankextractionartifact_delete_extractedcsv_and_more'),
        ('credit_cards', '0004_remove_extractionartifact_extraction_and_more'),
        ('extractions', '0002_add_indexes_for_experimental_queries'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='Transaction',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('date', models.DateField()),
                        ('narration', models.TextField()),
                        ('value_date', models.DateField()),
                        ('debit_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                        ('credit_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                        ('reference_number', models.CharField(max_length=50)),
                        ('closing_balance', models.DecimalField(decimal_places=2, max_digits=12)),
                        ('category', models.CharField(blank=True, max_length=50)),
                        ('artifact_row_id', models.CharField(blank=True, max_length=50)),
                        ('row_number', models.IntegerField(default=0)),
                        ('bank_account', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='bank_accounts.bankaccount')),
                        ('data_source_artifact', models.ForeignKey(blank=True, db_index=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bank_transactions', to='extractions.datasourceartifact')),
                        ('linked_transaction', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='linked_from', to='bank_accounts.transaction')),
                    ],
                    options={
                        'ordering': ['-date', '-row_number'],
                        'db_table': 'dashboard_transaction',
                    },
                ),
                migrations.CreateModel(
                    name='TransactionLog',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('action', models.CharField(choices=[('CATEGORY_CHANGE', 'Category Change'), ('LINK', 'Transaction Linked'), ('UNLINK', 'Transaction Unlinked')], max_length=20)),
                        ('old_value', models.CharField(blank=True, max_length=255)),
                        ('new_value', models.CharField(blank=True, max_length=255)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('transaction', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='logs', to='bank_accounts.transaction')),
                    ],
                    options={
                        'ordering': ['-created_at'],
                        'db_table': 'dashboard_transactionlog',
                    },
                ),
                migrations.CreateModel(
                    name='FileLoadLog',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('transaction_count', models.IntegerField(default=0)),
                        ('file_hash', models.CharField(blank=True, max_length=64)),
                        ('category_summary', models.JSONField(blank=True, default=dict)),
                        ('link_source', models.CharField(choices=[('pre_existing', 'Pre-existing Link'), ('none', 'No Link')], default='none', max_length=20)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('bank_account', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='bank_accounts.bankaccount')),
                        ('data_source_artifact', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='load_logs', to='extractions.datasourceartifact')),
                    ],
                    options={
                        'ordering': ['-created_at'],
                        'db_table': 'dashboard_fileloadlog',
                    },
                ),
                migrations.CreateModel(
                    name='AccountLog',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('action', models.CharField(choices=[('CREATE', 'Account Created'), ('UPDATE', 'Account Updated'), ('DELETE', 'Account Deleted')], max_length=20)),
                        ('old_value', models.CharField(blank=True, max_length=255)),
                        ('new_value', models.CharField(blank=True, max_length=255)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('bank_account', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='logs', to='bank_accounts.bankaccount')),
                    ],
                    options={
                        'ordering': ['-created_at'],
                        'db_table': 'dashboard_accountlog',
                    },
                ),
                migrations.CreateModel(
                    name='CreditCardPaymentMatch',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('offset', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                        ('confidence_score', models.FloatField(default=0.0)),
                        ('match_reasons', models.JSONField(default=list)),
                        ('is_active', models.BooleanField(default=True)),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('bank_transaction', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='cc_payment_match', to='bank_accounts.transaction')),
                        ('credit_card_transaction', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='bank_payment_match', to='credit_cards.creditcardtransaction')),
                    ],
                    options={
                        'ordering': ['-created_at'],
                        'db_table': 'dashboard_creditcardpaymentmatch',
                    },
                ),
                migrations.CreateModel(
                    name='DismissedBankInconsistency',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('inconsistency_type', models.CharField(choices=[('duplicate', 'Duplicate Transaction'), ('cross_account', 'Cross-Account Match'), ('balance_gap', 'Balance Discontinuity')], max_length=20)),
                        ('transaction_ids', models.CharField(max_length=255)),
                        ('reason', models.TextField(blank=True)),
                        ('dismissed_at', models.DateTimeField(auto_now_add=True)),
                    ],
                    options={
                        'ordering': ['-dismissed_at'],
                        'unique_together': {('inconsistency_type', 'transaction_ids')},
                        'db_table': 'dashboard_dismissedbankinconsistency',
                    },
                ),
            ],
            database_operations=[
                # No database operations - tables already exist with correct names
            ],
        ),
    ]
