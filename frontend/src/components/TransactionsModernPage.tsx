import { useEffect, useState, useRef, useCallback } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  SearchIcon,
  FilterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronDownIcon,
  CheckIcon,
  BuildingIcon,
  FileIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ActivityIcon,
  Link2Icon,
  Link2OffIcon,
  XIcon,
  CalendarIcon,
  CreditCardIcon,
  LandmarkIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Popover from "@radix-ui/react-popover"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  fetchTransactions,
  fetchCategories,
  fetchBankAccounts,
  fetchDateRange,
  updateTransactionCategory,
  fetchPotentialLinks,
  linkTransaction,
  unlinkTransaction,
  deleteCCPaymentMatch,
  type Transaction,
  type CategoryData,
  type BankAccount,
  type ExtractedCSV,
  type TransactionStats,
  type PotentialLinkTransaction,
  type DateRange,
  type DateRangeFilters,
} from "@/lib/api"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

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

function CategorySelectContent({
  categories,
  currentValue,
  onSelect,
  onClose,
}: {
  categories: CategoryData[]
  currentValue: string
  onSelect: (value: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState("")
  const displayValue = currentValue || "Uncategorized"

  const handleSelect = (value: string) => {
    onSelect(value)
    onClose()
  }

  const filteredCategories = categories
    .filter((cat) => cat.category !== "Uncategorized")
    .filter((cat) => !search || cat.category.toLowerCase().includes(search.toLowerCase()))

  const showUncategorized = !search || "uncategorized".includes(search.toLowerCase())

  return (
    <div className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden min-w-[200px]">
      <div className="p-2 border-b border-border">
        <input
          type="text"
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>
      <div className="p-1 max-h-48 overflow-y-auto">
        {showUncategorized && (
          <button
            onClick={() => handleSelect("Uncategorized")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer text-sm text-left ${
              displayValue === "Uncategorized" ? "bg-accent" : ""
            }`}
          >
            <span>Uncategorized</span>
            {displayValue === "Uncategorized" && <CheckIcon className="h-4 w-4" />}
          </button>
        )}
        {filteredCategories.map((cat) => (
          <button
            key={cat.category}
            onClick={() => handleSelect(cat.category)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer text-sm text-left ${
              displayValue === cat.category ? "bg-accent" : ""
            }`}
          >
            <span>{cat.category}</span>
            {displayValue === cat.category && <CheckIcon className="h-4 w-4" />}
          </button>
        ))}
        {!showUncategorized && filteredCategories.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted-foreground">No categories found</div>
        )}
      </div>
    </div>
  )
}

function CategorySelect({
  value,
  categories,
  onValueChange,
  disabled,
}: {
  value: string
  categories: CategoryData[]
  onValueChange: (value: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const displayValue = value || "Uncategorized"

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 max-w-[110px]"
          disabled={disabled}
        >
          <span className="truncate">{displayValue}</span>
          {disabled ? (
            <div className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start" className="z-50">
          <CategorySelectContent
            categories={categories}
            currentValue={value}
            onSelect={onValueChange}
            onClose={() => setOpen(false)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function LinkDialog({
  transaction,
  onLink,
  onUnlink,
}: {
  transaction: Transaction
  onLink: (linkToId: number) => void
  onUnlink: () => void
}) {
  const [open, setOpen] = useState(false)
  const [potentialLinks, setPotentialLinks] = useState<PotentialLinkTransaction[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<number | null>(null)

  const isLinked = !!transaction.linked_transaction

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && !isLinked) {
      setLoading(true)
      try {
        const result = await fetchPotentialLinks(transaction.id)
        setPotentialLinks(result.data)
      } catch (error) {
        console.error("Failed to fetch potential links:", error)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleLink = async (linkToId: number) => {
    setLinking(linkToId)
    try {
      await onLink(linkToId)
      setOpen(false)
    } finally {
      setLinking(null)
    }
  }

  const handleUnlink = async () => {
    setLinking(-1)
    try {
      await onUnlink()
      setOpen(false)
    } finally {
      setLinking(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Dialog.Trigger asChild>
              <button
                className={`p-1 rounded transition-colors ${
                  isLinked
                    ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {isLinked ? (
                  <Link2Icon className="h-4 w-4" />
                ) : (
                  <Link2OffIcon className="h-4 w-4" />
                )}
              </button>
            </Dialog.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-card text-card-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm"
              sideOffset={4}
            >
              {isLinked
                ? `Linked to ${transaction.linked_transaction?.bank_account} on ${formatDate(transaction.linked_transaction?.date || "")}`
                : "Find matching transaction"}
              <Tooltip.Arrow className="fill-card" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95 z-50">
          <div className="p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold">
              {isLinked ? "Linked Transaction" : "Link Transaction"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1">
              {isLinked
                ? "This transaction is linked to a corresponding transaction."
                : "Find matching transactions from other accounts (same amount, within 7 days)."}
            </Dialog.Description>
          </div>

          <div className="p-6">
            {/* Current transaction info */}
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Current Transaction</p>
              <p className="font-medium">{formatDate(transaction.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{transaction.narration}</p>
              <p className="text-sm flex items-center gap-1 flex-wrap">
                {transaction.bank_account?.nickname} •{" "}
                <span className={`inline-flex items-center gap-0.5 ${transaction.debit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  <FormattedCurrency amount={transaction.debit > 0 ? transaction.debit : transaction.credit} />
                  {transaction.debit > 0 ? <ArrowDownIcon className="h-3 w-3" /> : <ArrowUpIcon className="h-3 w-3" />}
                </span>
                {transaction.category && (
                  <span className="ml-2 text-muted-foreground">• {transaction.category}</span>
                )}
              </p>
            </div>

            {isLinked ? (
              /* Show linked transaction */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-muted-foreground mb-1">Linked To</p>
                  <p className="font-medium">{formatDate(transaction.linked_transaction?.date || "")}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-1">{transaction.linked_transaction?.narration}</p>
                  <p className="text-sm flex items-center gap-1">
                    {transaction.linked_transaction?.bank_account} •{" "}
                    <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
                      <FormattedCurrency amount={transaction.linked_transaction?.amount || 0} />
                      <ArrowUpIcon className="h-3 w-3" />
                    </span>
                  </p>
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={linking !== null}
                  className="w-full py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                >
                  {linking === -1 ? "Unlinking..." : "Unlink Transaction"}
                </button>
              </div>
            ) : (
              /* Show potential matches */
              <div>
                <p className="text-sm font-medium mb-2">Potential Matches (same amount, ±7 days)</p>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : potentialLinks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link2OffIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No matching transactions found</p>
                    <p className="text-sm mt-1">
                      No transactions with matching amount in other accounts within 7 days
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {potentialLinks.map((t) => (
                      <div
                        key={t.id}
                        className="p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{formatDate(t.date)}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">{t.narration}</p>
                            <p className="text-sm flex items-center gap-1 flex-wrap">
                              {t.bank_account?.nickname} •{" "}
                              <span className={`inline-flex items-center gap-0.5 ${t.debit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                <FormattedCurrency amount={t.debit > 0 ? t.debit : t.credit} />
                                {t.debit > 0 ? <ArrowDownIcon className="h-3 w-3" /> : <ArrowUpIcon className="h-3 w-3" />}
                              </span>
                              {t.category && (
                                <span className="ml-2 text-muted-foreground">• {t.category}</span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => handleLink(t.id)}
                            disabled={linking !== null}
                            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {linking === t.id ? "..." : "Link"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CCPaymentLinkDialog({
  transaction,
  onUnlink,
}: {
  transaction: Transaction
  onUnlink: () => void
}) {
  const [open, setOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const isLinked = !!transaction.cc_payment_match

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await onUnlink()
      setOpen(false)
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Dialog.Trigger asChild>
              <button
                className={`p-1 rounded transition-colors ${
                  isLinked
                    ? "text-green-600 dark:text-green-400 hover:bg-green-500/10"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {isLinked ? (
                  <Link2Icon className="h-4 w-4" />
                ) : (
                  <Link2OffIcon className="h-4 w-4" />
                )}
              </button>
            </Dialog.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-card text-card-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm"
              sideOffset={4}
            >
              {isLinked
                ? `Linked to ${transaction.cc_payment_match?.credit_card_transaction.credit_card?.nickname || "CC"} on ${formatDate(transaction.cc_payment_match?.credit_card_transaction.date || "")}`
                : "No CC payment linked"}
              <Tooltip.Arrow className="fill-card" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95 z-50">
          <div className="p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold">
              {isLinked ? "Linked Credit Card Payment" : "CC Payment Link"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1">
              {isLinked
                ? "This bank payment is linked to a credit card payment."
                : "This transaction is not linked to any credit card payment."}
            </Dialog.Description>
          </div>

          <div className="p-6">
            {/* Current transaction info */}
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Bank Transaction</p>
              <p className="font-medium">{formatDate(transaction.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{transaction.narration}</p>
              <p className="text-sm flex items-center gap-1 flex-wrap">
                {transaction.bank_account?.nickname} •{" "}
                <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
                  <FormattedCurrency amount={transaction.debit} />
                  <ArrowDownIcon className="h-3 w-3" />
                </span>
              </p>
            </div>

            {isLinked ? (
              /* Show linked CC transaction */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-muted-foreground mb-1">Linked Credit Card Payment</p>
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {transaction.cc_payment_match?.credit_card_transaction.credit_card?.nickname || "Unknown Card"}
                    </span>
                  </div>
                  <p className="font-medium">{formatDate(transaction.cc_payment_match?.credit_card_transaction.date || "")}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-1">
                    {transaction.cc_payment_match?.credit_card_transaction.description}
                  </p>
                  <p className="text-sm flex items-center gap-1">
                    <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
                      <FormattedCurrency amount={Math.abs(transaction.cc_payment_match?.credit_card_transaction.amount || 0)} />
                      <ArrowUpIcon className="h-3 w-3" />
                    </span>
                  </p>
                  {transaction.cc_payment_match && transaction.cc_payment_match.offset !== 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Offset: {transaction.cc_payment_match.offset > 0 ? "+" : ""}
                      {formatCurrency(transaction.cc_payment_match.offset)}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="w-full py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                >
                  {unlinking ? "Unlinking..." : "Unlink CC Payment"}
                </button>
              </div>
            ) : (
              /* No link */
              <div className="text-center py-8 text-muted-foreground">
                <Link2OffIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No credit card payment linked</p>
                <p className="text-sm mt-1">
                  Go to the Story page to match this payment
                </p>
              </div>
            )}
          </div>

          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  paginationRef,
  className = "",
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  paginationRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}) {
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0
  const endItem = Math.min(page * pageSize, total)

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <p className="text-sm text-muted-foreground">
        {startItem}-{endItem} of {total}
      </p>
      {totalPages > 1 && (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          <ChevronsLeftIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div
          ref={paginationRef}
          className="flex items-center gap-1 max-w-[300px] overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              data-active={page === p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                page === p
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          <ChevronsRightIcon className="h-4 w-4" />
        </button>
      </div>
      )}
    </div>
  )
}

export function TransactionsModernPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Helper to get initial values from URL
  const getInitialYear = () => {
    const year = searchParams.get('year')
    return year ? parseInt(year, 10) : null
  }
  const getInitialMonth = () => {
    const month = searchParams.get('month')
    return month ? parseInt(month, 10) : null
  }

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [extractedCSVs, setExtractedCSVs] = useState<ExtractedCSV[]>([])
  const [stats, setStats] = useState<TransactionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Date range state - initialize from URL
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [fullDateRange, setFullDateRange] = useState<DateRange | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(getInitialYear)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(getInitialMonth)

  // Filters - initialize from URL
  const [search, setSearch] = useState(searchParams.get('search') || "")
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || "")
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get('category') || "")
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') || "")
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(() => {
    const val = searchParams.get('bank_account')
    return val ? parseInt(val, 10) : null
  })
  const [selectedSourceFile, setSelectedSourceFile] = useState<number | null>(() => {
    const val = searchParams.get('source_file')
    return val ? parseInt(val, 10) : null
  })
  const [page, setPageState] = useState(() => {
    const val = searchParams.get('page')
    return val ? parseInt(val, 10) : 1
  })
  const pageSize = 50
  const paginationRef = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const tableSectionRef = useRef<HTMLElement>(null)
  const prevPageRowRef = useRef<HTMLTableRowElement>(null)
  const [lockedHeight, setLockedHeight] = useState<number | null>(null)
  const isPageChangeRef = useRef(false)
  const shouldScrollToTableRef = useRef(false)

  // Auto-scroll preference (synced with Header via custom event)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = localStorage.getItem('autoScrollToTable')
    return saved !== null ? saved === 'true' : true // default enabled
  })

  // Cache scroll positions for last 3 pages (page number -> scroll position)
  const scrollCacheRef = useRef<Map<number, number>>(new Map())
  const targetPageRef = useRef<number | null>(null)
  const currentPageRef = useRef<number>(page)

  // Wrapper to preserve scroll position when changing pages
  const setPage = useCallback((newPage: number | ((prev: number) => number)) => {
    const resolvedNewPage = typeof newPage === 'function' ? newPage(currentPageRef.current) : newPage

    // Save current page's scroll position before leaving
    const currentScroll = tableContainerRef.current?.scrollTop ?? 0
    scrollCacheRef.current.set(currentPageRef.current, currentScroll)

    // Limit cache to 3 entries (remove oldest if needed)
    if (scrollCacheRef.current.size > 3) {
      const firstKey = scrollCacheRef.current.keys().next().value
      if (firstKey !== undefined) {
        scrollCacheRef.current.delete(firstKey)
      }
    }

    // Mark target page to restore scroll after load
    targetPageRef.current = resolvedNewPage

    // Save the current table height to prevent layout shift
    if (tableContainerRef.current) {
      setLockedHeight(tableContainerRef.current.offsetHeight)
    }
    isPageChangeRef.current = true
    currentPageRef.current = resolvedNewPage
    setPageState(resolvedNewPage)
  }, [])

  // Update URL when filters change
  const updateURL = useCallback((updates: Record<string, string | number | null>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || (key === 'page' && value === 1)) {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      })
      return newParams
    }, { replace: true, preventScrollReset: true })
  }, [setSearchParams])

  useEffect(() => {
    document.title = "Transactions | FinAccs"
    window.scrollTo(0, 0)
  }, [])

  // Listen for auto-scroll changes from Header
  useEffect(() => {
    const handleAutoScrollChange = (e: CustomEvent<boolean>) => {
      setAutoScrollEnabled(e.detail)
    }
    window.addEventListener('autoScrollChange', handleAutoScrollChange as EventListener)
    return () => window.removeEventListener('autoScrollChange', handleAutoScrollChange as EventListener)
  }, [])

  // Sync state to URL
  useEffect(() => {
    updateURL({
      year: selectedYear,
      month: selectedMonth,
      search: debouncedSearch || null,
      category: selectedCategory || null,
      type: selectedType || null,
      bank_account: selectedBankAccount,
      source_file: selectedSourceFile,
      page: page,
    })
  }, [selectedYear, selectedMonth, debouncedSearch, selectedCategory, selectedType, selectedBankAccount, selectedSourceFile, page, updateURL])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Load full date range once (unfiltered) for year tabs
  useEffect(() => {
    async function loadFullDateRange() {
      try {
        const data = await fetchDateRange()
        setFullDateRange(data)
      } catch (error) {
        console.error("Failed to load full date range:", error)
      }
    }
    loadFullDateRange()
  }, [])

  // Load date range (re-fetch when filters change)
  useEffect(() => {
    async function loadDateRange() {
      try {
        const filters: DateRangeFilters = {}
        if (selectedBankAccount) filters.bank_account = selectedBankAccount
        if (selectedCategory) filters.category = selectedCategory
        if (selectedType) filters.type = selectedType
        if (selectedSourceFile) filters.source_file = selectedSourceFile
        if (debouncedSearch) filters.search = debouncedSearch

        const data = await fetchDateRange(filters)
        setDateRange(data)

        const years = Object.keys(data.years).map(Number).sort((a, b) => b - a)

        // Auto-select most recent year and month on initial load
        if (selectedYear === null && years.length > 0) {
          const latestYear = years[0]
          setSelectedYear(latestYear)
          const months = data.years[latestYear.toString()]
          if (months && months.length > 0) {
            setSelectedMonth(months[months.length - 1])
          }
        }
        // If current year is no longer available, select the most recent available year
        else if (selectedYear !== null && !years.includes(selectedYear) && years.length > 0) {
          const latestYear = years[0]
          setSelectedYear(latestYear)
          const months = data.years[latestYear.toString()]
          if (months && months.length > 0) {
            setSelectedMonth(months[months.length - 1])
          } else {
            setSelectedMonth(null)
          }
        }
        // If current month is no longer available in the selected year, select the most recent month
        else if (selectedYear !== null && selectedMonth !== null) {
          const months = data.years[selectedYear.toString()] || []
          if (!months.includes(selectedMonth) && months.length > 0) {
            setSelectedMonth(months[months.length - 1])
          } else if (months.length === 0) {
            setSelectedMonth(null)
          }
        }
      } catch (error) {
        console.error("Failed to load date range:", error)
      }
    }
    loadDateRange()
  }, [selectedBankAccount, selectedCategory, selectedType, selectedSourceFile, debouncedSearch])

  // Scroll pagination slider to show current page
  useEffect(() => {
    setTimeout(() => {
      const container = paginationRef.current
      const activeBtn = container?.querySelector('[data-active="true"]') as HTMLElement
      if (container && activeBtn) {
        const containerRect = container.getBoundingClientRect()
        const btnRect = activeBtn.getBoundingClientRect()
        const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (containerRect.width / 2) + (btnRect.width / 2)
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
      }
    }, 50)
  }, [page, total])

  const handleCategoryChange = async (transactionId: number, newCategory: string) => {
    setUpdatingId(transactionId)
    try {
      await updateTransactionCategory(transactionId, newCategory)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to update category:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleLink = async (transactionId: number, linkToId: number) => {
    try {
      await linkTransaction(transactionId, linkToId)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to link transaction:", error)
    }
  }

  const handleUnlink = async (transactionId: number) => {
    try {
      await unlinkTransaction(transactionId)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to unlink transaction:", error)
    }
  }

  const handleUnlinkCCPayment = async (matchId: number) => {
    try {
      await deleteCCPaymentMatch(matchId)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to unlink CC payment:", error)
    }
  }

  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await fetchCategories({ include_all: true })
        setCategories(data.data)
      } catch (error) {
        console.error("Failed to load categories:", error)
      }
    }
    loadCategories()
  }, [])

  useEffect(() => {
    async function loadBankAccounts() {
      try {
        const data = await fetchBankAccounts()
        setBankAccounts(data.accounts)
        setExtractedCSVs(data.extracted_csvs)
      } catch (error) {
        console.error("Failed to load bank accounts:", error)
      }
    }
    loadBankAccounts()
  }, [])

  useEffect(() => {
    async function loadTransactions() {
      if (!selectedYear || !selectedMonth) {
        setLoading(false)
        return
      }

      // Only show loading spinner if not a page change (to prevent layout shift)
      const isPageChange = isPageChangeRef.current
      if (!isPageChange) {
        setLoading(true)
      }

      try {
        const data = await fetchTransactions({
          category: selectedCategory || undefined,
          type: selectedType || undefined,
          bank_account: selectedBankAccount || undefined,
          source_file: selectedSourceFile || undefined,
          year: selectedYear,
          month: selectedMonth,
          search: debouncedSearch || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        setTransactions(data.data)
        setTotal(data.total)
        setStats(data.stats)
      } catch (error) {
        console.error("Failed to load transactions:", error)
      } finally {
        setLoading(false)
        // Clear the height lock and page change flag after data loads
        const wasPageChange = isPageChangeRef.current
        isPageChangeRef.current = false
        setLockedHeight(null)

        // Clear scroll cache when month/year changed
        if (shouldScrollToTableRef.current) {
          shouldScrollToTableRef.current = false
          scrollCacheRef.current.clear()
          if (autoScrollEnabled && tableSectionRef.current) {
            requestAnimationFrame(() => {
              const headerOffset = 56 + 16 // header height (h-14 = 56px) + margin
              const elementPosition = tableSectionRef.current!.getBoundingClientRect().top
              const offsetPosition = elementPosition + window.scrollY - headerOffset
              window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
            })
          }
        } else if (wasPageChange) {
          // Scroll table container past the "Previous page" row so first transaction is at top
          targetPageRef.current = null
          requestAnimationFrame(() => {
            if (tableContainerRef.current && prevPageRowRef.current) {
              const rowHeight = prevPageRowRef.current.offsetHeight
              tableContainerRef.current.scrollTo(0, rowHeight)
            } else if (tableContainerRef.current) {
              tableContainerRef.current.scrollTo(0, 0)
            }
          })
        }
      }
    }
    loadTransactions()
  }, [selectedCategory, selectedType, selectedBankAccount, selectedSourceFile, selectedYear, selectedMonth, debouncedSearch, page, refreshKey])

  // Filter extracted CSVs by selected bank account
  const filteredExtractedCSVs = selectedBankAccount
    ? extractedCSVs.filter((csv) => csv.bank_account_id === selectedBankAccount)
    : extractedCSVs

  const totalPages = Math.ceil(total / pageSize)

  // Get available years and months
  const availableYears = dateRange ? Object.keys(dateRange.years).map(Number).sort((a, b) => b - a) : []
  const availableMonths = selectedYear && dateRange ? (dateRange.years[selectedYear.toString()] || []) : []

  // Generate all years in range (from full/unfiltered date range)
  const fullYears = fullDateRange ? Object.keys(fullDateRange.years).map(Number).sort((a, b) => b - a) : []
  const allYearsInRange = fullYears.length > 0
    ? Array.from(
        { length: fullYears[0] - fullYears[fullYears.length - 1] + 1 },
        (_, i) => fullYears[0] - i
      )
    : []

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    // Reset to first available month in that year
    if (dateRange) {
      const months = dateRange.years[year.toString()]
      if (months && months.length > 0) {
        setSelectedMonth(months[months.length - 1])
      } else {
        setSelectedMonth(null)
      }
    }
    setPageState(1)
    shouldScrollToTableRef.current = true
  }

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month)
    setPageState(1)
    shouldScrollToTableRef.current = true
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <LandmarkIcon className="h-6 w-6 text-primary" />
              </div>
              Transactions
            </h1>
            <p className="text-muted-foreground mt-1">
              Bank account transactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Domain toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                className="px-3 py-1.5 text-sm rounded-md transition-colors bg-background text-foreground shadow-sm"
              >
                Bank Account
              </button>
              <button
                onClick={() => navigate('/credit-cards')}
                className="px-3 py-1.5 text-sm rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                Credit Card
              </button>
            </div>
          </div>
        </header>

        {/* Year Tabs */}
        <section className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Year</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allYearsInRange.map((year) => {
              const hasData = availableYears.includes(year)
              const isSelected = selectedYear === year

              return (
                <button
                  key={year}
                  onClick={() => hasData && handleYearChange(year)}
                  disabled={!hasData}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : hasData
                      ? "bg-card border border-border hover:bg-accent"
                      : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  {year}
                </button>
              )
            })}
          </div>
        </section>

        {/* Month Tabs */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Month</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...MONTH_NAMES].reverse().map((name, index) => {
              const monthNum = 12 - index
              const hasData = availableMonths.includes(monthNum)
              const isSelected = selectedMonth === monthNum

              return (
                <button
                  key={monthNum}
                  onClick={() => hasData && handleMonthChange(monthNum)}
                  disabled={!hasData}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : hasData
                      ? "bg-card border border-border hover:bg-accent"
                      : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <FilterIcon className="h-4 w-4 text-muted-foreground" />
                <Select.Root
                  value={selectedCategory}
                  onValueChange={(value) => {
                    setSelectedCategory(value === "all" ? "" : value)
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]">
                    <Select.Value placeholder="All Categories" />
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
                          <Select.ItemText>All Categories</Select.ItemText>
                          <Select.ItemIndicator>
                            <CheckIcon className="h-4 w-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                        {categories.map((cat) => (
                          <Select.Item
                            key={cat.category}
                            value={cat.category}
                            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                          >
                            <Select.ItemText>{cat.category}</Select.ItemText>
                            <Select.ItemIndicator>
                              <CheckIcon className="h-4 w-4" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              {/* Type Filter */}
              <Select.Root
                value={selectedType || "all"}
                onValueChange={(value) => {
                  setSelectedType(value === "all" ? "" : value)
                  setPage(1)
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[140px]">
                  <Select.Value placeholder="All Types" />
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
                        value="credit"
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                      >
                        <Select.ItemText>Income Only</Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      <Select.Item
                        value="debit"
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                      >
                        <Select.ItemText>Expenses Only</Select.ItemText>
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
                    const newBankAccount = value === "all" ? null : parseInt(value, 10)
                    setSelectedBankAccount(newBankAccount)
                    if (selectedSourceFile && newBankAccount) {
                      const csv = extractedCSVs.find((csv) => csv.source_file_id === selectedSourceFile)
                      if (csv && csv.bank_account_id !== newBankAccount) {
                        setSelectedSourceFile(null)
                      }
                    }
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]">
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

              {/* Source File Filter */}
              {filteredExtractedCSVs.length > 0 && (
                <Select.Root
                  value={selectedSourceFile?.toString() || "all"}
                  onValueChange={(value) => {
                    setSelectedSourceFile(value === "all" ? null : parseInt(value, 10))
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                      <Select.Value placeholder="All Sources" />
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
                          <Select.ItemText>All Sources</Select.ItemText>
                          <Select.ItemIndicator>
                            <CheckIcon className="h-4 w-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                        {filteredExtractedCSVs.map((csv) => (
                          <Select.Item
                            key={csv.id}
                            value={csv.source_file_id.toString()}
                            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                          >
                            <Select.ItemText>{csv.source_filename}</Select.ItemText>
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

        {/* Aggregate Stats */}
        {stats && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl border border-border bg-card shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUpIcon className="h-5 w-5 text-(--color-income)" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Credits</p>
                  <FormattedCurrency amount={stats.total_credits} className="text-xl font-bold text-(--color-income)" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDownIcon className="h-5 w-5 text-(--color-expense)" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Debits</p>
                  <FormattedCurrency amount={stats.total_debits} className="text-xl font-bold text-(--color-expense)" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ActivityIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Flow</p>
                  <p className={`text-xl font-bold inline-flex items-center gap-1 ${
                    stats.net_flow >= 0
                      ? "text-(--color-income)"
                      : "text-(--color-expense)"
                  }`}>
                    <FormattedCurrency amount={Math.abs(stats.net_flow)} />
                    {stats.net_flow >= 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Transactions Table */}
        <section ref={tableSectionRef} className="rounded-xl border border-border bg-card shadow-sm">
          <header className="p-6 pb-2">
            <h3 className="font-semibold">
              Transactions
              {selectedYear && selectedMonth && (
                <span className="text-muted-foreground font-normal ml-2">
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </span>
              )}
            </h3>
          </header>
          <div className="p-6 pt-0">
            {loading && selectedYear && selectedMonth ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !selectedYear || !selectedMonth ? (
              <div className="text-center py-12 text-muted-foreground">
                <ActivityIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{availableYears.length === 0 ? "No transactions found" : "Select a year and month to view transactions"}</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ActivityIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transactions found for this period</p>
              </div>
            ) : (
              <>
                {/* Top Pagination */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  className="mb-4 pb-4 border-b border-border/50"
                />

                <div
                  ref={tableContainerRef}
                  className="max-h-[60vh] overflow-y-auto"
                  style={lockedHeight ? { minHeight: lockedHeight } : undefined}
                >
                  <table className="w-full caption-bottom text-sm table-fixed">
                    <thead className="border-b border-border/40 sticky top-0 bg-card z-10 shadow-sm">
                      <tr>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[110px]">Date</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[280px]">Description</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">Account</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[130px]">Source</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[130px]">Category</th>
                        <th className="h-12 px-3 text-center align-middle font-medium text-muted-foreground w-[55px]">Link</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[120px]">Amount</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[120px]">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page > 1 && (
                        <tr ref={prevPageRowRef} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td colSpan={8} className="px-4 py-3 align-middle text-center">
                            <button
                              onClick={() => setPage(page - 1)}
                              className="text-sm text-muted-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted"
                            >
                              <ChevronLeftIcon className="h-4 w-4" />
                              <span>Previous page</span>
                            </button>
                          </td>
                        </tr>
                      )}
                      {transactions.map((t) => (
                        <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-muted/50">
                          <td className="px-4 py-3 align-middle text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(t.date)}
                          </td>
                          <td className="px-4 py-3 align-middle overflow-hidden">
                            <Tooltip.Provider>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <span className="text-sm truncate block cursor-default">
                                    {t.narration}
                                  </span>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-md z-50"
                                    sideOffset={4}
                                  >
                                    {t.narration}
                                    <Tooltip.Arrow className="fill-card" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          </td>
                          <td className="px-4 py-3 align-middle overflow-hidden">
                            {t.bank_account ? (
                              <span className="text-sm text-muted-foreground truncate block">
                                {t.bank_account.nickname}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground/50">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle overflow-hidden">
                            {t.source_file ? (
                              <Tooltip.Provider>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <span className="text-sm text-muted-foreground truncate block cursor-default">
                                      {t.source_file.filename}
                                    </span>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm z-50"
                                      sideOffset={4}
                                    >
                                      {t.source_file.filename}
                                      <Tooltip.Arrow className="fill-card" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            ) : (
                              <span className="text-sm text-muted-foreground/50">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <CategorySelect
                              value={t.category}
                              categories={categories}
                              onValueChange={(value) => handleCategoryChange(t.id, value)}
                              disabled={updatingId === t.id}
                            />
                          </td>
                          <td className="px-3 py-3 align-middle text-center">
                            {t.category === "Self Transfer" ? (
                              <LinkDialog
                                transaction={t}
                                onLink={(linkToId) => handleLink(t.id, linkToId)}
                                onUnlink={() => handleUnlink(t.id)}
                              />
                            ) : t.category === "Credit Card Payment" ? (
                              <CCPaymentLinkDialog
                                transaction={t}
                                onUnlink={() => t.cc_payment_match && handleUnlinkCCPayment(t.cc_payment_match.id)}
                              />
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground/40 text-xs">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-right">
                            {t.credit > 0 ? (
                              <span className="text-(--color-income) font-medium flex items-center justify-end gap-1">
                                <FormattedCurrency amount={t.credit} />
                                <ArrowUpIcon className="h-3 w-3 flex-shrink-0" />
                              </span>
                            ) : (
                              <span className="text-(--color-expense) font-medium flex items-center justify-end gap-1">
                                <FormattedCurrency amount={t.debit} />
                                <ArrowDownIcon className="h-3 w-3 flex-shrink-0" />
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-right text-sm">
                            <FormattedCurrency amount={t.balance} />
                          </td>
                        </tr>
                      ))}
                      {page < totalPages && (
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td colSpan={8} className="px-4 py-3 align-middle text-center">
                            <button
                              onClick={() => setPage(page + 1)}
                              className="text-sm text-muted-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted"
                            >
                              <span>Next page</span>
                              <ChevronRightIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Pagination */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  paginationRef={paginationRef}
                  className="pt-4 border-t border-border/50"
                />
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
