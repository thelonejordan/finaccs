import json
from decimal import Decimal
from datetime import date
from django.test import TestCase, Client
from django.urls import reverse

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction
from stories.models import Story
from links.models import StoryLink, CategoryLink
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


class StoryViewJITTests(TestCase):
    """Test Story view endpoints with JIT ResolvedTransaction creation."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account', bank_name='Test Bank',
            account_number='1234567890', ifsc_code='TEST0001234',
        )
        self.credit_card = CreditCard.objects.create(
            nickname='Test Card', card_name='Test Card',
        )
        self.story = Story.objects.create(name='Test Story')
        self.dsa = _create_extraction_pipeline('bank_account')

        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Test Bank Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF1', closing_balance=Decimal('9000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
        )
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Test CC Txn',
            amount=Decimal('500.00'), credit_card=self.credit_card,
            data_source_artifact=self.dsa,
        )

    def _story_txn_url(self, story):
        return reverse('story_transactions', kwargs={'story_id': story.story_id})

    def test_add_story_to_bank_txn_creates_rt_via_api(self):
        """Adding story to bank txn without RT via API creates RT and StoryLink."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['added'], 1)

        self.bank_txn.refresh_from_db()
        self.assertIsNotNone(self.bank_txn.resolved_transaction_id)
        self.assertTrue(self.bank_txn.is_primary)

        story_link = StoryLink.objects.get(
            resolved_transaction_id=self.bank_txn.resolved_transaction_id, story=self.story,
        )
        self.assertEqual(story_link.origin_transaction_type, 'bank')
        self.assertEqual(story_link.origin_transaction_id, self.bank_txn.id)

    def test_add_story_to_cc_txn_creates_rt_via_api(self):
        """Adding story to CC txn without RT via API creates RT and StoryLink."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'credit_card', 'id': self.cc_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['added'], 1)

        self.cc_txn.refresh_from_db()
        self.assertIsNotNone(self.cc_txn.resolved_transaction_id)
        self.assertTrue(self.cc_txn.is_primary)

        story_link = StoryLink.objects.get(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id, story=self.story,
        )
        self.assertEqual(story_link.origin_transaction_type, 'credit_card')
        self.assertEqual(story_link.origin_transaction_id, self.cc_txn.id)

    def test_add_story_to_txn_with_existing_rt_via_api(self):
        """Adding story to txn with existing RT via API doesn't create new RT."""
        rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-1000.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = rt.id
        self.bank_txn.is_primary = True
        self.bank_txn.save()

        rt_count_before = ResolvedTransaction.objects.count()
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 1)
        self.assertEqual(ResolvedTransaction.objects.count(), rt_count_before)

    def test_add_multiple_transactions_to_story(self):
        """Adding multiple transactions to story creates RTs as needed."""
        bank_txn2 = BankTransaction.objects.create(
            date=date(2024, 3, 2), narration='Test Bank Txn 2',
            value_date=date(2024, 3, 2),
            debit_amount=Decimal('2000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF2', closing_balance=Decimal('7000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
        )
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [
                {'type': 'bank', 'id': self.bank_txn.id},
                {'type': 'bank', 'id': bank_txn2.id},
                {'type': 'credit_card', 'id': self.cc_txn.id},
            ]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 3)
        self.assertEqual(StoryLink.objects.filter(story=self.story).count(), 3)

    def test_add_duplicate_transaction_not_counted(self):
        """Adding same txn twice doesn't create duplicate StoryLink."""
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['added'], 1)

        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['added'], 0)
        self.assertEqual(StoryLink.objects.filter(story=self.story).count(), 1)

    def test_remove_transaction_from_story(self):
        """Removing a transaction from a story deletes the StoryLink."""
        # Add first
        self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(StoryLink.objects.filter(story=self.story).count(), 1)

        # Remove
        response = self.client.delete(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['removed'], 1)
        self.assertEqual(StoryLink.objects.filter(story=self.story).count(), 0)

    def test_add_nonexistent_txn_skipped(self):
        """Adding a non-existent transaction is silently skipped."""
        response = self.client.post(
            self._story_txn_url(self.story),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': 99999}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 0)

    def test_story_not_found_returns_404(self):
        """Accessing non-existent story returns 404."""
        url = reverse('story_transactions', kwargs={'story_id': 'nonexistent'})
        response = self.client.post(
            url, data=json.dumps({'transactions': []}), content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)


class StoryCRUDTests(TestCase):
    """Test Story CRUD endpoints."""

    def setUp(self):
        self.client = Client()

    def test_create_story(self):
        response = self.client.post(
            reverse('story_list'),
            data=json.dumps({'name': 'My Trip', 'description': 'Vacation', 'icon': '✈️'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['name'], 'My Trip')
        self.assertEqual(data['icon'], '✈️')
        self.assertTrue(Story.objects.filter(name='My Trip').exists())

    def test_list_stories(self):
        Story.objects.create(name='Story A')
        Story.objects.create(name='Story B')
        response = self.client.get(reverse('story_list'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['stories']), 2)

    def test_get_story_detail(self):
        story = Story.objects.create(name='Detail Story')
        url = reverse('story_detail', kwargs={'story_id': story.story_id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['name'], 'Detail Story')
        self.assertIn('transactions', data)

    def test_update_story(self):
        story = Story.objects.create(name='Old Name')
        url = reverse('story_detail', kwargs={'story_id': story.story_id})
        response = self.client.put(
            url, data=json.dumps({'name': 'New Name'}), content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        story.refresh_from_db()
        self.assertEqual(story.name, 'New Name')

    def test_delete_story(self):
        story = Story.objects.create(name='To Delete')
        url = reverse('story_detail', kwargs={'story_id': story.story_id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Story.objects.filter(id=story.id).exists())

    def test_story_detail_not_found(self):
        url = reverse('story_detail', kwargs={'story_id': 'nonexistent'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)


class GetTransactionStoriesTests(TestCase):
    """Test the get_transaction_stories endpoint (batch lookup)."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.story = Story.objects.create(name='Test Story')
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('100'), credit_amount=Decimal('0'),
            reference_number='R1', closing_balance=Decimal('900'),
            bank_account=self.bank_account,
        )

    def test_returns_stories_for_linked_txn(self):
        """Transaction with StoryLink returns story info."""
        from links.utils import ensure_resolved_transaction
        ensure_resolved_transaction(self.bank_txn, 'bank')
        StoryLink.objects.create(
            resolved_transaction_id=self.bank_txn.resolved_transaction_id,
            story=self.story,
        )
        response = self.client.post(
            reverse('get_transaction_stories'),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        key = f'bank:{self.bank_txn.id}'
        self.assertEqual(len(data['transaction_stories'][key]), 1)
        self.assertEqual(data['transaction_stories'][key][0]['name'], 'Test Story')

    def test_returns_empty_for_unlinked_txn(self):
        """Transaction without StoryLink returns empty list."""
        response = self.client.post(
            reverse('get_transaction_stories'),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        key = f'bank:{self.bank_txn.id}'
        self.assertEqual(data := response.json()['transaction_stories'][key], [])


class StoryStatsTests(TestCase):
    """Test story stats calculation via StoryLink -> ResolvedTransaction."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.dsa = _create_extraction_pipeline('bank_account')
        self.story = Story.objects.create(name='Stats Story')
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Debit Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000.00'), credit_amount=Decimal('0.00'),
            reference_number='R1', closing_balance=Decimal('9000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
            is_primary=True,
        )
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-1000.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = self.rt.id
        self.bank_txn.save(update_fields=['resolved_transaction_id'])
        StoryLink.objects.create(resolved_transaction=self.rt, story=self.story)

    def test_story_list_includes_stats(self):
        """Story list serialization includes transaction_count and total_spent."""
        response = self.client.get(reverse('story_list'))
        data = response.json()['stories'][0]
        self.assertEqual(data['transaction_count'], 1)
        self.assertEqual(data['total_spent'], 1000.0)

    def test_story_detail_includes_transactions(self):
        """Story detail includes full transaction list."""
        url = reverse('story_detail', kwargs={'story_id': self.story.story_id})
        response = self.client.get(url)
        data = response.json()
        self.assertEqual(len(data['transactions']), 1)
        self.assertEqual(data['transactions'][0]['type'], 'bank')

    def test_category_map_applied_to_story_transactions(self):
        """CategoryLink category overrides txn.category in story transaction list."""
        CategoryLink.objects.create(
            resolved_transaction=self.rt, category='Travel',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        url = reverse('story_detail', kwargs={'story_id': self.story.story_id})
        response = self.client.get(url)
        self.assertEqual(response.json()['transactions'][0]['category'], 'Travel')
