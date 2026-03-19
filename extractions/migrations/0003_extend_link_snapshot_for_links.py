# Extend TransactionLinkSnapshot for category, story, entity and optional target_row_id

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('extractions', '0002_add_transaction_resolution'),
    ]

    operations = [
        migrations.AlterField(
            model_name='transactionlinksnapshot',
            name='link_type',
            field=models.CharField(
                choices=[
                    ('self_transfer', 'Self Transfer'),
                    ('cc_payment', 'Credit Card Payment'),
                    ('category', 'Category'),
                    ('story', 'Story'),
                    ('entity', 'Entity'),
                ],
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='transactionlinksnapshot',
            name='target_row_id',
            field=models.CharField(blank=True, max_length=50),
        ),
    ]
