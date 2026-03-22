from decimal import Decimal
from datetime import date
from io import StringIO
from django.test import TestCase
from django.core.management import call_command

from bank_accounts.models import BankAccount, BankTransaction
from credit_cards.models import CreditCard, CreditCardTransaction
from extractions.models import ResolvedTransaction
from links.models import CategoryLink, StoryLink, EntityLink, SelfTransferLink, CreditCardPaymentLink
from links.utils import ensure_resolved_transaction
from stories.models import Story
from entities.models import Entity


class EnsureResolvedTransactionTests(TestCase):
    """Tests for the ensure_resolved_transaction utility."""

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

    def test_bank_txn_creates_rt(self):
        """Bank txn without RT -> creates RT, sets resolved_transaction_id and is_primary."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        rt_id = ensure_resolved_transaction(self.bank_txn, 'bank')
        self.bank_txn.refresh_from_db()
        self.assertIsNotNone(rt_id)
        self.assertEqual(self.bank_txn.resolved_transaction_id, rt_id)
        self.assertTrue(self.bank_txn.is_primary)
        rt = ResolvedTransaction.objects.get(id=rt_id)
        self.assertEqual(rt.transaction_type, 'bank')
        self.assertEqual(rt.primary_transaction_id, self.bank_txn.id)
        self.assertEqual(rt.amount, Decimal('0.00') - Decimal('1000.00'))

    def test_cc_txn_creates_rt(self):
        """CC txn without RT -> creates RT, sets resolved_transaction_id and is_primary."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        rt_id = ensure_resolved_transaction(self.cc_txn, 'credit_card')
        self.cc_txn.refresh_from_db()
        self.assertIsNotNone(rt_id)
        self.assertEqual(self.cc_txn.resolved_transaction_id, rt_id)
        self.assertTrue(self.cc_txn.is_primary)
        rt = ResolvedTransaction.objects.get(id=rt_id)
        self.assertEqual(rt.transaction_type, 'credit_card')
        self.assertEqual(rt.amount, Decimal('500.00'))

    def test_existing_rt_noop(self):
        """Txn that already has RT -> returns existing RT id, no new RT created."""
        rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-1000.00'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = rt.id
        self.bank_txn.is_primary = True
        self.bank_txn.save()
        count_before = ResolvedTransaction.objects.count()
        returned_id = ensure_resolved_transaction(self.bank_txn, 'bank')
        self.assertEqual(returned_id, rt.id)
        self.assertEqual(ResolvedTransaction.objects.count(), count_before)


class StoryAddWithJITTests(TestCase):
    """Test that adding a story to a txn without RT creates the RT via JIT."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test Account', bank_name='Test Bank',
            account_number='1234567890', ifsc_code='TEST0001234',
        )
        self.cc = CreditCard.objects.create(nickname='Test CC', card_name='Test CC')
        self.story = Story.objects.create(name='Test Story')
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Dinner',
            amount=Decimal('800.00'), credit_card=self.cc,
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 2), narration='ATM',
            value_date=date(2024, 3, 2),
            debit_amount=Decimal('2000.00'), credit_amount=Decimal('0.00'),
            reference_number='REF2', closing_balance=Decimal('8000.00'),
            bank_account=self.bank_account,
        )

    def test_add_story_to_cc_txn_no_rt(self):
        """Adding a story to a CC txn that has no RT -> StoryLink and RT created."""
        self.assertIsNone(self.cc_txn.resolved_transaction_id)
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        StoryLink.objects.create(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id,
            story=self.story,
            origin_transaction_type='credit_card',
            origin_transaction_id=self.cc_txn.id,
        )
        self.assertEqual(StoryLink.objects.filter(story=self.story).count(), 1)
        self.assertIsNotNone(self.cc_txn.resolved_transaction_id)

    def test_add_entity_to_bank_txn_no_rt(self):
        """Adding an entity to a bank txn that has no RT -> EntityLink and RT created."""
        entity = Entity.objects.create(name='Test Entity')
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        ensure_resolved_transaction(self.bank_txn, 'bank')
        EntityLink.objects.create(
            resolved_transaction_id=self.bank_txn.resolved_transaction_id,
            entity=entity,
            origin_transaction_type='bank',
            origin_transaction_id=self.bank_txn.id,
        )
        self.assertEqual(EntityLink.objects.filter(entity=entity).count(), 1)
        self.assertIsNotNone(self.bank_txn.resolved_transaction_id)

    def test_add_story_to_txn_with_rt(self):
        """Adding a story to a txn that already has RT -> no new RT created."""
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        rt_id = self.cc_txn.resolved_transaction_id
        count_before = ResolvedTransaction.objects.count()
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        self.assertEqual(ResolvedTransaction.objects.count(), count_before)
        self.assertEqual(self.cc_txn.resolved_transaction_id, rt_id)


class CCCategoryLinkTests(TestCase):
    """Test that CC category endpoint creates CategoryLink."""

    def setUp(self):
        self.cc = CreditCard.objects.create(nickname='Test CC', card_name='Test CC')
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='Amazon',
            amount=Decimal('1500.00'), credit_card=self.cc,
        )

    def test_set_category_creates_link(self):
        """Setting category on CC txn -> both txn.category and CategoryLink updated."""
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        self.cc_txn.category = 'Shopping'
        self.cc_txn.save()
        CategoryLink.objects.filter(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id
        ).delete()
        CategoryLink.objects.create(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id,
            category='Shopping',
            origin_transaction_type='credit_card',
            origin_transaction_id=self.cc_txn.id,
        )
        link = CategoryLink.objects.get(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id
        )
        self.assertEqual(link.category, 'Shopping')
        self.assertEqual(self.cc_txn.category, 'Shopping')

    def test_clear_category_deletes_link(self):
        """Clearing category -> CategoryLink deleted."""
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        CategoryLink.objects.create(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id,
            category='Shopping',
            origin_transaction_type='credit_card',
            origin_transaction_id=self.cc_txn.id,
        )
        CategoryLink.objects.filter(
            resolved_transaction_id=self.cc_txn.resolved_transaction_id
        ).delete()
        self.assertEqual(
            CategoryLink.objects.filter(
                resolved_transaction_id=self.cc_txn.resolved_transaction_id
            ).count(), 0
        )


class SelfTransferLinkJITTests(TestCase):
    """Test self-transfer linking creates JIT RTs."""

    def setUp(self):
        self.account_a = BankAccount.objects.create(
            nickname='Account A', bank_name='Bank A',
            account_number='1111111111', ifsc_code='AAAA0001111',
        )
        self.account_b = BankAccount.objects.create(
            nickname='Account B', bank_name='Bank B',
            account_number='2222222222', ifsc_code='BBBB0002222',
        )
        self.txn_a = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Transfer out',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('5000.00'), credit_amount=Decimal('0.00'),
            reference_number='REFA', closing_balance=Decimal('5000.00'),
            bank_account=self.account_a,
        )
        self.txn_b = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Transfer in',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('0.00'), credit_amount=Decimal('5000.00'),
            reference_number='REFB', closing_balance=Decimal('15000.00'),
            bank_account=self.account_b,
        )

    def test_link_txns_without_rts_creates_both(self):
        """Linking two bank txns without RTs -> both get RTs, SelfTransferLink created."""
        self.assertIsNone(self.txn_a.resolved_transaction_id)
        self.assertIsNone(self.txn_b.resolved_transaction_id)
        ensure_resolved_transaction(self.txn_a, 'bank')
        ensure_resolved_transaction(self.txn_b, 'bank')
        self.assertIsNotNone(self.txn_a.resolved_transaction_id)
        self.assertIsNotNone(self.txn_b.resolved_transaction_id)
        SelfTransferLink.objects.create(
            resolved_transaction_a_id=self.txn_a.resolved_transaction_id,
            resolved_transaction_b_id=self.txn_b.resolved_transaction_id,
            origin_transaction_id_a=self.txn_a.id,
            origin_transaction_id_b=self.txn_b.id,
        )
        self.assertEqual(SelfTransferLink.objects.count(), 1)


# =============================================================================
# ResolvedTransaction model method tests
# =============================================================================

class ResolvedTransactionMethodTests(TestCase):
    """Test ResolvedTransaction helper methods that read from link tables."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000'), credit_amount=Decimal('0'),
            reference_number='R1', closing_balance=Decimal('9000'),
            bank_account=self.bank_account,
        )
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=self.bank_txn.id,
            date=self.bank_txn.date, amount=Decimal('-1000'),
            bank_account=self.bank_account,
        )
        self.bank_txn.resolved_transaction_id = self.rt.id
        self.bank_txn.is_primary = True
        self.bank_txn.save()

    def test_get_stories_returns_linked_stories(self):
        story = Story.objects.create(name='My Story')
        StoryLink.objects.create(resolved_transaction=self.rt, story=story)
        stories = list(self.rt.get_stories())
        self.assertEqual(len(stories), 1)
        self.assertEqual(stories[0].id, story.id)

    def test_get_stories_empty_when_no_links(self):
        self.assertEqual(list(self.rt.get_stories()), [])

    def test_get_entities_returns_linked_entities(self):
        entity = Entity.objects.create(name='John')
        EntityLink.objects.create(resolved_transaction=self.rt, entity=entity)
        entities = list(self.rt.get_entities())
        self.assertEqual(len(entities), 1)
        self.assertEqual(entities[0].id, entity.id)

    def test_get_entities_empty_when_no_links(self):
        self.assertEqual(list(self.rt.get_entities()), [])

    def test_get_effective_category_returns_latest(self):
        CategoryLink.objects.create(resolved_transaction=self.rt, category='Food')
        CategoryLink.objects.create(resolved_transaction=self.rt, category='Travel')
        # Latest wins (ordered by -created_at, so the last created should be first)
        self.assertEqual(self.rt.get_effective_category(), 'Travel')

    def test_get_effective_category_none_when_no_links(self):
        self.assertIsNone(self.rt.get_effective_category())

    def test_get_linked_resolved_transaction_via_side_a(self):
        other_rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('1000'),
            bank_account=self.bank_account,
        )
        SelfTransferLink.objects.create(
            resolved_transaction_a=self.rt, resolved_transaction_b=other_rt,
        )
        result = self.rt.get_linked_resolved_transaction()
        self.assertEqual(result.id, other_rt.id)

    def test_get_linked_resolved_transaction_via_side_b(self):
        other_rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('1000'),
            bank_account=self.bank_account,
        )
        SelfTransferLink.objects.create(
            resolved_transaction_a=other_rt, resolved_transaction_b=self.rt,
        )
        result = self.rt.get_linked_resolved_transaction()
        self.assertEqual(result.id, other_rt.id)

    def test_get_linked_resolved_transaction_none_when_no_link(self):
        self.assertIsNone(self.rt.get_linked_resolved_transaction())

    def test_get_linked_resolved_transaction_none_for_cc_type(self):
        cc = CreditCard.objects.create(nickname='CC', card_name='CC')
        cc_rt = ResolvedTransaction.objects.create(
            transaction_type='credit_card', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('500'),
            credit_card=cc,
        )
        self.assertIsNone(cc_rt.get_linked_resolved_transaction())


# =============================================================================
# Link model durability tests (SET_NULL on RT delete)
# =============================================================================

class LinkDurabilityTests(TestCase):
    """Test that links survive when ResolvedTransaction is deleted (SET_NULL)."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('-1000'),
            bank_account=self.bank_account,
        )

    def test_category_link_survives_rt_delete(self):
        link = CategoryLink.objects.create(resolved_transaction=self.rt, category='Food')
        self.rt.delete()
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)
        self.assertEqual(link.category, 'Food')

    def test_story_link_survives_rt_delete(self):
        story = Story.objects.create(name='Story')
        link = StoryLink.objects.create(resolved_transaction=self.rt, story=story)
        self.rt.delete()
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)
        self.assertEqual(link.story_id, story.id)

    def test_entity_link_survives_rt_delete(self):
        entity = Entity.objects.create(name='Entity')
        link = EntityLink.objects.create(resolved_transaction=self.rt, entity=entity)
        self.rt.delete()
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)
        self.assertEqual(link.entity_id, entity.id)

    def test_self_transfer_link_survives_rt_delete(self):
        other_rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('1000'),
            bank_account=self.bank_account,
        )
        link = SelfTransferLink.objects.create(
            resolved_transaction_a=self.rt, resolved_transaction_b=other_rt,
        )
        self.rt.delete()
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_a_id)
        self.assertEqual(link.resolved_transaction_b_id, other_rt.id)

    def test_cc_payment_link_survives_rt_delete(self):
        cc = CreditCard.objects.create(nickname='CC', card_name='CC')
        cc_rt = ResolvedTransaction.objects.create(
            transaction_type='credit_card', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('-5000'),
            credit_card=cc,
        )
        link = CreditCardPaymentLink.objects.create(
            bank_resolved_transaction=self.rt, cc_resolved_transaction=cc_rt,
        )
        self.rt.delete()
        link.refresh_from_db()
        self.assertIsNone(link.bank_resolved_transaction_id)
        self.assertEqual(link.cc_resolved_transaction_id, cc_rt.id)

    def test_story_link_cascade_on_story_delete(self):
        """StoryLink is CASCADE deleted when Story is deleted."""
        story = Story.objects.create(name='Temp')
        StoryLink.objects.create(resolved_transaction=self.rt, story=story)
        story.delete()
        self.assertEqual(StoryLink.objects.filter(story_id=story.id).count(), 0)

    def test_entity_link_cascade_on_entity_delete(self):
        """EntityLink is CASCADE deleted when Entity is deleted."""
        entity = Entity.objects.create(name='Temp')
        EntityLink.objects.create(resolved_transaction=self.rt, entity=entity)
        entity.delete()
        self.assertEqual(EntityLink.objects.filter(entity_id=entity.id).count(), 0)


# =============================================================================
# recover_orphaned_links management command tests
# =============================================================================

class RecoverOrphanedLinksTests(TestCase):
    """Test the recover_orphaned_links management command."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.cc = CreditCard.objects.create(nickname='CC', card_name='CC')
        self.bank_txn = BankTransaction.objects.create(
            date=date(2024, 3, 1), narration='Txn',
            value_date=date(2024, 3, 1),
            debit_amount=Decimal('1000'), credit_amount=Decimal('0'),
            reference_number='R1', closing_balance=Decimal('9000'),
            bank_account=self.bank_account,
        )
        self.cc_txn = CreditCardTransaction.objects.create(
            date=date(2024, 3, 1), description='CC Txn',
            amount=Decimal('500'), credit_card=self.cc,
        )

    def test_recover_category_link(self):
        """Orphaned CategoryLink with origin is re-attached to origin's RT."""
        ensure_resolved_transaction(self.bank_txn, 'bank')
        rt_id = self.bank_txn.resolved_transaction_id

        # Create orphaned link (resolved_transaction=NULL but origin set)
        link = CategoryLink.objects.create(
            resolved_transaction=None, category='Food',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertEqual(link.resolved_transaction_id, rt_id)

    def test_recover_story_link(self):
        """Orphaned StoryLink is re-attached."""
        ensure_resolved_transaction(self.bank_txn, 'bank')
        story = Story.objects.create(name='Story')
        link = StoryLink.objects.create(
            resolved_transaction=None, story=story,
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertEqual(link.resolved_transaction_id, self.bank_txn.resolved_transaction_id)

    def test_recover_entity_link(self):
        """Orphaned EntityLink is re-attached."""
        ensure_resolved_transaction(self.cc_txn, 'credit_card')
        entity = Entity.objects.create(name='Entity')
        link = EntityLink.objects.create(
            resolved_transaction=None, entity=entity,
            origin_transaction_type='credit_card', origin_transaction_id=self.cc_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertEqual(link.resolved_transaction_id, self.cc_txn.resolved_transaction_id)

    def test_recover_self_transfer_link_side_a(self):
        """Orphaned SelfTransferLink side_a is re-attached."""
        ensure_resolved_transaction(self.bank_txn, 'bank')
        link = SelfTransferLink.objects.create(
            resolved_transaction_a=None,
            resolved_transaction_b=None,
            origin_transaction_id_a=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertEqual(link.resolved_transaction_a_id, self.bank_txn.resolved_transaction_id)

    def test_recover_cc_payment_link_bank_side(self):
        """Orphaned CreditCardPaymentLink bank side is re-attached."""
        ensure_resolved_transaction(self.bank_txn, 'bank')
        link = CreditCardPaymentLink.objects.create(
            bank_resolved_transaction=None,
            cc_resolved_transaction=None,
            origin_bank_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertEqual(link.bank_resolved_transaction_id, self.bank_txn.resolved_transaction_id)

    def test_dry_run_does_not_modify(self):
        """--dry-run shows what would be recovered without changing anything."""
        ensure_resolved_transaction(self.bank_txn, 'bank')
        link = CategoryLink.objects.create(
            resolved_transaction=None, category='Food',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', '--dry-run', stdout=out)
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)
        self.assertIn('DRY RUN', out.getvalue())

    def test_skip_when_origin_txn_missing(self):
        """Link whose origin transaction no longer exists is skipped."""
        link = CategoryLink.objects.create(
            resolved_transaction=None, category='Food',
            origin_transaction_type='bank', origin_transaction_id=99999,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)
        self.assertIn('not found', out.getvalue())

    def test_skip_when_no_origin_type(self):
        """Link with origin_transaction_id but no origin_transaction_type is skipped."""
        link = CategoryLink.objects.create(
            resolved_transaction=None, category='Food',
            origin_transaction_type=None, origin_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertIsNone(link.resolved_transaction_id)

    def test_creates_rt_for_origin_without_one(self):
        """Recovery creates RT for origin txn that doesn't have one yet."""
        self.assertIsNone(self.bank_txn.resolved_transaction_id)
        link = CategoryLink.objects.create(
            resolved_transaction=None, category='Food',
            origin_transaction_type='bank', origin_transaction_id=self.bank_txn.id,
        )
        out = StringIO()
        call_command('recover_orphaned_links', stdout=out)
        link.refresh_from_db()
        self.assertIsNotNone(link.resolved_transaction_id)
        self.bank_txn.refresh_from_db()
        self.assertEqual(link.resolved_transaction_id, self.bank_txn.resolved_transaction_id)


# =============================================================================
# Link uniqueness constraint tests
# =============================================================================

class LinkUniquenessTests(TestCase):
    """Test unique constraints on link models."""

    def setUp(self):
        self.bank_account = BankAccount.objects.create(
            nickname='Test', bank_name='Test', account_number='123', ifsc_code='TEST0001234',
        )
        self.rt = ResolvedTransaction.objects.create(
            transaction_type='bank', primary_transaction_id=0,
            date=date(2024, 3, 1), amount=Decimal('-1000'),
            bank_account=self.bank_account,
        )

    def test_storylink_unique_per_rt_story(self):
        """Cannot create duplicate StoryLink for same RT + Story."""
        from django.db import IntegrityError
        story = Story.objects.create(name='Story')
        StoryLink.objects.create(resolved_transaction=self.rt, story=story)
        with self.assertRaises(IntegrityError):
            StoryLink.objects.create(resolved_transaction=self.rt, story=story)

    def test_entitylink_unique_per_rt_entity(self):
        """Cannot create duplicate EntityLink for same RT + Entity."""
        from django.db import IntegrityError
        entity = Entity.objects.create(name='Entity')
        EntityLink.objects.create(resolved_transaction=self.rt, entity=entity)
        with self.assertRaises(IntegrityError):
            EntityLink.objects.create(resolved_transaction=self.rt, entity=entity)

    def test_multiple_category_links_allowed(self):
        """Multiple CategoryLinks on same RT are allowed (latest wins)."""
        CategoryLink.objects.create(resolved_transaction=self.rt, category='Food')
        CategoryLink.objects.create(resolved_transaction=self.rt, category='Travel')
        self.assertEqual(CategoryLink.objects.filter(resolved_transaction=self.rt).count(), 2)
