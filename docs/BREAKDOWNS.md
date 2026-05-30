# Transaction Breakdowns

## Problem

A single transaction often represents multiple distinct expenses. For example, a grocery bill of 5000 might include vegetables (2000), snacks (1500), and dairy (1500). Currently there is no way to decompose a transaction into labeled sub-amounts, making it impossible to track spending at a granular level within a single transaction.

## Solution

A Breakdown feature that lets users split any transaction into labeled parts with validation:
- Parts must sum to the original transaction amount
- Optional percentage-based validation: a part can declare a rate (%) referencing either another part or the transaction total

## Data Model

### Breakdown (in `links/models.py`)

```python
class Breakdown(models.Model):
    breakdown_id = CharField(max_length=20, unique=True)  # "bkdn_xxxxxxxx"
    name = CharField(max_length=200)
    description = TextField(blank=True)
    resolved_transaction = OneToOneField(ResolvedTransaction, null=True, blank=True)
    origin_transaction_type = CharField(max_length=20, blank=True, null=True)
    origin_transaction_id = IntegerField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
```

One breakdown per transaction (enforced by OneToOneField).

### BreakdownPart (in `links/models.py`)

```python
class BreakdownPart(models.Model):
    breakdown = ForeignKey(Breakdown, on_delete=CASCADE, related_name='parts')
    label = CharField(max_length=200)
    amount = DecimalField(max_digits=12, decimal_places=2)
    rate = DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)
    rate_reference = ForeignKey('self', on_delete=SET_NULL, null=True, blank=True)
    order = IntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)
```

- `rate`: optional percentage for validation
- `rate_reference`: if set, validates `amount = rate_reference.amount * rate / 100`; if null and rate is set, validates `amount = transaction_total * rate / 100`

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/breakdowns/` | List all breakdowns with stats |
| POST | `/api/breakdowns/` | Create breakdown + optional parts |
| GET | `/api/breakdowns/<id>/` | Detail with parts + transaction info |
| PUT | `/api/breakdowns/<id>/` | Update name/description |
| DELETE | `/api/breakdowns/<id>/` | Delete |
| POST | `/api/breakdowns/<id>/parts/` | Bulk replace all parts |
| DELETE | `/api/breakdowns/<id>/parts/<part_id>/` | Delete single part |
| POST | `/api/breakdowns/transaction-breakdowns/` | Batch lookup |

## Validations

Computed both backend (returned in API response) and frontend (instant feedback):

1. **Sum rule**: `abs(sum(parts) - transaction_amount) <= 0.01` — error if fails
2. **Rate rule**: For each part with `rate` set:
   - Reference amount = `rate_reference.amount` if reference exists, else `transaction_amount`
   - Expected = `reference * rate / 100`
   - `abs(part.amount - expected) <= 0.01` — warn if fails

## Frontend

- **BreakdownsPage**: Card grid listing all breakdowns, create modal (name + transaction picker)
- **BreakdownDetailPage**: Transaction info, collapsible validation panel, parts list with inline editing (label, amount, rate, rate_reference)
