from decimal import Decimal
from datetime import date
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.db import IntegrityError

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction
from extractions.models import ResolvedTransaction
from links.utils import ensure_resolved_transaction


class EnsureResolvedTransactionAtomicityTests(TestCase):
    """Test atomicity of ensure_resolved_transaction utility."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account', bank_name='Test Bank',
            account_number='1234567890', ifsc_code='TEST0001234',
        )
        self.credit_card = CreditCard.objects.create(
            nickname='Test Card', card_name='Test Card',
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Test Bank Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF1', closing_balance=Decimal('9000.00'),
            bank_account=self.bank_account,
        )
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Test CC Txn',
            amount=Decimal('500.00'), credit_card=self.credit_card,
        )

    def test_bank_txn_atomicity_on_save_failure(self):
        """If txn.save() fails, ResolvedTransaction should NOT be created (atomicity)."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        initial_rt_count = ResolvedTransaction.objects.count()

        # Mock save to raise an exception
        with patch.object(BankTransaction, 'save', side_effect=IntegrityError('Save failed')):
            with self.assertRaises(IntegrityError):
                ensure_resolved_transaction(self.bank_txn, 'bank')

        # Verify no orphaned RT was created
        self.assertEqual(ResolvedTransaction.objects.count(), initial_rt_count)
        self.bank_txn.refresh_from_db()
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        self.assertFalse(self.bank_txn.is_primary)

    def test_cc_txn_atomicity_on_save_failure(self):
        """If CC txn.save() fails, ResolvedTransaction should NOT be created (atomicity)."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        initial_rt_count = ResolvedTransaction.objects.count()

        # Mock save to raise an exception
        with patch.object(CreditCardTransaction, 'save', side_effect=IntegrityError('Save failed')):
            with self.assertRaises(IntegrityError):
                ensure_resolved_transaction(self.cc_txn, 'credit_card')

        # Verify no orphaned RT was created
        self.assertEqual(ResolvedTransaction.objects.count(), initial_rt_count)
        self.cc_txn.refresh_from_db()
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        self.assertFalse(self.cc_txn.is_primary)

    def test_rt_creation_failure_rollback(self):
        """If RT creation fails, transaction changes should be rolled back."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        self.assertFalse(self.bank_txn.is_primary)

        # Mock RT creation to fail
        with patch.object(ResolvedTransaction.objects, 'create', side_effect=IntegrityError('RT creation failed')):
            with self.assertRaises(IntegrityError):
                ensure_resolved_transaction(self.bank_txn, 'bank')

        # Verify transaction remains unchanged
        self.bank_txn.refresh_from_db()
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        self.assertFalse(self.bank_txn.is_primary)