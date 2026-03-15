"""
DataSourceLoader for loading/unloading DataSourceArtifacts into transaction tables.

This module handles:
- Loading transformed data into Transaction/CreditCardTransaction tables
- Unloading (deleting transactions while preserving artifact and link snapshots)
- Deleting artifacts completely
- Snapshotting and reapplying transaction links for optimistic reload
"""
import csv
import io
from decimal import Decimal
from typing import List, Optional, Tuple
from django.utils import timezone
from django.db import transaction as db_transaction
from django.db.models import Q

from .transformers import decompress_data
from .models import DataSourceArtifact, TransactionLinkSnapshot, ResolvedTransaction
from project.cache_utils import invalidate_bank_inconsistencies, invalidate_cc_inconsistencies


def load_artifact(artifact: DataSourceArtifact) -> Tuple[int, Optional[str]]:
    """
    Load a DataSourceArtifact into the appropriate transaction table.

    Args:
        artifact: DataSourceArtifact instance to load

    Returns:
        Tuple of (count of transactions loaded, error message or None)
    """
    if artifact.status == 'loaded':
        return 0, "Artifact is already loaded"

    if artifact.status == 'loading':
        return 0, "Artifact is currently being loaded"

    # Check entity is assigned
    if artifact.data_source_target == 'bank_account_transactions' and not artifact.bank_account:
        return 0, "No bank account assigned to artifact"
    if artifact.data_source_target == 'credit_card_transactions' and not artifact.credit_card:
        return 0, "No credit card assigned to artifact"

    # Mark as loading
    artifact.status = 'loading'
    artifact.save()

    try:
        # Decompress and parse CSV
        csv_data = decompress_data(artifact.content)
        reader = csv.DictReader(io.StringIO(csv_data))

        if artifact.data_source_target == 'bank_account_transactions':
            count = _load_bank_transactions(artifact, reader)
            invalidate_bank_inconsistencies()
        elif artifact.data_source_target == 'credit_card_transactions':
            count = _load_cc_transactions(artifact, reader)
            invalidate_cc_inconsistencies()
        else:
            raise ValueError(f"Unknown data source target: {artifact.data_source_target}")

        # Mark as loaded
        artifact.status = 'loaded'
        artifact.loaded_at = timezone.now()
        artifact.error_message = ''
        artifact.save()

        # Try to reapply any saved links
        _reapply_links(artifact)

        return count, None

    except Exception as e:
        artifact.status = 'error'
        artifact.error_message = str(e)
        artifact.save()
        return 0, str(e)


def _load_bank_transactions(artifact: DataSourceArtifact, reader) -> int:
    """Load bank account transactions from CSV reader."""
    from bank_accounts.models import BankTransaction

    transactions = []
    for row in reader:
        # Parse row
        date_str = row.get('date', '')
        value_date_str = row.get('value_date', '')
        narration = row.get('narration', '')
        debit = Decimal(row.get('debit_amount', '0') or '0')
        credit = Decimal(row.get('credit_amount', '0') or '0')
        ref = row.get('reference_number', '')
        balance = Decimal(row.get('closing_balance', '0') or '0')
        row_id = row.get('row_id', '')

        txn = BankTransaction(
            date=date_str if date_str else None,
            value_date=value_date_str if value_date_str else date_str,
            narration=narration,
            debit_amount=debit,
            credit_amount=credit,
            reference_number=ref,
            closing_balance=balance,
            bank_account=artifact.bank_account,
            data_source_artifact=artifact,
            artifact_row_id=str(row_id),
            row_number=int(row_id) if row_id else 0,
        )
        transactions.append(txn)

    BankTransaction.objects.bulk_create(transactions)
    created = list(
        BankTransaction.objects.filter(data_source_artifact=artifact)
        .order_by('row_number', 'id')
    )
    if not created:
        return len(transactions)
    resolved_list = [
        ResolvedTransaction(
            transaction_type='bank',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=txn.credit_amount - txn.debit_amount,
            bank_account=artifact.bank_account,
            credit_card=None,
        )
        for txn in created
    ]
    ResolvedTransaction.objects.bulk_create(resolved_list)
    for i, txn in enumerate(created):
        txn.resolved_transaction_id = resolved_list[i].id
        txn.is_primary = True
    BankTransaction.objects.bulk_update(created, ['resolved_transaction_id', 'is_primary'])
    return len(transactions)


def _load_cc_transactions(artifact: DataSourceArtifact, reader) -> int:
    """Load credit card transactions from CSV reader."""
    from credit_cards.models import CreditCardTransaction

    transactions = []
    for row in reader:
        # Parse row
        date_str = row.get('date', '')
        narration = row.get('narration', '')
        debit = Decimal(row.get('debit_amount', '0') or '0')
        credit = Decimal(row.get('credit_amount', '0') or '0')
        intl_amount_str = row.get('intl_amount', '')
        intl_currency = row.get('intl_currency', '')
        exchange_rate_str = row.get('exchange_rate', '')
        row_id = row.get('row_id', '')

        # Amount: debit is positive charge, credit is negative payment
        amount = debit - credit

        intl_amount = Decimal(intl_amount_str) if intl_amount_str else Decimal('0')
        exchange_rate = Decimal(exchange_rate_str) if exchange_rate_str else None

        txn = CreditCardTransaction(
            date=date_str if date_str else None,
            description=narration,
            amount=amount,
            intl_amount=intl_amount,
            intl_currency=intl_currency,
            exchange_rate=exchange_rate,
            credit_card=artifact.credit_card,
            data_source_artifact=artifact,
            artifact_row_id=str(row_id),
            row_number=int(row_id) if row_id else 0,
        )
        transactions.append(txn)

    CreditCardTransaction.objects.bulk_create(transactions)
    created = list(
        CreditCardTransaction.objects.filter(data_source_artifact=artifact)
        .order_by('row_number', 'id')
    )
    if not created:
        return len(transactions)
    resolved_list = [
        ResolvedTransaction(
            transaction_type='credit_card',
            primary_transaction_id=txn.id,
            date=txn.date,
            amount=txn.amount,
            bank_account=None,
            credit_card=artifact.credit_card,
        )
        for txn in created
    ]
    ResolvedTransaction.objects.bulk_create(resolved_list)
    for i, txn in enumerate(created):
        txn.resolved_transaction_id = resolved_list[i].id
        txn.is_primary = True
    CreditCardTransaction.objects.bulk_update(created, ['resolved_transaction_id', 'is_primary'])
    return len(transactions)


def unload_artifact(artifact: DataSourceArtifact) -> Tuple[int, Optional[str]]:
    """
    Unload a DataSourceArtifact by deleting its transactions but preserving the artifact.

    Before deleting, snapshots any existing links for potential reapplication on reload.

    Args:
        artifact: DataSourceArtifact instance to unload

    Returns:
        Tuple of (count of transactions deleted, error message or None)
    """
    if artifact.status != 'loaded':
        return 0, "Artifact is not loaded"

    try:
        _snapshot_links(artifact)
        _promote_primary_if_needed(artifact)

        if artifact.data_source_target == 'bank_account_transactions':
            from bank_accounts.models import BankTransaction
            count, _ = BankTransaction.objects.filter(data_source_artifact=artifact).delete()
            invalidate_bank_inconsistencies()
        elif artifact.data_source_target == 'credit_card_transactions':
            from credit_cards.models import CreditCardTransaction
            count, _ = CreditCardTransaction.objects.filter(data_source_artifact=artifact).delete()
            invalidate_cc_inconsistencies()
        else:
            return 0, f"Unknown data source target: {artifact.data_source_target}"

        # Update artifact status
        artifact.status = 'unloaded'
        artifact.loaded_at = None
        artifact.save()

        return count, None

    except Exception as e:
        return 0, str(e)


def delete_artifact(artifact: DataSourceArtifact) -> Tuple[bool, Optional[str]]:
    """
    Delete a DataSourceArtifact and all its transactions.

    Args:
        artifact: DataSourceArtifact instance to delete

    Returns:
        Tuple of (success boolean, error message or None)
    """
    try:
        # First unload if loaded
        if artifact.status == 'loaded':
            unload_artifact(artifact)

        # Delete the artifact (cascades to link snapshots)
        artifact.delete()
        return True, None

    except Exception as e:
        return False, str(e)


def _promote_primary_if_needed(artifact: DataSourceArtifact):
    """
    Before deleting this artifact's transactions, for any ResolvedTransaction whose
    primary is in the delete set, promote another member (not in the artifact) so links
    remain displayed.
    """
    if artifact.data_source_target == 'bank_account_transactions':
        from bank_accounts.models import BankTransaction
        txns_in_artifact = list(
            BankTransaction.objects.filter(data_source_artifact=artifact).values_list('id', flat=True)
        )
        if not txns_in_artifact:
            return
        delete_ids = set(txns_in_artifact)
        resolved_ids = set(
            BankTransaction.objects.filter(id__in=txns_in_artifact)
            .values_list('resolved_transaction_id', flat=True)
        )
        resolved_ids.discard(None)
        for rid in resolved_ids:
            resolved = ResolvedTransaction.objects.filter(id=rid).first()
            if not resolved or resolved.primary_transaction_id not in delete_ids:
                continue
            other = (
                BankTransaction.objects.filter(resolved_transaction_id=rid)
                .exclude(data_source_artifact=artifact)
                .first()
            )
            if other:
                resolved.bank_transactions.update(is_primary=False)
                other.is_primary = True
                other.save(update_fields=['is_primary'])
                resolved.primary_transaction_id = other.id
                resolved.save(update_fields=['primary_transaction_id'])
    elif artifact.data_source_target == 'credit_card_transactions':
        from credit_cards.models import CreditCardTransaction
        txns_in_artifact = list(
            CreditCardTransaction.objects.filter(data_source_artifact=artifact).values_list('id', flat=True)
        )
        if not txns_in_artifact:
            return
        delete_ids = set(txns_in_artifact)
        resolved_ids = set(
            CreditCardTransaction.objects.filter(id__in=txns_in_artifact)
            .values_list('resolved_transaction_id', flat=True)
        )
        resolved_ids.discard(None)
        for rid in resolved_ids:
            resolved = ResolvedTransaction.objects.filter(id=rid).first()
            if not resolved or resolved.primary_transaction_id not in delete_ids:
                continue
            other = (
                CreditCardTransaction.objects.filter(resolved_transaction_id=rid)
                .exclude(data_source_artifact=artifact)
                .first()
            )
            if other:
                resolved.credit_card_transactions.update(is_primary=False)
                other.is_primary = True
                other.save(update_fields=['is_primary'])
                resolved.primary_transaction_id = other.id
                resolved.save(update_fields=['primary_transaction_id'])


def _snapshot_links(artifact: DataSourceArtifact):
    """
    Snapshot existing transaction links before unloading.

    Saves self-transfer links (Transaction.linked_transaction) and
    credit card payment links (CreditCardPaymentMatch).
    """
    # Clear existing snapshots for this artifact
    TransactionLinkSnapshot.objects.filter(data_source_artifact=artifact).delete()

    snapshots = []

    if artifact.data_source_target == 'bank_account_transactions':
        from bank_accounts.models import BankTransaction
        from credit_cards.models import CreditCardPaymentMatch

        # Snapshot self-transfer links
        transactions = BankTransaction.objects.filter(
            data_source_artifact=artifact,
            linked_transaction__isnull=False
        ).select_related('linked_transaction')

        for txn in transactions:
            if txn.artifact_row_id and txn.linked_transaction:
                # Find the target's artifact_row_id
                target_row_id = txn.linked_transaction.artifact_row_id
                if target_row_id:
                    snapshots.append(TransactionLinkSnapshot(
                        data_source_artifact=artifact,
                        link_type='self_transfer',
                        source_row_id=txn.artifact_row_id,
                        target_row_id=target_row_id,
                        link_metadata={
                            'linked_txn_artifact_id': txn.linked_transaction.data_source_artifact_id
                        } if txn.linked_transaction.data_source_artifact_id else {}
                    ))

        # Snapshot credit card payment matches
        matches = CreditCardPaymentMatch.objects.filter(
            bank_transaction__data_source_artifact=artifact
        ).select_related('bank_transaction', 'credit_card_transaction')

        for match in matches:
            if match.bank_transaction.artifact_row_id and match.credit_card_transaction:
                cc_row_id = match.credit_card_transaction.artifact_row_id
                if cc_row_id:
                    snapshots.append(TransactionLinkSnapshot(
                        data_source_artifact=artifact,
                        link_type='cc_payment',
                        source_row_id=match.bank_transaction.artifact_row_id,
                        target_row_id=cc_row_id,
                        link_metadata={
                            'offset': float(match.offset),
                            'confidence_score': match.confidence_score,
                            'match_reasons': match.match_reasons,
                            'cc_artifact_id': match.credit_card_transaction.data_source_artifact_id
                        }
                    ))

        _snapshot_category_story_entity(artifact, snapshots)

    if snapshots:
        TransactionLinkSnapshot.objects.bulk_create(snapshots)


def _snapshot_category_story_entity(artifact: DataSourceArtifact, snapshots: list):
    if artifact.data_source_target != 'bank_account_transactions':
        return
    from bank_accounts.models import BankTransaction
    txns = list(
        BankTransaction.objects.filter(data_source_artifact=artifact)
        .filter(artifact_row_id__isnull=False)
        .exclude(artifact_row_id='')
    )
    if not txns:
        return
    try:
        from links.models import CategoryLink, StoryLink, EntityLink
        use_links = True
    except ImportError:
        use_links = False
    from stories.models import StoryTransaction
    from entities.models import EntityTransaction
    for txn in txns:
        if use_links and txn.resolved_transaction_id:
            cat_links = CategoryLink.objects.filter(resolved_transaction_id=txn.resolved_transaction_id).order_by('-created_at')[:1]
            if cat_links:
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='category',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'category': cat_links[0].category},
                ))
            for sl in StoryLink.objects.filter(resolved_transaction_id=txn.resolved_transaction_id).select_related('story'):
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='story',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'story_id': sl.story.story_id},
                ))
            for el in EntityLink.objects.filter(resolved_transaction_id=txn.resolved_transaction_id).select_related('entity'):
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='entity',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'entity_id': el.entity.entity_id},
                ))
        else:
            if txn.category:
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='category',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'category': txn.category},
                ))
            for st in StoryTransaction.objects.filter(transaction_type='bank', transaction_id=txn.id).select_related('story'):
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='story',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'story_id': st.story.story_id},
                ))
            for et in EntityTransaction.objects.filter(transaction_type='bank', transaction_id=txn.id).select_related('entity'):
                snapshots.append(TransactionLinkSnapshot(
                    data_source_artifact=artifact,
                    link_type='entity',
                    source_row_id=txn.artifact_row_id,
                    target_row_id='',
                    link_metadata={'entity_id': et.entity.entity_id},
                ))


def _reapply_links(artifact: DataSourceArtifact):
    """
    Attempt to reapply snapshotted links after reload.

    This is optimistic - if the target transaction doesn't exist, the link is skipped.
    """
    snapshots = TransactionLinkSnapshot.objects.filter(data_source_artifact=artifact)

    if not snapshots.exists():
        return

    if artifact.data_source_target == 'bank_account_transactions':
        from bank_accounts.models import BankTransaction
        from credit_cards.models import CreditCardPaymentMatch
        from credit_cards.models import CreditCardTransaction

        # Build lookup of new transactions by row_id
        new_txns = {
            txn.artifact_row_id: txn
            for txn in BankTransaction.objects.filter(data_source_artifact=artifact)
            if txn.artifact_row_id
        }

        for snapshot in snapshots:
            source_txn = new_txns.get(snapshot.source_row_id)
            if not source_txn:
                continue

            if snapshot.link_type == 'self_transfer':
                # Find target transaction
                target_artifact_id = snapshot.link_metadata.get('linked_txn_artifact_id')
                if target_artifact_id:
                    target_txn = BankTransaction.objects.filter(
                        data_source_artifact_id=target_artifact_id,
                        artifact_row_id=snapshot.target_row_id
                    ).first()
                else:
                    # Same artifact
                    target_txn = new_txns.get(snapshot.target_row_id)

                if target_txn and source_txn.linked_transaction is None:
                    source_txn.linked_transaction = target_txn
                    source_txn.save()
                if target_txn:
                    _reapply_create_self_transfer_link(source_txn, target_txn)

            elif snapshot.link_type == 'cc_payment':
                # Find target CC transaction
                cc_artifact_id = snapshot.link_metadata.get('cc_artifact_id')
                if cc_artifact_id:
                    target_cc_txn = CreditCardTransaction.objects.filter(
                        data_source_artifact_id=cc_artifact_id,
                        artifact_row_id=snapshot.target_row_id
                    ).first()

                    if target_cc_txn:
                        # Check if match already exists
                        existing = CreditCardPaymentMatch.objects.filter(
                            bank_transaction=source_txn
                        ).first()

                        if not existing:
                            CreditCardPaymentMatch.objects.create(
                                bank_transaction=source_txn,
                                credit_card_transaction=target_cc_txn,
                                offset=Decimal(str(snapshot.link_metadata.get('offset', 0))),
                                confidence_score=snapshot.link_metadata.get('confidence_score', 0),
                                match_reasons=snapshot.link_metadata.get('match_reasons', []),
                            )
                        _reapply_create_cc_payment_link(source_txn, target_cc_txn, snapshot.link_metadata)

            elif snapshot.link_type == 'category':
                _reapply_create_category_link(source_txn, snapshot.link_metadata)
            elif snapshot.link_type == 'story':
                _reapply_create_story_link(source_txn, snapshot.link_metadata)
            elif snapshot.link_type == 'entity':
                _reapply_create_entity_link(source_txn, snapshot.link_metadata)

    snapshots.delete()


def _reapply_create_self_transfer_link(source_txn, target_txn):
    try:
        from links.models import SelfTransferLink
    except ImportError:
        return
    if not source_txn.resolved_transaction_id or not target_txn.resolved_transaction_id:
        return
    if source_txn.resolved_transaction_id == target_txn.resolved_transaction_id:
        return
    ra, rb = source_txn.resolved_transaction_id, target_txn.resolved_transaction_id
    if SelfTransferLink.objects.filter(
        Q(resolved_transaction_a_id=ra, resolved_transaction_b_id=rb)
        | Q(resolved_transaction_a_id=rb, resolved_transaction_b_id=ra)
    ).exists():
        return
    SelfTransferLink.objects.create(
        resolved_transaction_a_id=ra,
        resolved_transaction_b_id=rb,
        origin_transaction_id_a=source_txn.id,
        origin_transaction_id_b=target_txn.id,
    )


def _reapply_create_cc_payment_link(source_txn, target_cc_txn, link_metadata):
    try:
        from links.models import CreditCardPaymentLink
    except ImportError:
        return
    if not source_txn.resolved_transaction_id or not target_cc_txn.resolved_transaction_id:
        return
    if CreditCardPaymentLink.objects.filter(
        bank_resolved_transaction_id=source_txn.resolved_transaction_id,
        cc_resolved_transaction_id=target_cc_txn.resolved_transaction_id,
    ).exists():
        return
    CreditCardPaymentLink.objects.create(
        bank_resolved_transaction_id=source_txn.resolved_transaction_id,
        cc_resolved_transaction_id=target_cc_txn.resolved_transaction_id,
        offset=Decimal(str(link_metadata.get('offset', 0))),
        confidence_score=link_metadata.get('confidence_score', 0),
        match_reasons=link_metadata.get('match_reasons', []),
        origin_bank_transaction_id=source_txn.id,
        origin_cc_transaction_id=target_cc_txn.id,
    )


def _reapply_create_category_link(source_txn, link_metadata):
    try:
        from links.models import CategoryLink
    except ImportError:
        return
    category = link_metadata.get('category')
    if not category or not source_txn.resolved_transaction_id:
        return
    if CategoryLink.objects.filter(resolved_transaction_id=source_txn.resolved_transaction_id).exists():
        return
    CategoryLink.objects.create(
        resolved_transaction_id=source_txn.resolved_transaction_id,
        category=category,
        origin_transaction_type='bank',
        origin_transaction_id=source_txn.id,
    )


def _reapply_create_story_link(source_txn, link_metadata):
    try:
        from links.models import StoryLink
        from stories.models import Story
    except ImportError:
        return
    story_id = link_metadata.get('story_id')
    if not story_id or not source_txn.resolved_transaction_id:
        return
    story = Story.objects.filter(story_id=story_id).first()
    if not story:
        return
    StoryLink.objects.get_or_create(
        resolved_transaction_id=source_txn.resolved_transaction_id,
        story=story,
        defaults={
            'origin_transaction_type': 'bank',
            'origin_transaction_id': source_txn.id,
        },
    )


def _reapply_create_entity_link(source_txn, link_metadata):
    try:
        from links.models import EntityLink
        from entities.models import Entity
    except ImportError:
        return
    entity_id = link_metadata.get('entity_id')
    if not entity_id or not source_txn.resolved_transaction_id:
        return
    entity = Entity.objects.filter(entity_id=entity_id).first()
    if not entity:
        return
    EntityLink.objects.get_or_create(
        resolved_transaction_id=source_txn.resolved_transaction_id,
        entity=entity,
        defaults={
            'origin_transaction_type': 'bank',
            'origin_transaction_id': source_txn.id,
        },
    )


def reload_artifact(artifact: DataSourceArtifact) -> Tuple[int, Optional[str]]:
    """
    Unload and reload an artifact, preserving links through snapshots.

    Args:
        artifact: DataSourceArtifact instance to reload

    Returns:
        Tuple of (count of transactions loaded, error message or None)
    """
    if artifact.status == 'loaded':
        unload_artifact(artifact)

    return load_artifact(artifact)
