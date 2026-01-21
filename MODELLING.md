# Data Modelling: Banks, Accounts & Credit Cards

This document describes the model structure and extraction pipeline for financial data in the FinAccs system.

## Overview

The system uses an **artifact-based ETL pipeline** with three phases:
1. **Extract** - Parse raw files into standardized CSV artifacts
2. **Transform** - Convert raw artifacts into ingestable format
3. **Load** - Insert ingestable artifacts into transaction tables

```
RAW FILE → EXTRACT → TRANSFORM → LOAD → TRANSACTIONS
   │           │          │         │
   │           ↓          ↓         ↓
   │      SourceFile  Artifacts  Database
   │        (blob)    (gzip'd)   records
   └──────────────────────────────────────→ Audit Trail
```

---

## Model Structure

### Bank Accounts

#### BankAccount
Core entity representing a bank account.

| Field | Type | Description |
|-------|------|-------------|
| `nickname` | CharField | User-friendly name |
| `bank_name` | CharField | Bank institution name |
| `account_number` | CharField | Account number |
| `ifsc_code` | CharField | IFSC code |
| `branch` | CharField | Branch name |

#### ExtractionPipeline
Configuration for how files should be extracted.

| Field | Type | Description |
|-------|------|-------------|
| `name` | CharField | Pipeline identifier |
| `extractor_type` | CharField | One of: `sbi_pdf`, `icici_xlsx`, `hdfc_txt`, `generic_xlsx`, `generic_txt` |
| `file_pattern` | CharField | Glob pattern for file matching |
| `password` | CharField | Optional password for encrypted files |
| `default_bank_account` | ForeignKey | Default account for new files |

#### SourceFile
Raw uploaded bank statement file.

| Field | Type | Description |
|-------|------|-------------|
| `file_data` | BinaryField | Gzip-compressed file blob |
| `file_hash` | CharField | SHA-256 hash for deduplication |
| `file_size` | IntegerField | Original file size |
| `mime_type` | CharField | File MIME type |
| `date_range_start` | DateField | Statement start date |
| `date_range_end` | DateField | Statement end date |
| `bank_account` | ForeignKey | Linked bank account |
| `extraction_pipeline` | ForeignKey | Pipeline used for extraction |
| `disabled` | BooleanField | Soft delete flag |

#### ExtractedCSV
Output of the extraction phase.

| Field | Type | Description |
|-------|------|-------------|
| `name` | CharField | Unique ID: `extraction_DDMMYYYY_xxxxxxxx` |
| `csv_data` | BinaryField | Gzip-compressed CSV blob |
| `csv_hash` | CharField | SHA-256 hash |
| `row_count` | IntegerField | Number of data rows |
| `status` | CharField | Workflow status (see below) |
| `hidden` | BooleanField | Exclude from UI |
| `source_file` | ForeignKey | Original file |
| `bank_account` | ForeignKey | Linked account |

**Status workflow:** `extracted` → `transformed` → `loading` → `loaded` | `error` | `superseded`

**CSV Schema:**
```csv
date,value_date,narration,debit_amount,credit_amount,reference_number,closing_balance
```

#### BankExtractionArtifact
Individual extracted data artifact.

| Field | Type | Description |
|-------|------|-------------|
| `artifact_id` | CharField | Unique ID: `artifact_xxxxxxxx` |
| `artifact_type` | CharField | e.g., `ingestable_transactions` |
| `content` | BinaryField | Gzip-compressed CSV/JSON |
| `extracted_csv` | ForeignKey | Parent extraction |
| `source_artifact` | ForeignKey | Data lineage tracking |

---

### Credit Cards

#### CreditCard
Core entity representing a credit card.

| Field | Type | Description |
|-------|------|-------------|
| `nickname` | CharField | User-friendly name |
| `card_name` | CharField | Card product name |
| `card_number_mask` | CharField | Masked card number (e.g., `XXXX8007`) |
| `issuer` | CharField | Card issuer |
| `credit_limit` | DecimalField | Credit limit |

#### CreditCardSourceFile
Raw credit card statement file.

| Field | Type | Description |
|-------|------|-------------|
| `file_data` | BinaryField | Gzip-compressed file blob |
| `file_hash` | CharField | SHA-256 hash |
| `pdf_password` | CharField | Optional PDF password |
| `date_range_start` | DateField | Statement start date |
| `date_range_end` | DateField | Statement end date |
| `credit_card` | ForeignKey | Linked credit card |

#### CreditCardPDFExtraction
Output of PDF extraction phase.

| Field | Type | Description |
|-------|------|-------------|
| `name` | CharField | Unique ID: `cc_pdf_DDMMYYYY_xxxxxxxx` |
| `status` | CharField | Workflow status |
| `hidden` | BooleanField | Exclude from UI |
| `source_file` | ForeignKey | Original file |
| `statement_date_start` | DateField | Parsed statement start |
| `statement_date_end` | DateField | Parsed statement end |
| `invoice_number` | CharField | Statement invoice number |
| `total_amount_due` | DecimalField | Amount due |
| `min_amount_due` | DecimalField | Minimum payment |

**Helper methods:**
- `get_artifact(type)` - Get single artifact by type (startswith match)
- `get_artifacts(type)` - Get all artifacts of type
- `get_transactions_artifacts()` - Get all transaction artifacts (multi-card safe)
- `get_ingestable_artifacts()` - Get all ready-to-load artifacts

#### ExtractionArtifact
Individual extracted artifact from credit card statements.

| Field | Type | Description |
|-------|------|-------------|
| `artifact_id` | CharField | Unique ID: `artifact_xxxxxxxx` |
| `artifact_type` | CharField | See artifact types below |
| `content` | BinaryField | Gzip-compressed CSV/JSON |
| `pdf_extraction` | ForeignKey | Parent extraction |
| `credit_card` | ForeignKey | For multi-card PDFs |
| `transformer_name` | CharField | Transformer to apply |
| `is_transformable` | BooleanField | Needs transformation |
| `is_transformed` | BooleanField | Transformation applied |
| `source_artifact` | ForeignKey | Data lineage |

**Artifact types:**
| Type | Description |
|------|-------------|
| `transactions` | Raw extracted transactions |
| `transactions-{card_no}` | Per-card transactions (multi-card) |
| `ingestable_transactions` | Transformed, ready to load |
| `ingestable_transactions-{card_no}` | Per-card ingestable |
| `emi` | EMI/loan information |
| `metadata` | Statement metadata (JSON) |

#### CreditCardTransaction
Final loaded transaction record.

| Field | Type | Description |
|-------|------|-------------|
| `date` | DateField | Transaction date |
| `description` | TextField | Transaction description |
| `amount` | DecimalField | Amount (positive=charge, negative=payment) |
| `intl_amount` | DecimalField | International amount |
| `intl_currency` | CharField | Currency code (USD, EUR, etc.) |
| `exchange_rate` | DecimalField | Calculated exchange rate |
| `credit_card` | ForeignKey | Card used |
| `source_file` | ForeignKey | Source file |
| `pdf_extraction` | ForeignKey | Source extraction |
| `source_artifact` | ForeignKey | Artifact that loaded it |

**Properties:**
- `is_payment` - True if amount < 0 (credit)
- `is_charge` - True if amount > 0 (debit)

---

## Extraction Pipeline

### Phase 1: Extract

**Input:** Raw files (PDF, XLSX, TXT, CSV)
**Output:** Standardized CSV artifacts stored as gzip blobs

#### Bank Account Extractors

| Extractor | Format | Method |
|-----------|--------|--------|
| `sbi_pdf` | PDF | pdfplumber table/text parsing |
| `icici_xlsx` | Excel | openpyxl with column auto-detection |
| `hdfc_txt` | Text | Comma-separated parsing |
| `generic_xlsx` | Excel | Generic column mapping |
| `generic_txt` | CSV/TXT | Flexible parsing |

**Normalized output schema:**
```csv
date,value_date,narration,debit_amount,credit_amount,reference_number,closing_balance
```

#### Credit Card PDF Extractor

Uses multi-method extraction:
1. **Table extraction** - pdfplumber structured tables
2. **Text extraction** - Regex patterns on raw text (more reliable)

**Multi-card handling:**
- Detects card number headers (e.g., `4375XXXXXXXX8007`)
- Creates separate artifacts per card: `transactions-{card_no}`
- Preserves card association throughout pipeline

**Extracted artifacts:**
```csv
# transactions
row_id,date,ser_no,description,amount,intl_amount,intl_currency,card_number

# emi
date,description,amount,remaining_tenure

# metadata (JSON)
{
  "statement_start": "2024-01-01",
  "statement_end": "2024-01-31",
  "credit_limit": 100000,
  "amount_due": 15000
}
```

### Phase 2: Transform

**Input:** Raw extraction artifacts
**Output:** Ingestable artifacts (standardized format)

#### Transformer Registry

| Transformer | Input | Output |
|-------------|-------|--------|
| `LegacyCCTransactionsTransformer` | Legacy CSV format | Ingestable CSV |
| `ICICICCTransactionsTransformer` | ICICI PDF raw | Ingestable CSV |

#### Transformation process:
1. Read artifact by type
2. Normalize amounts → split into debit/credit
3. Calculate exchange rates for international transactions
4. Produce standardized ingestable CSV

**Ingestable schema (extended):**
```csv
date,value_date,narration,debit_amount,credit_amount,reference_number,closing_balance,intl_amount,intl_currency,exchange_rate
```

**Multi-card transformation:**
- `transactions` → `ingestable_transactions`
- `transactions-{card_no}` → `ingestable_transactions-{card_no}`

> Note: Bank account extractors produce ingestable CSV directly (legacy design), skipping explicit transform phase.

### Phase 3: Load

**Input:** Ingestable artifacts
**Output:** Transaction records in database

#### Loading process:
1. Read ingestable CSV artifact
2. Map columns to transaction model fields
3. Bulk insert records via `bulk_create`
4. Link to source file/artifact/extraction
5. Update extraction status to `loaded`

**Features:**
- Bulk insertion for performance
- Row number preservation for ordering
- Full data lineage tracking
- Soft delete support via `disabled` flag

---

## Datasource Visibility

Making extracted data visible as datasources for loading.

### Bank Account Datasources

**API Endpoint:** `GET /api/bank/extracted-csvs/`

**Query:**
```python
ExtractedCSV.objects.filter(
    status__in=['extracted', 'transformed', 'loading', 'loaded', 'error'],
    hidden=False
)
```

**Response includes:**
- Extraction metadata
- Transaction count (if loaded)
- Date ranges
- Artifact list with details

**Content access:**
1. Check for `ingestable_transactions` artifact
2. Fall back to `csv_data` blob if no artifact
3. Return gzip-decoded CSV content

### Credit Card Datasources

**API Endpoint:** `GET /api/credit-cards/source-files/`

**Query:**
```python
CreditCardSourceFile.objects.filter(file_data__isnull=False)
```

**Transaction stats from:**
```python
CreditCardTransaction.objects.filter(
    source_artifact__isnull=False,
    pdf_extraction__isnull=False,
    pdf_extraction__hidden=False,
    pdf_extraction__status__ne='superseded'
)
```

**Ingestable artifact access:**
```python
extraction.get_ingestable_artifacts()  # Returns all ingestable_transactions* artifacts
```

---

## Loading & Unloading

### Loading Transactions

#### Bank Accounts
```python
# API: POST /api/bank/load-csvs/
# Body: {"extraction_ids": [1, 2, 3]}

for extraction in extractions:
    extraction.status = 'loading'
    extraction.save()

    artifact = extraction.artifacts.get(artifact_type='ingestable_transactions')
    csv_content = gzip.decompress(artifact.content)

    transactions = []
    for row in csv.DictReader(csv_content):
        transactions.append(Transaction(
            date=row['date'],
            narration=row['narration'],
            debit_amount=row['debit_amount'],
            credit_amount=row['credit_amount'],
            # ... other fields
            source_artifact=artifact,
            extraction=extraction
        ))

    Transaction.objects.bulk_create(transactions)
    extraction.status = 'loaded'
    extraction.save()
```

#### Credit Cards
```python
# Management command: load_pdf_extractions
# API: POST /api/credit-cards/load/

for extraction in extractions:
    extraction.status = 'loading'
    extraction.save()

    for artifact in extraction.get_ingestable_artifacts():
        csv_content = gzip.decompress(artifact.content)

        transactions = []
        for row in csv.DictReader(csv_content):
            transactions.append(CreditCardTransaction(
                date=row['date'],
                description=row['narration'],
                amount=row['debit_amount'] or -row['credit_amount'],
                intl_amount=row.get('intl_amount'),
                intl_currency=row.get('intl_currency'),
                exchange_rate=row.get('exchange_rate'),
                credit_card=artifact.credit_card,
                source_file=extraction.source_file,
                pdf_extraction=extraction,
                source_artifact=artifact
            ))

        CreditCardTransaction.objects.bulk_create(transactions)

    extraction.status = 'loaded'
    extraction.save()
```

### Unloading (Soft Delete)

Transactions are not physically deleted but excluded via flags:

#### Disable Extraction
```python
# Excludes all transactions from this extraction from calculations
extraction.disabled = True
extraction.save()

# Transactions remain but are filtered out:
Transaction.objects.filter(extraction__disabled=False)
```

#### Hide Extraction
```python
# Excludes from UI but keeps data for audit
extraction.hidden = True
extraction.save()

# Still visible in raw queries, hidden from datasource list
```

#### Supersede Extraction
```python
# Mark old extraction as replaced by new one
old_extraction.status = 'superseded'
old_extraction.save()

# Superseded extractions excluded from active transaction counts
```

### Re-extraction

To reload data:
1. Mark existing extraction as `superseded`
2. Run extraction again → creates new `ExtractedCSV`
3. Transform if needed
4. Load new extraction
5. Old transactions excluded via superseded status

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER UPLOADS FILE                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  EXTRACT PHASE                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │    SourceFile    │───▶│   Extractor      │───▶│  ExtractedCSV    │  │
│  │  (blob storage)  │    │  (parse file)    │    │  + Artifacts     │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TRANSFORM PHASE (Credit Cards)                                         │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   transactions   │───▶│   Transformer    │───▶│   ingestable_    │  │
│  │    artifact      │    │  (normalize)     │    │   transactions   │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LOAD PHASE                                                             │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │    ingestable    │───▶│   Bulk Insert    │───▶│   Transaction    │  │
│  │    artifact      │    │                  │    │    Records       │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DATASOURCE VISIBILITY                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  API Endpoints   │───▶│  Filter by       │───▶│   Frontend       │  │
│  │  (list/detail)   │    │  status/hidden   │    │   Display        │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Differences: Bank vs Credit Cards

| Aspect | Bank Accounts | Credit Cards |
|--------|---------------|--------------|
| **Input Formats** | PDF, XLSX, TXT, CSV | PDF, CSV |
| **Extraction** | Single-stage to ingestable | Multi-stage (extract → transform → load) |
| **Artifacts** | Single `ingestable_transactions` | Multiple: transactions, EMI, metadata |
| **Multi-Item Support** | N/A | Multi-card PDFs supported |
| **Transformers** | None (legacy extractors produce ingestable) | Registry-based |
| **Schema Columns** | 7 base columns | 10 columns (+intl_amount, intl_currency, exchange_rate) |
| **Management** | API-driven | Command-driven + API |

---

## Post-Load Transaction Data

After transactions are loaded into the database, additional data can be attached to them.

### Types of Post-Load Data

#### Transaction Links
- **Self Transfers**: Links between bank account transactions (e.g., transfer from Account A to Account B)
- **Credit Card Payment Links**: Links between bank account transactions and credit card transactions (payment made from bank account)

#### Tags
User-assigned categories/labels for organizing transactions.

#### Inconsistency Markers
System-detected issues:
- Duplicate transactions
- Missing data
- Calculation discrepancies

### Current Behavior on Unload/Reload

**Current limitation:** The system does not have robust handling for post-load data when transactions are unloaded and reloaded.

- **On Unload**: Links may be broken, tags may be orphaned
- **On Reload**: No automatic restoration of previous links/tags

---

## List Visibility

### Hidden Flag

Both `ExtractedCSV` and `CreditCardPDFExtraction` have a `hidden` field:

```python
hidden = BooleanField(default=False)
```

**Purpose:** Exclude entries from default UI lists without deleting them.

**Current behavior:**
- `hidden=True` excludes from datasource list API responses
- No UI toggle to switch between visible/hidden views
- No "Show All" option

### Disabled Flag

`SourceFile` has a `disabled` field:

```python
disabled = BooleanField(default=False)
```

**Purpose:** Soft-delete - excludes transactions from calculations without physical deletion.

**Current limitations:**
- No clear distinction between "hidden from UI" vs "disabled from calculations"
- No bulk hide/unhide functionality

---

## UI Workflow (Current)

### Bank Accounts Extractions Page

```
┌─────────────────────────────────────────────────────────────────┐
│  BANK EXTRACTIONS PAGE                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SOURCE FILES (from bank_accs/data/)        [Refresh]    │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ sbi_jan2024.pdf │ Pipeline: SBI PDF │ extracted     │ │   │
│  │ ├─────────────────────────────────────────────────────┤ │   │
│  │ │ icici_feb.xlsx  │ Pipeline: ICICI   │ not extracted │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ EXTRACTED CSVs                                          │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ extraction_01012024_abc123 │ loaded │ 45 txns       │ │   │
│  │ │   Account: SBI Savings     │ [View] [Unload]        │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Credit Card Extractions Page

```
┌─────────────────────────────────────────────────────────────────┐
│  CREDIT CARD EXTRACTIONS PAGE                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SOURCE FILES (from credit_cards/data/)     [Refresh]    │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ icici_stmt_jan.pdf │ 🔒 [Add Password] │ extracted   │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ PDF EXTRACTIONS                                         │   │
│  │ ┌─────────────────────────────────────────────────────┐ │   │
│  │ │ cc_pdf_01012024_xyz789 │ transformed │ 2 cards      │ │   │
│  │ │   Artifacts: transactions, emi, metadata            │ │   │
│  │ │   [Transform] [Load] [View Artifacts]               │ │   │
│  │ └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Current Limitations

1. **No bulk selection** - Must operate on items one at a time
2. **No visibility toggle** - Can't switch between visible/hidden/all
3. **Separate pages** - Bank and Credit Card extractions are on different pages
4. **No artifact preview** - Must navigate to view artifact details
5. **Limited status indicators** - Status workflow not clearly visible

---

## Bulk Operations (Current State)

### What Exists

**Bank Accounts:**
- API supports loading multiple extractions: `POST /api/bank/load-csvs/` with `{"extraction_ids": [1,2,3]}`
- No UI for bulk selection

**Credit Cards:**
- Management command can process multiple extractions
- No UI for bulk selection

### What's Missing

- No checkbox selection in UI
- No "Select All" functionality
- No bulk assign (password, extractor, account/card)
- No bulk hide/unhide
- No bulk enable/disable
- No smart bulk updates (skip already-done items)

---

## Revamp Required

This section outlines what needs to change to implement the revamped architecture described in `MODELLING-REVAMP.md`.

### Model Changes

| Current | Change Required | Revamped |
|---------|-----------------|----------|
| Separate `SourceFile` and `CreditCardSourceFile` | Unify into single model | `SourceFile` with domain field |
| `ExtractionPipeline` configures extractor | Replace with extractor assignment on SourceFile | `extractor` field on SourceFile |
| `ExtractedCSV` = extraction + artifact combined | Split into separate entities | `Extraction` + `ExtractionArtifact` |
| `BankExtractionArtifact` | Merge with CC artifacts | Unified `ExtractionArtifact` |
| `CreditCardPDFExtraction` | Becomes an Extraction | `Extraction` |
| `ExtractionArtifact` (CC only) | Add bank support, add fields | `ExtractionArtifact` with `data_source_target`, `transformer` |
| No equivalent | New entity | `DataSourceArtifact` |
| No explicit concept | New entity | `DataSource` with `Spec` |
| No explicit entity | Formalize | `DataSourceLoader` |

### Field Additions

**SourceFile (unified):**
- `domain`: enum(bank_account, credit_card)
- `extractor`: str (replaces ExtractionPipeline FK)
- `status`: enum(not_extracted, extracted)
- `hidden`: bool (for UI toggle)

**Extraction (new):**
- `extraction_id`: unique identifier
- `source_file`: FK
- `extractor_name`: str
- `status`: enum(pending, completed, error)
- `hidden`: bool

**ExtractionArtifact:**
- `artifact_key`: str (for multi-card disambiguation)
- `data_source_target`: str (nullable)
- `transformer`: str (nullable)
- `transformation_status`: enum(not_transformed, transformed)

**DataSourceArtifact (new):**
- `artifact_id`: unique
- `data_source_target`: str
- `content`: bytes
- `status`: enum(unloaded, loaded)
- `disabled`: bool
- `hidden`: bool
- `bank_account` / `credit_card`: FK based on target
- `source_artifact`: FK to ExtractionArtifact

### UI Changes Required

| Current | Revamped |
|---------|----------|
| Separate Bank/CC extraction pages | Unified Extractions Page |
| No visibility toggle | Show Visible/Hidden/All dropdown |
| No bulk selection | Checkbox + Select All + Bulk Actions |
| No artifact preview inline | Artifacts Preview section |
| Individual item actions only | Bulk actions dropdown |
| No smart updates | Skip already-done items |

### API Changes Required

| Current Endpoint | Change |
|------------------|--------|
| `GET /api/bank/extracted-csvs/` | Merge into unified endpoint |
| `GET /api/credit-cards/source-files/` | Merge into unified endpoint |
| `POST /api/bank/load-csvs/` | Replace with DataSourceLoader API |
| `POST /api/credit-cards/load/` | Replace with DataSourceLoader API |
| (none) | New: Bulk update endpoints |
| (none) | New: DataSourceArtifact CRUD |

### Behavioral Changes

| Aspect | Current | Revamped |
|--------|---------|----------|
| **Post-load data on unload** | Lost/orphaned | Removed cleanly |
| **Post-load data on reload** | Not restored | Reapply optimistically |
| **Extraction deletion** | Manual cleanup | DataSourceLoader cascade cleanup |
| **Domain entity linking** | On SourceFile/Extraction | On DataSourceArtifact |
| **Transformation** | Implicit in some extractors | Explicit, user-controlled |

### Migration Strategy

1. **Phase 1: Unify SourceFile**
   - Add `domain` field
   - Migrate CreditCardSourceFile data
   - Update file discovery

2. **Phase 2: Split Extraction/Artifact**
   - Create Extraction model
   - Create unified ExtractionArtifact
   - Migrate ExtractedCSV → Extraction + Artifact
   - Migrate CreditCardPDFExtraction → Extraction

3. **Phase 3: Add DataSourceArtifact**
   - Create model
   - Add transformation workflow
   - Migrate existing loaded state

4. **Phase 4: UI Overhaul**
   - Unified Extractions Page
   - Add visibility toggles
   - Add bulk selection
   - Add artifact preview

5. **Phase 5: Post-Load Data Handling**
   - Implement link preservation
   - Implement optimistic reapply
   - Add DataSourceLoader cleanup
