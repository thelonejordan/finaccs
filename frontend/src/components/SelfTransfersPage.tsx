import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { logError } from "@/lib/logger"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams, Link } from "react-router-dom"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  BuildingIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  CalendarIcon,
  ArrowRightIcon,
  TagIcon,
  RepeatIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Collapsible from "@radix-ui/react-collapsible"
import { Footer } from "@/components/Footer"
import {
  fetchSelfTransferSuggestions,
  fetchSelfTransferLinks,
  fetchSelfTransferLinkYears,
  createSelfTransferLink,
  deleteSelfTransferLink,
  fetchBankAccounts,
  updateTransactionCategory,
  type SelfTransferSuggestionItem,
  type SelfTransferSuggestion,
  type SelfTransferLinkRecord,
  type BankAccount,
} from "@/lib/api"
import { useSelfTransfersCache } from "@/lib/self-transfers-cache"

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

function DateProximityBadge({ dateA, dateB }: { dateA: string; dateB: string }) {
  const days = Math.abs(
    Math.round((new Date(dateA).getTime() - new Date(dateB).getTime()) / (1000 * 60 * 60 * 24))
  )
  const label = days === 0 ? "Same day" : `${days}d apart`
  const colorClass = days === 0
    ? "bg-green-500/20 text-green-600 dark:text-green-400"
    : days <= 2
    ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
    : "bg-muted text-muted-foreground"

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

type SelfTransfersTab = "unmatched" | "confirmed"

// ── Suggestion Card ─────────────────────────────────────

function TransferSuggestionCard({
  suggestion,
  sourceTxnDate,
  onConfirm,
  isConfirming,
}: {
  suggestion: SelfTransferSuggestion
  sourceTxnDate: string
  onConfirm: () => void
  isConfirming: boolean
}) {
  const amount = suggestion.credit > 0 ? suggestion.credit : suggestion.debit
  const isCredit = suggestion.credit > 0

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border/50 bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">
            {suggestion.bank_account?.nickname || "Unknown Account"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(suggestion.date)}
          </span>
          <DateProximityBadge dateA={sourceTxnDate} dateB={suggestion.date} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{suggestion.narration}</p>
      </div>
      <FormattedCurrency
        amount={amount}
        className={`text-sm font-semibold ${isCredit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
      />
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

// ── Self Transfer Card (expandable) ─────────────────────

function SelfTransferCard({
  item,
  onConfirm,
  onRemoveTag,
}: {
  item: SelfTransferSuggestionItem
  onConfirm: (bankTxnId: number, suggestion: SelfTransferSuggestion) => Promise<void>
  onRemoveTag: (bankTxnId: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [removingTag, setRemovingTag] = useState(false)

  const handleConfirm = async (suggestion: SelfTransferSuggestion) => {
    setConfirmingId(suggestion.id)
    try {
      await onConfirm(item.bank_transaction.id, suggestion)
    } finally {
      setConfirmingId(null)
    }
  }

  const handleRemoveTag = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRemovingTag(true)
    try {
      await onRemoveTag(item.bank_transaction.id)
    } finally {
      setRemovingTag(false)
    }
  }

  const hasSuggestions = item.suggestions.length > 0

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
                <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium">
                  {item.bank_transaction.bank_account?.nickname || "Unknown Account"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(item.bank_transaction.date)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {item.bank_transaction.narration}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <FormattedCurrency
                amount={item.bank_transaction.amount}
                className={`text-lg font-semibold ${item.bank_transaction.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
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
                    Not a self transfer - remove tag
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
                {item.suggestions.map((suggestion) => (
                  <TransferSuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    sourceTxnDate={item.bank_transaction.date}
                    onConfirm={() => handleConfirm(suggestion)}
                    isConfirming={confirmingId === suggestion.id}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <XCircleIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No matching transactions found from other accounts within 7 days
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
  const [suggestions, setSuggestions] = useState<SelfTransferSuggestionItem[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const { invalidate: invalidateCache } = useSelfTransfersCache()

  useEffect(() => {
    async function loadFilters() {
      try {
        const bankData = await fetchBankAccounts()
        setBankAccounts(bankData.accounts)
      } catch (error) {
        logError("Failed to load bank accounts", error)
      }
    }
    loadFilters()
  }, [])

  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true)
      try {
        const result = await fetchSelfTransferSuggestions({
          bank_account: selectedBankAccount ?? undefined,
        })
        setSuggestions(result.data)
      } catch (error) {
        logError("Failed to load self-transfer suggestions", error)
      } finally {
        setLoading(false)
      }
    }
    loadSuggestions()
  }, [selectedBankAccount])

  const handleConfirm = async (bankTxnId: number, suggestion: SelfTransferSuggestion) => {
    try {
      await createSelfTransferLink({
        transaction_id: bankTxnId,
        link_to: suggestion.id,
      })
      setSuggestions((prev) => prev.filter((item) => item.bank_transaction.id !== bankTxnId))
      invalidateCache()
    } catch (error) {
      logError("Failed to create self-transfer link", error)
    }
  }

  const handleRemoveTag = async (bankTxnId: number) => {
    try {
      await updateTransactionCategory(bankTxnId, "Uncategorized")
      setSuggestions((prev) => prev.filter((item) => item.bank_transaction.id !== bankTxnId))
      invalidateCache()
    } catch (error) {
      logError("Failed to remove tag", error)
    }
  }

  return (
    <>
      {/* Filter Section */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            {bankAccounts.length > 0 && (
              <Select.Root
                value={selectedBankAccount?.toString() || "all"}
                onValueChange={(value) => {
                  setSelectedBankAccount(value === "all" ? null : parseInt(value, 10))
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

      {/* Transfer Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">All self transfers matched</p>
          <p className="text-sm text-muted-foreground mt-1">
            No unmatched self-transfer transactions found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((item) => (
            <SelfTransferCard
              key={item.bank_transaction.id}
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
  const [links, setLinks] = useState<SelfTransferLinkRecord[]>([])
  const [allLinks, setAllLinks] = useState<SelfTransferLinkRecord[]>([])
  const [years, setYears] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showTotals, setShowTotals] = useState(false)
  const statsRef = useRef<HTMLDivElement>(null)
  const { invalidate: invalidateCache } = useSelfTransfersCache()

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
        const result = await fetchSelfTransferLinks({})
        setAllLinks(result.data)
      } catch (error) {
        logError("Failed to load all links", error)
      }
    }
    loadAllLinks()
  }, [refreshKey])

  useEffect(() => {
    async function loadYears() {
      try {
        const result = await fetchSelfTransferLinkYears()
        setYears(result.years)
        const yearKeys = Object.keys(result.years).sort((a, b) => parseInt(b) - parseInt(a))
        if (yearKeys.length > 0 && !selectedYear) {
          setSelectedYear(yearKeys[0])
        }
      } catch (error) {
        logError("Failed to load years", error)
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
        const result = await fetchSelfTransferLinks({
          year: parseInt(selectedYear),
        })
        setLinks(result.data)
      } catch (err) {
        logError("Failed to load links", err)
      } finally {
        setLoading(false)
      }
    }
    loadLinks()
  }, [selectedYear, refreshKey])

  const handleUnlink = async (linkId: number) => {
    try {
      await deleteSelfTransferLink(linkId)
      setRefreshKey((k) => k + 1)
      invalidateCache()
    } catch (error) {
      logError("Failed to delete link", error)
    }
  }

  const linksByMonth = links.reduce((acc, link) => {
    const monthYear = getMonthYear(link.transaction_a.date)
    if (!acc[monthYear]) {
      acc[monthYear] = []
    }
    acc[monthYear].push(link)
    return acc
  }, {} as Record<string, SelfTransferLinkRecord[]>)

  const sortedMonths = Object.keys(linksByMonth).sort((a, b) => {
    const dateA = new Date(linksByMonth[a][0].transaction_a.date)
    const dateB = new Date(linksByMonth[b][0].transaction_a.date)
    return dateB.getTime() - dateA.getTime()
  })

  const stats = useMemo(() => {
    const totalAmount = links.reduce(
      (sum, l) => sum + l.transaction_a.amount, 0
    )
    return { count: links.length, totalAmount }
  }, [links])

  const allTimeStats = useMemo(() => {
    const totalAmount = allLinks.reduce(
      (sum, l) => sum + l.transaction_a.amount, 0
    )
    return { count: allLinks.length, totalAmount }
  }, [allLinks])

  const yearKeys = Object.keys(years).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <>
      {/* Year Buttons */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Confirmed Links</h2>
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
      <div ref={statsRef} className="grid grid-cols-2 gap-4 mb-6">
        <div
          onClick={() => setShowTotals(!showTotals)}
          className="rounded-xl border border-border bg-card shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <LinkIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Links</p>
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
            <div className="p-2 rounded-lg bg-blue-500/10">
              <RepeatIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Transferred</p>
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
      </div>

      {/* Links Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <XCircleIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-lg font-medium">No links found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedYear
              ? `No confirmed self-transfer links for ${selectedYear}`
              : "No confirmed self-transfer links yet"}
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
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Account A</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground"></th>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Account B</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linksByMonth[monthYear].map((link) => (
                      <tr key={link.id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2 mb-1">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {link.transaction_a.bank_account?.nickname || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(link.transaction_a.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {link.transaction_a.narration}
                          </p>
                          <FormattedCurrency
                            amount={link.transaction_a.amount}
                            className={`text-sm font-medium mt-1 block ${link.transaction_a.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                          />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <ArrowRightIcon className="h-5 w-5 text-muted-foreground mx-auto" />
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2 mb-1">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {link.transaction_b.bank_account?.nickname || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(link.transaction_b.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {link.transaction_b.narration}
                          </p>
                          <FormattedCurrency
                            amount={link.transaction_b.amount}
                            className={`text-sm font-medium mt-1 block ${link.transaction_b.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
                          />
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

export function SelfTransfersPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = (searchParams.get("tab") as SelfTransfersTab) || "confirmed"

  const setActiveTab = useCallback((newTab: SelfTransfersTab) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      newParams.set("tab", newTab)
      return newParams
    }, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    document.title = "Self Transfers | FinAccs"
  }, [])

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link to="/dashboard" className="hover:text-foreground transition-colors">home</Link>
              <span>/</span>
              <span>self-transfers</span>
            </div>
            <h1 className="text-2xl font-bold">Self Transfers</h1>
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
