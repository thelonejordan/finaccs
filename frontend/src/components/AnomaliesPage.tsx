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
  CreditCardIcon,
  CopyIcon,
  FileQuestionIcon,
  LinkIcon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
  RotateCcwIcon,
  GitBranchIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  fetchBankInconsistencies,
  dismissBankInconsistency,
  restoreBankInconsistency,
  fetchBankAccounts,
  fetchCreditCards,
  fetchCreditCardInconsistencies,
  dismissCreditCardInconsistency,
  restoreCreditCardInconsistency,
  type BankInconsistency,
  type BankAccount,
  type CreditCard,
  type CreditCardInconsistency,
} from "@/lib/api"
import { useInconsistencyCache } from "@/lib/inconsistency-cache"

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

type InconsistenciesTab = "bank" | "credit"

// Bank Account Inconsistencies Component
function BankAccountInconsistencies() {
  const { invalidate: invalidateInconsistencyCache } = useInconsistencyCache()
  const [inconsistencies, setInconsistencies] = useState<BankInconsistency[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [counts, setCounts] = useState<{ duplicate: number; cross_account: number; balance_gap: number }>({ duplicate: 0, cross_account: 0, balance_gap: 0 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<string>("all")
  const [showDismissed, setShowDismissed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 50

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

  // Always fetch data on mount and when filters/pagination change
  useEffect(() => {
    async function loadInconsistencies() {
      setLoading(true)
      try {
        const result = await fetchBankInconsistencies({
          bank_account: selectedBankAccount || undefined,
          type: selectedType === "all" ? undefined : selectedType as 'duplicate' | 'cross_account' | 'balance_gap',
          show_dismissed: showDismissed,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        setInconsistencies(result.data)
        setTotal(result.total)
        setCounts(result.counts)
      } catch (err) {
        console.error("Failed to load inconsistencies:", err)
      } finally {
        setLoading(false)
      }
    }
    loadInconsistencies()
  }, [selectedBankAccount, selectedType, showDismissed, page, refreshKey])

  const totalPages = Math.ceil(total / pageSize)

  async function handleDismiss(item: BankInconsistency) {
    try {
      await dismissBankInconsistency(item.type, item.transaction_ids)
      invalidateInconsistencyCache()
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to dismiss:", error)
    }
  }

  async function handleRestore(item: BankInconsistency) {
    try {
      await restoreBankInconsistency(item.type, item.transaction_ids)
      invalidateInconsistencyCache()
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to restore:", error)
    }
  }

  const totalActiveCount = counts.duplicate + counts.cross_account + counts.balance_gap

  return (
    <>
      {/* Filter Section */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Bank Inconsistencies</h2>
            <div className="flex-1" />
            {/* Show Dismissed Toggle */}
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                showDismissed
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {showDismissed ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
              {showDismissed ? "Showing Dismissed" : "Show Dismissed"}
            </button>
            {/* Type Filter */}
            <Select.Root
              value={selectedType}
              onValueChange={(value) => {
                setSelectedType(value)
                setPage(1)
              }}
            >
              <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon className="h-4 w-4 text-muted-foreground" />
                  <Select.Value placeholder="All Types" />
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
                      <Select.ItemText>All Types</Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="duplicate"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <CopyIcon className="h-3.5 w-3.5" />
                          Same-Account Duplicates ({counts.duplicate})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="cross_account"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <LinkIcon className="h-3.5 w-3.5" />
                          Cross-Account Matches ({counts.cross_account})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="balance_gap"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <GitBranchIcon className="h-3.5 w-3.5" />
                          Balance Gaps ({counts.balance_gap})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${totalActiveCount > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              {totalActiveCount > 0 ? (
                <AlertTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Issues</p>
              <p className={`text-xl font-bold ${totalActiveCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {totalActiveCount}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.duplicate > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
              <CopyIcon className={`h-5 w-5 ${counts.duplicate > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Same-Account Duplicates</p>
              <p className={`text-xl font-bold ${counts.duplicate > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {counts.duplicate}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.cross_account > 0 ? 'bg-orange-500/10' : 'bg-muted'}`}>
              <LinkIcon className={`h-5 w-5 ${counts.cross_account > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cross-Account Matches</p>
              <p className={`text-xl font-bold ${counts.cross_account > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                {counts.cross_account}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.balance_gap > 0 ? 'bg-purple-500/10' : 'bg-muted'}`}>
              <GitBranchIcon className={`h-5 w-5 ${counts.balance_gap > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balance Gaps</p>
              <p className={`text-xl font-bold ${counts.balance_gap > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`}>
                {counts.balance_gap}
              </p>
            </div>
          </div>
        </section>
      </div>

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
                {selectedType === "all"
                  ? "All bank transactions look good"
                  : `No ${selectedType === "duplicate" ? "same-account duplicates" : selectedType === "cross_account" ? "cross-account matches" : "balance gaps"} found`}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="border-b border-border/40">
                    <tr>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                      <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Details</th>
                      <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inconsistencies.map((item, idx) => (
                      <tr
                        key={`${item.type}-${item.transaction_ids.join('-')}-${idx}`}
                        className={`border-b border-border/30 transition-colors hover:bg-muted/50 ${item.dismissed ? 'opacity-50' : ''}`}
                      >
                        <td className="p-4 align-middle">
                          {item.type === "duplicate" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400">
                              <CopyIcon className="h-3 w-3" />
                              Duplicate ({item.count})
                            </span>
                          ) : item.type === "cross_account" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-600 dark:text-orange-400">
                              <LinkIcon className="h-3 w-3" />
                              Cross-Account ({item.count})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-600 dark:text-purple-400">
                              <GitBranchIcon className="h-3 w-3" />
                              Balance Gap
                            </span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="p-4 align-middle text-sm whitespace-nowrap">
                          {item.type === "cross_account" && item.accounts ? (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <span className="cursor-default">
                                    {item.accounts.length} accounts
                                  </span>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                                    sideOffset={4}
                                  >
                                    {item.accounts.map((acc, i) => (
                                      <div key={i}>{acc.nickname}</div>
                                    ))}
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          ) : (
                            item.bank_account?.nickname || <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <span className="text-sm line-clamp-2 cursor-default">
                                  {item.narration}
                                </span>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-md"
                                  sideOffset={4}
                                >
                                  {item.narration}
                                  <br />
                                  <span className="text-muted-foreground text-xs">
                                    Transaction IDs: {item.transaction_ids.join(", ")}
                                  </span>
                                  <Tooltip.Arrow className="fill-card" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>
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
                        <td className="p-4 align-middle text-right whitespace-nowrap">
                          {item.type === "balance_gap" && item.gap !== undefined ? (
                            <span className={`font-medium ${item.gap > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                              Gap: {item.gap > 0 ? "+" : ""}<FormattedCurrency amount={item.gap} />
                            </span>
                          ) : item.balance !== undefined ? (
                            <span className="text-muted-foreground">
                              Bal: <FormattedCurrency amount={item.balance} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-center">
                          {item.dismissed ? (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    onClick={() => handleRestore(item)}
                                    className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                                  >
                                    <RotateCcwIcon className="h-4 w-4" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-2 py-1 rounded-md shadow-lg border border-border text-xs"
                                    sideOffset={4}
                                  >
                                    Restore
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          ) : (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    onClick={() => handleDismiss(item)}
                                    className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                                  >
                                    <XIcon className="h-4 w-4" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-2 py-1 rounded-md shadow-lg border border-border text-xs"
                                    sideOffset={4}
                                  >
                                    Dismiss as false positive
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          )}
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
    </>
  )
}

// Credit Card Inconsistencies Component
function CreditCardInconsistencies() {
  const { invalidate: invalidateInconsistencyCache } = useInconsistencyCache()
  const [inconsistencies, setInconsistencies] = useState<CreditCardInconsistency[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [counts, setCounts] = useState<{ duplicate: number; cross_card: number; missing_description: number }>({ duplicate: 0, cross_card: 0, missing_description: 0 })
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedCreditCard, setSelectedCreditCard] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState<string>("all")
  const [showDismissed, setShowDismissed] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Load credit cards for filter
  useEffect(() => {
    async function loadCreditCards() {
      try {
        const data = await fetchCreditCards()
        setCreditCards(data.cards)
      } catch (error) {
        console.error("Failed to load credit cards:", error)
      }
    }
    loadCreditCards()
  }, [])

  // Always fetch data on mount and when filters change
  useEffect(() => {
    async function loadInconsistencies() {
      setLoading(true)
      try {
        const result = await fetchCreditCardInconsistencies({
          credit_card: selectedCreditCard || undefined,
          include_dismissed: showDismissed,
        })
        setInconsistencies(result.data)
        setTotal(result.total)
        setCounts(result.counts)
      } catch (err) {
        console.error("Failed to load credit card inconsistencies:", err)
      } finally {
        setLoading(false)
      }
    }
    loadInconsistencies()
  }, [selectedCreditCard, showDismissed, refreshKey])

  // Filter by type
  const filteredInconsistencies = selectedType === "all"
    ? inconsistencies
    : inconsistencies.filter((i) => i.type === selectedType)

  // Group items by related_ids to show dismiss button once per group
  const seenGroups = new Set<string>()

  async function handleDismiss(item: CreditCardInconsistency) {
    try {
      await dismissCreditCardInconsistency(item.type, item.related_ids)
      invalidateInconsistencyCache()  // Count decreased
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to dismiss:", error)
    }
  }

  async function handleRestore(item: CreditCardInconsistency) {
    try {
      await restoreCreditCardInconsistency(item.type, item.related_ids)
      invalidateInconsistencyCache()  // Count increased
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to restore:", error)
    }
  }

  return (
    <>
      {/* Filter Section */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Credit Card Inconsistencies</h2>
            <div className="flex-1" />
            {/* Show Dismissed Toggle */}
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                showDismissed
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {showDismissed ? <EyeIcon className="h-4 w-4" /> : <EyeOffIcon className="h-4 w-4" />}
              {showDismissed ? "Showing Dismissed" : "Show Dismissed"}
            </button>
            {/* Type Filter */}
            <Select.Root
              value={selectedType}
              onValueChange={setSelectedType}
            >
              <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon className="h-4 w-4 text-muted-foreground" />
                  <Select.Value placeholder="All Types" />
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
                      <Select.ItemText>All Types</Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="duplicate"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <CopyIcon className="h-3.5 w-3.5" />
                          Same-Card Duplicates ({counts.duplicate})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="cross_card"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <LinkIcon className="h-3.5 w-3.5" />
                          Cross-Card Matches ({counts.cross_card})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                    <Select.Item
                      value="missing_description"
                      className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                    >
                      <Select.ItemText>
                        <span className="flex items-center gap-2">
                          <FileQuestionIcon className="h-3.5 w-3.5" />
                          Missing Description ({counts.missing_description})
                        </span>
                      </Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
            {/* Credit Card Filter */}
            {creditCards.length > 0 && (
              <Select.Root
                value={selectedCreditCard?.toString() || "all"}
                onValueChange={(value) => {
                  setSelectedCreditCard(value === "all" ? null : parseInt(value, 10))
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                    <Select.Value placeholder="All Cards" />
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
                        <Select.ItemText>All Cards</Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      {creditCards.map((card) => (
                        <Select.Item
                          key={card.id}
                          value={card.id.toString()}
                          className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                        >
                          <Select.ItemText>
                            <span className="font-medium">{card.nickname}</span>
                            {card.issuer && (
                              <span className="text-muted-foreground ml-1">
                                ({card.issuer})
                              </span>
                            )}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${total > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
              {total > 0 ? (
                <AlertTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Issues</p>
              <p className={`text-xl font-bold ${total > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                {total}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.duplicate > 0 ? 'bg-red-500/10' : 'bg-muted'}`}>
              <CopyIcon className={`h-5 w-5 ${counts.duplicate > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Same-Card Duplicates</p>
              <p className={`text-xl font-bold ${counts.duplicate > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {counts.duplicate}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.cross_card > 0 ? 'bg-orange-500/10' : 'bg-muted'}`}>
              <LinkIcon className={`h-5 w-5 ${counts.cross_card > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cross-Card Matches</p>
              <p className={`text-xl font-bold ${counts.cross_card > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}`}>
                {counts.cross_card}
              </p>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${counts.missing_description > 0 ? 'bg-purple-500/10' : 'bg-muted'}`}>
              <FileQuestionIcon className={`h-5 w-5 ${counts.missing_description > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Missing Description</p>
              <p className={`text-xl font-bold ${counts.missing_description > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`}>
                {counts.missing_description}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Inconsistencies Table */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredInconsistencies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">No inconsistencies found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedType === "all"
                  ? "All credit card transactions look good"
                  : `No ${selectedType === "duplicate" ? "same-card duplicates" : selectedType === "cross_card" ? "cross-card matches" : "missing descriptions"} found`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b border-border/40">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Type</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Card</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                    <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInconsistencies.map((item) => {
                    const groupKey = `${item.type}-${item.related_ids.sort().join(",")}`
                    const isFirstInGroup = !seenGroups.has(groupKey)
                    if (isFirstInGroup) seenGroups.add(groupKey)

                    return (
                      <tr
                        key={`${item.type}-${item.id}`}
                        className={`border-b border-border/30 transition-colors hover:bg-muted/50 ${item.dismissed ? 'opacity-50' : ''}`}
                      >
                        <td className="p-4 align-middle">
                          {item.type === "duplicate" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400">
                              <CopyIcon className="h-3 w-3" />
                              Duplicate
                            </span>
                          ) : item.type === "cross_card" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/20 text-orange-600 dark:text-orange-400">
                              <LinkIcon className="h-3 w-3" />
                              Cross-Card
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-600 dark:text-purple-400">
                              <FileQuestionIcon className="h-3 w-3" />
                              Missing Desc
                            </span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(item.date)}
                        </td>
                        <td className="p-4 align-middle text-sm whitespace-nowrap">
                          {item.credit_card?.nickname || <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="p-4 align-middle">
                          {item.description ? (
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <span className="text-sm line-clamp-2 cursor-default">
                                    {item.description}
                                  </span>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-md"
                                    sideOffset={4}
                                  >
                                    {item.description}
                                    <br />
                                    <span className="text-muted-foreground text-xs">
                                      Related IDs: {item.related_ids.join(", ")}
                                    </span>
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          ) : (
                            <span className="text-muted-foreground/50 italic">No description</span>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-4 align-middle text-right whitespace-nowrap">
                          {item.amount > 0 ? (
                            <span className="text-red-700 dark:text-red-400 font-medium flex items-center justify-end gap-1">
                              <FormattedCurrency amount={item.amount} />
                              <ArrowDownIcon className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-green-700 dark:text-green-400 font-medium flex items-center justify-end gap-1">
                              <FormattedCurrency amount={Math.abs(item.amount)} />
                              <ArrowUpIcon className="h-3 w-3" />
                            </span>
                          )}
                        </td>
                        <td className="p-4 align-middle text-center">
                          {isFirstInGroup && (
                            item.dismissed ? (
                              <Tooltip.Provider>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <button
                                      onClick={() => handleRestore(item)}
                                      className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                                    >
                                      <RotateCcwIcon className="h-4 w-4" />
                                    </button>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="bg-card text-card-foreground px-2 py-1 rounded-md shadow-lg border border-border text-xs"
                                      sideOffset={4}
                                    >
                                      Restore
                                      <Tooltip.Arrow className="fill-card" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            ) : (
                              <Tooltip.Provider>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <button
                                      onClick={() => handleDismiss(item)}
                                      className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                                    >
                                      <XIcon className="h-4 w-4" />
                                    </button>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="bg-card text-card-foreground px-2 py-1 rounded-md shadow-lg border border-border text-xs"
                                      sideOffset={4}
                                    >
                                      Dismiss as false positive
                                      <Tooltip.Arrow className="fill-card" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            )
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export function AnomaliesPage() {
  const [activeTab, setActiveTab] = useState<InconsistenciesTab>("bank")

  useEffect(() => {
    document.title = "Anomalies | FinAccs"
  }, [])

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("bank")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "bank"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <BuildingIcon className="h-4 w-4" />
            Bank Accounts
          </button>
          <button
            onClick={() => setActiveTab("credit")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "credit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCardIcon className="h-4 w-4" />
            Credit Cards
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "bank" && <BankAccountInconsistencies />}
        {activeTab === "credit" && <CreditCardInconsistencies />}
      </main>
      <Footer />
    </div>
  )
}
