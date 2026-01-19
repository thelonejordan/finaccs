"""
PDF Extraction module for Credit Card statements.

Extracts transactions, EMI/loans, and statement metadata from PDF statements.
Currently supports ICICI credit card PDF format.
"""
import pdfplumber
import re
import gzip
import hashlib
import csv
import json
import io
from dataclasses import dataclass, field
from decimal import Decimal
from datetime import datetime, date
from typing import BinaryIO, Dict, Any, Optional


EXTRACTOR_VERSION = '1.1'


@dataclass
class ArtifactSpec:
    """Specification for an extraction artifact."""
    name: str
    data: str
    content_type: str  # 'csv' or 'json'
    row_count: int = 0
    transformer: Optional[str] = None  # Which transformer to use (e.g., 'icici_cc_transactions')


@dataclass
class ExtractionResult:
    """Result of a PDF extraction containing multiple artifacts."""
    artifacts: Dict[str, ArtifactSpec] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)  # Quick-access fields


def parse_date(date_str):
    """Parse date string like '27/03/2023' to date object."""
    if not date_str:
        return None
    # Try different date formats
    formats = [
        '%d/%m/%Y',    # 27/03/2023
        '%d/%m/%y',    # 27/03/23
        '%d-%m-%Y',    # 27-03-2023
        '%d-%m-%y',    # 27-03-23
        '%d %b %Y',    # 01 Jan 2024
        '%d-%b-%y',    # 01-Jan-24
        '%d-%b-%Y',    # 01-Jan-2024
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(amount_str):
    """Parse amount string like '923.05 CR' or '22.49' to Decimal.

    CR = Credit (payment received, negative in our schema)
    No suffix = Debit (charge, positive in our schema)
    """
    if not amount_str:
        return Decimal('0'), False

    amount_str = str(amount_str).strip()

    # Check for CR (credit) suffix - means payment received
    is_credit = 'CR' in amount_str.upper()

    # Remove commas, 'CR', and whitespace
    clean = re.sub(r'[,\s]|(CR|cr|Cr)', '', amount_str)

    try:
        amount = Decimal(clean)
        return amount, is_credit
    except Exception:
        return Decimal('0'), False


def extract_transactions_from_tables(tables):
    """Extract transactions from PDF tables."""
    transactions = []

    # Look for transaction tables
    # Header row should be: Date, SerNo., Transaction Details, Reward Points, Intl. amount, Amount
    for table in tables:
        if not table or len(table) < 1:
            continue

        for row in table:
            if not row or len(row) < 6:
                continue

            # Skip header rows
            first_cell = str(row[0]).strip() if row[0] else ''
            if first_cell.lower() in ['date', 'sl. no', 'particulars']:
                continue

            # Try to parse as transaction row
            # Format: [Date, SerNo, Description, RewardPoints, IntlAmount, Amount]
            txn_date = parse_date(first_cell)
            if not txn_date:
                continue

            ser_no = str(row[1]).strip() if row[1] else ''
            description = str(row[2]).strip() if row[2] else ''
            intl_amount_str = str(row[4]).strip() if len(row) > 4 and row[4] else ''
            amount_str = str(row[5]).strip() if len(row) > 5 and row[5] else ''

            amount, is_credit = parse_amount(amount_str)
            intl_amount, _ = parse_amount(intl_amount_str)

            if amount == 0 and intl_amount == 0:
                continue

            # In our schema: positive = charge, negative = payment
            if is_credit:
                amount = -amount

            transactions.append({
                'date': txn_date,
                'ser_no': ser_no,
                'description': description,
                'amount': amount,
                'intl_amount': intl_amount,
                'intl_currency': '',  # Table extraction doesn't capture currency
            })

    return transactions


def extract_transactions_from_text(text):
    """Extract transactions from raw PDF text using regex.

    ICICI format in text:
    DD/MM/YYYY SerialNumber Description RewardPoints Amount [CR]
    Example: 27/03/2023 7347465292 UPI Payment Received 0 923.05 CR

    For international transactions:
    DD/MM/YYYY SerialNumber Description RewardPoints IntlAmount Currency INRAmount [CR]
    Example: 17/05/2023 7347465292 ui.dev 0 59.00 USD 4945.37

    For multi-card PDFs, transactions are grouped under card headers like:
    0000XXXXXXXX1566
    16/03/2022 ... Transaction 1
    4375XXXXXXXX8007
    17/02/2022 ... Transaction 2

    Returns:
        dict: {
            'by_card': {card_number: [transactions], ...},
            'all': [all_transactions]
        }
    """
    # Find all card number headers with their positions
    # Format: 4 digits, 4-8 X's, 4 digits (e.g., 4375XXXXXXXX8007, 0000XXXXXXXX1566)
    card_pattern = r'\n(\d{4}X{4,}X*\d{4})\n'
    card_headers = [(m.start(), m.group(1)) for m in re.finditer(card_pattern, text)]

    def get_card_for_position(pos):
        """Find which card a transaction at position belongs to."""
        card_no = None
        for card_pos, card_num in card_headers:
            if card_pos < pos:
                card_no = card_num
            else:
                break
        return card_no

    # Pattern for international transactions (has currency code and two amounts)
    # Date, SerialNo, Description, RewardPoints (can be negative), IntlAmount, Currency, INRAmount, optional CR
    intl_pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(-?\d+)\s+([\d,]+\.?\d*)\s+([A-Z]{3})\s+([\d,]+\.?\d*)\s*(CR)?'

    # Pattern for domestic transactions (single amount)
    # Date, SerialNo, Description, optional RewardPoints (can be negative), Amount, optional CR
    # RewardPoints is optional to support PDFs that don't have this column (e.g., Amazon Pay ICICI)
    domestic_pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(?:(-?\d+)\s+)?([\d,]+\.?\d*)\s*(CR)?'

    # Track which positions we've already matched to avoid duplicates
    matched_positions = set()

    # Store matches with their positions for ordering
    all_matches = []

    # First, find international transactions
    for match in re.finditer(intl_pattern, text):
        date_str, serial, description, reward_pts, intl_amount_str, currency, amount_str, is_cr = match.groups()

        txn_date = parse_date(date_str)
        if not txn_date:
            continue

        description = description.strip()
        amount, _ = parse_amount(amount_str)  # INR amount is the last number
        intl_amount, _ = parse_amount(intl_amount_str)

        if amount == 0:
            continue

        # CR means credit (payment received), make it negative
        if is_cr:
            amount = -amount

        card_no = get_card_for_position(match.start())
        all_matches.append((match.start(), {
            'date': txn_date,
            'ser_no': serial,
            'description': description,
            'amount': amount,
            'intl_amount': intl_amount,
            'intl_currency': currency,
            'card_number': card_no,
        }))
        matched_positions.add(match.start())

    # Then, find domestic transactions (avoiding already matched positions)
    for match in re.finditer(domestic_pattern, text):
        if match.start() in matched_positions:
            continue

        date_str, serial, description, reward_pts, amount_str, is_cr = match.groups()

        txn_date = parse_date(date_str)
        if not txn_date:
            continue

        description = description.strip()
        amount, _ = parse_amount(amount_str)

        if amount == 0:
            continue

        # CR means credit (payment received), make it negative
        if is_cr:
            amount = -amount

        card_no = get_card_for_position(match.start())
        all_matches.append((match.start(), {
            'date': txn_date,
            'ser_no': serial,
            'description': description,
            'amount': amount,
            'intl_amount': Decimal('0'),
            'intl_currency': '',
            'card_number': card_no,
        }))

    # Sort by position in text to maintain original order
    all_matches.sort(key=lambda x: x[0])

    # Group transactions by card
    transactions_by_card = {}
    all_transactions = []

    for row_id, (_, txn) in enumerate(all_matches, start=1):
        txn['row_id'] = row_id
        all_transactions.append(txn)

        card_no = txn.get('card_number')
        if card_no:
            if card_no not in transactions_by_card:
                transactions_by_card[card_no] = []
            transactions_by_card[card_no].append(txn)

    return {
        'by_card': transactions_by_card,
        'all': all_transactions,
    }


def extract_emi_loans_from_tables(tables):
    """Extract EMI/Personal Loan data from PDF tables.

    Table format:
    [Transaction/LoanType, Creation Date, Finish Date, No. of Installments,
     EMI/Loan Amount, Pending Installments, Outstanding Amount*, Monthly Installment Amount]
    """
    emi_loans = []

    for table in tables:
        if not table or len(table) < 2:
            continue

        # Check if this is an EMI table by looking at header
        header = table[0]
        if not header or len(header) < 6:
            continue

        first_cell = str(header[0]).lower().replace('\n', ' ') if header[0] else ''
        if 'transaction' not in first_cell and 'loantype' not in first_cell:
            continue

        # Parse data rows (skip header)
        for row in table[1:]:
            if not row or len(row) < 8:
                continue

            loan_type = str(row[0]).replace('\n', ' ').strip() if row[0] else ''
            creation_date = parse_date(str(row[1]).strip()) if row[1] else None
            finish_date = parse_date(str(row[2]).strip()) if row[2] else None
            num_installments = int(re.sub(r'[^\d]', '', str(row[3]))) if row[3] else 0
            emi_amount, _ = parse_amount(str(row[4])) if row[4] else (Decimal('0'), False)
            pending_installments = int(re.sub(r'[^\d]', '', str(row[5]))) if row[5] else 0
            outstanding_amount, _ = parse_amount(str(row[6])) if row[6] else (Decimal('0'), False)
            monthly_installment, _ = parse_amount(str(row[7])) if row[7] else (Decimal('0'), False)

            if not loan_type or emi_amount == 0:
                continue

            emi_loans.append({
                'loan_type': loan_type,
                'creation_date': creation_date,
                'finish_date': finish_date,
                'num_installments': num_installments,
                'emi_amount': emi_amount,
                'pending_installments': pending_installments,
                'outstanding_amount': outstanding_amount,
                'monthly_installment': monthly_installment,
            })

    return emi_loans


def extract_statement_summary(text):
    """Extract statement summary information from PDF text.

    Extracts: statement date, payment due date, previous balance, purchases,
    cash advances, payments/credits, credit limit, available credit, cash limit, available cash
    """
    summary = {}

    # Statement Date - formats like "April 16, 2023" or "16 April 2023"
    stmt_date_match = re.search(r'STATEMENT\s*DATE\s*[\n\r]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})', text, re.IGNORECASE)
    if stmt_date_match:
        date_str = stmt_date_match.group(1).strip()
        # Try parsing different formats
        for fmt in ['%B %d, %Y', '%B %d %Y', '%d %B %Y', '%b %d, %Y', '%d %b %Y']:
            try:
                summary['statement_date'] = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Payment Due Date
    due_date_match = re.search(r'PAYMENT\s*DUE\s*DATE\s*[\n\r]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})', text, re.IGNORECASE)
    if due_date_match:
        date_str = due_date_match.group(1).strip()
        for fmt in ['%B %d, %Y', '%B %d %Y', '%d %B %Y', '%b %d, %Y', '%d %b %Y']:
            try:
                summary['payment_due_date'] = datetime.strptime(date_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Statement Period - "March 17, 2023 to April 16, 2023"
    period_match = re.search(
        r'Statement\s*period\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*to\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})',
        text, re.IGNORECASE
    )
    if period_match:
        start_str, end_str = period_match.groups()
        for fmt in ['%B %d, %Y', '%B %d %Y', '%b %d, %Y', '%b %d %Y']:
            try:
                summary['period_start'] = datetime.strptime(start_str.replace(',', ''), fmt.replace(',', '')).date()
                summary['period_end'] = datetime.strptime(end_str.replace(',', ''), fmt.replace(',', '')).date()
                break
            except ValueError:
                continue

    # Total Amount Due
    total_due_match = re.search(r'Total\s*Amount\s*due\s*[`₹]?\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if total_due_match:
        summary['total_amount_due'], _ = parse_amount(total_due_match.group(1))

    # Minimum Amount Due
    min_due_match = re.search(r'Minimum\s*Amount\s*due[^`₹\d]*[`₹]\s*([\d,]+\.?\d*)', text, re.IGNORECASE)
    if min_due_match:
        summary['minimum_amount_due'], _ = parse_amount(min_due_match.group(1))

    # ICICI format: Credit Limit, Available Credit, Cash Limit, Available Cash are in a row
    credit_row_match = re.search(
        r'Credit\s*Limit.*?Available\s*Credit.*?Cash\s*Limit.*?Available\s*Cash.*?'
        r'[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)',
        text, re.IGNORECASE | re.DOTALL
    )
    if credit_row_match:
        summary['credit_limit'], _ = parse_amount(credit_row_match.group(1))
        summary['available_credit'], _ = parse_amount(credit_row_match.group(2))
        summary['cash_limit'], _ = parse_amount(credit_row_match.group(3))
        summary['available_cash'], _ = parse_amount(credit_row_match.group(4))

    # Card Number (masked format like 4375XXXXXXXX8007)
    card_match = re.search(r'(\d{4}X{4,}X*\d{4})', text)
    if card_match:
        summary['card_no'] = card_match.group(1)

    # Invoice No and CIN No
    invoice_match = re.search(r'Invoice\s*No\.?:?\s*(\S+)', text, re.IGNORECASE)
    if invoice_match:
        summary['invoice_no'] = invoice_match.group(1)

    cin_match = re.search(r'CIN\s*No\.?:?\s*(\S+)', text, re.IGNORECASE)
    if cin_match:
        summary['cin_no'] = cin_match.group(1)

    # ICICI format: Previous Balance, Purchases/Charges, Cash Advances, Payments/Credits in a row
    amounts_row_match = re.search(
        r'Previous\s*Balance.*?Purchases?\s*/?\s*Charges?.*?Cash\s*Advances?.*?Payments?\s*/?\s*Credits?.*?'
        r'[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)\s*[`₹]\s*([\d,]+\.?\d*)',
        text, re.IGNORECASE | re.DOTALL
    )
    if amounts_row_match:
        summary['previous_balance'], _ = parse_amount(amounts_row_match.group(1))
        summary['purchases'], _ = parse_amount(amounts_row_match.group(2))
        summary['cash_advances'], _ = parse_amount(amounts_row_match.group(3))
        summary['payments_credits'], _ = parse_amount(amounts_row_match.group(4))

    return summary


def json_serializer(obj):
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def extract_icici_pdf(file_path_or_bytes, password=None):
    """
    Extract from ICICI PDF statement.

    Args:
        file_path_or_bytes: Either a file path (str/Path) or bytes/file-like object
        password: Optional PDF password

    Returns:
        dict: {
            'transactions': list[dict],       # All transactions (date, ser_no, description, amount, intl_amount, card_number)
            'transactions_by_card': dict,     # {card_number: [transactions]} - grouped by card
            'emi_loans': list[dict],          # loan_type, creation_date, ...
            'metadata': dict,                 # timeline, statement_summary, credit_summary
        }
    """
    # Handle different input types
    if isinstance(file_path_or_bytes, (str, type(None))):
        pdf = pdfplumber.open(file_path_or_bytes, password=password)
    elif isinstance(file_path_or_bytes, bytes):
        pdf = pdfplumber.open(io.BytesIO(file_path_or_bytes), password=password)
    elif hasattr(file_path_or_bytes, 'read'):
        pdf = pdfplumber.open(file_path_or_bytes, password=password)
    else:
        raise ValueError(f"Unsupported input type: {type(file_path_or_bytes)}")

    with pdf:
        all_tables = []
        all_text = ""

        for page in pdf.pages:
            # Extract tables
            tables = page.extract_tables()
            if tables:
                all_tables.extend(tables)

            # Also extract raw text
            text = page.extract_text()
            if text:
                all_text += text + "\n"

        # Extract statement summary
        summary = extract_statement_summary(all_text)

        # Try both extraction methods for transactions
        transactions_from_tables = extract_transactions_from_tables(all_tables)
        text_extraction_result = extract_transactions_from_text(all_text)

        # Use text-based extraction as primary (more complete)
        # Fall back to table extraction if text yields nothing
        if text_extraction_result['all']:
            transactions = text_extraction_result['all']
            transactions_by_card = text_extraction_result['by_card']
        else:
            transactions = transactions_from_tables
            transactions_by_card = {}

        # Extract EMI/Loans
        emi_loans = extract_emi_loans_from_tables(all_tables)

        # Build metadata structure
        # Use list of card numbers if multiple cards found, otherwise single value
        card_numbers = list(transactions_by_card.keys()) if transactions_by_card else []
        if not card_numbers and summary.get('card_no'):
            card_numbers = [summary.get('card_no')]
        card_no_value = card_numbers if len(card_numbers) > 1 else (card_numbers[0] if card_numbers else summary.get('card_no'))

        metadata = {
            "metadata": {
                "card_no": card_no_value,
                "invoice_no": summary.get('invoice_no'),
                "cin_no": summary.get('cin_no'),
            },
            "timeline": {
                "statement_date": summary.get('statement_date'),
                "statement_period_begin": summary.get('period_start'),
                "statement_period_end": summary.get('period_end'),
                "payment_due_date": summary.get('payment_due_date'),
            },
            "statement_summary": {
                "previous_balance": summary.get('previous_balance'),
                "purchases": summary.get('purchases'),
                "cash_advances": summary.get('cash_advances'),
                "payments_credits": summary.get('payments_credits'),
                "total_amount_due": summary.get('total_amount_due'),
                "minimum_amount_due": summary.get('minimum_amount_due'),
            },
            "credit_summary": {
                "credit_limit": summary.get('credit_limit'),
                "available_credit": summary.get('available_credit'),
                "cash_limit": summary.get('cash_limit'),
                "available_cash": summary.get('available_cash'),
            }
        }

        # Remove None values
        metadata["metadata"] = {k: v for k, v in metadata["metadata"].items() if v is not None}
        metadata["timeline"] = {k: v for k, v in metadata["timeline"].items() if v is not None}
        metadata["statement_summary"] = {k: v for k, v in metadata["statement_summary"].items() if v is not None}
        metadata["credit_summary"] = {k: v for k, v in metadata["credit_summary"].items() if v is not None}

        return {
            'transactions': transactions,
            'transactions_by_card': transactions_by_card,
            'emi_loans': emi_loans,
            'metadata': metadata,
        }


def transactions_to_csv(transactions, include_card_number=True):
    """Convert transactions list to CSV string.

    Args:
        transactions: List of transaction dicts
        include_card_number: Whether to include card_number column (default True)

    Returns:
        CSV string
    """
    output = io.StringIO()
    writer = csv.writer(output)

    if include_card_number:
        writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency', 'card_number'])
    else:
        writer.writerow(['row_id', 'date', 'ser_no', 'description', 'amount', 'intl_amount', 'intl_currency'])

    for txn in transactions:
        row = [
            txn.get('row_id', ''),
            txn['date'].isoformat() if txn['date'] else '',
            txn.get('ser_no', ''),
            txn['description'],
            float(txn['amount']),
            float(txn.get('intl_amount', 0)) if txn.get('intl_amount') else '',
            txn.get('intl_currency', ''),
        ]
        if include_card_number:
            row.append(txn.get('card_number', ''))
        writer.writerow(row)

    return output.getvalue()


def emi_loans_to_csv(emi_loans):
    """Convert EMI/loans list to CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'loan_type', 'creation_date', 'finish_date', 'num_installments',
        'emi_amount', 'pending_installments', 'outstanding_amount', 'monthly_installment'
    ])

    for loan in emi_loans:
        writer.writerow([
            loan['loan_type'],
            loan['creation_date'].isoformat() if loan['creation_date'] else '',
            loan['finish_date'].isoformat() if loan['finish_date'] else '',
            loan['num_installments'],
            float(loan['emi_amount']),
            loan['pending_installments'],
            float(loan['outstanding_amount']),
            float(loan['monthly_installment']),
        ])

    return output.getvalue()


def metadata_to_json(metadata):
    """Convert metadata dict to JSON string."""
    return json.dumps(metadata, indent=2, default=json_serializer)


def compress_data(data_str):
    """Compress string data with gzip."""
    return gzip.compress(data_str.encode('utf-8'))


def decompress_data(data_bytes):
    """Decompress gzip data to string."""
    return gzip.decompress(data_bytes).decode('utf-8')


def compute_hash(data_str):
    """Compute SHA-256 hash of string data."""
    return hashlib.sha256(data_str.encode('utf-8')).hexdigest()


def create_pdf_extraction(source_file, file_bytes, password=None):
    """
    Extract from PDF and create a CreditCardPDFExtraction record with artifacts.

    For multi-card PDFs, creates separate artifacts per card:
    - transactions-4375XXXXXXXX8007
    - transactions-0000XXXXXXXX1566

    Args:
        source_file: CreditCardSourceFile instance
        file_bytes: Raw PDF bytes
        password: Optional PDF password

    Returns:
        CreditCardPDFExtraction instance (saved)
    """
    from .models import CreditCardPDFExtraction, ExtractionArtifact

    # Extract data from PDF
    result = extract_icici_pdf(file_bytes, password=password)

    transactions = result['transactions']
    transactions_by_card = result.get('transactions_by_card', {})
    emi_loans = result['emi_loans']
    metadata = result['metadata']

    # Convert EMI and metadata to artifacts
    emi_csv = emi_loans_to_csv(emi_loans) if emi_loans else ''
    metadata_json = metadata_to_json(metadata)

    # Parse metadata for quick access fields
    timeline = metadata.get('timeline', {})
    meta_info = metadata.get('metadata', {})
    stmt_summary = metadata.get('statement_summary', {})

    # Create extraction record
    extraction = CreditCardPDFExtraction(
        source_file=source_file,
        credit_card=source_file.credit_card,
        extractor_version=EXTRACTOR_VERSION,
        statement_date=timeline.get('statement_date'),
        statement_period_begin=timeline.get('statement_period_begin'),
        statement_period_end=timeline.get('statement_period_end'),
        payment_due_date=timeline.get('payment_due_date'),
        card_number_mask=', '.join(meta_info['card_no']) if isinstance(meta_info.get('card_no'), list) else meta_info.get('card_no', ''),
        invoice_number=meta_info.get('invoice_no', ''),
        total_amount_due=stmt_summary.get('total_amount_due'),
        minimum_amount_due=stmt_summary.get('minimum_amount_due'),
    )
    extraction.save()

    # Create transaction artifacts - one per card if grouped, otherwise single artifact
    if transactions_by_card:
        # Multi-card: create per-card artifacts
        for card_no, card_txns in transactions_by_card.items():
            card_csv = transactions_to_csv(card_txns, include_card_number=True)
            ExtractionArtifact.objects.create(
                extraction=extraction,
                artifact_type=f'transactions-{card_no}',
                content_type='csv',
                data=compress_data(card_csv),
                data_hash=compute_hash(card_csv),
                row_count=len(card_txns),
                transformer_name='icici_cc_transactions',
                is_transformable=True,
                is_transformed=False,
            )
    elif transactions:
        # Single card or no card headers: create single transactions artifact
        transactions_csv = transactions_to_csv(transactions, include_card_number=True)
        ExtractionArtifact.objects.create(
            extraction=extraction,
            artifact_type='transactions',
            content_type='csv',
            data=compress_data(transactions_csv),
            data_hash=compute_hash(transactions_csv),
            row_count=len(transactions),
            transformer_name='icici_cc_transactions',
            is_transformable=True,
            is_transformed=False,
        )

    if emi_csv:
        ExtractionArtifact.objects.create(
            extraction=extraction,
            artifact_type='emi',
            content_type='csv',
            data=compress_data(emi_csv),
            data_hash=compute_hash(emi_csv),
            row_count=len(emi_loans),
            # EMI is not transformable currently
            is_transformable=False,
            is_transformed=False,
        )

    if metadata_json:
        ExtractionArtifact.objects.create(
            extraction=extraction,
            artifact_type='metadata',
            content_type='json',
            data=compress_data(metadata_json),
            data_hash=compute_hash(metadata_json),
            row_count=0,
            # Metadata is not transformable
            is_transformable=False,
            is_transformed=False,
        )

    return extraction


def transform_to_ingestable(extraction):
    """
    Transform raw transactions artifacts to ingestable format using the transformer registry.

    For multi-card PDFs, transforms all transaction artifacts (e.g., transactions-4375XXXXXXXX8007).
    Uses the transformer declared on each transactions artifact (e.g., 'icici_cc_transactions')
    to produce standardized ingestable artifacts.
    """
    from .transformers import transform_artifact

    raw_artifacts = extraction.get_transactions_artifacts()
    if not raw_artifacts:
        raise ValueError("No transactions artifacts found")

    transformed_count = 0
    for raw_artifact in raw_artifacts:
        if not raw_artifact.is_transformable:
            continue

        if not raw_artifact.transformer_name:
            continue

        # Use the transformer registry to transform the artifact
        transformed_artifact = transform_artifact(raw_artifact)
        if transformed_artifact:
            transformed_count += 1

    if transformed_count == 0:
        raise ValueError("No artifacts were transformed")

    extraction.status = 'transformed'
    extraction.save()

    return extraction


def load_transactions_from_artifact(artifact):
    """
    Load transactions from a single ExtractionArtifact into the database.

    Reads from the ingestable artifact which has the standardized format:
    date, value_date, narration, debit_amount, credit_amount,
    reference_number, closing_balance, intl_amount, intl_currency, exchange_rate

    Args:
        artifact: ExtractionArtifact instance (must be an ingestable artifact)

    Returns:
        list of created CreditCardTransaction instances
    """
    from .models import CreditCardTransaction

    extraction = artifact.extraction

    # Decompress and parse CSV
    csv_data = decompress_data(artifact.data)
    reader = csv.DictReader(io.StringIO(csv_data))

    transactions = []
    for row_num, row in enumerate(reader, start=1):
        # Map ingestable columns to CreditCardTransaction
        # amount = debit_amount - credit_amount (debit is positive charge, credit is negative payment)
        debit = Decimal(row['debit_amount']) if row['debit_amount'] else Decimal('0')
        credit = Decimal(row['credit_amount']) if row['credit_amount'] else Decimal('0')
        amount = debit - credit

        intl_amount = Decimal(row['intl_amount']) if row['intl_amount'] else Decimal('0')
        intl_currency = row.get('intl_currency', '')
        exchange_rate = Decimal(row['exchange_rate']) if row.get('exchange_rate') else None

        # Use artifact's credit_card if set, otherwise fall back to extraction's credit_card
        credit_card = artifact.credit_card or extraction.credit_card

        txn = CreditCardTransaction(
            date=row['date'] if row['date'] else None,
            description=row['narration'],
            amount=amount,
            intl_amount=intl_amount,
            intl_currency=intl_currency,
            exchange_rate=exchange_rate,
            credit_card=credit_card,
            source_file=extraction.source_file,
            pdf_extraction=extraction,
            source_artifact=artifact,
            row_number=row_num,
        )
        transactions.append(txn)

    # Bulk create
    CreditCardTransaction.objects.bulk_create(transactions)

    return transactions


def load_transactions_from_extraction(extraction):
    """
    Load transactions from a CreditCardPDFExtraction into the database.

    For multi-card PDFs, loads from all ingestable artifacts (e.g., transactions_ingestable-4375XXXXXXXX8007).

    Args:
        extraction: CreditCardPDFExtraction instance

    Returns:
        list of created CreditCardTransaction instances
    """
    from django.utils import timezone

    # Get all ingestable artifacts (must run transform first)
    artifacts = extraction.get_ingestable_artifacts()
    if not artifacts:
        raise ValueError("No ingestable artifact found. Run transformation first.")

    all_transactions = []
    for artifact in artifacts:
        transactions = load_transactions_from_artifact(artifact)
        all_transactions.extend(transactions)

    # Update extraction status
    extraction.status = 'loaded'
    extraction.loaded_at = timezone.now()
    extraction.save()

    return all_transactions
