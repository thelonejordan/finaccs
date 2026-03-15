# Durable links revamp: placeholder for backfilling ResolvedTransaction.
#
# This migration is a no-op so "migrate" never holds long-running locks (avoids
# MySQL 1205 Lock wait timeout). Backfill is done separately when the DB is quiet:
#
#   uv run python manage.py backfill_resolved_transactions
#
# Run that after deploy or during maintenance. The app tolerates null
# resolved_transaction until the backfill is run.

from django.db import migrations


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('bank_accounts', '0003_add_transaction_resolution'),
        ('credit_cards', '0003_add_transaction_resolution'),
        ('extractions', '0002_add_transaction_resolution'),
    ]

    operations = [
        migrations.RunPython(noop, noop, atomic=False),
    ]
