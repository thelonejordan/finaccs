"""
ICICI Credit Card "VIEW LAST STATEMENT" PDF extractor.

Extracts transactions from the ICICI online portal's "View Last Statement" PDF format.
This format has a clean table layout with columns:
Transaction Date | Details | Amount (INR) | Reference Number
Amounts suffixed with "Dr." (debit) or "Cr." (credit).
"""
import re
import csv
import json
import io
from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from typing import Optional, List, Dict, Any

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False

from . import BaseExtractor, ExtractionResult, ArtifactSpec, register_extractor


EXTRACTOR_VERSION = '1.0'


def parse_date(date_str: str) -> Optional[date]:
    """Parse date string like '12-05-2026' to date object."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str.strip(), '%d-%m-%Y').date()
    except ValueError:
        return None


def parse_amount(amount_str: str) -> tuple[Decimal, bool]:
    """Parse amount string like '122.44 Dr.' or '100000 Cr.'.

    Returns (amount, is_credit).
    """
    if not amount_str:
        return Decimal('0'), False

    amount_str = str(amount_str).strip()
    is_credit = 'Cr.' in amount_str or 'CR' in amount_str.upper()

    clean = re.sub(r'[,\s]|(Dr\.|Cr\.)', '', amount_str).strip()

    try:
        amount = Decimal(clean)
        return amount, is_credit
    except (InvalidOperation, ValueError):
        return Decimal('0'), False


def extract_transactions_from_tables(tables: List) -> List[Dict[str, Any]]:
    """Extract transactions from PDF tables.

    Expected table format:
    ['Transaction Date', 'Details', 'Amount (INR)', 'Reference Number']
    ['12-05-2026', 'IGST-CI@18%', '122.44 Dr.', '13399784560']

    Continuation tables (page 2+) may lack a header row - they start directly
    with data rows or a continuation row from the previous page.
    """
    transactions = []
    found_header = False

    for table in tables:
        if not table or len(table) < 2:
            continue

        start_idx = 0
        header = table[0]

        if header and len(header) >= 4:
            header_str = ' '.join(str(cell) for cell in header if cell).upper()
            if 'TRANSACTION DATE' in header_str:
                found_header = True
                start_idx = 1
            elif not found_header:
                continue

        # If we already found a header table, treat subsequent tables as continuations
        if not found_header:
            continue

        for row in table[start_idx:]:
            if not row or len(row) < 4:
                continue

            date_str = str(row[0]).strip() if row[0] else ''
            details = str(row[1]).strip() if row[1] else ''
            amount_str = str(row[2]).strip() if row[2] else ''
            ref_number = str(row[3]).strip() if row[3] else ''

            txn_date = parse_date(date_str)
            if not txn_date:
                continue

            amount, is_credit = parse_amount(amount_str)
            if amount == 0:
                continue

            if is_credit:
                amount = -amount

            # Clean multi-line details
            description = details.replace('\n', ' ').strip()

            transactions.append({
                'date': txn_date,
                'description': description,
                'amount': amount,
                'ref_number': ref_number,
            })

    return transactions


def extract_statement_summary(text: str) -> Dict[str, Any]:
    """Extract statement summary from the header section."""
    summary = {}

    # Statement Date: 13-05-2026
    m = re.search(r'Statement\s+Date\s+(\d{2}-\d{2}-\d{4})', text)
    if m:
        summary['statement_date'] = parse_date(m.group(1))

    # Payment Due Date: 30-05-2026
    m = re.search(r'Payment\s+Due\s+Date\s+(\d{2}-\d{2}-\d{4})', text)
    if m:
        summary['payment_due_date'] = parse_date(m.group(1))

    # Statement Period: 14-04-2026 TO 13-05-2026
    m = re.search(r'Statement\s+Period\s+(\d{2}-\d{2}-\d{4})\s+TO\s+(\d{2}-\d{2}-\d{4})', text)
    if m:
        summary['period_start'] = parse_date(m.group(1))
        summary['period_end'] = parse_date(m.group(2))

    # Total Amount Due: INR 90649.27
    m = re.search(r'Total\s+Amount\s+Due\s+INR\s+([\d,.]+)', text)
    if m:
        try:
            summary['total_amount_due'] = Decimal(m.group(1).replace(',', ''))
        except InvalidOperation:
            pass

    # Minimum Amount Due: INR 0
    m = re.search(r'Minimum\s+Amount\s+Due\s+INR\s+([\d,.]+)', text)
    if m:
        try:
            summary['minimum_amount_due'] = Decimal(m.group(1).replace(',', ''))
        except InvalidOperation:
            pass

    # Total Credit Limit: INR 360000
    m = re.search(r'Total\s+Credit\s+Limit\s+INR\s+([\d,.]+)', text)
    if m:
        try:
            summary['total_credit_limit'] = Decimal(m.group(1).replace(',', ''))
        except InvalidOperation:
            pass

    return summary


def transactions_to_csv(transactions: List[Dict]) -> str:
    """Convert transactions to CSV in the same format as icici_cc_pdf extractor."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency', 'card_number'])

    for txn in transactions:
        writer.writerow([
            txn.get('row_id', ''),
            txn['date'].isoformat() if txn['date'] else '',
            txn.get('ref_number', ''),
            txn['description'],
            float(txn['amount']),
            '',
            '',
            '',
        ])

    return output.getvalue()


def json_serializer(obj):
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


@register_extractor
class ICICICCLastStatementPDFExtractor(BaseExtractor):
    """ICICI Credit Card 'VIEW LAST STATEMENT' PDF Extractor."""
    name = 'icici_cc_laststatement_pdf'
    version = EXTRACTOR_VERSION
    domain = 'credit_card'
    supported_extensions = ['.pdf']

    def extract(self, file_bytes: bytes, password: Optional[str] = None) -> ExtractionResult:
        if not PDFPLUMBER_AVAILABLE:
            return ExtractionResult(error='pdfplumber is required for PDF parsing. Install with: uv add pdfplumber')

        try:
            pdf = pdfplumber.open(io.BytesIO(file_bytes), password=password)
        except (OSError, ValueError, TypeError) as e:
            return ExtractionResult(error=f'Failed to open PDF: {str(e)}')

        artifacts = []

        with pdf:
            all_text = ""
            all_tables = []

            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    all_text += text + "\n"
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)

            # Extract summary
            summary = extract_statement_summary(all_text)

            # Extract transactions from tables
            transactions = extract_transactions_from_tables(all_tables)

            if not transactions:
                return ExtractionResult(error='No transactions found in PDF')

            # Assign row IDs
            for row_id, txn in enumerate(transactions, start=1):
                txn['row_id'] = row_id

            # Build CSV artifact
            csv_content = transactions_to_csv(transactions)
            artifacts.append(ArtifactSpec(
                artifact_type='transactions',
                content=csv_content,
                content_format='csv',
                row_count=len(transactions),
                data_source_target='credit_card_transactions',
                transformer='icici_cc_transactions',
            ))

            # Build metadata
            metadata = {
                "metadata": {
                    "card_no": None,
                    "format": "view_last_statement",
                },
                "timeline": {
                    "statement_date": summary.get('statement_date'),
                    "statement_period_begin": summary.get('period_start'),
                    "statement_period_end": summary.get('period_end'),
                    "payment_due_date": summary.get('payment_due_date'),
                },
                "statement_summary": {
                    "total_amount_due": summary.get('total_amount_due'),
                    "minimum_amount_due": summary.get('minimum_amount_due'),
                },
            }

            metadata_json = json.dumps(metadata, indent=2, default=json_serializer)
            artifacts.append(ArtifactSpec(
                artifact_type='metadata',
                content=metadata_json,
                content_format='json',
                row_count=0,
            ))

        return ExtractionResult(artifacts=artifacts, metadata=metadata)
