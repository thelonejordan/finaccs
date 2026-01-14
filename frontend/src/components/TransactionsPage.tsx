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
  MenuIcon,
  XIcon,
} from "lucide-react"
import { useTheme } from "@/lib/theme"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TransactionTooltip } from "@/components/TransactionTooltip"
import { fetchTransactions, fetchCategories, type Transaction, type CategoryData } from "@/lib/api"

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

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  // Filters
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [selectedType, setSelectedType] = useState<string>("")
  const [page, setPage] = useState(1)
  const pageSize = 50

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
    async function loadTransactions() {
      setLoading(true)
      try {
        const data = await fetchTransactions({
          category: selectedCategory || undefined,
          type: selectedType || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        setTransactions(data.data)
        setTotal(data.total)
      } catch (error) {
        console.error("Failed to load transactions:", error)
      } finally {
        setLoading(false)
      }
    }
    loadTransactions()
  }, [selectedCategory, selectedType, page])

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
    <TooltipProvider delayDuration={300}>
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

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <XIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
            </button>
          </div>

          {menuOpen && (
            <div className="absolute right-4 top-full mt-2 w-56 bg-card rounded-lg shadow-lg border border-border z-50">
              <div className="p-2">
                <button
                  onClick={() => {
                    toggleTheme()
                    setMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-md hover:bg-accent text-card-foreground transition-colors"
                >
                  {theme === "light" ? (
                    <>
                      <MoonIcon className="h-5 w-5" />
                      <span>Dark Mode</span>
                    </>
                  ) : (
                    <>
                      <SunIcon className="h-5 w-5" />
                      <span>Light Mode</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
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

                {/* Category Filter */}
                <div className="flex items-center gap-2">
                  <FilterIcon className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value)
                      setPage(1)
                    }}
                    className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.category} value={cat.category}>
                        {cat.category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type Filter */}
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value)
                    setPage(1)
                  }}
                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All Types</option>
                  <option value="credit">Income Only</option>
                  <option value="debit">Expenses Only</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Transactions</span>
                {filteredTransactions.length !== transactions.length && (
                  <Badge variant="secondary">
                    Showing {filteredTransactions.length} of {transactions.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransactions.map((t) => (
                          <TransactionTooltip key={t.id} transaction={t}>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatDate(t.date)}
                              </TableCell>
                              <TableCell>
                                <span className="text-sm line-clamp-2">
                                  {t.narration}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="whitespace-nowrap">
                                  {t.category}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {t.credit > 0 ? (
                                  <span className="text-green-600 dark:text-green-400 font-medium flex items-center justify-end gap-1">
                                    <ArrowUpIcon className="h-3 w-3" />
                                    {formatCurrency(t.credit)}
                                  </span>
                                ) : (
                                  <span className="text-red-600 dark:text-red-400 font-medium flex items-center justify-end gap-1">
                                    <ArrowDownIcon className="h-3 w-3" />
                                    {formatCurrency(t.debit)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                                {formatCurrency(t.balance)}
                              </TableCell>
                            </TableRow>
                          </TransactionTooltip>
                        ))}
                      </TableBody>
                    </Table>
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
            </CardContent>
          </Card>
        </main>
      </div>
    </TooltipProvider>
  )
}
