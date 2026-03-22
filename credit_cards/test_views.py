import json
from decimal import Decimal
from datetime import date
from django.test import TestCase, Client
from django.urls import reverse

from credit_cards.models import CreditCard, CreditCardTransaction
from links.models import CategoryLink
from extractions.models import ResolvedTransaction, DataSourceArtifact, ExtractionArtifact, Extraction, SourceFile


def _create_extraction_pipeline(domain='credit_card'):
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


class CreditCardCategoryViewTests(TestCase):
    """Test credit card category endpoint with CategoryLink creation."""

    def setUp(self):
        self.client = Client()
        self.credit_card = CreditCard.objects.create(
            nickname='Test Card', card_name='Test Card',
        )
        self.dsa = _create_extraction_pipeline('credit_card')
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Amazon Purchase',
            amount=Decimal('1500.00'), credit_card=self.credit_card,
            data_source_artifact=self.dsa,
        )

    def _category_url(self, txn_id):
        return reverse('credit_card_transaction_category', kwargs={'transaction_id': txn_id})

    def test_set_category_creates_categorylink(self):
        """Setting category on CC txn creates both txn.category and CategoryLink."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        response = self.client.patch(
            self._category_url(self.cc_txn.id),
            data=json.dumps({'category': 'Shopping'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['category'], 'Shopping')

        self.cc_txn.refresh_from_db()
        self.assertEqual(self.cc_txn.category, 'Shopping')
        self.assertIsNotNone(self.cc_txn.resolved_transaction_id)
        self.assertTrue(self.cc_txn.is_primary)

        link = CategoryLink.objects.get(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id,
        )
        self.assertEqual(link.category, 'Shopping')
        self.assertEqual(link.origin_transaction_type, 'credit_card')
        self.assertEqual(link.origin_transaction_id, self.cc_txn.id)

    def test_update_category_replaces_categorylink(self):
        """Updating category replaces existing CategoryLink."""
        url = self._category_url(self.cc_txn.id)
        self.client.patch(url, data=json.dumps({'category': 'Shopping'}), content_type='application/json')

        self.cc_txn.refresh_from_db()
        rt_id = self.cc_txn.resolved_transaction_id
        self.assertEqual(CategoryLink.objects.filter(resolved_transaction_id=rt_id).count(), 1)

        response = self.client.patch(url, data=json.dumps({'category': 'Entertainment'}), content_type='application/json')
        self.assertEqual(response.json()['category'], 'Entertainment')

        self.cc_txn.refresh_from_db()
        self.assertEqual(self.cc_txn.category, 'Entertainment')
        self.assertEqual(CategoryLink.objects.filter(resolved_transaction_id=rt_id).count(), 1)
        self.assertEqual(CategoryLink.objects.get(resolved_transaction_id=rt_id).category, 'Entertainment')

    def test_clear_category_deletes_categorylink(self):
        """Clearing category (Uncategorized) deletes CategoryLink."""
        url = self._category_url(self.cc_txn.id)
        self.client.patch(url, data=json.dumps({'category': 'Shopping'}), content_type='application/json')

        self.cc_txn.refresh_from_db()
        rt_id = self.cc_txn.resolved_transaction_id
        self.assertEqual(CategoryLink.objects.filter(resolved_transaction_id=rt_id).count(), 1)

        response = self.client.patch(url, data=json.dumps({'category': 'Uncategorized'}), content_type='application/json')
        self.assertEqual(response.json()['category'], 'Uncategorized')

        self.cc_txn.refresh_from_db()
        self.assertEqual(self.cc_txn.category, '')
        self.assertEqual(CategoryLink.objects.filter(resolved_transaction_id=rt_id).count(), 0)

    def test_set_category_on_txn_with_existing_rt(self):
        """Setting category on txn that already has RT doesn't create new RT."""
        rt = ResolvedTransaction.objects.create(
            transaction_type='credit_card', primary_transaction_id=self.cc_txn.id,
            date=self.cc_txn.date, amount=self.cc_txn.amount,
            credit_card=self.credit_card,
        )
        self.cc_txn.resolved_transaction_id = rt.id
        self.cc_txn.is_primary = True
        self.cc_txn.save()

        rt_count_before = ResolvedTransaction.objects.count()
        response = self.client.patch(
            self._category_url(self.cc_txn.id),
            data=json.dumps({'category': 'Food & Dining'}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['category'], 'Food & Dining')
        self.assertEqual(ResolvedTransaction.objects.count(), rt_count_before)
        self.assertEqual(CategoryLink.objects.get(resolved_transaction_id=rt.id).category, 'Food & Dining')

    def test_invalid_transaction_id(self):
        """Setting category on non-existent transaction returns 404."""
        response = self.client.patch(
            self._category_url(99999),
            data=json.dumps({'category': 'Shopping'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)

    def test_invalid_json(self):
        """Sending invalid JSON returns 400."""
        response = self.client.patch(
            self._category_url(self.cc_txn.id),
            data='not json',
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
