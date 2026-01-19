from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0019_add_credit_card_to_artifact'),
    ]

    operations = [
        migrations.AlterField(
            model_name='creditcardpdfextraction',
            name='card_number_mask',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
