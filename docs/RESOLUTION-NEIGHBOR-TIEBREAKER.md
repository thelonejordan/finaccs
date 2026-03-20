# Resolution: Neighbor Balance Tiebreaker

## Problem

The resolution algorithm matches transactions across overlapping sources using `(date, amount, closing_balance)`.
When two **different** real transactions share the same key, the algorithm cannot distinguish them and only creates one suggestion — leaving the other pair unmatched.

## Solution

When a bucket has more than one transaction per source (not a 1:1 mapping), use the **closing balances of contiguous neighboring rows** (`prev_closing_balance`, `next_closing_balance`) as a tiebreaker to refine the grouping.

Neighbors are only used when the adjacent row's `row_number` is exactly ±1 (no gaps in the extracted data). If a neighbor is missing (first/last row), `None` is used — `None` values still match each other.

## Real Example

SBI account, October 2025. A UPI payment of ₹9,985.62 was initiated, reversed, and retried via internet banking — producing two distinct debits with identical `(date, amount, closing_balance)`:

**PDF source (8645978307931102025.pdf):**

| Row | Date | Narration | Debit | Closing Balance |
|-----|------|-----------|-------|-----------------|
| 53 | 2025-10-22 | ACHDr NACH00000000056369 ETMONEY | 500.00 | 16,04,618.47 |
| **54** | **2025-10-23** | **UPI/DR/529613337982/FOURDEGR/utib/wintwealth/Payvi** | **9,985.62** | **15,94,632.85** |
| 55 | 2025-10-23 | UPI/REV/529613337982 | — (credit 9,985.62) | 16,04,618.47 |
| **56** | **2025-10-23** | **INB Wint Wealth** | **9,985.62** | **15,94,632.85** |
| 57 | 2025-10-23 | INB E mandate | 59.00 | 15,94,573.85 |

**Email source (Email_Statement.xlsx):**

| Row | Date | Narration | Debit | Closing Balance |
|-----|------|-----------|-------|-----------------|
| 481 | 2025-10-22 | DEBIT ACHDr NACH00000000056369 ETMONEY | 500.00 | 16,04,618.47 |
| **482** | **2025-10-23** | **WDL TFR UPI/DR/529613337982/FOURDEGR/utib/wintwealth** | **9,985.62** | **15,94,632.85** |
| 483 | 2025-10-23 | DEP TFR UPI/REV/529613337982 | — (credit 9,985.62) | 16,04,618.47 |
| **484** | **2025-10-23** | **WDL TFR INB Wint Wealth 0099782162097** | **9,985.62** | **15,94,632.85** |
| 485 | 2025-10-23 | WDL TFR INB E mandate | 59.00 | 15,94,573.85 |

### How the tiebreaker works

All four bolded rows have the same `(date=2025-10-23, amount=9985.62, closing_balance=1594632.85)`.

Using neighbor balances:

| Txn | Source | prev_bal | next_bal |
|-----|--------|----------|----------|
| Row 54 (UPI/DR) | PDF | 16,04,618.47 | **16,04,618.47** |
| Row 482 (WDL TFR UPI/DR) | Email | 16,04,618.47 | **16,04,618.47** |
| Row 56 (INB Wint Wealth) | PDF | 16,04,618.47 | **15,94,573.85** |
| Row 484 (WDL TFR INB) | Email | 16,04,618.47 | **15,94,573.85** |

The `next_bal` values differ — **16,04,618.47** (the UPI reversal) vs **15,94,573.85** (the E mandate debit) — creating two distinct sub-groups that produce correct 1:1 matches.
