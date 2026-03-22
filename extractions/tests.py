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
from stories.models import Story
from entities.models import Entity
from links.models import StoryLink, EntityLink
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

        # Add stories via StoryLink (attached to resolved transaction)
        StoryLink.objects.create(
            resolved_transaction=resolved,
            story=self.story1,
            origin_transaction_type='bank',
            origin_transaction_id=self.bank_txn1.id,
        )
        StoryLink.objects.create(
            resolved_transaction=resolved,
            story=self.story2,
            origin_transaction_type='bank',
            origin_transaction_id=self.bank_txn2.id,
        )

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

        # Add entity via EntityLink (attached to resolved transaction)
        EntityLink.objects.create(
            resolved_transaction=resolved,
            entity=self.entity1,
            origin_transaction_type='bank',
            origin_transaction_id=self.bank_txn1.id,
        )

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


# =============================================================================
# Resolution Suggestion Algorithm Tests
# =============================================================================


class ResolutionSuggestionAlgorithmTests(TestCase):
    """Tests for the suggestion generation algorithm, including the neighbor balance tiebreaker."""

    def setUp(self):
        """Create two data source artifacts for the same bank account."""
        self.client = Client()
        self.bank_account = BankAccount.objects.create(
            nickname='Test SBI', bank_name='SBI',
            account_number='8645978307', ifsc_code='SBIN0001234'
        )

        # Source 1: PDF statement
        sf1 = SourceFile.objects.create(filename='statement.pdf', domain='bank_account')
        ext1 = Extraction.objects.create(source_file=sf1, extractor_name='test', status='completed')
        ea1 = ExtractionArtifact.objects.create(
            extraction=ext1, artifact_type='transactions', content=b'test', content_hash='h1'
        )
        self.dsa1 = DataSourceArtifact.objects.create(
            source_artifact=ea1, data_source_target='bank_account_transactions',
            content=b'test', content_hash='h1', transformer='test',
            bank_account=self.bank_account, status='loaded'
        )

        # Source 2: Email statement
        sf2 = SourceFile.objects.create(filename='email_statement.xlsx', domain='bank_account')
        ext2 = Extraction.objects.create(source_file=sf2, extractor_name='test', status='completed')
        ea2 = ExtractionArtifact.objects.create(
            extraction=ext2, artifact_type='transactions', content=b'test', content_hash='h2'
        )
        self.dsa2 = DataSourceArtifact.objects.create(
            source_artifact=ea2, data_source_target='bank_account_transactions',
            content=b'test', content_hash='h2', transformer='test',
            bank_account=self.bank_account, status='loaded'
        )

        # Create overlapping group with both artifacts
        self.group = OverlappingSourceGroup.objects.create(
            name='Test Group', bank_account=self.bank_account
        )
        self.group.data_source_artifacts.add(self.dsa1, self.dsa2)

    def _create_txn(self, dsa, row, narration, debit, credit, balance, txn_date=None):
        return BankTransaction.objects.create(
            date=txn_date or date(2025, 10, 23),
            narration=narration,
            value_date=txn_date or date(2025, 10, 23),
            debit_amount=Decimal(str(debit)),
            credit_amount=Decimal(str(credit)),
            reference_number='',
            closing_balance=Decimal(str(balance)),
            bank_account=self.bank_account,
            data_source_artifact=dsa,
            row_number=row,
        )

    def _run_suggest(self):
        """Create a session and hit the suggest endpoint. Returns the response data."""
        session = ResolutionSession.objects.create(overlapping_group=self.group)
        response = self.client.post(f'/api/transactions/resolve/{session.session_id}/suggest/')
        return response.json(), session

    def test_one_to_one_match(self):
        """Simple 1:1 mapping should create one suggestion with score 1.0."""
        self._create_txn(self.dsa1, 1, 'UPI/DR/123', 500, 0, 10000)
        self._create_txn(self.dsa2, 1, 'WDL TFR UPI/DR/123', 500, 0, 10000)

        data, session = self._run_suggest()
        self.assertEqual(data['stats']['suggestions_created'], 1)

        suggestion = ResolutionSuggestion.objects.get(session=session)
        self.assertEqual(suggestion.suggestion_score, 1.0)
        self.assertTrue(suggestion.match_signals['closing_balance'])
        self.assertFalse(suggestion.match_signals['neighbor_balance'])

    def test_nm_match_with_neighbor_tiebreaker(self):
        """N:M mapping should use neighbor balances to disambiguate.

        Real scenario: UPI debit + reversal + INB retry, producing two
        transactions with identical (date, amount, closing_balance) but
        different neighboring balances.
        """
        # Source 1 (PDF): rows 53-57
        self._create_txn(self.dsa1, 53, 'ACHDr ETMONEY', 500, 0, 1604618.47, date(2025, 10, 22))
        self._create_txn(self.dsa1, 54, 'UPI/DR/529613337982/FOURDEGR', 9985.62, 0, 1594632.85)
        self._create_txn(self.dsa1, 55, 'UPI/REV/529613337982', 0, 9985.62, 1604618.47)
        self._create_txn(self.dsa1, 56, 'INB Wint Wealth', 9985.62, 0, 1594632.85)
        self._create_txn(self.dsa1, 57, 'INB E mandate', 59, 0, 1594573.85)

        # Source 2 (Email): rows 481-485, same structure
        self._create_txn(self.dsa2, 481, 'DEBIT ACHDr ETMONEY', 500, 0, 1604618.47, date(2025, 10, 22))
        self._create_txn(self.dsa2, 482, 'WDL TFR UPI/DR/529613337982', 9985.62, 0, 1594632.85)
        self._create_txn(self.dsa2, 483, 'DEP TFR UPI/REV/529613337982', 0, 9985.62, 1604618.47)
        self._create_txn(self.dsa2, 484, 'WDL TFR INB Wint Wealth', 9985.62, 0, 1594632.85)
        self._create_txn(self.dsa2, 485, 'WDL TFR INB E mandate', 59, 0, 1594573.85)

        data, session = self._run_suggest()

        # Should create 5 suggestions: ACHDr, UPI/DR, UPI/REV, INB Wint, INB E mandate
        self.assertEqual(data['stats']['suggestions_created'], 5)

        # Check the two ₹9,985.62 debit suggestions used neighbor tiebreaker
        neighbor_suggestions = ResolutionSuggestion.objects.filter(
            session=session, match_signals__neighbor_balance=True
        )
        self.assertEqual(neighbor_suggestions.count(), 2)

        # Verify correct pairing: UPI/DR rows paired together, INB rows paired together
        for suggestion in neighbor_suggestions:
            txn_ids = [item['id'] for item in suggestion.suggested_transaction_ids]
            txns = list(BankTransaction.objects.filter(id__in=txn_ids))
            narrations = [t.narration for t in txns]
            # Both should be UPI/DR variants or both should be INB variants
            has_upi = any('UPI/DR' in n for n in narrations)
            has_inb = any('INB Wint' in n or 'WDL TFR   INB Wint' in n for n in narrations)
            self.assertTrue(
                (has_upi and not has_inb) or (has_inb and not has_upi),
                f'Mismatched pairing: {narrations}'
            )

    def test_nm_match_fallback_pairs_by_row_order(self):
        """When neighbor tiebreaker can't disambiguate, pair by row_number order."""
        # Two identical transactions per source with same neighbors (non-contiguous rows → None neighbors)
        self._create_txn(self.dsa1, 10, 'TXN A', 1000, 0, 50000)
        self._create_txn(self.dsa1, 20, 'TXN B', 1000, 0, 50000)  # gap in row_number
        self._create_txn(self.dsa2, 10, 'TXN A copy', 1000, 0, 50000)
        self._create_txn(self.dsa2, 20, 'TXN B copy', 1000, 0, 50000)

        data, session = self._run_suggest()

        # Both should match via neighbor tiebreaker (both have None, None neighbors)
        # and pair by row_number order: row 10↔10, row 20↔20
        self.assertEqual(data['stats']['suggestions_created'], 2)

        suggestions = ResolutionSuggestion.objects.filter(session=session).order_by('id')
        for suggestion in suggestions:
            txn_ids = [item['id'] for item in suggestion.suggested_transaction_ids]
            txns = list(BankTransaction.objects.filter(id__in=txn_ids))
            # Both txns in a pair should have the same row_number
            self.assertEqual(txns[0].row_number, txns[1].row_number)

    def test_no_match_same_source(self):
        """Transactions from the same source should NOT be matched."""
        self._create_txn(self.dsa1, 1, 'TXN A', 500, 0, 10000)
        self._create_txn(self.dsa1, 2, 'TXN B', 500, 0, 10000)

        data, session = self._run_suggest()
        self.assertEqual(data['stats']['suggestions_created'], 0)

    def test_score_for_neighbor_match(self):
        """Neighbor-disambiguated matches should get score 0.95."""
        # Contiguous rows with different next balances
        self._create_txn(self.dsa1, 1, 'TXN A', 1000, 0, 50000)
        self._create_txn(self.dsa1, 2, 'TXN B', 1000, 0, 50000)
        self._create_txn(self.dsa1, 3, 'NEXT A', 200, 0, 49800)  # next for row 2

        self._create_txn(self.dsa2, 1, 'TXN A copy', 1000, 0, 50000)
        self._create_txn(self.dsa2, 2, 'TXN B copy', 1000, 0, 50000)
        self._create_txn(self.dsa2, 3, 'NEXT A copy', 200, 0, 49800)

        data, session = self._run_suggest()

        neighbor_suggestions = ResolutionSuggestion.objects.filter(
            session=session, match_signals__neighbor_balance=True
        )
        for s in neighbor_suggestions:
            self.assertEqual(s.suggestion_score, 0.95)


class DuplicateExtractionGuardTests(TestCase):
    """Test that re-extracting an already-extracted file is blocked."""

    def setUp(self):
        from django.test import Client
        self.client = Client()
        self.source_file = SourceFile.objects.create(
            filename='test_guard.pdf',
            domain='bank_account',
            file_data=b'fake pdf content',
            extraction_status='extracted',
            extractor='test_extractor',
        )
        self.extraction = Extraction.objects.create(
            source_file=self.source_file,
            extractor_name='test_extractor',
            status='completed',
        )

    def _extract_url(self):
        return f'/api/extractions/source-files/{self.source_file.source_file_id}/extract/'

    def test_duplicate_extraction_returns_409(self):
        """Re-extracting with the same extractor returns 409 Conflict."""
        import json
        response = self.client.post(
            self._extract_url(),
            data=json.dumps({'extractor': 'test_extractor'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 409)
        body = response.json()
        self.assertIn('already has a completed extraction', body['error'])
        self.assertEqual(body['existing_extraction_id'], self.extraction.id)

    def test_duplicate_extraction_force_bypasses_guard(self):
        """Re-extracting with force=true bypasses the guard (may fail later on unknown extractor, not 409)."""
        import json
        response = self.client.post(
            self._extract_url(),
            data=json.dumps({'extractor': 'test_extractor', 'force': True}),
            content_type='application/json',
        )
        # Should NOT be 409 — the guard was bypassed.
        # It will fail with 400 (unknown extractor) since 'test_extractor' isn't real, which is fine.
        self.assertNotEqual(response.status_code, 409)

    def test_different_extractor_allowed(self):
        """Extracting with a different extractor is allowed (not a duplicate)."""
        import json
        response = self.client.post(
            self._extract_url(),
            data=json.dumps({'extractor': 'other_extractor'}),
            content_type='application/json',
        )
        # Should NOT be 409 — different extractor name
        self.assertNotEqual(response.status_code, 409)

    def test_no_guard_when_no_completed_extraction(self):
        """If existing extraction is not completed, re-extraction is allowed."""
        import json
        self.extraction.status = 'failed'
        self.extraction.save()
        response = self.client.post(
            self._extract_url(),
            data=json.dumps({'extractor': 'test_extractor'}),
            content_type='application/json',
        )
        self.assertNotEqual(response.status_code, 409)
