from django.db import migrations


def backfill_offsets(apps, schema_editor):
    RefundLink = apps.get_model('links', 'RefundLink')
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    CreditCardTransaction = apps.get_model('credit_cards', 'CreditCardTransaction')

    for link in RefundLink.objects.all():
        try:
            if link.origin_refund_type == 'bank':
                refund_txn = BankTransaction.objects.get(id=link.origin_refund_transaction_id)
                refund_amount = refund_txn.credit_amount or refund_txn.debit_amount
            else:
                refund_txn = CreditCardTransaction.objects.get(id=link.origin_refund_transaction_id)
                refund_amount = abs(refund_txn.amount)

            if link.origin_original_type == 'bank':
                orig_txn = BankTransaction.objects.get(id=link.origin_original_transaction_id)
                original_amount = orig_txn.debit_amount or orig_txn.credit_amount
            else:
                orig_txn = CreditCardTransaction.objects.get(id=link.origin_original_transaction_id)
                original_amount = abs(orig_txn.amount)

            link.offset = refund_amount - original_amount
            link.save(update_fields=['offset'])
        except Exception:
            pass


class Migration(migrations.Migration):

    dependencies = [
        ('links', '0003_refundlink_offset'),
        ('bank_accounts', '0001_initial'),
        ('credit_cards', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_offsets, migrations.RunPython.noop),
    ]
