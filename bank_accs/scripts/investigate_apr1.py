from dashboard.models import Transaction
from django.db.models import Q


def run():
    from bank_accs.models import BankAccount

    account = BankAccount.objects.get(nickname='SBI')

    # Get transactions around May 1, 2022
    txns = list(
        Transaction.objects
        .filter(bank_account=account)
        .filter(Q(source_file__isnull=True) | Q(source_file__disabled=False))
        .filter(date__gte='2022-03-25', date__lte='2022-05-10')
        .select_related('source_file')
        .order_by('date', 'id')
    )

    print(f'Transactions around May 1, 2022 (SBI):')
    print()
    prev_balance = None
    prev_source = None
    for t in txns:
        expected = None
        gap = ''
        source_change = ''

        source = t.source_file.filename if t.source_file else 'None'
        if prev_source and source != prev_source:
            source_change = ' <<< SOURCE CHANGE'

        if prev_balance is not None:
            expected = prev_balance + t.credit_amount - t.debit_amount
            if expected != t.closing_balance:
                gap = f' *** GAP: {float(t.closing_balance - expected):+.2f}'

        exp_str = f'{float(expected):.2f}' if expected else 'N/A'
        print(f'{t.date} | Cr:{float(t.credit_amount):>10.2f} | Dr:{float(t.debit_amount):>10.2f} | Bal:{float(t.closing_balance):>12.2f} | Exp:{exp_str:>12} | {source[:35]}{gap}{source_change}')
        prev_balance = t.closing_balance
        prev_source = source
