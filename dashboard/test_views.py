import json
from decimal import Decimal
from datetime import date
from django.test import TestCase, Client
from django.urls import reverse

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction, CreditCardPaymentMatch
from links.models import SelfTransferLink, CreditCardPaymentLink, CategoryLink
from extractions.models import ResolvedTransaction, DataSourceArtifact, ExtractionArtifact, Extraction, SourceFile


def _create_extraction_pipeline(domain='bank_account'):
    """Helper to create SourceFile -> Extraction -> ExtractionArtifact -> DataSourceArtifact."""
    sf = SourceFile.objects.create(
        filename=f'test_{domain}_{SourceFile.objects.count()}.csv',
        file_path='test.csv', file_hash='testhash', domain=domain,
    )
    ext = Extraction.objects.create(
        source_file=sf, extractor_name='test', status='completed',
    )
    ea = ExtractionArtifact.objects.create(
        extraction=ext, artifact_type='transactions',
        content=b'test', content_hash='testhash',
    )
    dsa = DataSourceArtifact.objects.create(
        source_artifact=ea,
        data_source_target=f'{domain}_transactions',
        content=b'test', content_hash='testhash', transformer='test',
        status='loaded', enabled=True, hidden=False,
    )
    return dsa


class SelfTransferLinkViewTests(TestCase):
    """Test self-transfer link endpoint with JIT ResolvedTransaction creation."""

    def setUp(self):
        self.client = Client()
        self.account_a = BankAccount.objects.create(
            nickname='Account A', bank_name='Bank A',
            account_number='1111111111', ifsc_code='AAAA0001111',
        )
        self.account_b = BankAccount.objects.create(
            nickname='Account B', bank_name='Bank B',
            account_number='2222222222', ifsc_code='BBBB0002222',
        )
        self.dsa = _create_extraction_pipeline('bank_account')

        self.txn_a = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Transfer to Account B',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('5000.00'), credit_amount=Decimal('0.00'),
            reference_number='REFA', closing_balance=Decimal('5000.00'),
            bank_account=self.account_a, data_source_artifact=self.dsa,
        )
        self.txn_b = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Transfer from Account A',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('0.00'), credit_amount=Decimal('5000.00'),
            reference_number='REFB', closing_balance=Decimal('15000.00'),
            bank_account=self.account_b, data_source_artifact=self.dsa,
        )

    def _link_url(self, txn_id):
        return reverse('dashboard:api_link_transaction', kwargs={'transaction_id': txn_id})

    def test_link_transactions_creates_rts_and_link(self):
        """Linking two bank txns without RTs creates both RTs and SelfTransferLink."""
        self.assertIsNone(self.txn_a.resolved_transaction_id)
        self.assertIsNone(self.txn_b.resolved_transaction_id)

        response = self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

        self.txn_a.refresh_from_db()
        self.txn_b.refresh_from_db()
        self.assertIsNotNone(self.txn_a.resolved_transaction_id)
        self.assertIsNotNone(self.txn_b.resolved_transaction_id)
        self.assertTrue(self.txn_a.is_primary)
        self.assertTrue(self.txn_b.is_primary)
        self.assertEqual(self.txn_a.category, 'Self Transfer')
        self.assertEqual(self.txn_b.category, 'Self Transfer')

        link = SelfTransferLink.objects.get(
            resolved_transaction_a_id=self.txn_a.resolved_transaction_id,
            resolved_transaction_b_id=self.txn_b.resolved_transaction_id,
        )
        self.assertEqual(link.origin_transaction_id_a, self.txn_a.id)
        self.assertEqual(link.origin_transaction_id_b, self.txn_b.id)

    def test_link_creates_category_links(self):
        """Linking creates CategoryLink('Self Transfer') on both RTs."""
        self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        self.txn_a.refresh_from_db()
        self.txn_b.refresh_from_db()
        for rt_id in (self.txn_a.resolved_transaction_id, self.txn_b.resolved_transaction_id):
            link = CategoryLink.objects.get(resolved_transaction_id=rt_id)
            self.assertEqual(link.category, 'Self Transfer')

    def test_link_with_one_existing_rt(self):
        """Linking when one txn has RT creates RT for the other."""
        rt_a = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.txn_a.id,
            date=self.txn_a.date, amount=Decimal('-5000.00'),
            bank_account=self.account_a,
        )
        self.txn_a.resolved_transaction_id = rt_a.id
        self.txn_a.is_primary = True
        self.txn_a.save()

        response = self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

        self.txn_b.refresh_from_db()
        self.assertIsNotNone(self.txn_b.resolved_transaction_id)
        self.assertEqual(SelfTransferLink.objects.count(), 1)

    def test_duplicate_link_not_created(self):
        """Linking already linked transactions doesn't create duplicate SelfTransferLink."""
        self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        link_count = SelfTransferLink.objects.count()
        self.assertEqual(link_count, 1)

        # Attempt to link again - should fail because txn_a is already linked
        response = self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(SelfTransferLink.objects.count(), link_count)

    def test_unlink_deletes_self_transfer_link(self):
        """Unlinking deletes the SelfTransferLink."""
        self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': self.txn_b.id}),
            content_type='application/json',
        )
        self.assertEqual(SelfTransferLink.objects.count(), 1)

        response = self.client.delete(self._link_url(self.txn_a.id))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(SelfTransferLink.objects.count(), 0)

    def test_link_same_account_rejected(self):
        """Linking transactions from same account returns 400."""
        txn_same = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Same account',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('100'), credit_amount=Decimal('0'),
            reference_number='REFSAME', closing_balance=Decimal('4900'),
            bank_account=self.account_a, data_source_artifact=self.dsa,
        )
        response = self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': txn_same.id}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_link_nonexistent_target_returns_404(self):
        response = self.client.post(
            self._link_url(self.txn_a.id),
            data=json.dumps({'link_to': 99999}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)


class CreditCardPaymentLinkTests(TestCase):
    """Test credit card payment matching creates CreditCardPaymentLink."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account', bank_name='Test Bank',
            account_number='1234567890', ifsc_code='TEST0001234',
        )
        self.credit_card = CreditCard.objects.create(
            nickname='Test Card', card_name='Test Card',
        )
        self.dsa = _create_extraction_pipeline('bank_account')

        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='CC Payment',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('5000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF1', closing_balance=Decimal('10000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
            is_primary=True,
        )
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Payment Received',
            amount=Decimal('-5000.00'), credit_card=self.credit_card,
            data_source_artifact=self.dsa,
        )

    def _matches_url(self):
        return reverse('dashboard:api_cc_payment_matches')

    def test_create_payment_match_creates_link(self):
        """Creating a payment match creates CreditCardPaymentLink with JIT RTs."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        self.assertIsNone(self.cc_txn.resolved_transaction_id)

        response = self.client.post(
            self._matches_url(),
            data=json.dumps({
                'bank_transaction_id': self.bank_txn.id,
                'credit_card_transaction_id': self.cc_txn.id,
            }),
            content_type='application/json',
        )
        # POST creates match and returns 200 (JsonResponse, not 201)
        self.assertIn(response.status_code, (200, 201))

        self.bank_txn.refresh_from_db()
        self.cc_txn.refresh_from_db()
        self.assertIsNotNone(self.bank_txn.resolved_transaction_id)
        self.assertIsNotNone(self.cc_txn.resolved_transaction_id)

        # Verify CreditCardPaymentMatch was created
        self.assertTrue(CreditCardPaymentMatch.objects.filter(
            bank_transaction=self.bank_txn, credit_card_transaction=self.cc_txn,
        ).exists())

        # Verify CreditCardPaymentLink was created
        self.assertTrue(CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction_id=self.bank_txn.resolved_transaction_id,
            cc_resolved_transaction_id=self.cc_txn.resolved_transaction_id,
            is_active=True,
        ).exists())

    def test_payment_match_creates_category_links(self):
        """Creating a payment match creates CategoryLink('Credit Card Payment') on both RTs."""
        self.client.post(
            self._matches_url(),
            data=json.dumps({
                'bank_transaction_id': self.bank_txn.id,
                'credit_card_transaction_id': self.cc_txn.id,
            }),
            content_type='application/json',
        )
        self.bank_txn.refresh_from_db()
        self.cc_txn.refresh_from_db()

        for rt_id in (self.bank_txn.resolved_transaction_id, self.cc_txn.resolved_transaction_id):
            link = CategoryLink.objects.filter(resolved_transaction_id=rt_id).first()
            self.assertIsNotNone(link)
            self.assertEqual(link.category, 'Credit Card Payment')

    def test_payment_match_with_existing_rts(self):
        """Creating payment match when RTs exist doesn't create new RTs."""
        bank_rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-5000.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = bank_rt.id
        self.bank_txn.is_primary = True
        self.bank_txn.save()

        cc_rt = ResolvedTransaction.objects.create(
            transaction_type='credit_card', primary_transaction_id=self.cc_txn.id,
            date=self.cc_txn.date, amount=Decimal('-5000.00'),
            credit_card=self.credit_card,
        )
        self.cc_txn.resolved_transaction_id = cc_rt.id
        self.cc_txn.is_primary = True
        self.cc_txn.save()

        rt_count_before = ResolvedTransaction.objects.count()
        self.client.post(
            self._matches_url(),
            data=json.dumps({
                'bank_transaction_id': self.bank_txn.id,
                'credit_card_transaction_id': self.cc_txn.id,
            }),
            content_type='application/json',
        )
        self.assertEqual(ResolvedTransaction.objects.count(), rt_count_before)
        self.assertTrue(CreditCardPaymentLink.objects.filter(
            bank_resolved_transaction_id=bank_rt.id,
            cc_resolved_transaction_id=cc_rt.id,
            is_active=True,
        ).exists())

    def test_missing_fields_returns_400(self):
        response = self.client.post(
            self._matches_url(),
            data=json.dumps({'bank_transaction_id': self.bank_txn.id}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)


class BankTransactionCategoryUpdateTests(TestCase):
    """Test bank transaction category update creates CategoryLink."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.dsa = _create_extraction_pipeline('bank_account')
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('-1000.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Test',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000.00'), credit_amount=Decimal('0.00'),
            reference_number='R1', closing_balance=Decimal('9000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
            resolved_transaction=self.rt, is_primary=True,
        )
        self.rt.primary_transaction_id = self.bank_txn.id
        self.rt.save()

    def _update_url(self, txn_id):
        return reverse('dashboard:api_transaction_update', kwargs={'transaction_id': txn_id})

    def test_set_category_creates_categorylink(self):
        """Setting category on bank txn with RT creates CategoryLink."""
        response = self.client.patch(
            self._update_url(self.bank_txn.id),
            data=json.dumps({'category': 'Food & Dining'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['category'], 'Food & Dining')

        link = CategoryLink.objects.get(resolved_transaction_id=self.rt.id)
        self.assertEqual(link.category, 'Food & Dining')
        self.assertEqual(link.origin_transaction_type, 'bank')

    def test_update_category_replaces_categorylink(self):
        """Updating category replaces the CategoryLink."""
        url = self._update_url(self.bank_txn.id)
        self.client.patch(url, data=json.dumps({'category': 'Food'}), content_type='application/json')
        self.client.patch(url, data=json.dumps({'category': 'Travel'}), content_type='application/json')

        self.assertEqual(CategoryLink.objects.filter(resolved_transaction_id=self.rt.id).count(), 1)
        self.assertEqual(CategoryLink.objects.get(resolved_transaction_id=self.rt.id).category, 'Travel')

    def test_category_response_uses_categorylink(self):
        """Response category reflects CategoryLink value."""
        CategoryLink.objects.create(
            resolved_transaction_id=self.rt.id, category='From Link',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        response = self.client.patch(
            self._update_url(self.bank_txn.id),
            data=json.dumps({}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['category'], 'From Link')

    def test_nonexistent_txn_returns_404(self):
        response = self.client.patch(
            self._update_url(99999),
            data=json.dumps({'category': 'X'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)
