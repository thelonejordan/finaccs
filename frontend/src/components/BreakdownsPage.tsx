import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ScissorsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from "lucide-react"
import { logError } from "@/lib/logger"
import { Footer } from "@/components/Footer"
import { SortDropdown, sortItems } from "@/components/SortDropdown"
import {
  fetchBreakdowns,
  fetchBreakdown,
  type Breakdown,
  type BreakdownDetail,
} from "@/lib/api"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function BreakdownRow({ breakdown }: { breakdown: Breakdown }) {
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<BreakdownDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (!expanded && !detail) {
      setLoading(true)
      try {
        const data = await fetchBreakdown(breakdown.breakdown_id)
        setDetail(data)
      } catch (err) {
        logError("Failed to load breakdown detail", err)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(!expanded)
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left"
      >
        {expanded ? (
          <ChevronDownIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        {breakdown.stats.is_valid ? (
          <CheckCircleIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
        ) : (
          <AlertCircleIcon className="h-4 w-4 text-amber-600 flex-shrink-0" />
        )}

        <span className="flex-1 min-w-0 text-sm font-medium truncate">
          {breakdown.name}
        </span>

        <span className="text-xs text-muted-foreground flex-shrink-0">
          {breakdown.stats.parts_count} parts
        </span>

        <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right">
          {formatDate(breakdown.transaction?.date ?? null)}
        </span>

        <span className="text-xs text-muted-foreground flex-shrink-0 w-12 text-right">
          {breakdown.transaction?.source ?? "-"}
        </span>

        <span className="font-mono text-sm flex-shrink-0 w-28 text-right">
          {breakdown.transaction ? formatCurrency(Math.abs(breakdown.transaction.amount)) : "-"}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pl-12">
          {loading ? (
            <div className="py-2 text-xs text-muted-foreground">Loading...</div>
          ) : detail && detail.parts.length > 0 ? (
            <div className="rounded border border-border overflow-hidden">
              {detail.parts.map((part, idx) => (
                <div key={part.id} className="flex items-center gap-3 px-3 py-1.5 text-xs border-b border-border last:border-b-0">
                  <span className="text-muted-foreground w-5">{idx + 1}.</span>
                  <span className="flex-1">{part.label}</span>
                  {part.rate != null && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {part.rate}%
                    </span>
                  )}
                  <span className="font-mono w-24 text-right">{formatCurrency(part.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-xs text-muted-foreground">No parts defined.</div>
          )}
          <Link
            to={`/breakdowns/${breakdown.breakdown_id}`}
            className="inline-block mt-2 text-xs text-primary hover:underline"
          >
            Open detail →
          </Link>
        </div>
      )}
    </div>
  )
}

export function BreakdownsPage() {
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState("updated_at")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    document.title = "Breakdowns | FinAccs"
  }, [])

  const loadData = async () => {
    try {
      const data = await fetchBreakdowns()
      setBreakdowns(data.breakdowns)
    } catch (error) {
      logError("Failed to load breakdowns", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const sortOptions = [
    { value: "updated_at", label: "Last updated" },
    { value: "created_at", label: "Created at" },
    { value: "name", label: "Name" },
  ]

  const sortedBreakdowns = sortItems(breakdowns, sortBy, sortDirection)

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
              <span>/</span>
              <span>breakdowns</span>
            </div>
            <h1 className="text-2xl font-bold">Breakdowns</h1>
          </div>
          <SortDropdown
            options={sortOptions}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={(by, dir) => { setSortBy(by); setSortDirection(dir) }}
          />
        </div>

        {sortedBreakdowns.length > 0 ? (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {sortedBreakdowns.map(b => (
              <BreakdownRow key={b.breakdown_id} breakdown={b} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <ScissorsIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">No breakdowns yet</p>
            <p className="text-sm mt-1">Select a transaction and click "Breakdown" to split it into parts.</p>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
