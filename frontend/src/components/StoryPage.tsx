import { useEffect, useState } from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CreditCardIcon,
  BuildingIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  CalendarIcon,
  ArrowRightIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Collapsible from "@radix-ui/react-collapsible"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  fetchCCPaymentSuggestions,
  fetchCCPaymentMatches,
  fetchCCPaymentMatchYears,
  createCCPaymentMatch,
  deleteCCPaymentMatch,
  fetchBankAccounts,
  type CCPaymentSuggestionItem,
  type CCPaymentSuggestion,
  type CCPaymentMatch,
  type BankAccount,
} from "@/lib/api"

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

type StoryTab = "unmatched" | "confirmed"

// Offset Badge Component
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

// Confidence Badge Component
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

// Match Reasons Badge Component
function MatchReasonsBadge({ reasons }: { reasons: string[] }) {
  const formatReason = (reason: string) => {
    return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  }

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

// Suggestion Card Component
function SuggestionCard({
  suggestion,
  onConfirm,
  isConfirming,
}: {
  suggestion: CCPaymentSuggestion
  onConfirm: () => void
  isConfirming: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <CreditCardIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {suggestion.credit_card_transaction.credit_card?.nickname || "Unknown Card"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(suggestion.credit_card_transaction.date)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {suggestion.credit_card_transaction.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <FormattedCurrency
            amount={Math.abs(suggestion.credit_card_transaction.amount)}
            className="text-sm font-medium text-green-600 dark:text-green-400"
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
        className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
      >
        {isConfirming ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
        ) : (
          <LinkIcon className="h-4 w-4" />
        )}
        Confirm
      </button>
    </div>
  )
}

// Payment Card Component (Expandable)
function PaymentCard({
  item,
  onConfirm,
}: {
  item: CCPaymentSuggestionItem
  onConfirm: (bankTxnId: number, suggestion: CCPaymentSuggestion) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const handleConfirm = async (suggestion: CCPaymentSuggestion) => {
    setConfirmingId(suggestion.credit_card_transaction.id)
    try {
      await onConfirm(item.bank_transaction.id, suggestion)
    } finally {
      setConfirmingId(null)
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
                className="text-lg font-semibold text-red-600 dark:text-red-400"
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
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="px-4 pb-4 border-t border-border/50">
            {hasSuggestions ? (
              <div className="space-y-3 mt-4">
                {item.suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.credit_card_transaction.id}
                    suggestion={suggestion}
                    onConfirm={() => handleConfirm(suggestion)}
                    isConfirming={confirmingId === suggestion.credit_card_transaction.id}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <XCircleIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No matching credit card payments found within 7 days
                </p>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

// Unmatched Tab Component
function UnmatchedTab() {
  const [suggestions, setSuggestions] = useState<CCPaymentSuggestionItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const [refreshKey, _setRefreshKey] = useState(0)

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

  // Load total count (unfiltered)
  useEffect(() => {
    async function loadTotalCount() {
      try {
        const result = await fetchCCPaymentSuggestions({})
        setTotalCount(result.data.length)
      } catch (err) {
        console.error("Failed to load total count:", err)
      }
    }
    loadTotalCount()
  }, [refreshKey])

  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true)
      try {
        const result = await fetchCCPaymentSuggestions({
          bank_account: selectedBankAccount || undefined,
        })
        setSuggestions(result.data)
      } catch (err) {
        console.error("Failed to load suggestions:", err)
      } finally {
        setLoading(false)
      }
    }
    loadSuggestions()
  }, [selectedBankAccount, refreshKey])

  const handleConfirm = async (bankTxnId: number, suggestion: CCPaymentSuggestion) => {
    try {
      await createCCPaymentMatch({
        bank_transaction_id: bankTxnId,
        credit_card_transaction_id: suggestion.credit_card_transaction.id,
        offset: suggestion.offset,
        confidence_score: suggestion.confidence_score,
        match_reasons: suggestion.match_reasons,
      })
      // Optimistically update: remove the confirmed bank transaction from the list
      setSuggestions((prev) => prev.filter((item) => item.bank_transaction.id !== bankTxnId))
    } catch (error) {
      console.error("Failed to create match:", error)
    }
  }

  return (
    <>
      {/* Filter Section */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Unmatched Bank CC Payments</h2>
            <div className="flex-1" />
            {/* Bank Account Filter */}
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

      {/* Summary Card */}
      <section className="rounded-xl border border-border bg-card shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${suggestions.length > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
            {suggestions.length > 0 ? (
              <CreditCardIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Unmatched CC Payments {selectedBankAccount ? "(filtered)" : ""}
            </p>
            <p className={`text-xl font-bold ${suggestions.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {suggestions.length}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                / {totalCount} total
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Payment Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">All CC payments matched</p>
          <p className="text-sm text-muted-foreground mt-1">
            No unmatched credit card payments found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((item) => (
            <PaymentCard
              key={item.bank_transaction.id}
              item={item}
              onConfirm={handleConfirm}
            />
          ))}
        </div>
      )}
    </>
  )
}

// Confirmed Tab Component
function ConfirmedTab() {
  const [matches, setMatches] = useState<CCPaymentMatch[]>([])
  const [years, setYears] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadYears() {
      try {
        const result = await fetchCCPaymentMatchYears()
        setYears(result.years)
        // Auto-select most recent year if available
        const yearKeys = Object.keys(result.years).sort((a, b) => parseInt(b) - parseInt(a))
        if (yearKeys.length > 0 && !selectedYear) {
          setSelectedYear(yearKeys[0])
        }
      } catch (error) {
        console.error("Failed to load years:", error)
      }
    }
    loadYears()
  }, [refreshKey])

  useEffect(() => {
    async function loadMatches() {
      if (!selectedYear) {
        // Don't load until a year is selected
        return
      }
      setLoading(true)
      try {
        const result = await fetchCCPaymentMatches({
          year: parseInt(selectedYear),
        })
        setMatches(result.data)
      } catch (err) {
        console.error("Failed to load matches:", err)
      } finally {
        setLoading(false)
      }
    }
    loadMatches()
  }, [selectedYear, refreshKey])

  const handleUnmatch = async (matchId: number) => {
    try {
      await deleteCCPaymentMatch(matchId)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      console.error("Failed to delete match:", error)
    }
  }

  // Group matches by month
  const matchesByMonth = matches.reduce((acc, match) => {
    const monthYear = getMonthYear(match.bank_transaction.date)
    if (!acc[monthYear]) {
      acc[monthYear] = []
    }
    acc[monthYear].push(match)
    return acc
  }, {} as Record<string, CCPaymentMatch[]>)

  const sortedMonths = Object.keys(matchesByMonth).sort((a, b) => {
    const dateA = new Date(matchesByMonth[a][0].bank_transaction.date)
    const dateB = new Date(matchesByMonth[b][0].bank_transaction.date)
    return dateB.getTime() - dateA.getTime()
  })

  const yearKeys = Object.keys(years).sort((a, b) => parseInt(b) - parseInt(a))

  return (
    <>
      {/* Year Buttons */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">Confirmed Matches</h2>
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

      {/* Summary Card */}
      <section className="rounded-xl border border-border bg-card shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <LinkIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Confirmed Matches {selectedYear ? `(${selectedYear})` : ""}
            </p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {matches.length}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                / {Object.values(years).reduce((sum, count) => sum + count, 0)} total
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Match Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <XCircleIcon className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-lg font-medium">No matches found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {selectedYear
              ? `No confirmed matches for ${selectedYear}`
              : "No confirmed matches yet"}
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
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Bank Payment</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground"></th>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">CC Payment</th>
                      <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Offset</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Confidence</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchesByMonth[monthYear].map((match) => (
                      <tr key={match.id} className="border-b border-border/30 transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2 mb-1">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {match.bank_transaction.bank_account?.nickname || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(match.bank_transaction.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {match.bank_transaction.narration}
                          </p>
                          <FormattedCurrency
                            amount={match.bank_transaction.amount}
                            className="text-sm font-medium text-red-600 dark:text-red-400 mt-1 block"
                          />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <ArrowRightIcon className="h-5 w-5 text-muted-foreground mx-auto" />
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex items-center gap-2 mb-1">
                            <CreditCardIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {match.credit_card_transaction.credit_card?.nickname || "Unknown"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(match.credit_card_transaction.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {match.credit_card_transaction.description}
                          </p>
                          <FormattedCurrency
                            amount={Math.abs(match.credit_card_transaction.amount)}
                            className="text-sm font-medium text-green-600 dark:text-green-400 mt-1 block"
                          />
                        </td>
                        <td className="p-4 align-middle text-right">
                          <OffsetBadge offset={match.offset} />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <ConfidenceBadge score={match.confidence_score} />
                        </td>
                        <td className="p-4 align-middle text-center">
                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  onClick={() => handleUnmatch(match.id)}
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
                                  Unmatch
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

export function StoryPage() {
  const [activeTab, setActiveTab] = useState<StoryTab>("unmatched")

  useEffect(() => {
    document.title = "Story | FinAccs"
  }, [])

  return (
    <div className="min-h-screen bg-muted/40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("unmatched")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "unmatched"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <SparklesIcon className="h-4 w-4" />
            Unmatched
          </button>
          <button
            onClick={() => setActiveTab("confirmed")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "confirmed"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            Confirmed
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "unmatched" && <UnmatchedTab />}
        {activeTab === "confirmed" && <ConfirmedTab />}
      </main>
      <Footer />
    </div>
  )
}
