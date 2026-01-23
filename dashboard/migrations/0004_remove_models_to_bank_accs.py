# Generated manually for moving models from dashboard to bank_accs

from django.db import migrations


class Migration(migrations.Migration):
    """
    Remove Transaction, TransactionLog, FileLoadLog, AccountLog,
    CreditCardPaymentMatch, and DismissedBankInconsistency models
    from dashboard app (moved to bank_accs app).

    Uses SeparateDatabaseAndState to update Django's model registry
    without modifying the actual database tables.
    """

    dependencies = [
        ('dashboard', '0003_remove_accountlog_source_file_and_more'),
        ('bank_accs', '0004_move_models_from_dashboard'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.DeleteModel(
                    name='TransactionLog',
                ),
                migrations.DeleteModel(
                    name='CreditCardPaymentMatch',
                ),
                migrations.DeleteModel(
                    name='Transaction',
                ),
                migrations.DeleteModel(
                    name='FileLoadLog',
                ),
                migrations.DeleteModel(
                    name='AccountLog',
                ),
                migrations.DeleteModel(
                    name='DismissedBankInconsistency',
                ),
            ],
            database_operations=[
                # No database operations - tables are now managed by bank_accs
            ],
        ),
    ]
