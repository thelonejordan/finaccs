import { useEffect, useState } from "react"
import {
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronDownIcon,
  CheckIcon,
  BuildingIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import { Header } from "@/components/Header"
import {
  fetchInconsistencies,
  fetchBankAccounts,
  type Inconsistency,
  type BankAccount,
} from "@/lib/api"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function FormattedCurrency({ amount, className = "" }: { amount: number; className?: string }) {
  const formatted = formatCurrency(amount)
  const match = formatted.match(/^(.*?)(\.\d{2})$/)
  if (match) {
    return (
      <span className={className}>
        {match[1]}
        <span className="opacity-50">{match[2]}</span>
      </span>
    )
  }
  return <span className={className}>{formatted}</span>
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function InconsistenciesPage() {
  const [inconsistencies, setInconsistencies] = useState<Inconsistency[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 50

  useEffect(() => {
    document.title = "Inconsistencies | FinAccs"
  }, [])

  // Load bank accounts for filter
  useEffect(() => {
    async function loadBankAccounts() {
      try {
        const data = await fetchBankAccounts()
        setBankAccounts(data.accounts)
      } catch (error) {
        console.error("Failed to load bank accounts:", error)
      }
    }
    loadBankAccounts()
  }, [])

  // Load inconsistencies
  useEffect(() => {
    async function loadInconsistencies() {
      setLoading(true)
      try {
        const result = await fetchInconsistencies({
          bank_account: selectedBankAccount || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        setInconsistencies(result.data)
        setTotal(result.total)
      } catch (err) {
        console.error("Failed to load inconsistencies:", err)
      } finally {
        setLoading(false)
      }
    }
    loadInconsistencies()
  }, [selectedBankAccount, page])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Filter Section */}
        <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
              <h2 className="text-lg font-semibold">Balance Inconsistencies</h2>
              <div className="flex-1" />
              {/* Bank Account Filter */}
              {bankAccounts.length > 0 && (
                <Select.Root
                  value={selectedBankAccount?.toString() || "all"}
                  onValueChange={(value) => {
                    setSelectedBankAccount(value === "all" ? null : parseInt(value, 10))
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                      <Select.Value placeholder="All Accounts" />
                    </div>
                    <Select.Icon>
                      <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden" position="popper" sideOffset={4}>
                      <Select.Viewport className="p-1 max-h-60 overflow-y-auto">
                        <Select.Item
                          value="all"
                          className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                        >
                          <Select.ItemText>All Accounts</Select.ItemText>
                          <Select.ItemIndicator>
                            <CheckIcon className="h-4 w-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                        {bankAccounts.map((acc) => (
                          <Select.Item
                            key={acc.id}
                            value={acc.id.toString()}
                            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                          >
                            <Select.ItemText>
                              <span className="font-medium">{acc.nickname}</span>
                              <span className="text-muted-foreground ml-1">
                                ({acc.bank_name})
                              </span>
                            </Select.ItemText>
                            <Select.ItemIndicator>
                              <CheckIcon className="h-4 w-4" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              )}
            </div>
          </div>
        </section>

        {/* Summary Card */}
        <section className="rounded-xl border border-border bg-card shadow-sm p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${total > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              {total > 0 ? (
                <AlertTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balance Discontinuities Found</p>
              <p className={`text-xl font-bold ${total > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {total}
              </p>
            </div>
          </div>
        </section>

        {/* Inconsistencies Table */}
        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : inconsistencies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium">No inconsistencies found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All transaction balances are continuous
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="border-b border-border/40">
                      <tr>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Expected</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actual</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inconsistencies.map((item) => (
                        <tr key={item.transaction_id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                          <td className="p-4 align-middle text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(item.date)}
                          </td>
                          <td className="p-4 align-middle text-sm whitespace-nowrap">
                            {item.bank_account.nickname}
                          </td>
                          <td className="p-4 align-middle">
                            <span className="text-sm line-clamp-2" title={item.narration}>
                              {item.narration}
                            </span>
                          </td>
                          <td className="p-4 align-middle text-right whitespace-nowrap">
                            {item.credit > 0 ? (
                              <span className="text-green-700 dark:text-green-400 font-medium flex items-center justify-end gap-1">
                                <FormattedCurrency amount={item.credit} />
                                <ArrowUpIcon className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="text-red-700 dark:text-red-400 font-medium flex items-center justify-end gap-1">
                                <FormattedCurrency amount={item.debit} />
                                <ArrowDownIcon className="h-3 w-3" />
                              </span>
                            )}
                          </td>
                          <td className="p-4 align-middle text-right text-sm text-muted-foreground whitespace-nowrap">
                            <FormattedCurrency amount={item.expected_balance} />
                          </td>
                          <td className="p-4 align-middle text-right text-sm whitespace-nowrap">
                            <FormattedCurrency amount={item.actual_balance} />
                          </td>
                          <td className="p-4 align-middle text-right whitespace-nowrap">
                            <span className={`font-medium ${item.gap > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                              {item.gap > 0 ? "+" : ""}
                              <FormattedCurrency amount={item.gap} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="First page"
                      >
                        <ChevronsLeftIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Previous page"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Next page"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                        className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Last page"
                      >
                        <ChevronsRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
