# Standard CSV Format

Standard CSV formats for manually adding transactions when no bank-specific extractor exists.

## When to use

- Your bank/card issuer isn't supported by a custom extractor
- You want to manually enter transactions
- You're importing from an unsupported source and can reformat the data yourself

Upload the file as a `.csv` with the appropriate domain selected. The system auto-detects `standard_bank_csv` or `standard_cc_csv` as the extractor.

---

## Bank Account Transactions

**Extractor:** `standard_bank_csv`

### Columns

| Column | Required | Format | Description |
|--------|----------|--------|-------------|
| `date` | Yes | `YYYY-MM-DD` | Transaction date |
| `narration` | Yes | text | Transaction description |
| `debit_amount` | Yes | decimal | Amount debited (0.00 if credit) |
| `credit_amount` | Yes | decimal | Amount credited (0.00 if debit) |
| `value_date` | No | `YYYY-MM-DD` | Value/settlement date (defaults to `date`) |
| `reference_number` | No | text | Cheque/reference number |
| `closing_balance` | No | decimal | Balance after transaction |

### Example

```csv
date,narration,debit_amount,credit_amount,closing_balance
2024-01-15,SALARY CREDIT JAN 2024,0.00,100000.00,150000.00
2024-01-16,UPI/SWIGGY/REF123,654.00,0.00,149346.00
2024-01-17,NEFT TO RENT ACCOUNT,25000.00,0.00,124346.00
```

### Notes

- `row_id` is auto-generated; do not include it
- Amounts use plain decimals (no commas): `25000.00` not `25,000.00`
- Exactly one of `debit_amount` or `credit_amount` should be non-zero per row
- Rows where both debit and credit are zero are skipped
- Dates also accept `DD/MM/YYYY`, `DD-MM-YYYY`, `DD-MMM-YYYY` but `YYYY-MM-DD` is preferred

---

## Credit Card Transactions

**Extractor:** `standard_cc_csv`

### Columns

| Column | Required | Format | Description |
|--------|----------|--------|-------------|
| `date` | Yes | `YYYY-MM-DD` | Transaction date |
| `narration` | Yes | text | Transaction/merchant description |
| `debit_amount` | Yes | decimal | Charge amount (0.00 if payment) |
| `credit_amount` | Yes | decimal | Payment/refund amount (0.00 if charge) |
| `value_date` | No | `YYYY-MM-DD` | Defaults to `date` |
| `reference_number` | No | text | Reference/serial number |
| `closing_balance` | No | text | Usually empty for credit cards |
| `intl_amount` | No | decimal | Foreign currency amount |
| `intl_currency` | No | text | Foreign currency code (e.g., USD) |
| `exchange_rate` | No | decimal | Exchange rate used |

### Example

```csv
date,narration,debit_amount,credit_amount,intl_amount,intl_currency,exchange_rate
2024-01-15,SWIGGY DELIVERY,654.00,0.00,,,
2024-01-16,AMAZON US PURCHASE,4200.00,0.00,50.00,USD,84.00
2024-01-20,PAYMENT RECEIVED - THANK YOU,0.00,10000.00,,,
```

### Notes

- `debit_amount` = charges/purchases (money you owe)
- `credit_amount` = payments/refunds (money returned)
- International fields are only needed for foreign currency transactions
- `exchange_rate` = INR amount per unit of foreign currency
