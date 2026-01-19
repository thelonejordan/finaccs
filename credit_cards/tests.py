from django.test import TestCase
from decimal import Decimal
from datetime import date
from pathlib import Path
import pdfplumber

from credit_cards.scripts.extract_sbi_pdf import (
    extract_statement_summary,
    extract_transactions_from_text,
    extract_emi_loans_from_tables,
)


class ICICIPDFExtractionTest(TestCase):
    """Tests for ICICI credit card PDF extraction."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.pdf_path = Path(__file__).parent / 'data' / '4375XXXXXXXX8007_240466_Retail_Coral_NORM.pdf'
        cls.password = 'jyot0905'

        # Extract data once for all tests
        with pdfplumber.open(cls.pdf_path, password=cls.password) as pdf:
            cls.all_text = ""
            cls.all_tables = []
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    cls.all_tables.extend(tables)
                text = page.extract_text()
                if text:
                    cls.all_text += text + "\n"

        cls.summary = extract_statement_summary(cls.all_text)
        cls.transactions = extract_transactions_from_text(cls.all_text)
        cls.emi_loans = extract_emi_loans_from_tables(cls.all_tables)

    def test_metadata_card_no(self):
        self.assertEqual(self.summary.get('card_no'), '4375XXXXXXXX8007')

    def test_metadata_invoice_no(self):
        self.assertEqual(self.summary.get('invoice_no'), '1574160400240466')

    def test_metadata_cin_no(self):
        self.assertEqual(self.summary.get('cin_no'), 'L65190GJ1994PLC021012')

    def test_timeline_statement_date(self):
        self.assertEqual(self.summary.get('statement_date'), date(2023, 4, 16))

    def test_timeline_period_start(self):
        self.assertEqual(self.summary.get('period_start'), date(2023, 3, 17))

    def test_timeline_period_end(self):
        self.assertEqual(self.summary.get('period_end'), date(2023, 4, 16))

    def test_timeline_payment_due_date(self):
        self.assertEqual(self.summary.get('payment_due_date'), date(2023, 5, 4))

    def test_statement_summary_previous_balance(self):
        self.assertEqual(self.summary.get('previous_balance'), Decimal('923.05'))

    def test_statement_summary_purchases(self):
        self.assertEqual(self.summary.get('purchases'), Decimal('921.07'))

    def test_statement_summary_cash_advances(self):
        self.assertEqual(self.summary.get('cash_advances'), Decimal('0.00'))

    def test_statement_summary_payments_credits(self):
        self.assertEqual(self.summary.get('payments_credits'), Decimal('923.05'))

    def test_statement_summary_total_amount_due(self):
        self.assertEqual(self.summary.get('total_amount_due'), Decimal('921.07'))

    def test_statement_summary_minimum_amount_due(self):
        self.assertEqual(self.summary.get('minimum_amount_due'), Decimal('920.00'))

    def test_credit_summary_credit_limit(self):
        self.assertEqual(self.summary.get('credit_limit'), Decimal('300000.00'))

    def test_credit_summary_available_credit(self):
        self.assertEqual(self.summary.get('available_credit'), Decimal('298173.45'))

    def test_credit_summary_cash_limit(self):
        self.assertEqual(self.summary.get('cash_limit'), Decimal('45000.00'))

    def test_credit_summary_available_cash(self):
        self.assertEqual(self.summary.get('available_cash'), Decimal('45000.00'))

    def test_transactions_count(self):
        self.assertEqual(len(self.transactions), 4)

    def test_transaction_1(self):
        txn = self.transactions[0]
        self.assertEqual(txn['date'], date(2023, 3, 27))
        self.assertEqual(txn['ser_no'], '7347465292')
        self.assertEqual(txn['description'], 'UPI Payment Received')
        self.assertEqual(txn['amount'], Decimal('-923.05'))

    def test_transaction_2(self):
        txn = self.transactions[1]
        self.assertEqual(txn['date'], date(2023, 3, 29))
        self.assertEqual(txn['ser_no'], '7359303378')
        self.assertEqual(txn['description'], 'Interest Amount Amortization - <23/24>')
        self.assertEqual(txn['amount'], Decimal('22.49'))

    def test_transaction_3(self):
        txn = self.transactions[2]
        self.assertEqual(txn['date'], date(2023, 3, 29))
        self.assertEqual(txn['ser_no'], '7359303383')
        self.assertEqual(txn['description'], 'IGST-CI@18%')
        self.assertEqual(txn['amount'], Decimal('4.05'))

    def test_transaction_4(self):
        txn = self.transactions[3]
        self.assertEqual(txn['date'], date(2023, 3, 29))
        self.assertEqual(txn['ser_no'], '7359303393')
        self.assertEqual(txn['description'], 'Principal Amount Amortization - <23/24>')
        self.assertEqual(txn['amount'], Decimal('894.53'))

    def test_emi_loans_count(self):
        self.assertEqual(len(self.emi_loans), 1)

    def test_emi_loan_1(self):
        loan = self.emi_loans[0]
        self.assertEqual(loan['loan_type'], 'Merchant EMI conversions')
        self.assertEqual(loan['creation_date'], date(2021, 5, 30))
        self.assertEqual(loan['finish_date'], date(2023, 4, 30))
        self.assertEqual(loan['num_installments'], 24)
        self.assertEqual(loan['emi_amount'], Decimal('18906.80'))
        self.assertEqual(loan['pending_installments'], 1)
        self.assertEqual(loan['outstanding_amount'], Decimal('916.80'))
        self.assertEqual(loan['monthly_installment'], Decimal('917.01'))
