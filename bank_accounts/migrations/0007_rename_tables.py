# Generated manually to rename tables to match new app naming

from django.db import migrations


class Migration(migrations.Migration):
    """
    Rename database tables to match the new app name (bank_accounts).

    Old names (from dashboard/bank_accs) → New names (bank_accounts)
    """

    dependencies = [
        ('bank_accounts', '0006_rename_transaction_to_banktransaction'),
    ]

    operations = [
        # Rename BankAccount table (from bank_accs)
        migrations.RunSQL(
            sql="ALTER TABLE bank_accs_bankaccount RENAME TO bank_accounts_bankaccount",
            reverse_sql="ALTER TABLE bank_accounts_bankaccount RENAME TO bank_accs_bankaccount",
        ),
        # Rename BankTransaction table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_transaction RENAME TO bank_accounts_banktransaction",
            reverse_sql="ALTER TABLE bank_accounts_banktransaction RENAME TO dashboard_transaction",
        ),
        # Rename TransactionLog table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_transactionlog RENAME TO bank_accounts_transactionlog",
            reverse_sql="ALTER TABLE bank_accounts_transactionlog RENAME TO dashboard_transactionlog",
        ),
        # Rename FileLoadLog table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_fileloadlog RENAME TO bank_accounts_fileloadlog",
            reverse_sql="ALTER TABLE bank_accounts_fileloadlog RENAME TO dashboard_fileloadlog",
        ),
        # Rename AccountLog table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_accountlog RENAME TO bank_accounts_accountlog",
            reverse_sql="ALTER TABLE bank_accounts_accountlog RENAME TO dashboard_accountlog",
        ),
        # Rename DismissedBankInconsistency table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_dismissedbankinconsistency RENAME TO bank_accounts_dismissedbankinconsistency",
            reverse_sql="ALTER TABLE bank_accounts_dismissedbankinconsistency RENAME TO dashboard_dismissedbankinconsistency",
        ),
    ]
