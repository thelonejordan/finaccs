# Migrate existing link data into first-class link tables

from django.db import migrations


def migrate_category_links(apps, schema_editor):
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    CreditCardTransaction = apps.get_model('credit_cards', 'CreditCardTransaction')
    CategoryLink = apps.get_model('links', 'CategoryLink')
    for txn in BankTransaction.objects.filter(
        resolved_transaction__isnull=False,
        category__isnull=False,
    ).exclude(category=''):
        if not CategoryLink.objects.filter(
            resolved_transaction_id=txn.resolved_transaction_id,
        ).exists():
            CategoryLink.objects.create(
                resolved_transaction_id=txn.resolved_transaction_id,
                category=txn.category,
                origin_transaction_type='bank',
                origin_transaction_id=txn.id,
            )
    for txn in CreditCardTransaction.objects.filter(
        resolved_transaction__isnull=False,
        category__isnull=False,
    ).exclude(category=''):
        if not CategoryLink.objects.filter(
            resolved_transaction_id=txn.resolved_transaction_id,
        ).exists():
            CategoryLink.objects.create(
                resolved_transaction_id=txn.resolved_transaction_id,
                category=txn.category,
                origin_transaction_type='credit_card',
                origin_transaction_id=txn.id,
            )


def migrate_story_links(apps, schema_editor):
    StoryTransaction = apps.get_model('stories', 'StoryTransaction')
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    CreditCardTransaction = apps.get_model('credit_cards', 'CreditCardTransaction')
    StoryLink = apps.get_model('links', 'StoryLink')
    for st in StoryTransaction.objects.all():
        if st.transaction_type == 'bank':
            txn = BankTransaction.objects.filter(id=st.transaction_id).first()
        else:
            txn = CreditCardTransaction.objects.filter(id=st.transaction_id).first()
        if txn and txn.resolved_transaction_id:
            StoryLink.objects.get_or_create(
                resolved_transaction_id=txn.resolved_transaction_id,
                story_id=st.story_id,
                defaults={
                    'origin_transaction_type': st.transaction_type,
                    'origin_transaction_id': st.transaction_id,
                },
            )


def migrate_entity_links(apps, schema_editor):
    EntityTransaction = apps.get_model('entities', 'EntityTransaction')
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    CreditCardTransaction = apps.get_model('credit_cards', 'CreditCardTransaction')
    EntityLink = apps.get_model('links', 'EntityLink')
    for et in EntityTransaction.objects.all():
        if et.transaction_type == 'bank':
            txn = BankTransaction.objects.filter(id=et.transaction_id).first()
        else:
            txn = CreditCardTransaction.objects.filter(id=et.transaction_id).first()
        if txn and txn.resolved_transaction_id:
            EntityLink.objects.get_or_create(
                resolved_transaction_id=txn.resolved_transaction_id,
                entity_id=et.entity_id,
                defaults={
                    'origin_transaction_type': et.transaction_type,
                    'origin_transaction_id': et.transaction_id,
                },
            )


def migrate_self_transfer_links(apps, schema_editor):
    BankTransaction = apps.get_model('bank_accounts', 'BankTransaction')
    SelfTransferLink = apps.get_model('links', 'SelfTransferLink')
    seen = set()
    for txn in BankTransaction.objects.filter(
        resolved_transaction__isnull=False,
        linked_transaction__isnull=False,
    ):
        ra = txn.resolved_transaction_id
        other = txn.linked_transaction
        if not other or not other.resolved_transaction_id:
            continue
        rb = other.resolved_transaction_id
        if ra == rb:
            continue
        key = (min(ra, rb), max(ra, rb))
        if key in seen:
            continue
        seen.add(key)
        if not SelfTransferLink.objects.filter(
            resolved_transaction_a_id=ra,
            resolved_transaction_b_id=rb,
        ).exists() and not SelfTransferLink.objects.filter(
            resolved_transaction_a_id=rb,
            resolved_transaction_b_id=ra,
        ).exists():
            SelfTransferLink.objects.create(
                resolved_transaction_a_id=ra,
                resolved_transaction_b_id=rb,
                origin_transaction_id_a=txn.id,
                origin_transaction_id_b=other.id,
            )


def migrate_cc_payment_links(apps, schema_editor):
    CreditCardPaymentMatch = apps.get_model('credit_cards', 'CreditCardPaymentMatch')
    CreditCardPaymentLink = apps.get_model('links', 'CreditCardPaymentLink')
    for match in CreditCardPaymentMatch.objects.filter(is_active=True):
        bt = match.bank_transaction
        ct = match.credit_card_transaction
        if not bt or not ct or not bt.resolved_transaction_id or not ct.resolved_transaction_id:
            continue
        if CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction_id=bt.resolved_transaction_id,
            cc_resolved_transaction_id=ct.resolved_transaction_id,
        ).exists():
            continue
        CreditCardPaymentLink.objects.create(
            bank_resolved_transaction_id=bt.resolved_transaction_id,
            cc_resolved_transaction_id=ct.resolved_transaction_id,
            offset=match.offset,
            confidence_score=match.confidence_score,
            match_reasons=match.match_reasons or [],
            origin_bank_transaction_id=bt.id,
            origin_cc_transaction_id=ct.id,
            is_active=match.is_active,
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('bank_accounts', '0003_add_transaction_resolution'),
        ('credit_cards', '0003_add_transaction_resolution'),
        ('entities', '0001_initial'),
        ('extractions', '0003_ensure_resolved_for_all_transactions'),
        ('stories', '0001_initial'),
        ('links', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(migrate_category_links, noop, atomic=False),
        migrations.RunPython(migrate_story_links, noop, atomic=False),
        migrations.RunPython(migrate_entity_links, noop, atomic=False),
        migrations.RunPython(migrate_self_transfer_links, noop, atomic=False),
        migrations.RunPython(migrate_cc_payment_links, noop, atomic=False),
    ]
