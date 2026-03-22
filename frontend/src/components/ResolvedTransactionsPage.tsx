import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  SearchIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  FlaskConicalIcon,
} from "lucide-react"
import { fetchResolvedTransactions, type ResolvedTransaction } from "@/lib/api"
import { Footer } from "@/components/Footer"

export function ResolvedTransactionsPage() {
  const navigate = useNavigate()
  const [resolvedTransactions, setResolvedTransactions] = useState<ResolvedTransaction[]>([])
  const [resolvedTotal, setResolvedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    document.title = "Resolved Transactions | FinAccs"
    loadResolvedTransactions()
  }, [])

  const loadResolvedTransactions = async () => {
    try {
      const { results, total } = await fetchResolvedTransactions({ page_size: 20 })
      setResolvedTransactions(results)
      setResolvedTotal(total)
    } catch (err) {
      console.error("Failed to load resolved transactions:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
    }).format(Math.abs(amount))
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/transactions/resolved/${searchQuery.trim()}`)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <FlaskConicalIcon className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Resolved Transactions</h1>
          </div>
          <p className="text-muted-foreground">
            Browse and search resolved transactions across all resolution groups.
          </p>
        </div>

        {/* Quick Lookup */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <SearchIcon className="h-4 w-4" />
            Transaction Lookup
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Search for a resolved transaction by its UUID or short ID.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Enter UUID or short ID (e.g., a1b2c3d4)"
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium inline-flex items-center gap-2"
            >
              Search
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Resolved Transactions */}
        {loading ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading resolved transactions...</p>
          </div>
        ) : resolvedTotal > 0 ? (
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-3">
              <h3 className="font-semibold flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-green-500/20">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  Resolved Transactions
                  <span className="text-sm font-normal text-muted-foreground">
                    ({resolvedTotal} total)
                  </span>
                </div>
              </h3>
            </header>
            <div className="p-6 pt-0">
              <div className="space-y-2">
                {resolvedTransactions.map((txn) => {
                  const isCredit = txn.amount > 0
                  return (
                    <button
                      key={txn.uuid}
                      onClick={() => navigate(`/transactions/resolved/${txn.uuid}`)}
                      className="w-full p-4 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary">{txn.short_id}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{formatDate(txn.date)}</span>
                            <span className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                              {txn.source_count} sources
                            </span>
                          </div>
                          <p className="text-sm truncate">{txn.primary_narration}</p>
                        </div>
                        <div className={`flex items-center gap-1 font-medium ${
                          isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {isCredit ? (
                            <ArrowUpIcon className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownIcon className="h-3.5 w-3.5" />
                          )}
                          ₹{formatCurrency(txn.amount)}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              {resolvedTotal > 20 && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Showing 20 of {resolvedTotal} resolved transactions.
                  Use the search above to find specific transactions.
                </p>
              )}
            </div>
          </section>
        ) : (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <CheckCircleIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="mt-4 font-medium">No resolved transactions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Resolve overlapping sources on the Resolution page to create resolved transactions.
            </p>
          </div>
        )}
      </div>

      <Footer />
    </div>
  )
}
