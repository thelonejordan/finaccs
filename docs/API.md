# FinAccs API Documentation

Complete API reference for the FinAccs financial dashboard.

**Base URL:** `http://localhost:8000/api/`

**Interactive Docs:** Enable `DEV_MODE=1` in `.env` to access `/api/docs/` (OpenAPI/Swagger)

---

## Table of Contents

1. [Health Check](#health-check)
2. [Bank Accounts](#bank-accounts)
3. [Bank Transactions](#bank-transactions)
4. [Credit Cards](#credit-cards)
5. [Credit Card Transactions](#credit-card-transactions)
6. [Dashboard Analytics](#dashboard-analytics)
7. [CC Payment Matching](#cc-payment-matching)
8. [Anomaly Detection](#anomaly-detection)
9. [Extraction Pipeline](#extraction-pipeline)
10. [Data Models](#data-models)

---

## Health Check

### GET /api/health/

Health check endpoint with version info.

**Response:**
```json
{
  "status": "ok",
  "project": "finaccs",
  "version": "1.0.0",
  "git_commit": "string | null"
}
```

---

## Bank Accounts

### GET /api/accounts/

List all bank accounts with transaction statistics.

**Response:**
```json
{
  "accounts": [
    {
      "id": "integer",
      "nickname": "string",
      "bank_name": "string",
      "account_number": "string",
      "ifsc_code": "string",
      "branch": "string",
      "created_at": "ISO datetime",
      "updated_at": "ISO datetime",
      "current_balance": "float | null",
      "last_transaction_date": "ISO date | null",
      "starting_balance": "float | null",
      "first_transaction_date": "ISO date | null",
      "transaction_count": "integer"
    }
  ]
}
```

### POST /api/accounts/

Create a new bank account.

**Request:**
```json
{
  "nickname": "string (required)",
  "bank_name": "string (required)",
  "account_number": "string (required)",
  "ifsc_code": "string (required)",
  "branch": "string (optional)"
}
```

**Response:** `201 Created`
```json
{
  "id": "integer",
  "nickname": "string",
  "bank_name": "string",
  "account_number": "string",
  "ifsc_code": "string",
  "branch": "string"
}
```

### GET /api/accounts/{id}/

Get a specific bank account.

### PUT /api/accounts/{id}/

Update a bank account.

### DELETE /api/accounts/{id}/

Delete a bank account.

**Response:**
```json
{ "success": true }
```

---

## Bank Transactions

### GET /api/transactions/

List bank transactions with filtering and pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bank_account` | integer | Filter by bank account ID |
| `category` | string | Filter by category |
| `type` | string | `credit` or `debit` |
| `year` | integer | Filter by year |
| `month` | integer | Filter by month (1-12) |
| `search` | string | Search narration/category/reference |
| `data_source_artifact` | string | Filter by data source artifact ID |
| `limit` | integer | Results per page (default: 100) |
| `offset` | integer | Pagination offset (default: 0) |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "date": "ISO date",
      "narration": "string",
      "debit": "float",
      "credit": "float",
      "balance": "float",
      "category": "string",
      "reference": "string",
      "bank_account": {
        "id": "integer",
        "nickname": "string"
      },
      "source_file": {
        "id": "integer",
        "filename": "string"
      },
      "linked_transaction": {
        "id": "integer",
        "date": "ISO date",
        "narration": "string",
        "bank_account": "string",
        "amount": "float"
      },
      "cc_payment_match": {
        "id": "integer",
        "credit_card_transaction": {
          "id": "integer",
          "date": "ISO date",
          "description": "string",
          "amount": "float",
          "credit_card": {
            "id": "integer",
            "nickname": "string"
          }
        },
        "offset": "float",
        "confidence_score": "float",
        "match_reasons": ["string"]
      }
    }
  ],
  "total": "integer",
  "stats": {
    "total_credits": "float",
    "total_debits": "float",
    "net_flow": "float"
  }
}
```

### PATCH /api/transactions/{id}/

Update transaction category.

**Request:**
```json
{ "category": "string" }
```

### GET /api/transactions/{id}/potential-links/

Find potential matching transactions for self-transfer linking.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `days` | integer | Date range window (default: 7) |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "date": "ISO date",
      "narration": "string",
      "debit": "float",
      "credit": "float",
      "category": "string",
      "bank_account": {
        "id": "integer",
        "nickname": "string"
      }
    }
  ]
}
```

### POST /api/transactions/{id}/link/

Link transactions as self-transfers.

**Request:**
```json
{ "link_to": "integer" }
```

### DELETE /api/transactions/{id}/link/

Unlink self-transfer transactions.

### GET /api/date-range/

Get available years and months with transaction data.

**Query Parameters:** `bank_account`, `category`, `type`, `search`

**Response:**
```json
{
  "years": {
    "2024": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    "2025": [1, 2]
  }
}
```

---

## Credit Cards

### GET /api/credit-cards/

List all credit cards with transaction statistics.

**Response:**
```json
{
  "cards": [
    {
      "id": "integer",
      "nickname": "string",
      "card_name": "string",
      "card_number_mask": "string",
      "issuer": "string",
      "credit_limit": "float | null",
      "created_at": "ISO datetime",
      "updated_at": "ISO datetime",
      "total_charges": "float",
      "total_payments": "float",
      "last_transaction_date": "ISO date | null",
      "first_transaction_date": "ISO date | null",
      "transaction_count": "integer"
    }
  ]
}
```

### POST /api/credit-cards/

Create a new credit card.

**Request:**
```json
{
  "nickname": "string (required)",
  "card_name": "string (required)",
  "card_number_mask": "string (required)",
  "issuer": "string (required)",
  "credit_limit": "float (optional)"
}
```

### GET /api/credit-cards/{id}/

Get a specific credit card.

### PUT /api/credit-cards/{id}/

Update a credit card.

### DELETE /api/credit-cards/{id}/

Delete a credit card.

---

## Credit Card Transactions

### GET /api/credit-card-transactions/

List credit card transactions with filtering and pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `credit_card` | integer | Filter by credit card ID |
| `category` | string | Filter by category |
| `type` | string | `charge` or `payment` |
| `year` | integer | Filter by year |
| `month` | integer | Filter by month (1-12) |
| `search` | string | Search description/category |
| `data_source_artifact` | string | Filter by data source artifact ID |
| `limit` | integer | Results per page (default: 100) |
| `offset` | integer | Pagination offset (default: 0) |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "date": "ISO date",
      "description": "string",
      "amount": "float (positive=charge, negative=payment)",
      "intl_amount": "float",
      "intl_currency": "string",
      "exchange_rate": "float | null",
      "category": "string",
      "credit_card": {
        "id": "integer",
        "nickname": "string"
      },
      "bank_payment_match": {
        "id": "integer",
        "bank_transaction": {
          "id": "integer",
          "date": "ISO date",
          "narration": "string",
          "amount": "float",
          "bank_account": {
            "id": "integer",
            "nickname": "string"
          }
        },
        "offset": "float",
        "confidence_score": "float",
        "match_reasons": ["string"]
      }
    }
  ],
  "total": "integer",
  "stats": {
    "total_charges": "float",
    "total_payments": "float",
    "net": "float"
  }
}
```

### PATCH /api/credit-card-transactions/{id}/category/

Update transaction category.

**Request:**
```json
{ "category": "string" }
```

### GET /api/credit-card-date-range/

Get available years and months with CC transaction data.

### GET /api/credit-card-categories/

Get categories with counts and totals.

**Query Parameters:** `credit_card`, `include_all`

---

## Dashboard Analytics

### GET /api/summary/

Get comprehensive financial summary.

**Response:**
```json
{
  "starting_balance": "float",
  "current_balance": "float",
  "total_credits": "float",
  "total_debits": "float",
  "net_flow": "float",
  "salary_income": "float",
  "other_income": "float",
  "expenses": "float",
  "unaccounted": "float",
  "transaction_count": "integer",
  "per_account": [
    {
      "id": "integer",
      "nickname": "string",
      "starting_balance": "float",
      "current_balance": "float",
      "total_credits": "float",
      "total_debits": "float",
      "salary_income": "float",
      "other_income": "float",
      "expenses": "float",
      "unaccounted": "float",
      "transaction_count": "integer"
    }
  ]
}
```

### GET /api/monthly/

Get monthly credit/debit breakdown.

**Response:**
```json
{
  "data": [
    {
      "month": "Jan 2024",
      "credits": "float",
      "debits": "float"
    }
  ]
}
```

### GET /api/categories/

Get expense categories with totals.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `include_all` | boolean | Include self transfers (default: false) |

**Response:**
```json
{
  "data": [
    {
      "category": "string",
      "amount": "float"
    }
  ]
}
```

### GET /api/top-expenses/

Get top N expenses.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Number of expenses (default: 10) |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "date": "ISO date",
      "narration": "string",
      "amount": "float",
      "category": "string",
      "bank_account": {
        "id": "integer",
        "nickname": "string"
      }
    }
  ]
}
```

### GET /api/logs/

Fetch activity logs (file loads, transaction changes, account changes).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | `all`, `transaction`, `account`, `file_load` |
| `action` | string | Filter by specific action |
| `limit` | integer | Results per page (default: 100) |
| `offset` | integer | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "log_type": "file_load | transaction | account",
      "action": "LOAD | CATEGORY_CHANGE | LINK | UNLINK | CREATE | UPDATE | DELETE",
      "action_display": "string",
      "old_value": "string",
      "new_value": "string",
      "created_at": "ISO datetime",
      "transaction": { ... },
      "bank_account": { ... },
      "source_file": "string",
      "file_load": {
        "transaction_count": "integer",
        "category_summary": "object",
        "file_hash": "string",
        "artifact_id": "string"
      }
    }
  ],
  "total": "integer"
}
```

---

## CC Payment Matching

### GET /api/cc-payment-suggestions/

Get unmatched bank CC payments with match suggestions.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bank_account` | integer | Filter by bank account ID |
| `year` | integer | Filter by year |
| `offset_threshold` | integer | Offset threshold % (default: 20) |

**Response:**
```json
{
  "data": [
    {
      "bank_transaction": {
        "id": "integer",
        "date": "ISO date",
        "narration": "string",
        "amount": "float",
        "is_debit": "boolean",
        "bank_account": {
          "id": "integer",
          "nickname": "string"
        }
      },
      "suggestions": [
        {
          "credit_card_transaction": {
            "id": "integer",
            "date": "ISO date",
            "description": "string",
            "amount": "float",
            "credit_card": {
              "id": "integer",
              "nickname": "string"
            }
          },
          "offset": "float",
          "confidence_score": "float",
          "match_reasons": ["exact_amount", "same_day"]
        }
      ]
    }
  ],
  "total": "integer"
}
```

### GET /api/cc-payment-suggestions/reverse/

Get unmatched CC payments with bank transaction suggestions.

**Query Parameters:** `credit_card`, `year`, `offset_threshold`

### GET /api/cc-payment-matches/

Get confirmed CC payment matches.

**Query Parameters:** `year`

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "bank_transaction": { ... },
      "credit_card_transaction": { ... },
      "offset": "float",
      "confidence_score": "float",
      "match_reasons": ["string"],
      "created_at": "ISO datetime"
    }
  ],
  "total": "integer"
}
```

### POST /api/cc-payment-matches/

Confirm a CC payment match.

**Request:**
```json
{
  "bank_transaction_id": "integer",
  "credit_card_transaction_id": "integer",
  "offset": "float",
  "confidence_score": "float",
  "match_reasons": ["string"]
}
```

### DELETE /api/cc-payment-matches/{id}/

Delete a CC payment match.

### GET /api/cc-payment-matches/years/

Get available years with match counts.

**Response:**
```json
{
  "years": {
    "2024": 45,
    "2025": 12
  }
}
```

---

## Anomaly Detection

### GET /api/bank-inconsistencies/

Detect duplicates, cross-account matches, and balance gaps.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bank_account` | integer | Filter by bank account ID |
| `type` | string | `duplicate`, `cross_account`, `balance_gap` |
| `show_dismissed` | boolean | Include dismissed (default: false) |
| `limit` | integer | Results per page (default: 100) |
| `offset` | integer | Pagination offset |

**Response:**
```json
{
  "data": [
    {
      "type": "duplicate | cross_account | balance_gap",
      "transaction_ids": ["integer"],
      "dismissed": "boolean",
      "date": "ISO date",
      "narration": "string",
      "debit": "float",
      "credit": "float",
      "balance": "float",
      "count": "integer",
      "bank_account": { ... },
      "transactions": [
        {
          "id": "integer",
          "artifact_id": "string",
          "bank_account": { ... }
        }
      ]
    }
  ],
  "total": "integer",
  "counts": {
    "duplicate": "integer",
    "cross_account": "integer",
    "balance_gap": "integer"
  }
}
```

### POST /api/bank-inconsistencies/dismiss/

Dismiss a bank inconsistency.

**Request:**
```json
{
  "type": "duplicate | cross_account | balance_gap",
  "transaction_ids": ["integer"],
  "reason": "string (optional)"
}
```

### POST /api/bank-inconsistencies/restore/

Restore a dismissed inconsistency.

**Request:**
```json
{
  "type": "duplicate | cross_account | balance_gap",
  "transaction_ids": ["integer"]
}
```

### GET /api/credit-card-inconsistencies/

Detect CC transaction inconsistencies.

**Query Parameters:** `credit_card`, `include_dismissed`

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "type": "duplicate | cross_card | missing_description",
      "date": "ISO date",
      "description": "string",
      "amount": "float",
      "category": "string",
      "credit_card": { ... },
      "message": "string",
      "related_ids": ["integer"],
      "dismissed": "boolean"
    }
  ],
  "total": "integer",
  "counts": {
    "duplicate": "integer",
    "cross_card": "integer",
    "missing_description": "integer"
  }
}
```

### POST /api/credit-card-inconsistencies/dismiss/

Dismiss a CC inconsistency.

### POST /api/credit-card-inconsistencies/restore/

Restore a dismissed CC inconsistency.

---

## Extraction Pipeline

### GET /api/extractions/extractors/

List available extractors.

**Response:**
```json
{
  "data": [
    {
      "name": "string",
      "version": "string",
      "domain": "bank_account | credit_card",
      "supported_extensions": ["string"]
    }
  ]
}
```

### Source Files

#### GET /api/extractions/source-files/

List source files.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `visibility` | string | `visible`, `hidden`, `all` |
| `domain` | string | `bank_account`, `credit_card`, `all` |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "source_file_id": "sf_xxxxxxxx",
      "filename": "string",
      "file_path": "string",
      "file_hash": "string",
      "file_size": "integer",
      "mime_type": "string",
      "domain": "bank_account | credit_card",
      "password": "string",
      "extractor": "string",
      "extraction_status": "not_extracted | extracted",
      "hidden": "boolean",
      "created_at": "ISO datetime",
      "updated_at": "ISO datetime",
      "auto_detected_extractor": "string | null"
    }
  ]
}
```

#### POST /api/extractions/source-files/refresh/

Scan directories for new files.

**Response:**
```json
{
  "created": "integer",
  "skipped": "integer",
  "errors": [{ "file": "string", "error": "string" }]
}
```

#### POST /api/extractions/source-files/bulk-update/

Bulk update source files.

**Request:**
```json
{
  "ids": ["integer"],
  "action": "hide | unhide | set_extractor | set_password | set_domain",
  "value": "string (for set_* actions)"
}
```

#### GET /api/extractions/source-files/{source_file_id}/

Get source file with all extractions.

#### PATCH /api/extractions/source-files/{source_file_id}/

Update source file (password, extractor, domain, hidden).

#### POST /api/extractions/source-files/{source_file_id}/validate-password/

Validate password for encrypted file.

**Request:**
```json
{ "password": "string" }
```

**Response:**
```json
{ "valid": "boolean", "error": "string" }
```

#### POST /api/extractions/source-files/{source_file_id}/extract/

Trigger extraction.

**Request:**
```json
{
  "password": "string (optional)",
  "extractor": "string (optional)"
}
```

### Extractions

#### GET /api/extractions/

List extractions.

**Query Parameters:** `visibility`, `domain`, `status`

#### POST /api/extractions/bulk-update/

Bulk update extractions.

**Request:**
```json
{
  "ids": ["integer"],
  "action": "hide | unhide | delete"
}
```

#### GET /api/extractions/{extraction_id}/

Get extraction details.

#### PATCH /api/extractions/{extraction_id}/

Update extraction (hidden).

#### DELETE /api/extractions/{extraction_id}/

Delete extraction.

### Artifacts

#### GET /api/extractions/artifacts/{artifact_id}/

Get artifact details.

#### GET /api/extractions/artifacts/{artifact_id}/preview/

Preview artifact content.

**Query Parameters:** `limit` (default: 50)

**Response:**
```json
{
  "data": "[array | object | string]",
  "total": "integer",
  "columns": ["string"],
  "format": "csv | json | text"
}
```

#### POST /api/extractions/artifacts/{artifact_id}/transform/

Transform artifact to DataSourceArtifact.

**Request:**
```json
{
  "bank_account_id": "integer (optional)",
  "credit_card_id": "integer (optional)"
}
```

#### POST /api/extractions/artifacts/bulk-transform/

Bulk transform artifacts.

### Data Sources

#### GET /api/extractions/data-sources/

List data source artifacts.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `visibility` | string | `visible`, `hidden`, `all` |
| `domain` | string | `bank_account_transactions`, `credit_card_transactions`, `all` |
| `status` | string | `unloaded`, `loading`, `loaded`, `error`, `all` |

**Response:**
```json
{
  "data": [
    {
      "id": "integer",
      "artifact_id": "ds_art_xxxxxxxx",
      "source_artifact_id": "string",
      "source_artifact_type": "string",
      "source_artifact_key": "string",
      "source_extraction_id": "string",
      "source_filename": "string",
      "data_source_target": "bank_account_transactions | credit_card_transactions",
      "content_hash": "string",
      "row_count": "integer",
      "bank_account_id": "integer | null",
      "bank_account_name": "string | null",
      "credit_card_id": "integer | null",
      "credit_card_name": "string | null",
      "transformer": "string",
      "status": "unloaded | loading | loaded | error",
      "error_message": "string",
      "enabled": "boolean",
      "hidden": "boolean",
      "transformed_at": "ISO datetime",
      "loaded_at": "ISO datetime | null"
    }
  ]
}
```

#### POST /api/extractions/data-sources/bulk-update/

Bulk update data sources.

**Request:**
```json
{
  "ids": ["integer"],
  "action": "hide | unhide | enable | disable | set_bank_account | set_credit_card | load | unload | delete",
  "value": "integer (for set_* actions)"
}
```

#### GET /api/extractions/data-sources/{artifact_id}/

Get data source details.

#### PATCH /api/extractions/data-sources/{artifact_id}/

Update data source (enabled, hidden, bank_account_id, credit_card_id).

#### DELETE /api/extractions/data-sources/{artifact_id}/

Delete data source.

#### POST /api/extractions/data-sources/{artifact_id}/load/

Load data source into transactions.

**Response:**
```json
{
  "success": true,
  "count": "integer",
  "data_source_artifact": { ... }
}
```

#### POST /api/extractions/data-sources/{artifact_id}/unload/

Unload transactions (keep artifact).

#### GET /api/extractions/data-sources/{artifact_id}/preview/

Preview data source content.

---

## Data Models

### BankAccount
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| nickname | string(100) | Display name |
| bank_name | string(100) | Bank name |
| account_number | string(20) | Account number |
| ifsc_code | string(11) | IFSC code |
| branch | string(200) | Branch name (optional) |

### BankTransaction
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| date | date | Transaction date |
| narration | text | Description |
| debit_amount | decimal(12,2) | Debit amount |
| credit_amount | decimal(12,2) | Credit amount |
| closing_balance | decimal(12,2) | Balance after transaction |
| category | string(50) | Category (optional) |
| reference_number | string(50) | Reference |
| bank_account_id | FK | Bank account |
| data_source_artifact_id | FK | Source artifact |
| linked_transaction_id | FK | Linked self-transfer |

### CreditCard
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| nickname | string(100) | Display name |
| card_name | string(100) | Card name |
| card_number_mask | string(20) | Masked card number |
| issuer | string(100) | Card issuer |
| credit_limit | decimal(12,2) | Credit limit (optional) |

### CreditCardTransaction
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| date | date | Transaction date |
| description | text | Description |
| amount | decimal(12,2) | Amount (positive=charge, negative=payment) |
| intl_amount | decimal(12,2) | International amount |
| intl_currency | string(3) | Currency code |
| exchange_rate | decimal(10,4) | Exchange rate (optional) |
| category | string(50) | Category (optional) |
| credit_card_id | FK | Credit card |
| data_source_artifact_id | FK | Source artifact |

### CreditCardPaymentMatch
| Field | Type | Description |
|-------|------|-------------|
| id | integer | Primary key |
| bank_transaction_id | FK (unique) | Bank transaction |
| credit_card_transaction_id | FK (unique) | CC transaction |
| offset | decimal(12,2) | Amount difference (rewards/cashout) |
| confidence_score | float | Match confidence (0-1) |
| match_reasons | JSON | List of match reasons |
| is_active | boolean | Active status |

### ID Formats
| Entity | Format | Example |
|--------|--------|---------|
| Source File | `sf_xxxxxxxx` | `sf_a1b2c3d4` |
| Extraction | `ext_DDMMYYYY_xxxxxxxx` | `ext_23012025_a1b2c3d4` |
| Extraction Artifact | `ext_art_xxxxxxxx` | `ext_art_a1b2c3d4` |
| Data Source Artifact | `ds_art_xxxxxxxx` | `ds_art_a1b2c3d4` |

---

## Error Responses

All endpoints return appropriate HTTP status codes:
- `200 OK` - Successful GET/PUT/PATCH
- `201 Created` - Successful POST creation
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found

Error response format:
```json
{ "error": "Error message" }
```
