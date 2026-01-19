# Schema migration to remove legacy CreditCardExtractedCSV model
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0016_remove_legacy_csv_extractions'),
    ]

    operations = [
        # Remove the FK from CreditCardTransaction first
        migrations.RemoveField(
            model_name='creditcardtransaction',
            name='extracted_csv',
        ),
        # Then delete the model
        migrations.DeleteModel(
            name='CreditCardExtractedCSV',
        ),
    ]
