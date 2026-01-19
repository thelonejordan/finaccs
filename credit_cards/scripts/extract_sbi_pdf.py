"""
Extraction script for ICICI Credit Card PDF statements.

Run with: uv run python manage.py runscript credit_cards.scripts.extract_sbi_pdf --script-args PASSWORD
"""
import pdfplumber
import re
import json
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date


PDF_PATH = Path(__file__).parent.parent / 'data' / '4375XXXXXXXX8007_240466_Retail_Coral_NORM.pdf'


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
    except:
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
            date = parse_date(first_cell)
            if not date:
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
                'date': date,
                'ser_no': ser_no,
                'description': description,
                'amount': amount,
                'intl_amount': intl_amount,
            })

    return transactions


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
    # "Credit Limit (Including cash) Available Credit (Including cash) Cash Limit Available Cash"
    # followed by values like "`3,00,000.00 `2,98,173.45 `45,000.00 `45,000.00"
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
    # "Previous Balance Purchases / Charges Cash Advances Payments / Credits"
    # followed by values like "`923.05 `921.07 `0.00 `923.05"
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


def extract_transactions_from_text(text):
    """Extract transactions from raw PDF text using regex.

    ICICI format in text:
    DD/MM/YYYY SerialNumber Description RewardPoints Amount [CR]
    Example: 27/03/2023 7347465292 UPI Payment Received 0 923.05 CR
    """
    transactions = []

    # Pattern to match transaction lines
    # Date (DD/MM/YYYY), SerialNo (digits), Description (text), RewardPoints (0 or number), Amount (with optional CR)
    pattern = r'(\d{2}/\d{2}/\d{4})\s+(\d{7,})\s+(.+?)\s+(\d+)\s+([\d,]+\.?\d*)\s*(CR)?'

    for match in re.finditer(pattern, text):
        date_str, serial, description, reward_pts, amount_str, is_cr = match.groups()

        date = parse_date(date_str)
        if not date:
            continue

        description = description.strip()
        amount, _ = parse_amount(amount_str)

        if amount == 0:
            continue

        # CR means credit (payment received), make it negative
        if is_cr:
            amount = -amount

        transactions.append({
            'date': date,
            'ser_no': serial,
            'description': description,
            'amount': amount,
            'intl_amount': Decimal('0'),
        })

    return transactions


def run(*args):
    """Main script entry point.

    Usage: python manage.py runscript credit_cards.scripts.extract_sbi_pdf --script-args PASSWORD
    """
    # Get password from args or try common ones
    password = args[0] if args else None

    print(f"Extracting from: {PDF_PATH}")
    if password:
        print(f"Using password: {'*' * len(password)}")
    print("=" * 80)

    if not PDF_PATH.exists():
        print(f"ERROR: PDF not found at {PDF_PATH}")
        return

    # Try to open with password
    try:
        pdf = pdfplumber.open(PDF_PATH, password=password)
    except Exception as e:
        print(f"ERROR: Could not open PDF - {e}")
        print()
        print("The PDF appears to be password protected.")
        print("Please provide the password as an argument:")
        print("  python manage.py runscript credit_cards.scripts.extract_sbi_pdf --script-args YOUR_PASSWORD")
        return

    with pdf:
        print(f"Total pages: {len(pdf.pages)}")
        print()

        all_tables = []
        all_text = ""

        for i, page in enumerate(pdf.pages):
            # Extract tables
            tables = page.extract_tables()
            if tables:
                all_tables.extend(tables)
                print(f"Page {i + 1}: Found {len(tables)} table(s)")

            # Also extract raw text
            text = page.extract_text()
            if text:
                all_text += text + "\n"

        # Extract statement summary
        print()
        print("=" * 80)
        print("STATEMENT SUMMARY")
        print("=" * 80)
        print()

        summary = extract_statement_summary(all_text)

        if summary:
            if 'statement_date' in summary:
                print(f"Statement Date:      {summary['statement_date'].strftime('%Y-%m-%d')}")
            if 'period_start' in summary and 'period_end' in summary:
                print(f"Statement Period:    {summary['period_start'].strftime('%Y-%m-%d')} to {summary['period_end'].strftime('%Y-%m-%d')}")
            if 'payment_due_date' in summary:
                print(f"Payment Due Date:    {summary['payment_due_date'].strftime('%Y-%m-%d')}")
            print()
            if 'previous_balance' in summary:
                print(f"Previous Balance:    {float(summary['previous_balance']):>15,.2f}")
            if 'purchases' in summary:
                print(f"Purchases/Charges:   {float(summary['purchases']):>15,.2f}")
            if 'cash_advances' in summary:
                print(f"Cash Advances:       {float(summary['cash_advances']):>15,.2f}")
            if 'payments_credits' in summary:
                print(f"Payments/Credits:    {float(summary['payments_credits']):>15,.2f}")
            print()
            if 'total_amount_due' in summary:
                print(f"Total Amount Due:    {float(summary['total_amount_due']):>15,.2f}")
            if 'minimum_amount_due' in summary:
                print(f"Minimum Amount Due:  {float(summary['minimum_amount_due']):>15,.2f}")
            print()
            if 'credit_limit' in summary:
                print(f"Credit Limit:        {float(summary['credit_limit']):>15,.2f}")
            if 'available_credit' in summary:
                print(f"Available Credit:    {float(summary['available_credit']):>15,.2f}")
            if 'cash_limit' in summary:
                print(f"Cash Limit:          {float(summary['cash_limit']):>15,.2f}")
            if 'available_cash' in summary:
                print(f"Available Cash:      {float(summary['available_cash']):>15,.2f}")
        else:
            print("No summary information found.")

        print()
        print("=" * 80)
        print("EXTRACTING TRANSACTIONS")
        print("=" * 80)
        print()

        # Try both extraction methods
        transactions_from_tables = extract_transactions_from_tables(all_tables)
        transactions_from_text = extract_transactions_from_text(all_text)

        print(f"From tables: {len(transactions_from_tables)} transactions")
        print(f"From text: {len(transactions_from_text)} transactions")

        # Use text-based extraction as primary (more complete)
        # Fall back to table extraction if text yields nothing
        if transactions_from_text:
            transactions = transactions_from_text
            print("Using text-based extraction")
        else:
            transactions = transactions_from_tables
            print("Using table-based extraction")
        print()

        if not transactions:
            print("No transactions found in tables.")
            return

        # Print extracted transactions
        print(f"Found {len(transactions)} transactions:")
        print()
        print(f"{'Date':<12} {'Description':<40} {'Amount':>12} {'Intl Amt':>12}")
        print("-" * 80)

        total_charges = Decimal('0')
        total_payments = Decimal('0')

        for txn in transactions:
            date_str = txn['date'].strftime('%Y-%m-%d')
            desc = txn['description'][:38] + '..' if len(txn['description']) > 40 else txn['description']
            amount = txn['amount']
            intl = txn['intl_amount']

            if amount > 0:
                total_charges += amount
            else:
                total_payments += abs(amount)

            amount_str = f"{float(amount):,.2f}"
            intl_str = f"{float(intl):,.2f}" if intl else "-"

            print(f"{date_str:<12} {desc:<40} {amount_str:>12} {intl_str:>12}")

        print("-" * 80)
        print(f"{'TOTAL CHARGES:':<54} {float(total_charges):>12,.2f}")
        print(f"{'TOTAL PAYMENTS:':<54} {float(total_payments):>12,.2f}")
        print(f"{'NET:':<54} {float(total_charges - total_payments):>12,.2f}")

        # Extract EMI/Personal Loans
        print()
        print("=" * 80)
        print("EMI / PERSONAL LOANS")
        print("=" * 80)
        print()

        emi_loans = extract_emi_loans_from_tables(all_tables)

        if not emi_loans:
            print("No EMI/Loan data found.")
        else:
            print(f"Found {len(emi_loans)} EMI/Loan(s):")
            print()
            print(f"{'Type':<25} {'Created':<12} {'Finish':<12} {'Total':<10} {'Pending':<8} {'Outstanding':>12} {'Monthly':>12}")
            print("-" * 95)

            total_outstanding = Decimal('0')
            for loan in emi_loans:
                loan_type = loan['loan_type'][:23] + '..' if len(loan['loan_type']) > 25 else loan['loan_type']
                created = loan['creation_date'].strftime('%Y-%m-%d') if loan['creation_date'] else '-'
                finish = loan['finish_date'].strftime('%Y-%m-%d') if loan['finish_date'] else '-'
                total_inst = str(loan['num_installments'])
                pending = str(loan['pending_installments'])
                outstanding = f"{float(loan['outstanding_amount']):,.2f}"
                monthly = f"{float(loan['monthly_installment']):,.2f}"

                total_outstanding += loan['outstanding_amount']

                print(f"{loan_type:<25} {created:<12} {finish:<12} {total_inst:<10} {pending:<8} {outstanding:>12} {monthly:>12}")

            print("-" * 95)
            print(f"{'TOTAL OUTSTANDING:':<69} {float(total_outstanding):>12,.2f}")

        # Output CSV format
        print()
        print("=" * 80)
        print("CSV OUTPUT - TRANSACTIONS:")
        print("=" * 80)
        print("date,ser_no,description,amount,intl_amount")
        for txn in transactions:
            date_str = txn['date'].strftime('%Y-%m-%d')
            ser_no = txn.get('ser_no', '')
            desc = txn['description'].replace('"', '""')  # Escape quotes
            amount = float(txn['amount'])
            intl = float(txn.get('intl_amount', 0))
            intl_str = f"{intl:.2f}" if intl else ""
            print(f'{date_str},{ser_no},"{desc}",{amount:.2f},{intl_str}')

        if emi_loans:
            print()
            print("=" * 80)
            print("CSV OUTPUT - EMI/LOANS:")
            print("=" * 80)
            print("loan_type,creation_date,finish_date,num_installments,emi_amount,pending_installments,outstanding_amount,monthly_installment")
            for loan in emi_loans:
                loan_type = loan['loan_type'].replace('"', '""')
                created = loan['creation_date'].strftime('%Y-%m-%d') if loan['creation_date'] else ''
                finish = loan['finish_date'].strftime('%Y-%m-%d') if loan['finish_date'] else ''
                print(f'"{loan_type}",{created},{finish},{loan["num_installments"]},{float(loan["emi_amount"]):.2f},{loan["pending_installments"]},{float(loan["outstanding_amount"]):.2f},{float(loan["monthly_installment"]):.2f}')

        # JSON output for statement metadata
        print()
        print("=" * 80)
        print("JSON OUTPUT - STATEMENT METADATA:")
        print("=" * 80)

        def json_serializer(obj):
            if isinstance(obj, (date, datetime)):
                return obj.isoformat()
            elif isinstance(obj, Decimal):
                return float(obj)
            raise TypeError(f"Type {type(obj)} not serializable")

        metadata = {
            "metadata": {
                "card_no": summary.get('card_no'),
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

        print(json.dumps(metadata, indent=2, default=json_serializer))
