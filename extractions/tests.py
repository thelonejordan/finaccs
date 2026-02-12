"""
Tests for Transaction Resolution feature.

TDD approach: Write tests first, then implement models to pass them.
"""
import uuid
from decimal import Decimal
from datetime import date
from django.test import TestCase
from django.db import IntegrityError

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction
from stories.models import Story, StoryTransaction
from entities.models import Entity, EntityTransaction
from extractions.models import (
    DataSourceArtifact, ExtractionArtifact, Extraction, SourceFile,
    ResolvedTransaction, OverlappingSourceGroup, ResolutionSession, ResolutionSuggestion
)


class ResolvedTransactionModelTests(TestCase):
    """Tests for ResolvedTransaction model."""

    def setUp(self):
        """Create test bank account and transactions."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )

    def test_create_resolved_transaction_generates_uuid(self):
        """ResolvedTransaction should auto-generate a UUID."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=1,
            date=date(2024, 1, 15),
            amount=Decimal('-5000.00'),
            bank_account=self.bank_account
        )
        self.assertIsNotNone(resolved.uuid)
        self.assertEqual(len(str(resolved.uuid)), 36)  # UUID format

    def test_short_id_returns_first_8_chars(self):
        """short_id property should return first 8 chars of UUID."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=1,
            date=date(2024, 1, 15),
            amount=Decimal('-5000.00'),
            bank_account=self.bank_account
        )
        self.assertEqual(len(resolved.short_id), 8)
        self.assertTrue(str(resolved.uuid).startswith(resolved.short_id))

    def test_uuid_is_unique(self):
        """Each ResolvedTransaction should have a unique UUID."""
        resolved1 = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=1,
            date=date(2024, 1, 15),
            amount=Decimal('-5000.00'),
            bank_account=self.bank_account
        )
        resolved2 = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=2,
            date=date(2024, 1, 16),
            amount=Decimal('-3000.00'),
            bank_account=self.bank_account
        )
        self.assertNotEqual(resolved1.uuid, resolved2.uuid)

    def test_can_lookup_by_uuid(self):
        """Should be able to find ResolvedTransaction by UUID."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=1,
            date=date(2024, 1, 15),
            amount=Decimal('-5000.00'),
            bank_account=self.bank_account
        )
        found = ResolvedTransaction.objects.get(uuid=resolved.uuid)
        self.assertEqual(found.id, resolved.id)


class BankTransactionResolutionTests(TestCase):
    """Tests for linking BankTransaction to ResolvedTransaction."""

    def setUp(self):
        """Create test data."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='NEFT TO JOHN DOE',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account
        )

    def test_bank_transaction_can_link_to_resolved(self):
        """BankTransaction should have resolved_transaction FK."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date,
            amount=self.bank_txn.amount,
            bank_account=self.bank_account
        )
        self.bank_txn.resolved_transaction = resolved
        self.bank_txn.is_primary = True
        self.bank_txn.save()

        self.bank_txn.refresh_from_db()
        self.assertEqual(self.bank_txn.resolved_transaction_id, resolved.id)
        self.assertTrue(self.bank_txn.is_primary)

    def test_resolved_transaction_can_have_multiple_sources(self):
        """Multiple BankTransactions can link to same ResolvedTransaction."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date,
            amount=self.bank_txn.amount,
            bank_account=self.bank_account
        )

        # First source (primary)
        self.bank_txn.resolved_transaction = resolved
        self.bank_txn.is_primary = True
        self.bank_txn.save()

        # Second source (non-primary)
        bank_txn2 = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='NEFT/JOHNDOE/REF123',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account,
            resolved_transaction=resolved,
            is_primary=False
        )

        self.assertEqual(resolved.bank_transactions.count(), 2)
        self.assertEqual(resolved.bank_transactions.filter(is_primary=True).count(), 1)

    def test_source_count_property(self):
        """ResolvedTransaction should report source count."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date,
            amount=self.bank_txn.amount,
            bank_account=self.bank_account
        )
        self.bank_txn.resolved_transaction = resolved
        self.bank_txn.is_primary = True
        self.bank_txn.save()

        self.assertEqual(resolved.source_count, 1)

        # Add another source
        BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='Another narration',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account,
            resolved_transaction=resolved,
            is_primary=False
        )

        self.assertEqual(resolved.source_count, 2)


class LinkageAggregationTests(TestCase):
    """Tests for linkage aggregation from source transactions."""

    def setUp(self):
        """Create test data with stories and entities."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )
        self.story1 = Story.objects.create(name='Rent Payment')
        self.story2 = Story.objects.create(name='Monthly Expenses')
        self.entity1 = Entity.objects.create(name='John Doe', entity_type='person')

        # Create two bank transactions representing same real transaction
        self.bank_txn1 = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='NEFT TO JOHN DOE',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account
        )
        self.bank_txn2 = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='NEFT/JOHNDOE/REF123',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account
        )

        # Add story to txn1
        StoryTransaction.objects.create(
            story=self.story1,
            transaction_type='bank',
            transaction_id=self.bank_txn1.id
        )
        # Add different story to txn2
        StoryTransaction.objects.create(
            story=self.story2,
            transaction_type='bank',
            transaction_id=self.bank_txn2.id
        )
        # Add entity to txn1
        EntityTransaction.objects.create(
            entity=self.entity1,
            transaction_type='bank',
            transaction_id=self.bank_txn1.id
        )

    def test_get_stories_aggregates_from_all_sources(self):
        """get_stories() should return stories from all member transactions."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn1.id,
            date=self.bank_txn1.date,
            amount=self.bank_txn1.amount,
            bank_account=self.bank_account
        )
        self.bank_txn1.resolved_transaction = resolved
        self.bank_txn1.is_primary = True
        self.bank_txn1.save()
        self.bank_txn2.resolved_transaction = resolved
        self.bank_txn2.is_primary = False
        self.bank_txn2.save()

        stories = resolved.get_stories()
        self.assertEqual(stories.count(), 2)
        self.assertIn(self.story1, stories)
        self.assertIn(self.story2, stories)

    def test_get_entities_aggregates_from_all_sources(self):
        """get_entities() should return entities from all member transactions."""
        resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn1.id,
            date=self.bank_txn1.date,
            amount=self.bank_txn1.amount,
            bank_account=self.bank_account
        )
        self.bank_txn1.resolved_transaction = resolved
        self.bank_txn1.is_primary = True
        self.bank_txn1.save()
        self.bank_txn2.resolved_transaction = resolved
        self.bank_txn2.is_primary = False
        self.bank_txn2.save()

        entities = resolved.get_entities()
        self.assertEqual(entities.count(), 1)
        self.assertIn(self.entity1, entities)


class OverlappingSourceGroupTests(TestCase):
    """Tests for OverlappingSourceGroup model."""

    def setUp(self):
        """Create test source files and artifacts."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )

        # Create source file -> extraction -> artifact chain
        self.source_file = SourceFile.objects.create(
            filename='test_statement.pdf',
            domain='bank_account'
        )
        self.extraction = Extraction.objects.create(
            source_file=self.source_file,
            extractor_name='test_extractor',
            status='completed'
        )
        self.ext_artifact = ExtractionArtifact.objects.create(
            extraction=self.extraction,
            artifact_type='transactions',
            content=b'test',
            content_hash='abc123'
        )
        self.ds_artifact1 = DataSourceArtifact.objects.create(
            source_artifact=self.ext_artifact,
            data_source_target='bank_account_transactions',
            content=b'test',
            content_hash='abc123',
            transformer='test',
            bank_account=self.bank_account,
            status='loaded'
        )

        # Create second artifact
        self.source_file2 = SourceFile.objects.create(
            filename='test_export.csv',
            domain='bank_account'
        )
        self.extraction2 = Extraction.objects.create(
            source_file=self.source_file2,
            extractor_name='test_extractor',
            status='completed'
        )
        self.ext_artifact2 = ExtractionArtifact.objects.create(
            extraction=self.extraction2,
            artifact_type='transactions',
            content=b'test',
            content_hash='def456'
        )
        self.ds_artifact2 = DataSourceArtifact.objects.create(
            source_artifact=self.ext_artifact2,
            data_source_target='bank_account_transactions',
            content=b'test',
            content_hash='def456',
            transformer='test',
            bank_account=self.bank_account,
            status='loaded'
        )

    def test_create_overlapping_group(self):
        """Should be able to create an overlapping source group."""
        group = OverlappingSourceGroup.objects.create(
            name='Jan 2024 Statements',
            bank_account=self.bank_account
        )
        group.data_source_artifacts.add(self.ds_artifact1, self.ds_artifact2)

        self.assertIsNotNone(group.group_id)
        self.assertEqual(group.data_source_artifacts.count(), 2)
        self.assertEqual(group.resolution_status, 'pending')

    def test_group_id_auto_generated(self):
        """group_id should be auto-generated."""
        group = OverlappingSourceGroup.objects.create(
            name='Test Group',
            bank_account=self.bank_account
        )
        self.assertTrue(group.group_id.startswith('osg_'))

    def test_resolution_status_default_pending(self):
        """Default resolution_status should be 'pending'."""
        group = OverlappingSourceGroup.objects.create(
            name='Test Group',
            bank_account=self.bank_account
        )
        self.assertEqual(group.resolution_status, 'pending')


class ResolutionSessionTests(TestCase):
    """Tests for ResolutionSession model."""

    def setUp(self):
        """Create test overlapping group."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )
        self.group = OverlappingSourceGroup.objects.create(
            name='Test Group',
            bank_account=self.bank_account
        )

    def test_create_resolution_session(self):
        """Should be able to create a resolution session."""
        session = ResolutionSession.objects.create(
            overlapping_group=self.group
        )
        self.assertIsNotNone(session.session_id)
        self.assertTrue(session.session_id.startswith('rs_'))
        self.assertEqual(session.status, 'suggesting')

    def test_session_links_to_group(self):
        """Session should link to overlapping group."""
        session = ResolutionSession.objects.create(
            overlapping_group=self.group
        )
        self.assertEqual(session.overlapping_group_id, self.group.id)


class ResolutionSuggestionTests(TestCase):
    """Tests for ResolutionSuggestion model."""

    def setUp(self):
        """Create test session."""
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )
        self.group = OverlappingSourceGroup.objects.create(
            name='Test Group',
            bank_account=self.bank_account
        )
        self.session = ResolutionSession.objects.create(
            overlapping_group=self.group
        )

    def test_create_suggestion(self):
        """Should be able to create a resolution suggestion."""
        suggestion = ResolutionSuggestion.objects.create(
            session=self.session,
            suggested_transaction_ids=[
                {'type': 'bank', 'id': 1},
                {'type': 'bank', 'id': 2}
            ],
            suggestion_score=0.95,
            match_signals={'date': True, 'amount': True, 'reference': True}
        )
        self.assertEqual(suggestion.status, 'pending')
        self.assertEqual(len(suggestion.suggested_transaction_ids), 2)

    def test_suggestion_default_status_pending(self):
        """Default status should be 'pending'."""
        suggestion = ResolutionSuggestion.objects.create(
            session=self.session,
            suggested_transaction_ids=[{'type': 'bank', 'id': 1}],
            suggestion_score=0.5,
            match_signals={}
        )
        self.assertEqual(suggestion.status, 'pending')


# =============================================================================
# API Endpoint Tests
# =============================================================================

from django.test import Client
import json


class OverlappingGroupAPITests(TestCase):
    """Tests for overlapping group API endpoints."""

    def setUp(self):
        """Create test data."""
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )

        # Create source artifacts
        self.source_file1 = SourceFile.objects.create(
            filename='test1.pdf',
            domain='bank_account'
        )
        self.extraction1 = Extraction.objects.create(
            source_file=self.source_file1,
            extractor_name='test',
            status='completed'
        )
        self.ext_artifact1 = ExtractionArtifact.objects.create(
            extraction=self.extraction1,
            artifact_type='transactions',
            content=b'test',
            content_hash='abc123'
        )
        self.ds_artifact1 = DataSourceArtifact.objects.create(
            source_artifact=self.ext_artifact1,
            data_source_target='bank_account_transactions',
            content=b'test',
            content_hash='abc123',
            transformer='test',
            bank_account=self.bank_account,
            status='loaded'
        )

        self.source_file2 = SourceFile.objects.create(
            filename='test2.csv',
            domain='bank_account'
        )
        self.extraction2 = Extraction.objects.create(
            source_file=self.source_file2,
            extractor_name='test',
            status='completed'
        )
        self.ext_artifact2 = ExtractionArtifact.objects.create(
            extraction=self.extraction2,
            artifact_type='transactions',
            content=b'test',
            content_hash='def456'
        )
        self.ds_artifact2 = DataSourceArtifact.objects.create(
            source_artifact=self.ext_artifact2,
            data_source_target='bank_account_transactions',
            content=b'test',
            content_hash='def456',
            transformer='test',
            bank_account=self.bank_account,
            status='loaded'
        )

    def test_create_overlapping_group_api(self):
        """POST /api/sources/overlapping-groups should create a group."""
        response = self.client.post(
            '/api/sources/overlapping-groups/',
            data=json.dumps({
                'artifact_ids': [self.ds_artifact1.artifact_id, self.ds_artifact2.artifact_id],
                'name': 'Test Group'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('group_id', data)
        self.assertEqual(data['name'], 'Test Group')
        self.assertEqual(data['resolution_status'], 'pending')

    def test_create_overlapping_group_validates_same_account(self):
        """Creating group with different accounts should fail."""
        # Create artifact for different account
        other_account = BankAccount.objects.create(
            nickname='Other Account',
            bank_name='Other Bank',
            account_number='9999999999',
            ifsc_code='OTHER001234'
        )
        other_sf = SourceFile.objects.create(filename='other.pdf', domain='bank_account')
        other_ext = Extraction.objects.create(source_file=other_sf, extractor_name='test', status='completed')
        other_ext_art = ExtractionArtifact.objects.create(
            extraction=other_ext, artifact_type='transactions', content=b'x', content_hash='xyz'
        )
        other_ds_art = DataSourceArtifact.objects.create(
            source_artifact=other_ext_art,
            data_source_target='bank_account_transactions',
            content=b'x',
            content_hash='xyz',
            transformer='test',
            bank_account=other_account,
            status='loaded'
        )

        response = self.client.post(
            '/api/sources/overlapping-groups/',
            data=json.dumps({
                'artifact_ids': [self.ds_artifact1.artifact_id, other_ds_art.artifact_id],
                'name': 'Invalid Group'
            }),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_list_overlapping_groups_api(self):
        """GET /api/sources/overlapping-groups should list groups."""
        # Create a group first
        group = OverlappingSourceGroup.objects.create(
            name='Test Group',
            bank_account=self.bank_account
        )
        group.data_source_artifacts.add(self.ds_artifact1, self.ds_artifact2)

        response = self.client.get(f'/api/sources/overlapping-groups/?bank_account_id={self.bank_account.id}')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('groups', data)
        self.assertEqual(len(data['groups']), 1)
        self.assertEqual(data['groups'][0]['name'], 'Test Group')

    def test_delete_overlapping_group_api(self):
        """DELETE /api/sources/overlapping-groups/{id} should delete pending group."""
        group = OverlappingSourceGroup.objects.create(
            name='To Delete',
            bank_account=self.bank_account
        )
        group.data_source_artifacts.add(self.ds_artifact1)

        response = self.client.delete(f'/api/sources/overlapping-groups/{group.group_id}/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(OverlappingSourceGroup.objects.filter(id=group.id).exists())


class ResolvedTransactionAPITests(TestCase):
    """Tests for resolved transaction API endpoints."""

    def setUp(self):
        """Create test data."""
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account',
            bank_name='Test Bank',
            account_number='1234567890',
            ifsc_code='TEST0001234'
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='Test transaction',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account
        )
        self.resolved = ResolvedTransaction.objects.create(
            transaction_type='bank',
            primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date,
            amount=self.bank_txn.amount,
            bank_account=self.bank_account
        )
        self.bank_txn.resolved_transaction = self.resolved
        self.bank_txn.is_primary = True
        self.bank_txn.save()

    def test_get_resolved_by_uuid(self):
        """GET /api/transactions/resolved/{uuid} should return transaction."""
        response = self.client.get(f'/api/transactions/resolved/{self.resolved.uuid}/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['uuid'], str(self.resolved.uuid))
        self.assertEqual(data['short_id'], self.resolved.short_id)

    def test_get_resolved_by_short_id(self):
        """GET /api/transactions/resolved/{short_id} should work with short ID."""
        response = self.client.get(f'/api/transactions/resolved/{self.resolved.short_id}/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['uuid'], str(self.resolved.uuid))

    def test_change_primary_source(self):
        """PATCH /api/transactions/resolved/{uuid}/primary should change primary."""
        # Add second transaction
        bank_txn2 = BankTransaction.objects.create(
            date=date(2024, 1, 15),
            narration='Different narration',
            value_date=date(2024, 1, 15),
            debit_amount=Decimal('5000.00'),
            credit_amount=Decimal('0.00'),
            reference_number='REF123',
            closing_balance=Decimal('45000.00'),
            bank_account=self.bank_account,
            resolved_transaction=self.resolved,
            is_primary=False
        )

        response = self.client.patch(
            f'/api/transactions/resolved/{self.resolved.uuid}/primary/',
            data=json.dumps({'primary_transaction_id': bank_txn2.id}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        # Verify change
        self.bank_txn.refresh_from_db()
        bank_txn2.refresh_from_db()
        self.assertFalse(self.bank_txn.is_primary)
        self.assertTrue(bank_txn2.is_primary)

    def test_search_by_uuid_prefix(self):
        """GET /api/transactions/resolved/search?q= should search by prefix."""
        prefix = str(self.resolved.uuid)[:4]
        response = self.client.get(f'/api/transactions/resolved/search/?q={prefix}')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['uuid'], str(self.resolved.uuid))
