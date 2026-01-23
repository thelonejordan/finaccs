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

from .transformers import decompress_data
from .models import DataSourceArtifact, TransactionLinkSnapshot
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
        elif artifact.data_source_target == 'credit_card_transactions':
            count = _load_cc_transactions(artifact, reader)
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

    # Bulk create
    BankTransaction.objects.bulk_create(transactions)
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

    # Bulk create
    CreditCardTransaction.objects.bulk_create(transactions)
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
        # Snapshot links before deleting transactions
        _snapshot_links(artifact)

        # Delete transactions
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

    # Bulk create snapshots
    if snapshots:
        TransactionLinkSnapshot.objects.bulk_create(snapshots)


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

    # Clear snapshots after reapplication
    snapshots.delete()


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
