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
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Select from "@radix-ui/react-select"
import * as Popover from "@radix-ui/react-popover"
import { useTheme } from "@/lib/theme"
import {
  fetchTransactions,
  fetchCategories,
  fetchBankAccounts,
  updateTransactionCategory,
  type Transaction,
  type CategoryData,
  type BankAccount,
  type TransactionStats,
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
                      <Select.Content className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden">
                        <Select.Viewport className="p-1 max-h-60">
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
                      <thead className="border-b">
                        <tr>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">Date</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Category</th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((t) => (
                            <tr key={t.id} className="border-b transition-colors hover:bg-muted/50">
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
