# Credit Card EMIs

## Problem

EMI (Equated Monthly Installment) transactions on credit cards generate multiple related charges over time: the original purchase reversal, principal amortization entries, and interest charges per installment. Currently these are grouped manually via Stories (`💰 EMI - ...`), which is a workaround. There is no first-class way to:

- View all active/completed EMIs in one place
- See progress (installments paid vs remaining)
- Link EMI metadata from PDF extractions to the actual transactions
- Create EMI records when extraction metadata is unavailable

## Solution

A dedicated Credit Card EMI feature with its own model, link table, API, and frontend page.

## Data Model

### CreditCardEMI (in `credit_cards/models.py`)

```python
class CreditCardEMI(models.Model):
    emi_id = CharField(max_length=20, unique=True)  # "emi_xxxxxxxx"
    name = CharField(max_length=200)                 # e.g., "CROMA - MacBook Pro"
    description = TextField(blank=True)
    credit_card = ForeignKey(CreditCard, null=True, blank=True)

    # EMI terms
    original_amount = DecimalField(max_digits=12, decimal_places=2, null=True)
    num_installments = IntegerField(null=True)
    monthly_installment = DecimalField(max_digits=12, decimal_places=2, null=True)
    creation_date = DateField(null=True)
    finish_date = DateField(null=True)

    # Status
    STATUS_CHOICES = [('active', 'Active'), ('completed', 'Completed'), ('foreclosed', 'Foreclosed')]
    status = CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Provenance: link to the extraction artifact this was suggested from (if any)
    source_artifact = ForeignKey('extractions.ExtractionArtifact', null=True, blank=True, on_delete=SET_NULL)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

### EMILink (in `links/models.py`)

Same pattern as StoryLink/EntityLink, with an additional `component_type` field to classify the role of each transaction within the EMI:

```python
class EMILink(models.Model):
    COMPONENT_TYPE_CHOICES = [
        ('purchase', 'Original Purchase'),        # The original charge that was converted to EMI (debit)
        ('loan', 'Loan (EMI Conversion Credit)'), # Refund/credit when purchase is converted to EMI
        ('principal', 'Principal Installment'),    # Principal Amount Amortization
        ('interest', 'Interest Installment'),      # Interest Amount Amortization
        ('processing_fee', 'Processing Fee'),      # One-time processing/convenience fee
        ('tax', 'Tax'),                            # Any tax: IGST, CGST, SGST, etc.
        ('foreclosure', 'Foreclosure Charge'),     # Prepayment/foreclosure penalty
        ('other', 'Other'),                        # Any other EMI-related charge
    ]

    resolved_transaction = ForeignKey('extractions.ResolvedTransaction', on_delete=SET_NULL, null=True)
    emi = ForeignKey('credit_cards.CreditCardEMI', on_delete=CASCADE)
    component_type = CharField(max_length=20, choices=COMPONENT_TYPE_CHOICES, default='other')
    installment_number = IntegerField(null=True, blank=True)  # Only for principal/interest entries

    # Tax linkage: when component_type='tax', this links to the parent EMILink it is levied on
    tax_parent_link = ForeignKey('self', on_delete=SET_NULL, null=True, blank=True, related_name='tax_children')
    tax_rate = DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)  # e.g., 18.00 for 18%

    origin_transaction_type = CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = IntegerField(null=True, blank=True)
    added_at = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['resolved_transaction', 'emi']]
```

#### Component Types

| Type | Description | Installment # | Example Transaction |
|------|-------------|---------------|-------------------|
| `purchase` | Original purchase (debit on card) | never | `CROMA BHUBANESWAR IN` (30367.55) |
| `loan` | EMI conversion credit (refund of purchase) | never | `CROMA BHUBANESWAR IN` (-30367.55) |
| `principal` | Principal portion of an installment | yes | `Principal Amount Amortization - <1/3>CROMA` (9988.82) |
| `interest` | Interest portion of an installment | yes | `Interest Amount Amortization - <1/3>CROMA` (404.65) |
| `processing_fee` | One-time EMI conversion/processing fee | never | `Fee on gaming transaction` (45.92) |
| `tax` | Any tax on fees or interest (IGST, CGST, SGST, etc.) | inherited from parent | `IGST-CI@18%` (8.22) |
| `foreclosure` | Early closure penalty | never | Foreclosure charge |
| `other` | Anything else EMI-related | optional | DCC Fee, Markup Fee |

#### Purchase vs Loan

When a credit card transaction is converted to EMI:
1. **Purchase** — the original debit charge on the card (positive amount, e.g., ₹12,733.00)
2. **Loan** — the credit/refund issued when the bank converts it to EMI (negative amount, e.g., -₹12,733.00)

Both should match `original_amount` in absolute value. The net effect is zero — the purchase is "replaced" by installment debits over time.

#### Installment Number Rules

- `purchase`, `loan`, `processing_fee`, `foreclosure`: **never** have an installment number — they are one-time charges.
- `principal`, `interest`: **should** have an installment number (parsed from `<N/M>` in the description).
- `tax`: does **not** have its own installment number. Instead, it is linked to a parent EMILink via `tax_parent_link`. Its effective installment is inherited from the parent.
- `other`: optionally has an installment number.

#### Tax Linkage

Tax transactions are linked to the EMILink they are levied on (the "parent"):

```
IGST-CI@18% (₹34.38) → tax_parent_link → Interest #1 (₹191.00), tax_rate=18.00
IGST-CI@18% (₹45.84) → tax_parent_link → Processing Fee (₹254.66), tax_rate=18.00
```

This captures:
- **Which transaction** the tax is on (interest installment? processing fee?)
- **What rate** was applied (18%, 9%, etc.)
- **Grouping**: a tax linked to an installment's interest appears inside that installment group in the UI
- **Validation**: `tax_amount ≈ parent_amount × (tax_rate / 100)` with ±₹0.10 tolerance

## API Endpoints

All under `/api/emis/`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/emis/` | List all EMIs with computed stats |
| POST | `/api/emis/` | Create EMI (manual or from suggestion) |
| GET | `/api/emis/<emi_id>/` | Detail with linked transactions |
| PUT | `/api/emis/<emi_id>/` | Update EMI fields |
| DELETE | `/api/emis/<emi_id>/` | Delete EMI and its links |
| POST | `/api/emis/<emi_id>/transactions/` | Add transactions to EMI |
| DELETE | `/api/emis/<emi_id>/transactions/` | Remove transactions from EMI |
| PATCH | `/api/emis/<emi_id>/links/<link_id>/` | Update link classification (component_type, installment_number) |
| GET | `/api/emis/suggestions/` | Get suggestions from extraction artifacts |

### List Response

```json
{
  "emis": [
    {
      "emi_id": "emi_a1b2c3d4",
      "name": "CROMA - MacBook Pro",
      "credit_card": { "id": 1, "nickname": "MMT", "card_number_mask": "9004" },
      "original_amount": 30367.55,
      "num_installments": 3,
      "monthly_installment": 10393.47,
      "creation_date": "2025-11-26",
      "finish_date": "2026-01-26",
      "status": "completed",
      "stats": {
        "transaction_count": 7,
        "installments_paid": 3,
        "total_principal_paid": 30367.55,
        "total_interest_paid": 812.87,
        "total_fees_paid": 0,
        "total_tax_paid": 0,
        "total_paid": 31180.42
      }
    }
  ]
}
```

### Suggestions Response

Aggregates unlinked `artifact_type='emi'` rows from ExtractionArtifact. Each row in the EMI CSV becomes a suggestion:

```json
{
  "suggestions": [
    {
      "artifact_id": 11,
      "source_file": "4375XXXXXXXX8007_624522_Retail_Coral_NORM.pdf",
      "card_number_mask": "8007",
      "loan_type": "Merchant EMI conversions",
      "creation_date": "2021-05-30",
      "finish_date": "2023-04-30",
      "num_installments": 24,
      "emi_amount": 18906.80,
      "pending_installments": 19,
      "outstanding_amount": 17423.16,
      "monthly_installment": 917.01,
      "already_linked": false
    }
  ]
}
```

### Create from Suggestion

```json
POST /api/emis/
{
  "name": "BYJUS Subscription",
  "source_artifact_id": 11,
  "credit_card_id": 1,
  "original_amount": 18906.80,
  "num_installments": 24,
  "monthly_installment": 917.01,
  "creation_date": "2021-05-30",
  "finish_date": "2023-04-30"
}
```

### Create Manually

```json
POST /api/emis/
{
  "name": "iPhone 15 Pro",
  "credit_card_id": 2,
  "original_amount": 60000,
  "num_installments": 6,
  "monthly_installment": 10471.52,
  "creation_date": "2024-01-26"
}
```

## Frontend

### Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/emis` | `EMIsPage` | List of all EMIs + suggestions panel |
| `/emis/:emiId` | `EMIDetailPage` | EMI detail with linked transactions |

### List Page (`/emis`)

- Card grid (similar to StoriesPage) showing each EMI
- Each card shows: name, credit card, progress bar (installments paid/total), monthly amount, dates, status badge
- "Create EMI" button for manual creation
- Collapsible "Suggestions" section at top showing unlinked EMI artifacts from extractions
  - Each suggestion has a "Create" button that pre-fills the create form
  - Suggestions that already have a linked EMI are hidden

### Detail Page (`/emis/:emiId`)

- Header: name (editable), status badge, credit card
- Summary cards: original amount, monthly installment, installments paid/total, total interest paid, total fees, total tax
- Progress bar showing completion
- Transactions table grouped or tagged by component type:
  - Color-coded badges: `purchase`, `principal`, `interest`, `processing_fee`, `tax`, `foreclosure`, `other`
  - Columns: date, description, component type, installment #, amount
- Add transactions with component type selection (dropdown: principal, interest, etc.)
- Remove transactions functionality

### Add Transactions to EMI

Transactions can be added without classification (component_type defaults to "other"):

```json
POST /api/emis/emi_a1b2c3d4/transactions/
{
  "transactions": [
    { "type": "credit_card", "id": 101 },
    { "type": "credit_card", "id": 102 },
    { "type": "credit_card", "id": 103 }
  ]
}
```

Or with classification upfront:

```json
POST /api/emis/emi_a1b2c3d4/transactions/
{
  "transactions": [
    { "type": "credit_card", "id": 101, "component_type": "purchase" },
    { "type": "credit_card", "id": 102, "component_type": "principal", "installment_number": 1 },
    { "type": "credit_card", "id": 103, "component_type": "interest", "installment_number": 1 },
    { "type": "credit_card", "id": 104, "component_type": "tax" },
    { "type": "credit_card", "id": 105, "component_type": "processing_fee" }
  ]
}
```

Note: `installment_number` is only valid for `principal` and `interest`. Tax linkage (`tax_parent_link_id`, `tax_rate`) is set later via PATCH once the parent transaction is also linked.

### Detail Response (transactions with component info)

```json
{
  "emi_id": "emi_a1b2c3d4",
  "name": "CROMA - MacBook Pro",
  "transactions": [
    {
      "id": 101,
      "link_id": 10,
      "type": "credit_card",
      "date": "2025-11-26",
      "description": "CROMA BHUBANESWAR IN",
      "amount": -30367.55,
      "component_type": "purchase",
      "installment_number": null,
      "tax_parent_link_id": null,
      "tax_rate": null
    },
    {
      "id": 102,
      "link_id": 11,
      "type": "credit_card",
      "date": "2025-11-26",
      "description": "Principal Amount Amortization - <1/3>CROMA",
      "amount": 9988.82,
      "component_type": "principal",
      "installment_number": 1,
      "tax_parent_link_id": null,
      "tax_rate": null
    },
    {
      "id": 103,
      "link_id": 12,
      "type": "credit_card",
      "date": "2025-11-26",
      "description": "Interest Amount Amortization - <1/3>CROMA",
      "amount": 404.65,
      "component_type": "interest",
      "installment_number": 1,
      "tax_parent_link_id": null,
      "tax_rate": null
    },
    {
      "id": 104,
      "link_id": 13,
      "type": "credit_card",
      "date": "2025-11-26",
      "description": "IGST-CI@18%",
      "amount": 72.84,
      "component_type": "tax",
      "installment_number": null,
      "tax_parent_link_id": 12,
      "tax_rate": 18.00
    }
  ]
}
```

## Transaction Patterns

EMI transactions on ICICI credit cards follow this pattern:

1. **Original purchase** (credit/negative amount): `CROMA BHUBANESWAR IN` → -30367.55
2. **Principal amortization** (debit): `Principal Amount Amortization - <1/3>CROMA` → 9988.82
3. **Interest amortization** (debit): `Interest Amount Amortization - <1/3>CROMA` → 404.65
4. Optionally: IGST, processing fees on the first installment

The installment number pattern `<N/M>` in the description indicates progress.

## EMI Metadata from Extractions

The ICICI CC PDF extractor already extracts EMI data into `ExtractionArtifact` with `artifact_type='emi'`. The CSV format:

```
loan_type,creation_date,finish_date,num_installments,emi_amount,pending_installments,outstanding_amount,monthly_installment
```

Each statement PDF may contain the same EMI with updated `pending_installments` and `outstanding_amount`. The suggestions endpoint should deduplicate by `(card_number, emi_amount, creation_date)` and show the most recent snapshot.

## Compatibility with Durable Links

EMILink follows the same durable link architecture established in [DURABLE-LINKS.md](DURABLE-LINKS.md):

- **Attaches to ResolvedTransaction** (display_group), not to raw transactions. Uses `on_delete=SET_NULL` so links survive if RT is deleted.
- **Origin audit fields**: `origin_transaction_type` and `origin_transaction_id` (no FK, no CASCADE). If origin txn is unloaded, link remains.
- **JIT ResolvedTransaction**: When adding a transaction that lacks a `resolved_transaction`, create one via `links/utils.py:ensure_resolved_transaction()` — same utility used by stories/entities.
- **Resolution merge**: When overlapping groups are resolved, EMILinks on old ResolvedTransactions must be reassigned to the merged one (same as StoryLink, EntityLink, etc. in `extractions/views.py`).
- **Unload / promote**: If the primary of a ResolvedTransaction is unloaded, another member is promoted. EMILinks remain attached to the RT, unaffected.
- **Completed group deletion**: Unmerging a resolved group reroutes EMILinks back to individual RTs (same pattern as other link types).

## Grouped Installment View

The transactions table on the detail page groups transactions by installment number for readability. The layout:

### Group Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ One-time charges                                                    │
│   Purchase   CROMA BHUBANESWAR IN                     -₹12,733.00  │
│   Fee        NEWME BANGALORE IN                          ₹254.66   │
│   Tax (18%)  IGST-CI@18%              → on Fee           ₹45.84    │
├─────────────────────────────────────────────────────────────────────┤
│ Installment #1                                     Subtotal: ₹2,269│
│   Principal  Principal Amount Amortization - <1/6>     ₹2,043.97   │
│   Interest   Interest Amount Amortization - <1/6>        ₹191.00   │
│   Tax (18%)  IGST-CI@18%              → on Interest       ₹34.38   │
├─────────────────────────────────────────────────────────────────────┤
│ Installment #2                                     Subtotal: ₹2,235│
│   Principal  Principal Amount Amortization - <2/6>     ₹2,074.62   │
│   Interest   Interest Amount Amortization - <2/6>        ₹160.34   │
├─────────────────────────────────────────────────────────────────────┤
│ Uncategorized                                                       │
│   Other      Some unclassified txn                       ₹100.00   │
└─────────────────────────────────────────────────────────────────────┘
```

### Grouping Rules

1. **Loan group**: transactions with type `purchase` or `loan`. Also any `tax` whose `tax_parent_link` points to a purchase/loan. Shown first.
2. **One-time charges**: transactions with type `processing_fee` or `foreclosure`. Also any `tax` whose `tax_parent_link` points to a one-time charge. Shown second.
3. **Installment groups**: transactions with `principal` or `interest` that have a non-null `installment_number`, grouped by that number and sorted ascending. Also includes any `tax` whose `tax_parent_link` points to a transaction in that installment group.
4. **Uncategorized**: any transaction with `component_type = 'other'`, or `principal`/`interest` without an installment number, or `tax` without a `tax_parent_link`. Shown last.

Each installment group shows a subtotal (sum of principal + interest + tax within that group) on the right side of the group header, enabling quick comparison against the expected monthly EMI.

Tax entries display their rate and parent link inline: `Tax (18%) → on Interest` or `Tax (18%) → on Fee`.

## Validations

The detail page displays a validation panel that checks EMI data integrity. Validations run client-side against the linked transactions and configured EMI parameters. Each check shows pass/fail/warn with the actual vs expected values.

### Validation Rules

| # | Rule | Expected | Actual (computed from) | Tolerance | Severity |
|---|------|----------|----------------------|-----------|----------|
| 1a | Purchase matches Original Amount | `emi.original_amount` | `abs(sum of purchase transactions)` | exact (₹0) | error |
| 1b | Loan matches Original Amount | `emi.original_amount` | `abs(sum of loan transactions)` | exact (₹0) | error |
| 2 | Monthly EMI = Principal + Interest | `emi.monthly_installment` | Per installment: sum of principal + interest (excl. tax) | ±₹1 | warn (per installment) |
| 3 | Tax = rate% of parent | `parent_amount × (tax_rate / 100)` | Tax transaction amount | ±₹0.10 | warn (per tax link) |
| 4 | Total principal = Original Amount | `emi.original_amount` | Sum of all principal transactions | ±₹1 | error |
| 5 | Installment count matches | `emi.num_installments` | Count of distinct installment numbers with principal entries | exact | warn |

### Validation Behavior

- Validations only run when the relevant EMI parameters are configured (e.g., rule 1 skipped if `original_amount` is null).
- **Exact match** (rules 1, 5): No tolerance — these are direct equivalences (purchase amount is the original amount, count is a count).
- **±₹1 tolerance** (rules 2, 4): These involve summing multiple amortization entries that are individually rounded, so the total can drift by up to ₹1 from the expected value.
- **±₹0.10 tolerance** (rule 3): Tax is computed as `parent_amount × rate%`. The tolerance accounts for paisa-level rounding. This rule only fires when the tax link has both `tax_parent_link` and `tax_rate` set.
- The validation panel is collapsible, shown below the progress bar. Summary: "X passed, Y warnings, Z errors".
- Validation is purely informational — it does not block any action.

### Validation Display

```
┌─ Validations ─────────────────────── 4 passed · 1 warning · 0 errors ─┐
│ ✓ Purchase matches original amount    ₹12,733.00 = ₹12,733.00         │
│ ✓ Total principal = original amount   ₹12,733.00 = ₹12,733.00         │
│ ✓ Installment count                   6 of 6 installments              │
│ ✓ Tax on Interest #1 (18%)            ₹34.38 ≈ ₹34.38                 │
│ ⚠ EMI #1: P+I ≠ monthly EMI          ₹2,234.97 vs ₹2,234.96 (Δ₹0.01)│
└────────────────────────────────────────────────────────────────────────┘
```

## Incremental Classification

Transactions can be added to an EMI without classification (defaults to `component_type = 'other'`). Users classify them later from the EMI detail page by clicking on the component badge to edit type and installment number inline. This allows:

1. Quick bulk-add from Story pages without friction
2. Classify at leisure using the grouped installment view
3. Validations guide correct classification by highlighting inconsistencies

### PATCH endpoint for link updates

```
PATCH /api/emis/<emi_id>/links/<link_id>/
{ "component_type": "principal", "installment_number": 3 }
```

For tax links, also set the parent and rate:

```
PATCH /api/emis/<emi_id>/links/<link_id>/
{ "component_type": "tax", "tax_parent_link_id": 5, "tax_rate": 18.00 }
```

Returns the updated link fields including `tax_parent_link_id` and `tax_rate`.

## Migration from Stories

Existing `💰 EMI` stories will remain as-is. Users can manually create EMI records and re-link those transactions. No automatic migration - the stories serve as a reference for which transactions belong to which EMI.

## Implementation Order

1. Backend: model + migration
2. Backend: EMILink in links app + migration
3. Backend: views + URLs (CRUD, transactions, suggestions)
4. Frontend: API functions in `lib/api.ts`
5. Frontend: `EMIsPage` component (list + suggestions)
6. Frontend: `EMIDetailPage` component (detail + transactions)
7. Frontend: route registration in `App.tsx` + navigation link
