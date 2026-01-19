from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0020_increase_card_number_mask_length'),
    ]

    operations = [
        migrations.RenameField(
            model_name='creditcardpdfextraction',
            old_name='period_start',
            new_name='statement_period_begin',
        ),
        migrations.RenameField(
            model_name='creditcardpdfextraction',
            old_name='period_end',
            new_name='statement_period_end',
        ),
    ]
