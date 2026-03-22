import json
from decimal import Decimal
from datetime import date
from django.test import TestCase, Client
from django.urls import reverse

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction
from entities.models import Entity
from links.models import EntityLink, CategoryLink
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


class EntityViewJITTests(TestCase):
    """Test Entity view endpoints with JIT ResolvedTransaction creation."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account', bank_name='Test Bank',
            account_number='1234567890', ifsc_code='TEST0001234',
        )
        self.credit_card = CreditCard.objects.create(
            nickname='Test Card', card_name='Test Card',
        )
        self.entity = Entity.objects.create(name='Test Entity')
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

    def _entity_txn_url(self, entity):
        return reverse('entity_transactions', kwargs={'entity_id': entity.entity_id})

    def test_add_entity_to_bank_txn_creates_rt_via_api(self):
        """Adding entity to bank txn without RT via API creates RT and EntityLink."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        response = self.client.post(
            self._entity_txn_url(self.entity),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 1)

        self.bank_txn.refresh_from_db()
        self.assertIsNotNone(self.bank_txn.resolved_transaction_id)
        self.assertTrue(self.bank_txn.is_primary)

        entity_link = EntityLink.objects.get(
            resolved_transaction_id=self.bank_txn.resolved_transaction_id, entity=self.entity,
        )
        self.assertEqual(entity_link.origin_transaction_type, 'bank')
        self.assertEqual(entity_link.origin_transaction_id, self.bank_txn.id)

    def test_add_entity_to_cc_txn_creates_rt_via_api(self):
        """Adding entity to CC txn without RT via API creates RT and EntityLink."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        response = self.client.post(
            self._entity_txn_url(self.entity),
            data=json.dumps({'transactions': [{'type': 'credit_card', 'id': self.cc_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 1)

        self.cc_txn.refresh_from_db()
        self.assertIsNotNone(self.cc_txn.resolved_transaction_id)
        self.assertTrue(self.cc_txn.is_primary)

    def test_add_entity_to_txn_with_existing_rt_via_api(self):
        """Adding entity to txn with existing RT doesn't create new RT."""
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
            self._entity_txn_url(self.entity),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 1)
        self.assertEqual(ResolvedTransaction.objects.count(), rt_count_before)

    def test_add_multiple_transactions_to_entity(self):
        """Adding multiple transactions creates RTs as needed."""
        bank_txn2 = BankTransaction.objects.create(
            date=date(2024, 3, 2), narration='Test Bank Txn 2',
            value_date=date(2024, 3, 2),
            debit_amount=Decimal('2000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF2', closing_balance=Decimal('7000.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
        )
        response = self.client.post(
            self._entity_txn_url(self.entity),
            data=json.dumps({'transactions': [
                {'type': 'bank', 'id': self.bank_txn.id},
                {'type': 'bank', 'id': bank_txn2.id},
                {'type': 'credit_card', 'id': self.cc_txn.id},
            ]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['added'], 3)
        self.assertEqual(EntityLink.objects.filter(entity=self.entity).count(), 3)

    def test_add_duplicate_not_counted(self):
        """Adding same txn twice doesn't create duplicate EntityLink."""
        url = self._entity_txn_url(self.entity)
        payload = json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]})
        self.client.post(url, data=payload, content_type='application/json')
        response = self.client.post(url, data=payload, content_type='application/json')
        self.assertEqual(response.json()['added'], 0)
        self.assertEqual(EntityLink.objects.filter(entity=self.entity).count(), 1)

    def test_remove_transaction_from_entity(self):
        """Removing a transaction deletes the EntityLink."""
        url = self._entity_txn_url(self.entity)
        self.client.post(
            url,
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(EntityLink.objects.filter(entity=self.entity).count(), 1)

        response = self.client.delete(
            url,
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['removed'], 1)
        self.assertEqual(EntityLink.objects.filter(entity=self.entity).count(), 0)

    def test_entity_not_found_returns_404(self):
        url = reverse('entity_transactions', kwargs={'entity_id': 'nonexistent'})
        response = self.client.post(
            url, data=json.dumps({'transactions': []}), content_type='application/json',
        )
        self.assertEqual(response.status_code, 404)


class EntityCRUDTests(TestCase):
    """Test Entity CRUD endpoints."""

    def setUp(self):
        self.client = Client()

    def test_create_entity(self):
        response = self.client.post(
            reverse('entity_list'),
            data=json.dumps({'name': 'Amazon', 'entity_type': 'business', 'icon': '🏢'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['name'], 'Amazon')
        self.assertEqual(data['entity_type'], 'business')

    def test_create_person_default_icon(self):
        response = self.client.post(
            reverse('entity_list'),
            data=json.dumps({'name': 'John', 'entity_type': 'person'}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['icon'], '👤')

    def test_create_business_default_icon(self):
        response = self.client.post(
            reverse('entity_list'),
            data=json.dumps({'name': 'Corp', 'entity_type': 'business'}),
            content_type='application/json',
        )
        self.assertEqual(response.json()['icon'], '🏢')

    def test_list_entities(self):
        Entity.objects.create(name='A')
        Entity.objects.create(name='B')
        response = self.client.get(reverse('entity_list'))
        self.assertEqual(len(response.json()['entities']), 2)

    def test_get_entity_detail(self):
        entity = Entity.objects.create(name='Detail Entity')
        url = reverse('entity_detail', kwargs={'entity_id': entity.entity_id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('transactions', response.json())

    def test_update_entity(self):
        entity = Entity.objects.create(name='Old')
        url = reverse('entity_detail', kwargs={'entity_id': entity.entity_id})
        response = self.client.put(
            url, data=json.dumps({'name': 'New', 'entity_type': 'business'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        entity.refresh_from_db()
        self.assertEqual(entity.name, 'New')
        self.assertEqual(entity.entity_type, 'business')

    def test_delete_entity(self):
        entity = Entity.objects.create(name='Delete Me')
        url = reverse('entity_detail', kwargs={'entity_id': entity.entity_id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Entity.objects.filter(id=entity.id).exists())

    def test_entity_detail_not_found(self):
        url = reverse('entity_detail', kwargs={'entity_id': 'nonexistent'})
        self.assertEqual(self.client.get(url).status_code, 404)


class GetTransactionEntitiesTests(TestCase):
    """Test the get_transaction_entities endpoint (batch lookup)."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.entity = Entity.objects.create(name='Test Entity', entity_type='person')
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('100'), credit_amount=Decimal('0'),
            reference_number='R1', closing_balance=Decimal('900'),
            bank_account=self.bank_account,
        )

    def test_returns_entities_for_linked_txn(self):
        from links.utils import ensure_resolved_transaction
        ensure_resolved_transaction(self.bank_txn, 'bank')
        EntityLink.objects.create(
            resolved_transaction_id=self.bank_txn.resolved_transaction_id,
            entity=self.entity,
        )
        response = self.client.post(
            reverse('get_transaction_entities'),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        key = f'bank:{self.bank_txn.id}'
        entities = response.json()['transaction_entities'][key]
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0]['name'], 'Test Entity')
        self.assertEqual(entities[0]['entity_type'], 'person')

    def test_returns_empty_for_unlinked_txn(self):
        response = self.client.post(
            reverse('get_transaction_entities'),
            data=json.dumps({'transactions': [{'type': 'bank', 'id': self.bank_txn.id}]}),
            content_type='application/json',
        )
        key = f'bank:{self.bank_txn.id}'
        self.assertEqual(response.json()['transaction_entities'][key], [])


class EntityStatsTests(TestCase):
    """Test entity stats via EntityLink -> ResolvedTransaction."""

    def setUp(self):
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.dsa = _create_extraction_pipeline('bank_account')
        self.entity = Entity.objects.create(name='Stats Entity')
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Debit',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('500.00'), credit_amount=Decimal('0.00'),
            reference_number='R1', closing_balance=Decimal('9500.00'),
            bank_account=self.bank_account, data_source_artifact=self.dsa,
            is_primary=True,
        )
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-500.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = self.rt.id
        self.bank_txn.save(update_fields=['resolved_transaction_id'])
        EntityLink.objects.create(resolved_transaction=self.rt, entity=self.entity)

    def test_entity_list_includes_stats(self):
        response = self.client.get(reverse('entity_list'))
        data = response.json()['entities'][0]
        self.assertEqual(data['transaction_count'], 1)
        self.assertEqual(data['total_spent'], 500.0)

    def test_entity_detail_includes_transactions(self):
        url = reverse('entity_detail', kwargs={'entity_id': self.entity.entity_id})
        response = self.client.get(url)
        txns = response.json()['transactions']
        self.assertEqual(len(txns), 1)
        self.assertEqual(txns[0]['type'], 'bank')

    def test_category_map_applied_to_entity_transactions(self):
        CategoryLink.objects.create(
            resolved_transaction=self.rt, category='Food',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        url = reverse('entity_detail', kwargs={'entity_id': self.entity.entity_id})
        response = self.client.get(url)
        self.assertEqual(response.json()['transactions'][0]['category'], 'Food')
