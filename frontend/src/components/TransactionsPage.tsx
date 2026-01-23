import { useSearchParams } from "react-router-dom"
import { BankTransactionsPage } from "@/components/BankTransactionsPage"
import { CreditCardTransactionsPage } from "@/components/CreditCardTransactionsPage"

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const domain = searchParams.get('domain') || 'bank'

  if (domain === 'credit-card') {
    return <CreditCardTransactionsPage />
  }

  return <BankTransactionsPage />
}
