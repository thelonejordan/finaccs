# Generated manually for adding name field to CreditCardExtractedCSV

import shortuuid
from django.db import migrations, models


def generate_names(apps, schema_editor):
    """Populate name field for existing CreditCardExtractedCSV records."""
    CreditCardExtractedCSV = apps.get_model('credit_cards', 'CreditCardExtractedCSV')

    existing_names = set(CreditCardExtractedCSV.objects.exclude(name='').values_list('name', flat=True))

    for csv in CreditCardExtractedCSV.objects.filter(name=''):
        date_str = csv.extracted_at.strftime('%d%m%Y')
        # Generate unique name with collision check
        while True:
            short_id = shortuuid.uuid()[:8]
            candidate = f"cc_extraction_{date_str}_{short_id}"
            if candidate not in existing_names:
                csv.name = candidate
                existing_names.add(candidate)
                csv.save(update_fields=['name'])
                break


def reverse_names(apps, schema_editor):
    """Reverse migration: clear all names."""
    CreditCardExtractedCSV = apps.get_model('credit_cards', 'CreditCardExtractedCSV')
    CreditCardExtractedCSV.objects.all().update(name='')


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0006_creditcardsourcefile_date_range_end_and_more'),
    ]

    operations = [
        # Step 1: Add the name field without unique constraint (to allow empty values during migration)
        migrations.AddField(
            model_name='creditcardextractedcsv',
            name='name',
            field=models.CharField(blank=True, max_length=40, default=''),
        ),
        # Step 2: Populate names for existing records
        migrations.RunPython(generate_names, reverse_names),
        # Step 3: Add unique constraint now that all records have names
        migrations.AlterField(
            model_name='creditcardextractedcsv',
            name='name',
            field=models.CharField(blank=True, max_length=40, unique=True),
        ),
    ]
