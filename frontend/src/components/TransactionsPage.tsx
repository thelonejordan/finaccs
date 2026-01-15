import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowLeftIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  SearchIcon,
  FilterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  MenuIcon,
  ChevronDownIcon,
  CheckIcon,
  BuildingIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ActivityIcon,
  Link2Icon,
  Link2OffIcon,
  XIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Select from "@radix-ui/react-select"
import * as Popover from "@radix-ui/react-popover"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import { useTheme } from "@/lib/theme"
import {
  fetchTransactions,
  fetchCategories,
  fetchBankAccounts,
  updateTransactionCategory,
  fetchPotentialLinks,
  linkTransaction,
  unlinkTransaction,
  type Transaction,
  type CategoryData,
  type BankAccount,
  type TransactionStats,
  type PotentialLinkTransaction,
} from "@/lib/api"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount)
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
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground whitespace-nowrap hover:bg-secondary/80 transition-colors disabled:opacity-50"
          disabled={disabled}
        >
          {displayValue}
          {disabled ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start">
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
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95">
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
              <p className="text-sm">
                {transaction.bank_account?.nickname} •{" "}
                <span className={transaction.debit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
                  {transaction.debit > 0 ? `-${formatCurrency(transaction.debit)}` : `+${formatCurrency(transaction.credit)}`}
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
                  <p className="text-sm">
                    {transaction.linked_transaction?.bank_account} •{" "}
                    <span className="text-green-600 dark:text-green-400">
                      {formatCurrency(transaction.linked_transaction?.amount || 0)}
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
                            <p className="text-sm">
                              {t.bank_account?.nickname} •{" "}
                              <span className={t.debit > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>
                                {t.debit > 0 ? `-${formatCurrency(t.debit)}` : `+${formatCurrency(t.credit)}`}
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

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [stats, setStats] = useState<TransactionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const { mode, setMode } = useTheme()

  // Filters
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [selectedType, setSelectedType] = useState<string>("")
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 50

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

  useEffect(() => {
    async function loadCategories() {
      try {
        // Include all categories (including Self Transfer) for filtering
        const data = await fetchCategories(true)
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
      } catch (error) {
        console.error("Failed to load bank accounts:", error)
      }
    }
    loadBankAccounts()
  }, [])

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true)
      try {
        const data = await fetchTransactions({
          category: selectedCategory || undefined,
          type: selectedType || undefined,
          bank_account: selectedBankAccount || undefined,
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
      }
    }
    loadTransactions()
  }, [selectedCategory, selectedType, selectedBankAccount, page, refreshKey])

  // Filter transactions by search (client-side)
  const filteredTransactions = search
    ? transactions.filter(
        (t) =>
          t.narration.toLowerCase().includes(search.toLowerCase()) ||
          t.category.toLowerCase().includes(search.toLowerCase()) ||
          t.reference.toLowerCase().includes(search.toLowerCase())
      )
    : transactions

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="min-h-screen bg-muted/40">
        <header className="bg-primary text-primary-foreground shadow-lg relative">
          <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold">All Transactions</h1>
                <p className="text-primary-foreground/80 text-sm">
                  {total.toLocaleString()} transactions total
                </p>
              </div>
            </div>

            {/* Radix Dropdown Menu */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
                  aria-label="Toggle menu"
                >
                  <MenuIcon className="h-6 w-6" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="w-56 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                  sideOffset={8}
                  align="end"
                >
                  <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Display Mode
                  </DropdownMenu.Label>
                  <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => setMode(value as "light" | "dark" | "system")}>
                    <DropdownMenu.RadioItem
                      value="light"
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                    >
                      <SunIcon className="h-4 w-4" />
                      <span className="flex-1">Light</span>
                      <DropdownMenu.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem
                      value="dark"
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                    >
                      <MoonIcon className="h-4 w-4" />
                      <span className="flex-1">Dark</span>
                      <DropdownMenu.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                    <DropdownMenu.RadioItem
                      value="system"
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                    >
                      <MonitorIcon className="h-4 w-4" />
                      <span className="flex-1">System</span>
                      <DropdownMenu.ItemIndicator>
                        <CheckIcon className="h-4 w-4" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
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
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Category Filter - Radix Select */}
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

                {/* Type Filter - Radix Select */}
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
                    <Select.Content className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                      <Select.Viewport className="p-1">
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

                {/* Bank Account Filter - Radix Select */}
                {bankAccounts.length > 0 && (
                  <Select.Root
                    value={selectedBankAccount?.toString() || "all"}
                    onValueChange={(value) => {
                      setSelectedBankAccount(value === "all" ? null : parseInt(value, 10))
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
                      <Select.Content className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                        <Select.Viewport className="p-1 max-h-60">
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

          {/* Aggregate Stats */}
          {stats && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-border bg-card shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <TrendingUpIcon className="h-5 w-5 text-green-700 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Credits</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {formatCurrency(stats.total_credits)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card shadow-sm p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <TrendingDownIcon className="h-5 w-5 text-red-700 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Debits</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400">
                      {formatCurrency(stats.total_debits)}
                    </p>
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
                    <p className={`text-xl font-bold ${
                      stats.net_flow >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }`}>
                      {stats.net_flow >= 0 ? "+" : ""}{formatCurrency(stats.net_flow)}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Transactions Table */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-2">
              <h3 className="font-semibold flex items-center justify-between">
                <span>Transactions</span>
                {filteredTransactions.length !== transactions.length && (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                    Showing {filteredTransactions.length} of {transactions.length}
                  </span>
                )}
              </h3>
            </header>
            <div className="p-6 pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full caption-bottom text-sm">
                      <thead className="border-b border-border/40">
                        <tr>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">Date</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                          <th className="h-12 px-4 text-center align-middle font-medium text-muted-foreground w-[60px]">Link</th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((t) => (
                            <tr key={t.id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                              <td className="p-4 align-middle text-sm text-muted-foreground whitespace-nowrap">
                                {formatDate(t.date)}
                              </td>
                              <td className="p-4 align-middle">
                                <span className="text-sm line-clamp-2">
                                  {t.narration}
                                </span>
                              </td>
                              <td className="p-4 align-middle">
                                {t.bank_account ? (
                                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                                    {t.bank_account.nickname}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground/50">—</span>
                                )}
                              </td>
                              <td className="p-4 align-middle" onClick={(e) => e.stopPropagation()}>
                                <CategorySelect
                                  value={t.category}
                                  categories={categories}
                                  onValueChange={(value) => handleCategoryChange(t.id, value)}
                                  disabled={updatingId === t.id}
                                />
                              </td>
                              <td className="p-4 align-middle text-center">
                                {t.category === "Self Transfer" ? (
                                  <LinkDialog
                                    transaction={t}
                                    onLink={(linkToId) => handleLink(t.id, linkToId)}
                                    onUnlink={() => handleUnlink(t.id)}
                                  />
                                ) : (
                                  <span className="text-muted-foreground/40 text-xs">—</span>
                                )}
                              </td>
                              <td className="p-4 align-middle text-right whitespace-nowrap">
                                {t.credit > 0 ? (
                                  <span className="text-green-700 dark:text-green-400 font-medium flex items-center justify-end gap-1">
                                    <ArrowUpIcon className="h-3 w-3" />
                                    {formatCurrency(t.credit)}
                                  </span>
                                ) : (
                                  <span className="text-red-700 dark:text-red-400 font-medium flex items-center justify-end gap-1">
                                    <ArrowDownIcon className="h-3 w-3" />
                                    {formatCurrency(t.debit)}
                                  </span>
                                )}
                              </td>
                              <td className="p-4 align-middle text-right font-mono text-sm whitespace-nowrap">
                                {formatCurrency(t.balance)}
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (page <= 3) {
                              pageNum = i + 1
                            } else if (page >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = page - 2 + i
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setPage(pageNum)}
                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                  page === pageNum
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-accent"
                                }`}
                              >
                                {pageNum}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
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
