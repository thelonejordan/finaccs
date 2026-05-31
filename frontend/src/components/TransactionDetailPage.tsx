import { useState, useEffect } from "react"
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom"
import {
  ArrowLeftIcon,
  CopyIcon,
  CheckIcon,
  CalendarIcon,
  HashIcon,
  BuildingIcon,
  CreditCardIcon,
  FileTextIcon,
  LayersIcon,
  StarIcon,
  SearchIcon,
  Link2Icon,
  BookOpenIcon,
  UsersIcon,
} from "lucide-react"
import {
  fetchResolvedTransaction,
  changePrimarySource,
  searchResolvedTransactions,
  type ResolvedTransaction,
} from "@/lib/api"
import { formatDate, formatCurrencyINR as formatCurrency } from "@/lib/format"

export function TransactionDetailPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [transaction, setTransaction] = useState<ResolvedTransaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [changingPrimary, setChangingPrimary] = useState(false)
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "")
  const [searchResults, setSearchResults] = useState<ResolvedTransaction[]>([])
  const [searching, setSearching] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (uuid) {
      loadTransaction(uuid)
    }
  }, [uuid])

  const loadTransaction = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchResolvedTransaction(id)
      setTransaction(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transaction")
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUuid = async () => {
    if (!transaction) return
    try {
      await navigator.clipboard.writeText(transaction.uuid)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may fail in non-HTTPS contexts
    }
  }

  const handleChangePrimary = async (txnType: "bank" | "credit_card", txnId: number) => {
    if (!transaction) return
    setChangingPrimary(true)
    setActionError(null)
    try {
      const updated = await changePrimarySource(transaction.uuid, {
        transaction_type: txnType,
        transaction_id: txnId,
      })
      setTransaction(updated)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to change primary source")
    } finally {
      setChangingPrimary(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const { results } = await searchResolvedTransactions(searchQuery.trim())
      setSearchResults(results)
      if (results.length === 1) {
        navigate(`/transactions/resolved/${results[0].uuid}`)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setSearching(false)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  // Search-only view when no UUID is provided
  if (!uuid) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
            <span>/</span>
            <span>transaction</span>
          </div>
          <h1 className="text-2xl font-bold mb-6">Transaction Lookup</h1>
          <p className="text-muted-foreground mb-6">
            Enter a transaction UUID or short ID to view its details.
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
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                autoFocus
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {searchResults.length > 1 && (
            <div className="mt-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Multiple matches found ({searchResults.length}):
              </p>
              {searchResults.map((result) => (
                <button
                  key={result.uuid}
                  onClick={() => navigate(`/transactions/resolved/${result.uuid}`)}
                  className="w-full p-4 rounded-lg border border-border hover:bg-accent text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-sm text-primary">{result.short_id}</p>
                      <p className="text-sm mt-1">{result.primary_narration}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(result.amount)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(result.date)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="mt-4 text-sm text-muted-foreground">
              No transactions found matching "{searchQuery}"
            </p>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading transaction...</p>
        </div>
      </div>
    )
  }

  if (error || !transaction) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
          <div className="text-center py-12">
            <p className="text-lg text-red-500">{error || "Transaction not found"}</p>
            <button
              onClick={() => navigate("/transactions/resolved")}
              className="mt-4 text-primary hover:underline"
            >
              Search for a different transaction
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={() => navigate("/transactions/resolved")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <SearchIcon className="h-4 w-4" />
            Search another
          </button>
        </div>

        {/* UUID Section */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LayersIcon className="h-5 w-5 text-primary" />
              <span className="font-semibold">Resolved Transaction</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                {transaction.source_count} sources
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 font-mono text-lg bg-muted rounded-lg px-4 py-2 overflow-x-auto">
              <span className="text-primary font-bold">{transaction.short_id}</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-sm">{transaction.uuid}</span>
            </div>
            <button
              onClick={handleCopyUuid}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Copy UUID"
            >
              {copied ? (
                <CheckIcon className="h-5 w-5 text-green-500" />
              ) : (
                <CopyIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </div>

          {/* Transaction Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{formatDate(transaction.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <HashIcon className="h-4 w-4 text-muted-foreground" />
              <span className={`text-sm font-medium ${transaction.amount < 0 ? "text-red-500" : "text-green-500"}`}>
                {formatCurrency(transaction.amount)}
              </span>
            </div>
            {transaction.bank_account && (
              <div className="flex items-center gap-2">
                <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{transaction.bank_account.nickname}</span>
              </div>
            )}
            {transaction.credit_card && (
              <div className="flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{transaction.credit_card.nickname}</span>
              </div>
            )}
          </div>
        </div>

        {/* Primary Narration */}
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
          <h3 className="font-semibold mb-3">Primary Narration</h3>
          <p className="text-lg">{transaction.primary_narration}</p>
        </div>

        {/* Linked Transaction */}
        {transaction.linked_resolved_transaction && (
          <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Link2Icon className="h-4 w-4" />
              Linked Transaction (Self-Transfer)
            </h3>
            <button
              onClick={() => navigate(`/transactions/resolved/${transaction.linked_resolved_transaction!.uuid}`)}
              className="flex items-center gap-2 text-primary hover:underline font-mono"
            >
              {transaction.linked_resolved_transaction.short_id}
            </button>
          </div>
        )}

        {/* Stories & Entities */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {transaction.stories.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <BookOpenIcon className="h-4 w-4" />
                Stories ({transaction.stories.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {transaction.stories.map((story) => (
                  <button
                    key={story.story_id}
                    onClick={() => navigate(`/stories/${story.story_id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 hover:bg-violet-500/25 transition-colors"
                  >
                    <span>{story.icon}</span>
                    <span className="text-sm font-medium">{story.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {transaction.entities.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <UsersIcon className="h-4 w-4" />
                Entities ({transaction.entities.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {transaction.entities.map((entity) => (
                  <button
                    key={entity.entity_id}
                    onClick={() => navigate(`/entities/${entity.entity_id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25 transition-colors"
                  >
                    <span>{entity.icon}</span>
                    <span className="text-sm font-medium">{entity.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {actionError && (
          <div className="p-4 mb-6 rounded-lg bg-red-500/10 text-sm text-red-500">
            {actionError}
          </div>
        )}

        {/* Source Transactions */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <FileTextIcon className="h-4 w-4" />
            Source Transactions ({transaction.sources.length})
          </h3>
          <div className="space-y-3">
            {transaction.sources.map((source) => (
              <div
                key={`${source.type}-${source.id}`}
                className={`p-4 rounded-lg border ${source.is_primary ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {source.is_primary && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                          <StarIcon className="h-3 w-3" />
                          Primary
                        </span>
                      )}
                      {source.source_file && (
                        <span className="text-xs text-muted-foreground">
                          {source.source_file.filename}
                        </span>
                      )}
                    </div>
                    <p className="text-sm">{source.narration}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{formatDate(source.date)}</span>
                      <span className={source.amount < 0 ? "text-red-500" : "text-green-500"}>
                        {formatCurrency(source.amount)}
                      </span>
                    </div>
                  </div>
                  {!source.is_primary && (
                    <button
                      onClick={() => handleChangePrimary(source.type, source.id)}
                      disabled={changingPrimary}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      Set as Primary
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
