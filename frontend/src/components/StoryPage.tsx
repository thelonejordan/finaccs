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
  TagIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Collapsible from "@radix-ui/react-collapsible"
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import {
  fetchCCPaymentSuggestions,
  fetchCCPaymentSuggestionsReverse,
  fetchCCPaymentMatches,
  fetchCCPaymentMatchYears,
  createCCPaymentMatch,
  deleteCCPaymentMatch,
  fetchBankAccounts,
  fetchCreditCards,
  updateTransactionCategory,
  updateCreditCardTransactionCategory,
  type CCPaymentSuggestionItem,
  type CCPaymentSuggestion,
  type CCPaymentSuggestionReverseItem,
  type CCPaymentBankSuggestion,
  type CCPaymentMatch,
  type BankAccount,
  type CreditCard,
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
  onRemoveTag,
}: {
  item: CCPaymentSuggestionItem
  onConfirm: (bankTxnId: number, suggestion: CCPaymentSuggestion) => Promise<void>
  onRemoveTag: (bankTxnId: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [removingTag, setRemovingTag] = useState(false)

  const handleConfirm = async (suggestion: CCPaymentSuggestion) => {
    setConfirmingId(suggestion.credit_card_transaction.id)
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
            {/* Remove Tag Button */}
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
                    Not a CC payment - remove tag
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

// Bank Suggestion Card Component (for CC-first mode)
function BankSuggestionCard({
  suggestion,
  onConfirm,
  isConfirming,
}: {
  suggestion: CCPaymentBankSuggestion
  onConfirm: () => void
  isConfirming: boolean
}) {
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border border-border/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <BuildingIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">
            {suggestion.bank_transaction.bank_account?.nickname || "Unknown Account"}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(suggestion.bank_transaction.date)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {suggestion.bank_transaction.narration}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <FormattedCurrency
            amount={suggestion.bank_transaction.amount}
            className={`text-sm font-medium ${suggestion.bank_transaction.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
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

// Reverse Payment Card Component (CC transaction with bank suggestions)
function ReversePaymentCard({
  item,
  onConfirm,
  onRemoveCCTag,
}: {
  item: CCPaymentSuggestionReverseItem
  onConfirm: (ccTxnId: number, suggestion: CCPaymentBankSuggestion) => Promise<void>
  onRemoveCCTag: (ccTxnId: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [removingTag, setRemovingTag] = useState(false)
  const ccTxn = item.credit_card_transaction
  const hasSuggestions = item.suggestions.length > 0

  const handleConfirm = async (suggestion: CCPaymentBankSuggestion) => {
    setConfirmingId(suggestion.bank_transaction.id)
    try {
      await onConfirm(ccTxn.id, suggestion)
    } finally {
      setConfirmingId(null)
    }
  }

  const handleRemoveCCTag = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRemovingTag(true)
    try {
      await onRemoveCCTag(ccTxn.id)
    } finally {
      setRemovingTag(false)
    }
  }

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
                <CreditCardIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium">
                  {ccTxn.credit_card?.nickname || "Unknown Card"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(ccTxn.date)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground truncate">
                {ccTxn.description}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <FormattedCurrency
                amount={Math.abs(ccTxn.amount)}
                className="text-lg font-semibold text-green-600 dark:text-green-400"
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
            {/* Remove Tag Button */}
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    onClick={handleRemoveCCTag}
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
                    Not a CC payment - remove tag
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
                  <BankSuggestionCard
                    key={suggestion.bank_transaction.id}
                    suggestion={suggestion}
                    onConfirm={() => handleConfirm(suggestion)}
                    isConfirming={confirmingId === suggestion.bank_transaction.id}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <XCircleIcon className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No matching bank transactions found within 7 days
                </p>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

type SuggestionMode = "bank-first" | "cc-first"

// Unmatched Tab Component
function UnmatchedTab() {
  const [mode, setMode] = useState<SuggestionMode>("bank-first")
  const [suggestions, setSuggestions] = useState<CCPaymentSuggestionItem[]>([])
  const [reverseSuggestions, setReverseSuggestions] = useState<CCPaymentSuggestionReverseItem[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBankAccount, setSelectedBankAccount] = useState<number | null>(null)
  const [selectedCreditCard, setSelectedCreditCard] = useState<number | null>(null)
  const [offsetThreshold, setOffsetThreshold] = useState(20)
  const [refreshKey, _setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadFilters() {
      try {
        const [bankData, ccData] = await Promise.all([
          fetchBankAccounts(),
          fetchCreditCards(),
        ])
        setBankAccounts(bankData.accounts)
        setCreditCards(ccData.cards)
      } catch (error) {
        console.error("Failed to load filters:", error)
      }
    }
    loadFilters()
  }, [])

  // Load total count (unfiltered)
  useEffect(() => {
    async function loadTotalCount() {
      try {
        if (mode === "bank-first") {
          const result = await fetchCCPaymentSuggestions({ offset_threshold: offsetThreshold })
          setTotalCount(result.data.length)
        } else {
          const result = await fetchCCPaymentSuggestionsReverse({ offset_threshold: offsetThreshold })
          setTotalCount(result.data.length)
        }
      } catch (err) {
        console.error("Failed to load total count:", err)
      }
    }
    loadTotalCount()
  }, [refreshKey, mode, offsetThreshold])

  useEffect(() => {
    async function loadSuggestions() {
      setLoading(true)
      try {
        if (mode === "bank-first") {
          const result = await fetchCCPaymentSuggestions({
            bank_account: selectedBankAccount || undefined,
            offset_threshold: offsetThreshold,
          })
          setSuggestions(result.data)
          setReverseSuggestions([])
        } else {
          const result = await fetchCCPaymentSuggestionsReverse({
            credit_card: selectedCreditCard || undefined,
            offset_threshold: offsetThreshold,
          })
          setReverseSuggestions(result.data)
          setSuggestions([])
        }
      } catch (err) {
        console.error("Failed to load suggestions:", err)
      } finally {
        setLoading(false)
      }
    }
    loadSuggestions()
  }, [selectedBankAccount, selectedCreditCard, refreshKey, mode, offsetThreshold])

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
      // Decrement total count
      setTotalCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to create match:", error)
    }
  }

  const handleConfirmReverse = async (ccTxnId: number, suggestion: CCPaymentBankSuggestion) => {
    try {
      await createCCPaymentMatch({
        bank_transaction_id: suggestion.bank_transaction.id,
        credit_card_transaction_id: ccTxnId,
        offset: suggestion.offset,
        confidence_score: suggestion.confidence_score,
        match_reasons: suggestion.match_reasons,
      })
      // Optimistically update: remove the confirmed CC transaction from the list
      setReverseSuggestions((prev) => prev.filter((item) => item.credit_card_transaction.id !== ccTxnId))
      // Decrement total count
      setTotalCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to create match:", error)
    }
  }

  const handleRemoveTag = async (bankTxnId: number) => {
    try {
      await updateTransactionCategory(bankTxnId, "Uncategorized")
      // Optimistically update: remove the bank transaction from the list
      setSuggestions((prev) => prev.filter((item) => item.bank_transaction.id !== bankTxnId))
      // Decrement total count
      setTotalCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to remove tag:", error)
    }
  }

  const handleRemoveCCTag = async (ccTxnId: number) => {
    try {
      // Remove "Credit Card Payment" tag to exclude from CC-first suggestions
      await updateCreditCardTransactionCategory(ccTxnId, "Uncategorized")
      // Optimistically update: remove the CC transaction from the list
      setReverseSuggestions((prev) => prev.filter((item) => item.credit_card_transaction.id !== ccTxnId))
      // Decrement total count
      setTotalCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Failed to remove CC tag:", error)
    }
  }

  const currentSuggestions = mode === "bank-first" ? suggestions : reverseSuggestions

  return (
    <>
      {/* Filter Section */}
      <section className="rounded-xl border border-border bg-card shadow-sm mb-6">
        <div className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <h2 className="text-lg font-semibold">
              {mode === "bank-first" ? "Unmatched Bank CC Payments" : "Unmatched CC Payments"}
            </h2>
            <div className="flex-1" />

            {/* Offset Threshold Selector */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-input bg-background">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Max offset:</span>
              <div className="flex items-center gap-1">
                {[0, 20, 40, 60, 80, 100].map((value) => (
                  <button
                    key={value}
                    onClick={() => setOffsetThreshold(value)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      offsetThreshold === value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {value === 100 ? "All" : `${value}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
              <button
                onClick={() => setMode("bank-first")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "bank-first"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BuildingIcon className="h-4 w-4" />
                <ArrowRightIcon className="h-3 w-3" />
                <CreditCardIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMode("cc-first")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "cc-first"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CreditCardIcon className="h-4 w-4" />
                <ArrowRightIcon className="h-3 w-3" />
                <BuildingIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Bank Account Filter (bank-first mode) */}
            {mode === "bank-first" && bankAccounts.length > 0 && (
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

            {/* Credit Card Filter (cc-first mode) */}
            {mode === "cc-first" && creditCards.length > 0 && (
              <Select.Root
                value={selectedCreditCard?.toString() || "all"}
                onValueChange={(value) => {
                  setSelectedCreditCard(value === "all" ? null : parseInt(value, 10))
                }}
              >
                <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                    <Select.Value placeholder="All Cards" />
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
                        <Select.ItemText>All Cards</Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      {creditCards.map((card) => (
                        <Select.Item
                          key={card.id}
                          value={card.id.toString()}
                          className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                        >
                          <Select.ItemText>
                            <span className="font-medium">{card.nickname}</span>
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
          <div className={`p-2 rounded-lg ${currentSuggestions.length > 0 ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
            {currentSuggestions.length > 0 ? (
              <CreditCardIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Unmatched {mode === "bank-first" ? "Bank CC Payments" : "CC Payments"}{" "}
              {(mode === "bank-first" && selectedBankAccount) || (mode === "cc-first" && selectedCreditCard) ? "(filtered)" : ""}
            </p>
            <p className={`text-xl font-bold ${currentSuggestions.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {currentSuggestions.length}
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
      ) : currentSuggestions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">All CC payments matched</p>
          <p className="text-sm text-muted-foreground mt-1">
            No unmatched credit card payments found
          </p>
        </div>
      ) : mode === "bank-first" ? (
        <div className="space-y-4">
          {suggestions.map((item) => (
            <PaymentCard
              key={item.bank_transaction.id}
              item={item}
              onConfirm={handleConfirm}
              onRemoveTag={handleRemoveTag}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {reverseSuggestions.map((item) => (
            <ReversePaymentCard
              key={item.credit_card_transaction.id}
              item={item}
              onConfirm={handleConfirmReverse}
              onRemoveCCTag={handleRemoveCCTag}
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
        // No year selected (likely no matches exist) - stop loading
        setLoading(false)
        setMatches([])
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
                            className={`text-sm font-medium mt-1 block ${match.bank_transaction.is_debit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}
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
