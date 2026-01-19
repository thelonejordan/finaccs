from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('credit_cards', '0018_add_intl_currency_exchange_rate'),
    ]

    operations = [
        migrations.AddField(
            model_name='extractionartifact',
            name='credit_card',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='artifacts',
                to='credit_cards.creditcard',
            ),
        ),
    ]
