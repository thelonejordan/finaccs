import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { logError } from "@/lib/logger"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "react-router-dom"
import {
  ChevronRightIcon,
  BuildingIcon,
  CreditCardIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  CalendarIcon,
  ArrowRightIcon,
  TagIcon,
  RotateCcwIcon,
} from "lucide-react"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Collapsible from "@radix-ui/react-collapsible"
import { Footer } from "@/components/Footer"
import {
  fetchRefundSuggestions,
  fetchRefundLinks,
  fetchRefundLinkYears,
  createRefundLink,
  deleteRefundLink,
  updateTransactionCategory,
  updateCreditCardTransactionCategory,
  type RefundSuggestionItem,
  type RefundSuggestion,
  type RefundLinkRecord,
  type RefundTransaction,
} from "@/lib/api"
import { useRefundsCache } from "@/lib/refunds-cache"

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

function getMonthYear(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })
}

function OffsetBadge({ offset }: { offset: number }) {
  const absOffset = Math.abs(offset)
  let colorClass = "bg-green-500/20 text-green-600 dark:text-green-400"
  if (absOffset > 100) {
    colorClass = "bg-red-500/20 text-red-600 dark:text-red-400"
  } else if (absOffset > 0) {
    colorClass = "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {offset === 0 ? "Exact" : offset > 0 ? `+${formatCurrency(offset)}` : formatCurrency(offset)}
    </span>
  )
}

function TransactionCell({ txn }: { txn: RefundTransaction }) {
  const AccountIcon = txn.type === "bank" ? BuildingIcon : CreditCardIcon
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <AccountIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium">
          {txn.account?.nickname || "Unknown"}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(txn.date)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground truncate max-w-[250px]">
        {txn.description}
      </p>
      <FormattedCurrency
        amount={txn.amount}
        className={`text-sm font-medium mt-1 block ${txn.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
      />
    </div>
  )
}

type RefundsTab = "unmatched" | "confirmed"

// ── Badges ──────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  let colorClass = "bg-red-500/20 text-red-600 dark:text-red-400"
  let label = "Low"
  if (score > 0.8) {
    colorClass = "bg-green-500/20 text-green-600 dark:text-green-400"
    label = "High"
  } else if (score >= 0.5) {
    colorClass = "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
    label = "Medium"
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label} ({(score * 100).toFixed(0)}%)
    </span>
  )
}

function MatchReasonsBadge({ reasons }: { reasons: string[] }) {
  const formatReason = (reason: string) =>
    reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground"
        >
          {formatReason(reason)}
        </span>
      ))}
    </div>
  )
}

// ── Suggestion Card ─────────────────────────────────────

function RefundSuggestionCard({
  suggestion,
  onConfirm,
  isConfirming,
}: {
  suggestion: RefundSuggestion
  onConfirm: () => void
  isConfirming: boolean
}) {
  const txn = suggestion.transaction
  const AccountIcon = txn.type === "bank" ? BuildingIcon : CreditCardIcon

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border/50 bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <AccountIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">
            {txn.account?.nickname || "Unknown"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(txn.date)}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            {txn.type === "bank" ? "Bank" : "CC"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{txn.description}</p>
        <div className="flex items-center gap-2 mt-2">
          <FormattedCurrency
            amount={txn.amount}
            className={`text-sm font-semibold ${txn.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
          />
          <OffsetBadge offset={suggestion.offset} />
          <ConfidenceBadge score={suggestion.confidence_score} />
        </div>
        <div className="mt-2">
          <MatchReasonsBadge reasons={suggestion.match_reasons} />
        </div>
      </div>
      <button
        onClick={onConfirm}
        disabled={isConfirming}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isConfirming ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <LinkIcon className="h-4 w-4" />
        )}
        Confirm
      </button>
    </div>
  )
}

// ── Refund Card (expandable) ─────────────────────────────

function RefundCard({
  item,
  onConfirm,
  onRemoveTag,
}: {
  item: RefundSuggestionItem
  onConfirm: (refundTxn: RefundTransaction, originalTxn: RefundTransaction) => Promise<void>
  onRemoveTag: (refundTxn: RefundTransaction) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [removingTag, setRemovingTag] = useState(false)

  const handleConfirm = async (suggestion: RefundSuggestion) => {
    const key = `${suggestion.transaction.type}-${suggestion.transaction.id}`
    setConfirmingKey(key)
    try {
      await onConfirm(item.refund_transaction, suggestion.transaction)
    } finally {
      setConfirmingKey(null)
    }
  }

  const handleRemoveTag = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRemovingTag(true)
    try {
      await onRemoveTag(item.refund_transaction)
    } finally {
      setRemovingTag(false)
    }
  }

  const hasSuggestions = item.suggestions.length > 0
  const txn = item.refund_transaction
  const AccountIcon = txn.type === "bank" ? BuildingIcon : CreditCardIcon

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Collapsible.Trigger asChild>
          <button className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left">
            <ChevronRightIcon
              className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <AccountIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium">
                  {txn.account?.nickname || "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(txn.date)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                  {txn.type === "bank" ? "Bank" : "CC"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {txn.description}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <FormattedCurrency
                amount={txn.amount}
                className={`text-lg font-semibold ${txn.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
              />
              <div className="flex items-center gap-2 justify-end mt-1">
                {hasSuggestions ? (
                  <>
                    <SparklesIcon className="h-4 w-4 text-primary" />
                    <span className="text-xs text-primary font-medium">
                      {item.suggestions.length} suggestion{item.suggestions.length !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No suggestions</span>
                )}
              </div>
            </div>
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleRemoveTag}
                    disabled={removingTag}
                    className="p-2 rounded-lg border border-border hover:bg-destructive/10 hover:border-destructive/50 hover:text-destructive transition-colors disabled:opacity-50"
                  >
                    {removingTag ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <TagIcon className="h-4 w-4" />
                    )}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-popover text-popover-foreground px-3 py-2 rounded-lg shadow-lg text-xs z-50" sideOffset={4}>
                    Not a refund - remove tag
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="px-4 pb-4 border-t border-border/50">
            {hasSuggestions ? (
              <div className="space-y-3 mt-4">
                {item.suggestions.map((suggestion) => {
                  const key = `${suggestion.transaction.type}-${suggestion.transaction.id}`
                  return (
                    <RefundSuggestionCard
                      key={key}
                      suggestion={suggestion}
                      onConfirm={() => handleConfirm(suggestion)}
                      isConfirming={confirmingKey === key}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <XCircleIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No matching original transactions found within 180 days
                </p>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

// ── Unmatched Tab ────────────────────────────────────────

function UnmatchedTab() {
  const [suggestions, setSuggestions] = useState<RefundSuggestionItem[]>([])
  const [loading, setLoading] = useState(true)
  const { invalidate: invalidateCache } = useRefundsCache()

  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true)
      try {
        const result = await fetchRefundSuggestions()
        setSuggestions(result.data)
      } catch (error) {
        logError("Failed to load refund suggestions", error)
      } finally {
        setLoading(false)
      }
    }
    loadSuggestions()
  }, [])

  const handleConfirm = async (refundTxn: RefundTransaction, originalTxn: RefundTransaction) => {
    try {
      await createRefundLink({
        refund_transaction_id: refundTxn.id,
        refund_type: refundTxn.type,
        original_transaction_id: originalTxn.id,
        original_type: originalTxn.type,
      })
      setSuggestions((prev) =>
        prev.filter(
          (item) =>
            !(item.refund_transaction.id === refundTxn.id && item.refund_transaction.type === refundTxn.type)
        )
      )
      invalidateCache()
    } catch (error) {
      logError("Failed to create refund link", error)
    }
  }

  const handleRemoveTag = async (refundTxn: RefundTransaction) => {
    try {
      if (refundTxn.type === "bank") {
        await updateTransactionCategory(refundTxn.id, "Uncategorized")
      } else {
        await updateCreditCardTransactionCategory(refundTxn.id, "Uncategorized")
      }
      setSuggestions((prev) =>
        prev.filter(
          (item) =>
            !(item.refund_transaction.id === refundTxn.id && item.refund_transaction.type === refundTxn.type)
        )
      )
      invalidateCache()
    } catch (error) {
      logError("Failed to remove tag", error)
    }
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">All refunds matched</p>
          <p className="text-sm text-muted-foreground mt-1">
            No unmatched refund transactions found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((item) => (
            <RefundCard
              key={`${item.refund_transaction.type}-${item.refund_transaction.id}`}
              item={item}
              onConfirm={handleConfirm}
              onRemoveTag={handleRemoveTag}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ── Confirmed Tab ────────────────────────────────────────

function ConfirmedTab() {
  const [links, setLinks] = useState<RefundLinkRecord[]>([])
  const [allLinks, setAllLinks] = useState<RefundLinkRecord[]>([])
  const [years, setYears] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showTotals, setShowTotals] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)
  const { invalidate: invalidateCache } = useRefundsCache()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statsRef.current && !statsRef.current.contains(event.target as Node)) {
        setShowTotals(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    async function loadAllLinks() {
      try {
        const result = await fetchRefundLinks({})
        setAllLinks(result.data)
      } catch (error) {
        logError("Failed to load all refund links", error)
      }
    }
    loadAllLinks()
  }, [refreshKey])

  useEffect(() => {
    async function loadYears() {
      try {
        const result = await fetchRefundLinkYears()
        setYears(result.years)
        const yearKeys = Object.keys(result.years).sort((a, b) => parseInt(b) - parseInt(a))
        if (yearKeys.length > 0 && !selectedYear) {
          setSelectedYear(yearKeys[0])
        }
      } catch (error) {
        logError("Failed to load refund years", error)
      }
    }
    loadYears()
  }, [refreshKey])

  useEffect(() => {
    async function loadLinks() {
      if (!selectedYear) {
        setLoading(false)
        setLinks([])
        return
      }
      setLoading(true)
      try {
        const result = await fetchRefundLinks({
          year: parseInt(selectedYear),
        })
        setLinks(result.data)
      } catch (err) {
        logError("Failed to load refund links", err)
      } finally {
        setLoading(false)
      }
    }
    loadLinks()
  }, [selectedYear, refreshKey])

  const handleUnlink = async (linkId: number) => {
    try {
      await deleteRefundLink(linkId)
      setRefreshKey((k) => k + 1)
      invalidateCache()
    } catch (error) {
      logError("Failed to delete refund link", error)
    }
  }

  const linksByMonth = links.reduce((acc, link) => {
    const monthYear = getMonthYear(link.refund_transaction.date)
    if (!acc[monthYear]) {
      acc[monthYear] = []
    }
    acc[monthYear].push(link)
    return acc
  }, {} as Record<string, RefundLinkRecord[]>)

  const sortedMonths = Object.keys(linksByMonth).sort((a, b) => {
    const dateA = new Date(linksByMonth[a][0].refund_transaction.date)
    const dateB = new Date(linksByMonth[b][0].refund_transaction.date)
    return dateB.getTime() - dateA.getTime()
  })

  const stats = useMemo(() => {
    const totalAmount = links.reduce(
      (sum, l) => sum + l.refund_transaction.amount, 0
    )
    const totalOffset = links.reduce(
      (sum, l) => sum + l.offset, 0
    )
    return { count: links.length, totalAmount, totalOffset }
  }, [links])

  const allTimeStats = useMemo(() => {
    const totalAmount = allLinks.reduce(
      (sum, l) => sum + l.refund_transaction.amount, 0
    )
    const totalOffset = allLinks.reduce(
      (sum, l) => sum + l.offset, 0
    )
    return { count: allLinks.length, totalAmount, totalOffset }
  }, [allLinks])

  const yearKeys = Object.keys(years).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <>
      {/* Year Buttons */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Confirmed Refunds</h2>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                {yearKeys.map((year) => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedYear === year
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {year}
                    <span className="ml-1.5 text-xs opacity-75">({years[year]})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Summary Stats */}
      <div ref={statsRef} className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div
          onClick={() => setShowTotals(!showTotals)}
          className="rounded-xl border border-border bg-card shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <LinkIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Refund Links</p>
              <p className="text-xl font-bold">{stats.count}</p>
              <AnimatePresence>
                {showTotals && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    out of {Object.values(years).reduce((sum, count) => sum + count, 0)}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div
          onClick={() => setShowTotals(!showTotals)}
          className="rounded-xl border border-border bg-card shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <RotateCcwIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Refunded</p>
              <p className="text-xl font-bold">
                <FormattedCurrency amount={stats.totalAmount} />
              </p>
              <AnimatePresence>
                {showTotals && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    out of <FormattedCurrency amount={allTimeStats.totalAmount} />
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div
          onClick={() => setShowTotals(!showTotals)}
          className="rounded-xl border border-border bg-card shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats.totalOffset === 0 ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
              <TagIcon className={`h-5 w-5 ${stats.totalOffset === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Offset</p>
              <p className={`text-xl font-bold ${stats.totalOffset === 0 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                <FormattedCurrency amount={stats.totalOffset} />
              </p>
              <AnimatePresence>
                {showTotals && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    out of <FormattedCurrency amount={allTimeStats.totalOffset} />
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Links Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <XCircleIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-lg font-medium">No refund links found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedYear
              ? `No confirmed refund links for ${selectedYear}`
              : "No confirmed refund links yet"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedMonths.map((monthYear) => (
            <section key={monthYear} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-muted/50 border-b border-border/50">
                <h3 className="text-sm font-semibold">{monthYear}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="border-b border-border/40">
                    <tr>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Original</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground"></th>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Refund</th>
                      <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Offset</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linksByMonth[monthYear].map((link) => (
                      <tr key={link.id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle">
                          <TransactionCell txn={link.original_transaction} />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <ArrowRightIcon className="h-5 w-5 text-muted-foreground mx-auto" />
                        </td>
                        <td className="p-4 align-middle">
                          <TransactionCell txn={link.refund_transaction} />
                        </td>
                        <td className="p-4 align-middle text-right">
                          <OffsetBadge offset={link.offset} />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  onClick={() => handleUnlink(link.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                                >
                                  <UnlinkIcon className="h-4 w-4" />
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  className="bg-card text-card-foreground px-2 py-1 rounded-md shadow-lg border border-border text-xs"
                                  sideOffset={4}
                                >
                                  Unlink
                                  <Tooltip.Arrow className="fill-card" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

// ── Main Page ────────────────────────────────────────────

export function RefundsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get("tab") as RefundsTab) || "confirmed"

  const setActiveTab = useCallback((newTab: RefundsTab) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set("tab", newTab)
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    document.title = "Refunds | FinAccs"
  }, [])

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <RotateCcwIcon className="h-6 w-6 text-primary" />
              </div>
              Refunds
            </h1>
            <p className="text-muted-foreground mt-1">
              Match refund transactions to their original charges
            </p>
          </div>

          {/* Tabs */}
          <div className="flex items-center bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("confirmed")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                activeTab === "confirmed"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LinkIcon className="h-4 w-4" />
              Confirmed
            </button>
            <button
              onClick={() => setActiveTab("unmatched")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center gap-2 ${
                activeTab === "unmatched"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
              Unmatched
            </button>
          </div>
        </header>

        {/* Tab Content */}
        {activeTab === "unmatched" && <UnmatchedTab />}
        {activeTab === "confirmed" && <ConfirmedTab />}
      </main>
      <Footer />
    </>
  )
}
