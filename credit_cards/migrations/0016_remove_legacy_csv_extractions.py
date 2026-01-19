# Data migration to clean up legacy CreditCardExtractedCSV model records only
# Transaction data is preserved as orphaned records
from django.db import migrations


def remove_legacy_csv_model_data(apps, schema_editor):
    """
    Delete only the legacy CreditCardExtractedCSV records.
    Transactions are preserved (will become orphaned).
    """
    CreditCardExtractedCSV = apps.get_model('credit_cards', 'CreditCardExtractedCSV')

    # Delete all CreditCardExtractedCSV records (FK on transactions is SET_NULL)
    csvs_deleted, _ = CreditCardExtractedCSV.objects.all().delete()
    print(f"  Deleted {csvs_deleted} CreditCardExtractedCSV records")


def noop(apps, schema_editor):
    """No-op reverse migration - data cannot be restored."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0015_backfill_transformer_fields'),
        ('dashboard', '0010_creditcardpaymentmatch'),
    ]

    operations = [
        migrations.RunPython(remove_legacy_csv_model_data, noop),
    ]
