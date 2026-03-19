# Generated for durable links revamp

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('entities', '0001_initial'),
        ('extractions', '0002_add_transaction_resolution'),
        ('stories', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CategoryLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(max_length=50)),
                ('origin_transaction_type', models.CharField(blank=True, max_length=20, null=True)),
                ('origin_transaction_id', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='category_links', to='extractions.resolvedtransaction')),
            ],
            options={
                'db_table': 'links_categorylink',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='CreditCardPaymentLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('offset', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('confidence_score', models.FloatField(default=0.0)),
                ('match_reasons', models.JSONField(default=list)),
                ('origin_bank_transaction_id', models.IntegerField(blank=True, null=True)),
                ('origin_cc_transaction_id', models.IntegerField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('bank_resolved_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cc_payment_links_bank', to='extractions.resolvedtransaction')),
                ('cc_resolved_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cc_payment_links_cc', to='extractions.resolvedtransaction')),
            ],
            options={
                'db_table': 'links_creditcardpaymentlink',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EntityLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origin_transaction_type', models.CharField(blank=True, max_length=20, null=True)),
                ('origin_transaction_id', models.IntegerField(blank=True, null=True)),
                ('added_at', models.DateTimeField(auto_now_add=True)),
                ('entity', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='entity_links', to='entities.entity')),
                ('resolved_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='entity_links', to='extractions.resolvedtransaction')),
            ],
            options={
                'db_table': 'links_entitylink',
                'ordering': ['-added_at'],
                'unique_together': {('resolved_transaction', 'entity')},
            },
        ),
        migrations.CreateModel(
            name='SelfTransferLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origin_transaction_id_a', models.IntegerField(blank=True, null=True)),
                ('origin_transaction_id_b', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_transaction_a', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='self_transfer_links_as_a', to='extractions.resolvedtransaction')),
                ('resolved_transaction_b', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='self_transfer_links_as_b', to='extractions.resolvedtransaction')),
            ],
            options={
                'db_table': 'links_selftransferlink',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='StoryLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('origin_transaction_type', models.CharField(blank=True, max_length=20, null=True)),
                ('origin_transaction_id', models.IntegerField(blank=True, null=True)),
                ('added_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_transaction', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='story_links', to='extractions.resolvedtransaction')),
                ('story', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='story_links', to='stories.story')),
            ],
            options={
                'db_table': 'links_storylink',
                'ordering': ['-added_at'],
                'unique_together': {('resolved_transaction', 'story')},
            },
        ),
    ]
