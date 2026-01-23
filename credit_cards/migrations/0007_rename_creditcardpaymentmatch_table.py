# Generated manually to rename CreditCardPaymentMatch table

from django.db import migrations


class Migration(migrations.Migration):
    """
    Rename CreditCardPaymentMatch table to match new app location.
    """

    dependencies = [
        ('credit_cards', '0006_update_banktransaction_reference'),
        ('bank_accounts', '0007_rename_tables'),
    ]

    operations = [
        # Rename CreditCardPaymentMatch table (from dashboard)
        migrations.RunSQL(
            sql="ALTER TABLE dashboard_creditcardpaymentmatch RENAME TO credit_cards_creditcardpaymentmatch",
            reverse_sql="ALTER TABLE credit_cards_creditcardpaymentmatch RENAME TO dashboard_creditcardpaymentmatch",
        ),
    ]
