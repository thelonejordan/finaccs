# Transaction Resolution (Safe Source Merging)

## DEVELOPER NOTES

```
Problem: Multiple source files (PDF, CSV, passbook) contain the same transactions with
different narrations. Want to merge them without losing any data or linkages.

Solution: Transaction Resolution
- Group source records that represent the same real-world transaction
- User picks which source's narration to display (primary)
- All source records preserved (no deletion)
- Linkages (stories, entities) stay on source transactions and are aggregated

Key principles:
- No data loss ever
- Explicit trigger required (user marks sources as "overlapping")
- All matches require user review (no auto-merge)
- Each resolved transaction has a unique UUID for reference
```

## Main Section (detailed technical design)

### Problem Statement (Revised)

The original problem was about "replacing" source files. But the real goal is **preserving information** from multiple sources while maintaining a single logical view of each transaction.

**Key insight**: Different source files for the same account may contain the same transactions with different narrations, formats, or details. Rather than replacing one with another (losing information), we should **merge them** through entity resolution.

**Example**:
- `src-1` (bank statement PDF): `2024-01-15 | -5000 | NEFT TO JOHN DOE`
- `src-2` (bank CSV export): `2024-01-15 | -5000 | NEFT/JOHNDOE/REF123`
- `src-3` (passbook scan): `2024-01-15 | -5000 | TRF TO J DOE REF123`

All three represent the **same real-world transaction**. Each narration provides different information. We want to:
1. Group them as one logical transaction
2. Let user pick which source's narration to display
3. Preserve all source records (no deletion)
4. **Linkages automatically carry over** - since source transactions aren't deleted, existing story/entity assignments remain and are inherited by the resolved group

---

### Core Concept: Transaction Resolution

**ResolvedTransaction**: A logical grouping of source transaction records that represent the same real-world transaction.

```
                    ┌──────────────────────────────────┐
                    │      ResolvedTransaction         │
                    │  uuid: rtxn_a1b2c3d4e5f6        │
                    │  (logical identity)              │
                    └───────────────┬──────────────────┘
                                    │
                                    │ aggregates linkages from ▼
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │ BankTxn (src1)│       │ BankTxn (src2)│       │ BankTxn (src3)│
    │ primary: YES  │       │ primary: NO   │       │ primary: NO   │
    │               │       │               │       │               │
    │ Stories: [A]  │       │ Entities: [X] │       │ (no linkages) │
    └───────────────┘       └───────────────┘       └───────────────┘

Linkages STAY on source transactions. ResolvedTransaction inherits/aggregates them.
→ ResolvedTransaction sees: Stories: [A], Entities: [X]
```

---

### Proposed Architecture

#### 1. ResolvedTransaction Model

```python
import uuid

class ResolvedTransaction(models.Model):
    """Logical identity for a real-world transaction, grouping multiple source records."""

    # Unique identifier - copyable, searchable
    uuid = UUIDField(default=uuid.uuid4, unique=True, editable=False)

    transaction_type = CharField  # 'bank' or 'credit_card'

    # The source transaction to use for display (narration, reference, etc.)
    primary_transaction_id = IntegerField

    # Denormalized fields from primary (for efficient querying/display)
    date = DateField
    amount = DecimalField  # Positive for credit, negative for debit
    bank_account = ForeignKey(BankAccount, null=True)
    credit_card = ForeignKey(CreditCard, null=True)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            Index(fields=['bank_account', 'date']),
            Index(fields=['credit_card', 'date']),
            Index(fields=['uuid']),
        ]

    @property
    def short_id(self) -> str:
        """Short copyable ID (first 8 chars of UUID)."""
        return str(self.uuid)[:8]

    def get_linked_resolved_transaction(self):
        """
        Get linked resolved transaction (for self-transfers).
        Derived from source-level BankTransaction.linked_transaction.
        """
        for txn in self.bank_transactions.all():
            if txn.linked_transaction_id:
                linked_txn = BankTransaction.objects.get(id=txn.linked_transaction_id)
                if linked_txn.resolved_transaction_id:
                    return linked_txn.resolved_transaction
        return None
```

#### 2. Transaction to Resolution Link

```python
# Add to BankTransaction model:
class BankTransaction(models.Model):
    # ... existing fields ...
    resolved_transaction = ForeignKey(
        ResolvedTransaction,
        null=True,
        blank=True,
        related_name='bank_transactions'
    )
    is_primary = BooleanField(default=False)  # Is this the display source?

# Same for CreditCardTransaction
```

#### 3. Linkage Model (Unchanged - Automatic Inheritance)

**Key simplification**: Linkages stay on source transactions. No migration needed.

```python
# StoryTransaction and EntityTransaction remain UNCHANGED
# They still reference individual BankTransaction/CreditCardTransaction records

class StoryTransaction(models.Model):
    story = ForeignKey(Story)
    transaction_type = CharField  # 'bank' or 'credit_card'
    transaction_id = IntegerField  # Points to source transaction (unchanged)
    added_at = DateTimeField(auto_now_add=True)

class EntityTransaction(models.Model):
    entity = ForeignKey(Entity)
    transaction_type = CharField  # 'bank' or 'credit_card'
    transaction_id = IntegerField  # Points to source transaction (unchanged)
    added_at = DateTimeField(auto_now_add=True)
```

**How aggregation works**:
```python
class ResolvedTransaction(models.Model):
    # ...

    def get_stories(self):
        """Aggregate stories from all member transactions."""
        story_ids = set()
        for txn in self.bank_transactions.all():
            story_ids.update(
                StoryTransaction.objects
                .filter(transaction_type='bank', transaction_id=txn.id)
                .values_list('story_id', flat=True)
            )
        return Story.objects.filter(id__in=story_ids)

    def get_entities(self):
        """Aggregate entities from all member transactions."""
        entity_ids = set()
        for txn in self.bank_transactions.all():
            entity_ids.update(
                EntityTransaction.objects
                .filter(transaction_type='bank', transaction_id=txn.id)
                .values_list('entity_id', flat=True)
            )
        return Entity.objects.filter(id__in=entity_ids)
```

**Benefits**:
- Zero migration for existing linkages
- Linkages automatically "carry over" when transactions are grouped
- If a transaction is unlinked from a group, its linkages stay with it

#### 4. Overlapping Source Group Model (Resolution Trigger)

**Key Design Decision**: By default, all source files are assumed to contain **unique transactions**. Resolution only happens when users explicitly mark sources as overlapping.

```python
class OverlappingSourceGroup(models.Model):
    """
    User-defined group of source files that contain overlapping transactions.
    This is the TRIGGER for resolution - marking sources as overlapping initiates matching.
    """

    group_id = CharField  # "osg_xxxxxxxx"
    name = CharField  # User-friendly name, e.g., "Jan 2024 Statements"

    # All artifacts in this group are considered to have overlapping transactions
    data_source_artifacts = M2M(DataSourceArtifact)

    # Target account (all sources must be for same account)
    bank_account = ForeignKey(BankAccount, null=True)
    credit_card = ForeignKey(CreditCard, null=True)

    # Status
    resolution_status = CharField  # 'pending', 'in_progress', 'completed'

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        # Each artifact can only be in one overlapping group
        constraints = [
            # Enforced at application level since M2M doesn't support unique
        ]
```

**Behavior**:
- When user marks sources as overlapping → `OverlappingSourceGroup` is created
- This triggers the resolution workflow
- Sources NOT in any group are treated as having unique transactions
- Each source can only belong to ONE overlapping group

#### 5. Resolution Session Model

```python
class ResolutionSession(models.Model):
    """Tracks a transaction resolution operation for an overlapping group."""

    session_id = CharField  # "rs_xxxxxxxx"

    # The overlapping group being resolved
    overlapping_group = ForeignKey(OverlappingSourceGroup)

    status = CharField  # 'suggesting', 'review', 'executing', 'completed', 'cancelled'

    created_at = DateTimeField(auto_now_add=True)
    completed_at = DateTimeField(null=True)

    # Summary
    stats = JSONField  # {"groups_created": 45, "singles": 55, "total_txns": 150}
```

#### 6. Resolution Suggestion Model

```python
class ResolutionSuggestion(models.Model):
    """Suggested grouping of transactions during a resolution session."""

    session = ForeignKey(ResolutionSession)

    # Transactions suggested to be grouped (stored as JSON list of IDs)
    suggested_transaction_ids = JSONField  # [{"type": "bank", "id": 123}, ...]

    # Suggestion info
    suggestion_score = FloatField
    match_signals = JSONField  # {"date": true, "amount": true, "closing_balance": true}
    # Note: Match signals are:
    #   - date: Always true (required for grouping)
    #   - amount: Always true (required for grouping)
    #   - closing_balance: True if closing balances match (strong signal for bank txns)
    # Reference was removed as it's ambiguous (often embedded in narration, not a separate field)

    # User decision
    status = CharField  # 'pending', 'confirmed', 'modified', 'rejected'

    # If confirmed/modified, which transaction is primary
    confirmed_primary_id = IntegerField(null=True)
    confirmed_transaction_ids = JSONField(null=True)  # Final list after user review
```

---

### Workflow

#### Default Behavior (No Resolution)

By default, all source files are treated as containing **unique transactions**:
- Loading a new source file creates new transactions
- No automatic matching or deduplication
- Transactions from different sources are independent

```
Source A (50 txns) ──→ 50 unique transactions
Source B (50 txns) ──→ 50 unique transactions (even if same data)
                       Total: 100 transactions (potential duplicates)
```

#### Trigger: Mark Sources as Overlapping

Resolution is triggered when user explicitly marks sources as having overlapping data:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Source Files - HDFC Savings ****1234                                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ ☑ statement_jan2024.pdf       50 txns    Jan 1-31    ○ Unique                       │
│ ☑ bank_export_jan.csv         50 txns    Jan 1-31    ○ Unique                       │
│ ☐ statement_feb2024.pdf       45 txns    Feb 1-28    ○ Unique                       │
│                                                                                      │
│ Selected: 2 sources                                                                  │
│                                                                                      │
│ [Mark as Overlapping]  ← THIS IS THE TRIGGER                                        │
│                                                                                      │
│ "These sources contain the same transactions (different formats/exports)"           │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**What happens when "Mark as Overlapping" is clicked:**
1. System creates `OverlappingSourceGroup` with selected sources
2. User is prompted to start resolution immediately or later
3. Sources are now tagged as part of an overlapping group

---

#### Phase 1: Create Overlapping Group
1. User selects multiple source files for the same account
2. User clicks "Mark as Overlapping"
3. System validates:
   - All sources target the same bank_account/credit_card
   - Sources are not already in another overlapping group
   - Sources are loaded (or prompts to load first)
4. System creates `OverlappingSourceGroup`
5. User can name the group (e.g., "Jan 2024 Statements")

#### Phase 2: Initiate Resolution
1. User clicks "Resolve Now" (or later from the group)
2. System creates `ResolutionSession` linked to the overlapping group
3. Session status → 'suggesting'

#### Phase 3: Generate Suggestions
1. Collect all transactions from selected sources
2. Group candidates by date + amount (required match)
3. For each potential group with transactions from DIFFERENT sources:
   ```
   candidates = txns where date matches AND amount matches
   if len(candidates) > 1 AND candidates are from different source files:
       # Check closing balance (strong signal for bank transactions)
       if bank_transaction:
           closing_balance_match = all closing balances are equal

       # Score: 1.0 if closing_balance matches, 0.7 otherwise
       score = 1.0 if closing_balance_match else 0.7

       create ResolutionSuggestion(
           suggested_transaction_ids=[...],
           suggestion_score=score,
           match_signals={date: true, amount: true, closing_balance: ...},
           status='pending'
       )
   ```
4. Session status → 'review'

#### Phase 4: User Review (Side-by-Side Comparison)

**UI: Transaction Resolution Review**

Features:
- **Bulk Primary Selection**: Set primary source for ALL transactions at once
- **Per-transaction Override**: Override primary for individual suggestions
- **Colored Amounts**: ↑ green for credits (money in), ↓ red for debits (money out)
- **Match Signals**: Shows which signals matched (date, amount, closing_balance)
- **Navigation**: Previous/Next buttons to browse suggestions one at a time

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ BULK PRIMARY SOURCE                                                          │
│ Set primary for ALL: [Source 1: statement.pdf ▼]  [Apply to All]            │
├──────────────────────────────────────────────────────────────────────────────┤

┌──────────────────────────────────────────────────────────────────────────────┐
│ SUGGESTION 1 of 20                      Match: date ✓ amount ✓ balance ✓    │
│ 2024-01-15 | ↓ ₹5,000.00 (red)                                 Score: 100%  │
├──────────────────────────────────────────────────────────────────────────────┤
│ ○ src-1 (PDF)  │ 2024-01-15 │ ↓ ₹5,000.00 │ NEFT TO JOHN DOE               │
│ ● src-2 (CSV)  │ 2024-01-15 │ ↓ ₹5,000.00 │ NEFT/JOHNDOE/REF123            │
│ ○ src-3 (scan) │ 2024-01-15 │ ↓ ₹5,000.00 │ TRF TO J DOE REF123            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [◀ Prev] [1/20] [Next ▶]           [Not a Match]  [Confirm]                 │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ SUGGESTION 2 of 20                      Match: date ✓ amount ✓ balance ✗    │
│ 2024-01-16 | ↑ ₹10,000.00 (green)                               Score: 70%  │
├──────────────────────────────────────────────────────────────────────────────┤
│ ● src-1 (PDF)  │ 2024-01-16 │ ↑ ₹10,000.00 │ SALARY CREDIT ACME INC        │
│ ○ src-2 (CSV)  │ 2024-01-16 │ ↑ ₹10,000.00 │ SAL CR ACME                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [◀ Prev] [2/20] [Next ▶]           [Not a Match]  [Confirm]                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**User actions**:
1. **Set Primary for All** - Bulk select which source file should be primary for ALL suggestions
2. **Confirm** - Accept suggestion with selected primary source
3. **Not a Match** - These are actually different transactions, reject the suggestion
4. **Per-transaction Primary Selection** - Click radio button to select primary for individual suggestion
5. **Navigation** - Use Previous/Next to browse through suggestions
6. **Revert** - Change a confirmed/rejected suggestion back to pending for re-review

#### Phase 5: Execute Resolution
1. Session status → 'executing'
2. For each confirmed group:
   - Create `ResolvedTransaction` with:
     - UUID (auto-generated)
     - primary_transaction_id set to user's selection
     - Denormalized date/amount from primary
   - Update all grouped `BankTransaction`/`CreditCardTransaction` records:
     - Set `resolved_transaction` FK
     - Set `is_primary = True` for the selected primary only
3. **Linkages are NOT migrated** - they stay on source transactions
   - Stories/Entities: Already on source txns, aggregated via `get_stories()`/`get_entities()`
   - Self-transfer links: Stay on source `BankTransaction.linked_transaction`
   - CC payment matches: Stay on source transactions
4. Session status → 'completed'
5. OverlappingSourceGroup.resolution_status → 'completed'

---

### Querying & Display

#### Getting transactions for display:

```python
# OLD: Query raw transactions
transactions = BankTransaction.objects.filter(bank_account=account)

# NEW: Query resolved transactions
resolved = ResolvedTransaction.objects.filter(bank_account=account)
for rtxn in resolved:
    primary = rtxn.bank_transactions.get(is_primary=True)
    display_narration = primary.narration
    all_narrations = [t.narration for t in rtxn.bank_transactions.all()]
```

#### Transaction detail view shows all sources:

```
┌─────────────────────────────────────────────────────────┐
│ Transaction: 2024-01-15 | -5,000.00                     │
├─────────────────────────────────────────────────────────┤
│ Narration: NEFT/JOHNDOE/REF123 (from src-2)             │
│ Reference: REF123                                       │
│                                                         │
│ Also recorded in:                                       │
│   • src-1: "NEFT TO JOHN DOE"                          │
│   • src-3: "TRF TO J DOE REF123"                       │
│                                                         │
│ [Change Primary Source ▼]                               │
├─────────────────────────────────────────────────────────┤
│ Stories: Rent Payment, Monthly Expenses                 │
│ Entities: John Doe                                      │
│ Linked: ↔ Transfer from Savings Account                │
└─────────────────────────────────────────────────────────┘
```

---

### API Endpoints

#### Overlapping Source Group APIs (Trigger)

```
POST /api/sources/overlapping-groups
    body: {
        artifact_ids: ["ds_art_xxx", "ds_art_yyy"],
        name: "Jan 2024 Statements"  // optional
    }
    → Creates overlapping group, validates same account
    → Returns: group_id

GET /api/sources/overlapping-groups?account_id={id}
    → List all overlapping groups for an account

GET /api/sources/overlapping-groups/{group_id}
    → Get group details including resolution status

DELETE /api/sources/overlapping-groups/{group_id}
    → Remove overlapping group (sources become independent again)
    → Only allowed if not yet resolved

PATCH /api/sources/overlapping-groups/{group_id}
    body: { add_artifact_ids: [...], remove_artifact_ids: [...] }
    → Modify group membership (before resolution)
```

#### Resolution Session APIs

```
POST /api/sources/overlapping-groups/{group_id}/resolve
    → Starts resolution session for the overlapping group
    → Returns: session_id

GET /api/transactions/resolve/{session_id}
    → Get session status and stats

POST /api/transactions/resolve/{session_id}/suggest
    → Generates match suggestions

GET /api/transactions/resolve/{session_id}/review
    → Returns suggestions for UI review

POST /api/transactions/resolve/{session_id}/confirm-group
    body: { suggestion_id: 123, primary_transaction_id: 456 }
    → Confirms a suggested group with selected primary

POST /api/transactions/resolve/{session_id}/modify-group
    body: { suggestion_id: 123, transaction_ids: [...], primary_id: 456 }
    → Modifies a suggested group

POST /api/transactions/resolve/{session_id}/execute
    → Executes the resolution

POST /api/transactions/resolve/{session_id}/cancel
    → Cancels the resolution session
```

#### Resolved Transaction APIs

```
GET /api/transactions/resolved/{uuid}
    → Get resolved transaction by UUID (full or short)
    → Returns: transaction details, all source records, aggregated linkages

GET /api/transactions/resolved/search?q={partial_uuid}
    → Search by partial UUID prefix
    → Returns: list of matching resolved transactions

PATCH /api/transactions/resolved/{uuid}/primary
    body: { primary_transaction_id: 789 }
    → Change primary source for display

POST /api/transactions/resolved/{uuid}/unlink
    body: { transaction_id: 123 }
    → Remove a source transaction from the group
    → Source transaction becomes standalone (its own single-member resolved txn)
    → Original resolved txn keeps remaining members (or becomes single-member if only one left)

POST /api/transactions/resolved/{uuid}/merge
    body: { other_uuid: "b2c3d4e5" }
    → Merge two resolved transactions into one
```

#### Transaction List API (Updated)

```
GET /api/transactions/resolved?account_id={id}&page={n}
    → Returns resolved transactions with:
      - uuid, short_id
      - primary transaction details
      - source_count (number of copies)
      - aggregated linkage counts
```

---

### UI Components

#### 0. Mark Sources as Overlapping (Resolution Trigger)

This is the entry point for resolution. Located on the Source Files page for each account.

**Source Files Page with Overlapping Controls:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Source Files - HDFC Savings ****1234                                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ LOADED SOURCES                                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ☑ statement_jan2024.pdf    │ 50 txns │ Jan 1-31  │ ○ Independent               │ │
│ │ ☑ bank_export_jan.csv      │ 50 txns │ Jan 1-31  │ ○ Independent               │ │
│ │ ☐ passbook_q1.pdf          │ 150 txns│ Jan-Mar   │ ○ Independent               │ │
│ │ ☐ statement_feb2024.pdf    │ 45 txns │ Feb 1-28  │ ○ Independent               │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ Selected: 2 sources with overlapping date range (Jan 1-31)                          │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ [Mark as Overlapping]                                                           │ │
│ │                                                                                 │ │
│ │ "These sources contain the same transactions in different formats.              │ │
│ │  Marking them as overlapping lets you merge duplicates and choose              │ │
│ │  which narration to display."                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**After clicking "Mark as Overlapping" - Name the Group:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Create Overlapping Source Group                                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Group Name: [Jan 2024 Statements_________________]                                   │
│                                                                                      │
│ Sources in this group:                                                               │
│   • statement_jan2024.pdf (50 transactions)                                          │
│   • bank_export_jan.csv (50 transactions)                                            │
│                                                                                      │
│ These sources will be marked as containing overlapping transactions.                 │
│ You can then resolve them to merge duplicates.                                       │
│                                                                                      │
│                                    [Cancel]  [Create Group & Resolve Now]            │
│                                              [Create Group (Resolve Later)]          │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Source Files Page - After Group Created:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Source Files - HDFC Savings ****1234                                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ OVERLAPPING GROUPS                                                                   │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📁 Jan 2024 Statements                                    Status: ⚠️ Pending    │ │
│ │    • statement_jan2024.pdf (50 txns)                                            │ │
│ │    • bank_export_jan.csv (50 txns)                                              │ │
│ │                                                                                 │ │
│ │    [Resolve Now]  [Edit Group]  [Remove Group]                                  │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ 📁 Q1 2024 Combined                                       Status: ✅ Resolved   │ │
│ │    • passbook_q1.pdf (150 txns)                                                 │ │
│ │    • quarterly_statement.pdf (150 txns)                                         │ │
│ │                                                                                 │ │
│ │    Resolved: 150 transactions (75 with 2 copies)                                │ │
│ │    [View Resolution]  [Add Source]                                              │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ INDEPENDENT SOURCES (not in any overlapping group)                                   │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ☐ statement_feb2024.pdf    │ 45 txns │ Feb 1-28  │ ○ Independent               │ │
│ │ ☐ statement_mar2024.pdf    │ 48 txns │ Mar 1-31  │ ○ Independent               │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ [Mark Selected as Overlapping]                                                       │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

Status Legend:
  ⚠️ Pending   - Group created, resolution not started
  🔄 In Progress - Resolution in progress
  ✅ Resolved  - All transactions resolved
```

**Validation Errors:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Cannot create overlapping group                                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ • "bank_export_jan.csv" is already in group "Jan 2024 Statements"                   │
│                                                                                      │
│ Each source can only be in one overlapping group.                                    │
│ Remove it from the existing group first, or select different sources.               │
│                                                                                      │
│                                                                         [OK]        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

#### 1. Transactions List Page (with Resolution Indicators)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Transactions - HDFC Savings ****1234                              [Resolve Sources] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search by UUID: [________________________] [Go]                                  │
├──────┬────────────┬─────────────┬─────────────────────────────────┬─────────┬───────┤
│      │ DATE       │ AMOUNT      │ NARRATION                       │ SOURCES │ UUID  │
├──────┼────────────┼─────────────┼─────────────────────────────────┼─────────┼───────┤
│      │ 2024-01-15 │ -5,000.00   │ NEFT/JOHNDOE/REF123            │ ③       │ 📋    │
│      │            │             │                                 │         │       │
├──────┼────────────┼─────────────┼─────────────────────────────────┼─────────┼───────┤
│      │ 2024-01-16 │ +10,000.00  │ SALARY CREDIT ACME INC         │ ②       │ 📋    │
│      │            │             │                                 │         │       │
├──────┼────────────┼─────────────┼─────────────────────────────────┼─────────┼───────┤
│      │ 2024-01-17 │ -1,500.00   │ ATM WITHDRAWAL                 │ ①       │ 📋    │
│      │            │             │                                 │         │       │
├──────┼────────────┼─────────────┼─────────────────────────────────┼─────────┼───────┤
│      │ 2024-01-18 │ -200.00     │ AMAZON PAY                     │ ①       │ 📋    │
└──────┴────────────┴─────────────┴─────────────────────────────────┴─────────┴───────┘

Legend:
  SOURCES column shows count of source records for this transaction
  ③ = 3 sources (resolved transaction with copies)
  ② = 2 sources
  ① = 1 source (single record, no copies)

  📋 = Click to copy UUID to clipboard
       Shows toast: "UUID a1b2c3d4 copied!"
```

**Source count badge styling**:
- `①` - Gray/muted (single source, no resolution)
- `②` `③` `④` - Blue badge (resolved with multiple sources)

**Clicking the source badge** opens a popover:
```
┌─────────────────────────────────────────┐
│ 3 source records:                       │
│                                         │
│ ★ src-2 (CSV)    - primary              │
│   src-1 (PDF)                           │
│   src-3 (scan)                          │
│                                         │
│ [View Details] [Change Primary]         │
└─────────────────────────────────────────┘
```

---

#### 2. Transaction Details Page

Accessible via:
- Clicking a row in the transactions list
- Pasting UUID in the search box
- Direct URL: `/transactions/details?uuid=a1b2c3d4`

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Transaction Details                                                                  │
│                                                                                      │
│ UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890                          [📋 Copy UUID]  │
│ Short ID: a1b2c3d4                                                  [📋 Copy Short] │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ PRIMARY RECORD (displayed in lists)                                             │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Source:      src-2 (bank_statement_jan2024.csv)                                 │ │
│ │ Date:        2024-01-15                                                         │ │
│ │ Amount:      -5,000.00                                                          │ │
│ │ Narration:   NEFT/JOHNDOE/REF123                                               │ │
│ │ Reference:   REF123                                                             │ │
│ │ Value Date:  2024-01-15                                                         │ │
│ │ Balance:     45,230.50                                                          │ │
│ │                                                                 [Set as Primary]│ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ OTHER RECORDS (2 copies)                                                        │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Source: src-1 (statement_jan.pdf)                          [Set as Primary] │ │ │
│ │ │ Narration: NEFT TO JOHN DOE                                                 │ │ │
│ │ │ Reference: -                                                                │ │ │
│ │ │ Value Date: 2024-01-15                                                      │ │ │
│ │ │ Balance: 45,230.50                                                          │ │ │
│ │ └─────────────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                                 │ │
│ │ ┌─────────────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Source: src-3 (passbook_scan.pdf)                          [Set as Primary] │ │ │
│ │ │ Narration: TRF TO J DOE REF123                                              │ │ │
│ │ │ Reference: REF123                                                           │ │ │
│ │ │ Value Date: -                                                               │ │ │
│ │ │ Balance: -                                                                  │ │ │
│ │ └─────────────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                                 │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ LINKAGES (aggregated from all records)                                          │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                                 │ │
│ │ Stories:                                                                        │ │
│ │   📖 Rent Payment (linked from src-1)                                          │ │
│ │   📖 Monthly Expenses (linked from src-2)                                      │ │
│ │                                                                                 │ │
│ │ Entities:                                                                       │ │
│ │   👤 John Doe (linked from src-1)                                              │ │
│ │                                                                                 │ │
│ │ Self-Transfer:                                                                  │ │
│ │   ↔ Linked to: 2024-01-15 | +5,000.00 | HDFC Current ****5678                  │ │
│ │     (rtxn: b2c3d4e5)                                          [View Details]   │ │
│ │                                                                                 │ │
│ │ CC Payment Match:                                                               │ │
│ │   💳 None                                                                       │ │
│ │                                                                                 │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ACTIONS                                                                         │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │ [Add to Story ▼]  [Add to Entity ▼]  [Create Self-Transfer Link]               │ │
│ │                                                                                 │ │
│ │ [Unlink Record from Group...]  [Merge with Another Transaction...]              │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

#### 3. UUID Search Box

Present on the Transactions page header:

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔍 Search by UUID: [a1b2c3d4________________________] [Go]         │
└────────────────────────────────────────────────────────────────────┘

Behavior:
- Accepts full UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
- Accepts short ID: a1b2c3d4
- Accepts partial (prefix match): a1b2
- On "Go" or Enter: navigates to Transaction Details page

If not found:
┌────────────────────────────────────────────────────────────────────┐
│ ⚠️ No transaction found with UUID "xyz123"                         │
│    Check the UUID and try again.                                   │
└────────────────────────────────────────────────────────────────────┘
```

---

#### 4. Resolution Wizard (3 Steps)

**Step 1: Confirm Group & Generate Matches**

(Triggered from "Resolve Now" on an overlapping group)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Resolve Overlapping Sources                                          Step 1 of 3    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Overlapping Group: "Jan 2024 Statements"                                            │
│ Account: HDFC Savings ****1234                                                       │
│                                                                                      │
│ Sources in this group:                                                               │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ ✓ statement_jan2024.pdf       │ 50 transactions │ Jan 1 - Jan 31   │ Loaded    │ │
│ │ ✓ bank_export_jan.csv         │ 50 transactions │ Jan 1 - Jan 31   │ Loaded    │ │
│ │ ✓ passbook_q1.pdf             │ 150 transactions│ Jan 1 - Mar 31   │ Loaded    │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ Total: 250 source transactions                                                       │
│ Date overlap: Jan 1 - Jan 31 (50 days of potential matches)                         │
│                                                                                      │
│ ⚠️ Want to add more sources to this group before resolving?                          │
│    [Add More Sources...]                                                             │
│                                                                                      │
│                                                    [Cancel]  [Generate Matches →]   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Generating matches... (loading state)**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Resolve Overlapping Sources                                          Step 1 of 3    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│                        ⏳ Generating match suggestions...                            │
│                                                                                      │
│                        Analyzing 250 transactions...                                 │
│                        Found 45 potential groups so far...                           │
│                                                                                      │
│                        [Cancel]                                                      │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Step 2: Review Suggested Groups**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Resolve Overlapping Sources                                          Step 2 of 3    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Review Suggested Groups                        Progress: 0 / 45 groups reviewed     │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ BULK PRIMARY SOURCE SELECTION                                                   │ │
│ │ Set primary source for ALL transactions:  [Source 1 ▼]  [Apply to All]          │ │
│ │ (You can still override per-transaction below)                                   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ Filter: [All Groups ▼]  [Show only: Needs Review]  [Show only: Confirmed]           │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ GROUP 1 of 45                                    Match confidence: HIGH (1.0)   │ │
│ │ 2024-01-15 | ↓ ₹5,000.00 (red)                                                  │ │
│ │ Match signals: date ✓  amount ✓  closing_balance ✓                              │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                                 │ │
│ │   SOURCE              DATE         AMOUNT              NARRATION                │ │
│ │   ─────────────────────────────────────────────────────────────────────────     │ │
│ │ ○ statement.pdf       2024-01-15   ↓ ₹5,000.00 (red)   NEFT TO JOHN DOE        │ │
│ │ ● bank_export.csv     2024-01-15   ↓ ₹5,000.00 (red)   NEFT/JOHNDOE/REF123     │ │
│ │ ○ passbook.pdf        2024-01-15   ↓ ₹5,000.00 (red)   TRF TO J DOE REF123     │ │
│ │                                                                                 │ │
│ │ Primary: ● bank_export.csv                                                      │ │
│ │                                                                                 │ │
│ │ [✓ Confirm]  [✗ Not a Match]                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ GROUP 2 of 45                                    Match confidence: MEDIUM (0.7) │ │
│ │ 2024-01-16 | ↑ ₹10,000.00 (green)                                               │ │
│ │ Match signals: date ✓  amount ✓  closing_balance ✗                              │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                                 │ │
│ │   SOURCE              DATE         AMOUNT               NARRATION               │ │
│ │   ─────────────────────────────────────────────────────────────────────────     │ │
│ │ ● statement.pdf       2024-01-16   ↑ ₹10,000.00 (green) SALARY CREDIT ACME INC │ │
│ │ ○ bank_export.csv     2024-01-16   ↑ ₹10,000.00 (green) SAL CR ACME            │ │
│ │                                                                                 │ │
│ │ Primary: ● statement.pdf                                                        │ │
│ │                                                                                 │ │
│ │ [✓ Confirm]  [✗ Not a Match]                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ Navigation: [◀ Previous] [1 / 45] [Next ▶]          [Back]  [Execute Resolution]   │
└─────────────────────────────────────────────────────────────────────────────────────┘

Amount Display:
  ↑ ₹10,000.00 (green) = Credit (money in)
  ↓ ₹5,000.00 (red)    = Debit (money out)
```

**Step 2 (continued): Handle Unmatched Transactions**

(This is part of Step 2, shown as a separate section after reviewing suggested groups)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Resolve Overlapping Sources                                    Step 2 of 3 (cont.)  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Unmatched Transactions                                                               │
│                                                                                      │
│ These transactions appear in only one source. They will be created as               │
│ single-record resolved transactions.                                                 │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Only in: statement.pdf (5 transactions)                                         │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 2024-01-17 | -1,500.00  | ATM WITHDRAWAL              [Find Match...] [OK ✓]   │ │
│ │ 2024-01-20 | -350.00    | UTILITY BILL PAYMENT        [Find Match...] [OK ✓]   │ │
│ │ 2024-01-25 | -89.00     | NETFLIX SUBSCRIPTION        [Find Match...] [OK ✓]   │ │
│ │ 2024-01-28 | +500.00    | UPI/REFUND                  [Find Match...] [OK ✓]   │ │
│ │ 2024-01-30 | -2,000.00  | RENT TRANSFER               [Find Match...] [OK ✓]   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Only in: bank_export.csv (2 transactions)                                       │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │ 2024-01-31 | -50.00     | BANK CHARGES                [Find Match...] [OK ✓]   │ │
│ │ 2024-01-31 | -18.00     | GST ON CHARGES              [Find Match...] [OK ✓]   │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ "Find Match" lets you search other sources for a matching transaction.               │
│                                                                                      │
│                                                [Back]  [Next: Confirm & Execute]    │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Step 3: Confirmation & Execute**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Resolve Overlapping Sources                                          Step 3 of 3    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Summary                                                                              │
│                                                                                      │
│ ┌─────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Sources processed:           3                                                  │ │
│ │ Total source transactions:   250                                                │ │
│ │                                                                                 │ │
│ │ Resolved transactions:       98                                                 │ │
│ │   - With 3 copies:           45                                                 │ │
│ │   - With 2 copies:           46                                                 │ │
│ │   - Single record:           7                                                  │ │
│ │                                                                                 │ │
│ │ Linkages preserved:                                                             │ │
│ │   - Story assignments:       23                                                 │ │
│ │   - Entity assignments:      15                                                 │ │
│ │   - Self-transfer links:     8                                                  │ │
│ │   - CC payment matches:      2                                                  │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│ ⚠️  This operation will create resolved transaction records. Source transactions     │
│    will be linked to their resolved groups. This can be undone by unlinking         │
│    individual records.                                                               │
│                                                                                      │
│                                                    [Back]  [Execute Resolution]     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Post-Execution Success:**

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ✅ Resolution Complete!                                                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ Created 98 resolved transactions from 250 source records.                           │
│                                                                                      │
│ All existing linkages (stories, entities, self-transfers) have been preserved       │
│ and are now accessible through the resolved transactions.                           │
│                                                                                      │
│                                        [View Transactions]  [Resolve More Sources]  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

#### 5. Quick Actions from Transactions List

**Right-click context menu or action dropdown:**

```
┌─────────────────────────────┐
│ 📋 Copy UUID                │
│ 📋 Copy Short ID            │
│ ─────────────────────────── │
│ 👁️ View Details             │
│ ★  Change Primary Source    │
│ ─────────────────────────── │
│ 📖 Add to Story...          │
│ 👤 Add to Entity...         │
│ ↔️ Create Self-Transfer Link │
│ ─────────────────────────── │
│ 🔗 Merge with Another...    │
│ ✂️ Unlink from Group        │
└─────────────────────────────┘
```

---

#### 6. Source File View Enhancement

On the source files / extractions page, show resolution status:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ Source Files - HDFC Savings ****1234                                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│ FILE                      TRANSACTIONS    DATE RANGE         RESOLUTION STATUS      │
│ ─────────────────────────────────────────────────────────────────────────────────── │
│ statement_jan2024.pdf     50              Jan 1 - Jan 31     ✅ Fully resolved      │
│ bank_export_jan.csv       50              Jan 1 - Jan 31     ✅ Fully resolved      │
│ passbook_q1.pdf           150             Jan 1 - Mar 31     ⚠️ Partial (50/150)    │
│ statement_feb2024.pdf     45              Feb 1 - Feb 28     ○ Not resolved         │
│                                                                                      │
│ Legend:                                                                              │
│   ✅ Fully resolved - all transactions linked to resolved groups                    │
│   ⚠️ Partial - some transactions resolved, others pending                           │
│   ○ Not resolved - transactions exist as standalone records                         │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Data Integrity Guarantees

**No data is ever deleted by this feature:**

| Data Type | Guarantee |
|-----------|-----------|
| Source transactions | Never deleted. `BankTransaction`/`CreditCardTransaction` records are only linked to resolved groups, never removed. |
| Source files | Never deleted. Can be hidden but file data remains in database. |
| Story assignments | Stay on source transactions. Aggregated for display, never moved or deleted. |
| Entity assignments | Stay on source transactions. Aggregated for display, never moved or deleted. |
| Self-transfer links | Stay on source `BankTransaction.linked_transaction`. Derived at resolved level. |
| CC payment matches | Stay on source transactions. Derived at resolved level. |
| Resolved transactions | Never deleted. Unlinking a source txn creates a new single-member resolved txn for it. |

**Reversibility:**
- Any resolution can be undone by unlinking transactions
- Unlinking creates standalone resolved transactions (doesn't delete anything)
- Changing primary source is instant and non-destructive

---

### Edge Cases

#### Overlapping Group Management

| Scenario | Handling |
|----------|----------|
| Source already in another overlapping group | Error: "Source is already in group X. Remove it first." |
| Marking sources from different accounts | Error: "All sources must be for the same account." |
| Source not yet loaded | Prompt: "Load source first before marking as overlapping" |
| Removing source from group after resolution | Allowed; transactions become standalone; linkages stay |
| Deleting overlapping group | If not resolved: group deleted, sources become independent. If resolved: error, unlink transactions first |

#### Resolution Process

| Scenario | Handling |
|----------|----------|
| 3+ sources have same transaction | Group all together; user picks one primary |
| Amount differs slightly (rounding) | Don't auto-suggest; user can manually group via "Find Match" |
| Same date, same amount, different transactions | Present as suggestion; user splits apart |
| User wants to undo grouping | "Unlink" removes source txn from group → becomes its own single-member resolved txn |
| Deleting a source file | **Not recommended**. If primary, auto-promote another. If last source, resolved txn retains UUID but has no display data (soft-deleted state) |
| Adding new source to existing group | Can add before resolution; after resolution, triggers incremental re-resolution |

#### Default Behavior (No Overlapping Group)

| Scenario | Handling |
|----------|----------|
| Loading duplicate source file | Treated as unique; creates separate transactions (user must mark as overlapping to resolve) |
| Same transactions in different accounts | No auto-detection; these are legitimately different (e.g., self-transfer appears in both accounts) |

---

### Migration Path

**Key simplification**: Since linkages stay on source transactions and are aggregated, no linkage migration is needed.

1. **Phase 1: Add new models**
   - Add `ResolvedTransaction` model with UUID field
   - Add `OverlappingSourceGroup` model (resolution trigger)
   - Add `ResolutionSession` and `ResolutionSuggestion` models
   - Add `resolved_transaction` FK and `is_primary` to `BankTransaction`/`CreditCardTransaction`
   - No changes to `StoryTransaction`/`EntityTransaction`

2. **Phase 2: Auto-create resolved transactions for existing data**
   - For each existing transaction without a resolved_transaction:
     - Create single-member `ResolvedTransaction`
     - Set transaction as primary
   - This is a one-time data migration
   - Existing linkages automatically work (they point to source transactions which are now members of resolved groups)

3. **Phase 3: Update queries and views**
   - Transaction list queries now return `ResolvedTransaction` objects
   - Transaction detail view shows all source records and aggregated linkages
   - Story/Entity views aggregate from source transactions

4. **Phase 4: Add "Mark as Overlapping" UI**
   - Add overlapping group management to Source Files page
   - Add "Mark as Overlapping" button and flow
   - Add group status indicators

5. **Phase 5: Add Resolution Wizard UI**
   - Add 3-step resolution wizard
   - Add Transaction Details page with UUID search
   - Add source count indicators on transaction list
   - Add "Change Primary" functionality

6. **Phase 6: Add API endpoints**
   - Overlapping group management APIs
   - Resolution session management
   - UUID lookup
   - Primary source switching

