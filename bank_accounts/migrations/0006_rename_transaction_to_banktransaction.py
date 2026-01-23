# Generated manually for renaming Transaction to BankTransaction

from django.db import migrations


class Migration(migrations.Migration):
    """
    Rename Transaction model to BankTransaction.

    Uses SeparateDatabaseAndState since db_table is explicitly set
    and doesn't need to change.
    """

    dependencies = [
        ('bank_accounts', '0005_remove_creditcardpaymentmatch_to_credit_cards'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameModel(
                    old_name='Transaction',
                    new_name='BankTransaction',
                ),
            ],
            database_operations=[
                # No database operations - db_table is explicitly set to 'dashboard_transaction'
            ],
        ),
    ]
