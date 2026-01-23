# Generated manually for moving CreditCardPaymentMatch from bank_accounts to credit_cards

from django.db import migrations


class Migration(migrations.Migration):
    """
    Remove CreditCardPaymentMatch model from bank_accounts app
    (moved to credit_cards app).

    Uses SeparateDatabaseAndState to update Django's model registry
    without modifying the actual database tables.
    """

    dependencies = [
        ('bank_accounts', '0004_move_models_from_dashboard'),
        ('credit_cards', '0005_move_creditcardpaymentmatch_from_bank_accounts'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(
                    name='CreditCardPaymentMatch',
                ),
            ],
            database_operations=[
                # No database operations - table is now managed by credit_cards
            ],
        ),
    ]
