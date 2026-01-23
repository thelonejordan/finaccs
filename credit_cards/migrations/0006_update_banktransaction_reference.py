# Generated manually for updating CreditCardPaymentMatch FK reference

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Update CreditCardPaymentMatch.bank_transaction FK to reference
    bank_accounts.BankTransaction (renamed from Transaction).

    Uses SeparateDatabaseAndState since this is just a model rename,
    the actual FK column doesn't change.
    """

    dependencies = [
        ('credit_cards', '0005_move_creditcardpaymentmatch_from_bank_accounts'),
        ('bank_accounts', '0006_rename_transaction_to_banktransaction'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AlterField(
                    model_name='creditcardpaymentmatch',
                    name='bank_transaction',
                    field=models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='cc_payment_match',
                        to='bank_accounts.banktransaction'
                    ),
                ),
            ],
            database_operations=[
                # No database operations - just updating the model reference
            ],
        ),
    ]
