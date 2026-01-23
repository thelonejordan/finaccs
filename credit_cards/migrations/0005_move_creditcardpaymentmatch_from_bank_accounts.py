# Generated manually for moving CreditCardPaymentMatch from bank_accounts to credit_cards

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Move CreditCardPaymentMatch model from bank_accounts app to credit_cards app.

    Uses SeparateDatabaseAndState to update Django's model registry
    without modifying the actual database tables.
    """

    dependencies = [
        ('credit_cards', '0004_remove_extractionartifact_extraction_and_more'),
        ('bank_accounts', '0004_move_models_from_dashboard'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
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
            ],
            database_operations=[
                # No database operations - table already exists with correct name
            ],
        ),
    ]
