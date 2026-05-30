import { useEffect, useState, useRef, useCallback, memo } from "react"
import { logError } from "@/lib/logger"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams, useNavigate, Link } from "react-router-dom"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  SearchIcon,
  FilterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronDownIcon,
  CheckIcon,
  CreditCardIcon,
  FileIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  GlobeIcon,
  Link2Icon,
  Link2OffIcon,
  XIcon,
  BuildingIcon,
  BookOpenIcon,
  HashIcon,
  UsersIcon,
  TagIcon,
  WalletIcon,
  ScissorsIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import * as Popover from "@radix-ui/react-popover"
import * as Tooltip from "@radix-ui/react-tooltip"
import * as Dialog from "@radix-ui/react-dialog"
import { Footer } from "@/components/Footer"
import { AddToStoryModal } from "@/components/stories/AddToStoryModal"
import { AddToEntityModal } from "@/components/entities/AddToEntityModal"
import { AddToEMIModal } from "@/components/emis/AddToEMIModal"
import {
  fetchCreditCards,
  fetchCreditCardTransactions,
  fetchCreditCardDateRange,
  fetchCreditCardCategories,
  updateCreditCardTransactionCategory,
  deleteCCPaymentMatch,
  fetchSuggestionsForCCTransaction,
  createCCPaymentMatch,
  fetchRefundSuggestionsForTransaction,
  createRefundLink,
  deleteRefundLink,
  getTransactionStories,
  getTransactionEntities,
  getTransactionEMIs,
  createBreakdown,
  type CreditCard,
  type CreditCardTransaction,
  type CreditCardTransactionStats,
  type CreditCardCategoryData,
  type CreditCardDateRangeFilters,
  type DateRange,
  type CCPaymentBankSuggestion,
  type BankPaymentMatchInfo,
  type RefundLinkInfo,
  type RefundSuggestion,
  type StoryBadge,
  type EntityBadge,
  type EMIBadge,
} from "@/lib/api"

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
]

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

function CategorySelectContent({
  categories,
  currentValue,
  onSelect,
  onClose,
}: {
  categories: CreditCardCategoryData[]
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
          className="w-full px-2 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
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
  categories: CreditCardCategoryData[]
  onValueChange: (value: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const displayValue = value || "Uncategorized"

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 max-w-[110px]"
          disabled={disabled}
        >
          <span className="truncate">{displayValue}</span>
          {disabled ? (
            <div className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={4} align="start" className="z-50">
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

function BankPaymentLinkDialog({
  transaction,
  onUnlink,
  onMatchConfirmed,
}: {
  transaction: CreditCardTransaction
  onUnlink: () => void
  onMatchConfirmed: (bankPaymentMatch: BankPaymentMatchInfo) => void
}) {
  const [open, setOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [suggestions, setSuggestions] = useState<CCPaymentBankSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [confirming, setConfirming] = useState<number | null>(null)

  const isLinked = !!transaction.bank_payment_match

  const loadSuggestions = async () => {
    setLoadingSuggestions(true)
    try {
      const data = await fetchSuggestionsForCCTransaction(transaction.id)
      setSuggestions(data.suggestions)
    } catch (error) {
      logError("Failed to load suggestions", error)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  useEffect(() => {
    if (open && !isLinked) {
      loadSuggestions()
    }
  }, [open, isLinked, transaction.id])

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await onUnlink()
      setOpen(false)
    } finally {
      setUnlinking(false)
    }
  }

  const handleConfirmMatch = async (suggestion: CCPaymentBankSuggestion) => {
    setConfirming(suggestion.bank_transaction.id)
    try {
      const result = await createCCPaymentMatch({
        bank_transaction_id: suggestion.bank_transaction.id,
        credit_card_transaction_id: transaction.id,
        offset: suggestion.offset,
        confidence_score: suggestion.confidence_score,
        match_reasons: suggestion.match_reasons,
      })
      onMatchConfirmed({
        id: result.id,
        bank_transaction: suggestion.bank_transaction,
        offset: suggestion.offset,
        confidence_score: suggestion.confidence_score,
        match_reasons: suggestion.match_reasons,
      })
      setOpen(false)
    } catch (error) {
      logError("Failed to confirm match", error)
    } finally {
      setConfirming(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
                ? `Linked to ${transaction.bank_payment_match?.bank_transaction.bank_account?.nickname || "Bank"} on ${formatDate(transaction.bank_payment_match?.bank_transaction.date || "")}`
                : "No bank payment linked"}
              <Tooltip.Arrow className="fill-card" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95 z-50">
          <div className="p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold">
              {isLinked ? "Linked Bank Payment" : "Bank Payment Link"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1">
              {isLinked
                ? "This credit card payment is linked to a bank transaction."
                : "This payment is not linked to any bank transaction."}
            </Dialog.Description>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {/* Current CC transaction info */}
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-1">Credit Card Payment</p>
              <div className="flex items-center gap-2 mb-1">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{transaction.credit_card?.nickname || "Unknown Card"}</span>
              </div>
              <p className="font-medium">{formatDate(transaction.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{transaction.description}</p>
              <p className="text-sm flex items-center gap-1 flex-wrap">
                <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
                  <FormattedCurrency amount={Math.abs(transaction.amount)} />
                  <ArrowUpIcon className="h-3 w-3" />
                </span>
              </p>
            </div>

            {isLinked ? (
              /* Show linked bank transaction */
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-muted-foreground mb-1">Linked Bank Transaction</p>
                  <div className="flex items-center gap-2 mb-1">
                    <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {transaction.bank_payment_match?.bank_transaction.bank_account?.nickname || "Unknown Account"}
                    </span>
                  </div>
                  <p className="font-medium">{formatDate(transaction.bank_payment_match?.bank_transaction.date || "")}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-1">
                    {transaction.bank_payment_match?.bank_transaction.narration}
                  </p>
                  <p className="text-sm flex items-center gap-1">
                    <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
                      <FormattedCurrency amount={transaction.bank_payment_match?.bank_transaction.amount || 0} />
                      <ArrowDownIcon className="h-3 w-3" />
                    </span>
                  </p>
                  {transaction.bank_payment_match && transaction.bank_payment_match.offset !== 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Offset: {transaction.bank_payment_match.offset > 0 ? "+" : ""}
                      {formatCurrency(transaction.bank_payment_match.offset)}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="w-full py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                >
                  {unlinking ? "Unlinking..." : "Unlink Bank Payment"}
                </button>
              </div>
            ) : loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Suggested Matches</p>
                {suggestions.map((s) => (
                  <div key={s.bank_transaction.id} className="p-3 rounded-lg border border-border hover:border-primary/50 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{s.bank_transaction.bank_account?.nickname || "Unknown"}</span>
                      <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {Math.round(s.confidence_score * 100)}% match
                      </span>
                    </div>
                    <p className="text-sm">{formatDate(s.bank_transaction.date)}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">{s.bank_transaction.narration}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
                        <FormattedCurrency amount={s.bank_transaction.amount} />
                        <ArrowDownIcon className="h-3 w-3" />
                      </span>
                      <button
                        onClick={() => handleConfirmMatch(s)}
                        disabled={confirming !== null}
                        className="px-3 py-1 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {confirming === s.bank_transaction.id ? "Confirming..." : "Confirm"}
                      </button>
                    </div>
                    {s.offset !== 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Offset: {s.offset > 0 ? "+" : ""}{formatCurrency(s.offset)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Link2OffIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No suggestions found</p>
                <p className="text-sm mt-1">No matching bank payments within 7 days</p>
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

function RefundLinkDialog({
  transaction,
  onUnlink,
  onLinkConfirmed,
}: {
  transaction: CreditCardTransaction
  onUnlink: () => void
  onLinkConfirmed: (refundLink: RefundLinkInfo, otherTxnId: number, otherTxnType: string, otherRefundLink: RefundLinkInfo) => void
}) {
  const [open, setOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [suggestions, setSuggestions] = useState<RefundSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const isLinked = !!transaction.refund_link

  const loadSuggestions = async () => {
    setLoadingSuggestions(true)
    try {
      const data = await fetchRefundSuggestionsForTransaction('credit_card', transaction.id)
      setSuggestions(data.suggestions)
    } catch (error) {
      logError("Failed to load refund suggestions", error)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  useEffect(() => {
    if (open && !isLinked) {
      loadSuggestions()
    }
  }, [open, isLinked, transaction.id])

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await onUnlink()
      setOpen(false)
    } finally {
      setUnlinking(false)
    }
  }

  const handleConfirmLink = async (suggestion: RefundSuggestion) => {
    const key = `${suggestion.transaction.type}:${suggestion.transaction.id}`
    setConfirming(key)
    try {
      const isRefundSide = transaction.category === 'Refund'
      const result = await createRefundLink({
        refund_transaction_id: isRefundSide ? transaction.id : suggestion.transaction.id,
        refund_type: isRefundSide ? 'credit_card' : suggestion.transaction.type,
        original_transaction_id: isRefundSide ? suggestion.transaction.id : transaction.id,
        original_type: isRefundSide ? suggestion.transaction.type : 'credit_card',
      })
      const myRole: 'refund' | 'original' = isRefundSide ? 'refund' : 'original'
      const otherRole: 'refund' | 'original' = isRefundSide ? 'original' : 'refund'
      onLinkConfirmed(
        { id: result.id, role: myRole, other_transaction: suggestion.transaction },
        suggestion.transaction.id,
        suggestion.transaction.type,
        { id: result.id, role: otherRole, other_transaction: result[isRefundSide ? 'refund_transaction' : 'original_transaction'] },
      )
      setOpen(false)
    } catch (error) {
      logError("Failed to confirm refund link", error)
    } finally {
      setConfirming(null)
    }
  }

  const other = transaction.refund_link?.other_transaction
  const otherIcon = other?.account?.type === 'credit_card'
    ? <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
    : <BuildingIcon className="h-4 w-4 text-muted-foreground" />

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
                ? `Refund linked to ${other?.account?.nickname || "transaction"} on ${formatDate(other?.date || "")}`
                : "No refund link"}
              <Tooltip.Arrow className="fill-card" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden animate-in fade-in-0 zoom-in-95 z-50">
          <div className="p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold">
              {isLinked ? "Linked Refund" : "Refund Link"}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mt-1">
              {isLinked
                ? `This transaction is the ${transaction.refund_link?.role === 'refund' ? 'refund' : 'original charge'} in a refund link.`
                : "Find and link the original transaction for this refund."}
            </Dialog.Description>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-1">
                {transaction.refund_link?.role === 'original' ? 'Original Charge' : 'Refund Transaction'}
              </p>
              <div className="flex items-center gap-2 mb-1">
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{transaction.credit_card?.nickname || "Unknown Card"}</span>
              </div>
              <p className="font-medium">{formatDate(transaction.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{transaction.description}</p>
              <p className="text-sm flex items-center gap-1 flex-wrap">
                {transaction.amount < 0 ? (
                  <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
                    <FormattedCurrency amount={Math.abs(transaction.amount)} />
                    <ArrowUpIcon className="h-3 w-3" />
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
                    <FormattedCurrency amount={transaction.amount} />
                    <ArrowDownIcon className="h-3 w-3" />
                  </span>
                )}
              </p>
            </div>

            {isLinked && other ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-muted-foreground mb-1">
                    {transaction.refund_link?.role === 'refund' ? 'Original Charge' : 'Refund'}
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    {otherIcon}
                    <span className="font-medium">
                      {other.account?.nickname || "Unknown"}
                    </span>
                  </div>
                  <p className="font-medium">{formatDate(other.date)}</p>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-1">
                    {other.description}
                  </p>
                  <p className="text-sm flex items-center gap-1">
                    {other.is_debit ? (
                      <span className="text-red-600 dark:text-red-400 inline-flex items-center gap-0.5">
                        <FormattedCurrency amount={other.amount} />
                        <ArrowDownIcon className="h-3 w-3" />
                      </span>
                    ) : (
                      <span className="text-green-600 dark:text-green-400 inline-flex items-center gap-0.5">
                        <FormattedCurrency amount={other.amount} />
                        <ArrowUpIcon className="h-3 w-3" />
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="w-full py-2 px-4 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                >
                  {unlinking ? "Unlinking..." : "Unlink Refund"}
                </button>
              </div>
            ) : loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Suggested Original Transactions</p>
                {suggestions.map((s) => {
                  const key = `${s.transaction.type}:${s.transaction.id}`
                  const icon = s.transaction.account?.type === 'credit_card'
                    ? <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                    : <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                  return (
                    <div key={key} className="p-3 rounded-lg border border-border hover:border-primary/50 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        {icon}
                        <span className="font-medium">{s.transaction.account?.nickname || "Unknown"}</span>
                        <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {Math.round(s.confidence_score * 100)}% match
                        </span>
                      </div>
                      <p className="text-sm">{formatDate(s.transaction.date)}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{s.transaction.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-sm inline-flex items-center gap-0.5 ${
                          s.transaction.is_debit
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }`}>
                          <FormattedCurrency amount={s.transaction.amount} />
                          {s.transaction.is_debit
                            ? <ArrowDownIcon className="h-3 w-3" />
                            : <ArrowUpIcon className="h-3 w-3" />
                          }
                        </span>
                        <button
                          onClick={() => handleConfirmLink(s)}
                          disabled={confirming !== null}
                          className="px-3 py-1 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {confirming === key ? "Confirming..." : "Confirm"}
                        </button>
                      </div>
                      {s.offset !== 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Offset: {s.offset > 0 ? "+" : ""}{formatCurrency(s.offset)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Link2OffIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No suggestions found</p>
                <p className="text-sm mt-1">No matching transactions within 180 days</p>
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

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  paginationRef,
  className = "",
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  paginationRef?: React.RefObject<HTMLDivElement | null>
  className?: string
}) {
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0
  const endItem = Math.min(page * pageSize, total)

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <p className="text-sm text-muted-foreground">
        {startItem}-{endItem} of {total}
      </p>
      {totalPages > 1 && (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="First page"
        >
          <ChevronsLeftIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div
          ref={paginationRef}
          className="flex items-center gap-1 max-w-[300px] overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              data-active={page === p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                page === p
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next page"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-input hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Last page"
        >
          <ChevronsRightIcon className="h-4 w-4" />
        </button>
      </div>
      )}
    </div>
  )
}

const TransactionRow = memo(function TransactionRow({
  transaction,
  isSelected,
  isUpdating,
  categories,
  stories,
  entities,
  emis,
  onSelect,
  onCategoryChange,
  onUnlink,
  onMatchConfirmed,
  onRefundUnlink,
  onRefundLinkConfirmed,
}: {
  transaction: CreditCardTransaction
  isSelected: boolean
  isUpdating: boolean
  categories: CreditCardCategoryData[]
  stories: StoryBadge[]
  entities: EntityBadge[]
  emis: EMIBadge[]
  onSelect: (id: number, event: React.MouseEvent) => void
  onCategoryChange: (transactionId: number, newCategory: string) => void
  onUnlink: (matchId: number, transactionId: number) => void
  onMatchConfirmed: (transactionId: number, bankPaymentMatch: BankPaymentMatchInfo) => void
  onRefundUnlink: (linkId: number, transactionId: number) => void
  onRefundLinkConfirmed: (transactionId: number, refundLink: RefundLinkInfo, otherTxnId: number, otherTxnType: string, otherRefundLink: RefundLinkInfo) => void
}) {
  const t = transaction
  return (
    <tr className={`border-b border-border/40 transition-colors hover:bg-muted/50 ${isSelected ? 'bg-primary/5' : ''}`}>
      <td className="px-3 py-3 align-middle text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onClick={(e) => onSelect(t.id, e)}
          readOnly
          className="rounded border-border"
        />
      </td>
      <td className="px-4 py-3 align-middle text-sm text-muted-foreground whitespace-nowrap">
        {formatDate(t.date)}
      </td>
      <td className="px-4 py-3 align-middle overflow-hidden">
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="text-sm truncate block cursor-default">
                {t.description}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-md"
                sideOffset={4}
              >
                {t.description}
                <Tooltip.Arrow className="fill-card" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      </td>
      <td className="px-4 py-3 align-middle overflow-hidden">
        {t.credit_card ? (
          <span className="text-sm text-muted-foreground truncate block">
            {t.credit_card.nickname}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground/50">-</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle overflow-hidden">
        {t.source_file ? (
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span className="text-sm text-muted-foreground truncate block cursor-default">
                  {t.source_file.filename}
                </span>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm z-50"
                  sideOffset={4}
                >
                  {t.source_file.filename}
                  <Tooltip.Arrow className="fill-card" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        ) : (
          <span className="text-sm text-muted-foreground/50">-</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
        <CategorySelect
          value={t.category}
          categories={categories}
          onValueChange={(value) => onCategoryChange(t.id, value)}
          disabled={isUpdating}
        />
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center justify-center gap-1">
          {(t.bank_payment_match || t.category === 'Credit Card Payment') && (
            <BankPaymentLinkDialog
              transaction={t}
              onUnlink={() => t.bank_payment_match && onUnlink(t.bank_payment_match.id, t.id)}
              onMatchConfirmed={(match) => onMatchConfirmed(t.id, match)}
            />
          )}
          {(t.refund_link || (t.category === 'Refund' && !t.bank_payment_match)) && (
            <RefundLinkDialog
              transaction={t}
              onUnlink={() => t.refund_link && onRefundUnlink(t.refund_link.id, t.id)}
              onLinkConfirmed={(link, otherTxnId, otherTxnType, otherLink) => onRefundLinkConfirmed(t.id, link, otherTxnId, otherTxnType, otherLink)}
            />
          )}
          {/* Stories icon */}
          {stories.length > 0 && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button className="p-1 rounded hover:bg-muted transition-colors">
                  <BookOpenIcon className="h-4 w-4 text-blue-500" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm max-w-xs z-50"
                  sideOffset={4}
                >
                  <p className="font-medium mb-1">Stories</p>
                  <div className="space-y-1">
                    {stories.map(s => (
                      <Link
                        key={s.story_id}
                        to={`/stories/${s.story_id}`}
                        className="flex items-center gap-1.5 hover:text-primary"
                      >
                        <span>{s.icon}</span>
                        <span className="text-muted-foreground hover:text-primary">{s.name}</span>
                      </Link>
                    ))}
                  </div>
                  <Tooltip.Arrow className="fill-card" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
          {/* Entities icon */}
          {entities.length > 0 && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button className="p-1 rounded hover:bg-muted transition-colors">
                  <UsersIcon className="h-4 w-4 text-purple-500" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm max-w-xs z-50"
                  sideOffset={4}
                >
                  <p className="font-medium mb-1">Entities</p>
                  <div className="space-y-1">
                    {entities.map(e => (
                      <Link
                        key={e.entity_id}
                        to={`/entities/${e.entity_id}`}
                        className="flex items-center gap-1.5 hover:text-primary"
                      >
                        <span>{e.icon}</span>
                        <span className="text-muted-foreground hover:text-primary">{e.name}</span>
                      </Link>
                    ))}
                  </div>
                  <Tooltip.Arrow className="fill-card" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
          {/* EMIs icon */}
          {emis.length > 0 && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button className="p-1 rounded hover:bg-muted transition-colors">
                  <WalletIcon className="h-4 w-4 text-amber-500" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm max-w-xs z-50"
                  sideOffset={4}
                >
                  <p className="font-medium mb-1">EMIs</p>
                  <div className="space-y-1">
                    {emis.map(e => (
                      <Link
                        key={e.emi_id}
                        to={`/emis/${e.emi_id}`}
                        className="flex items-center gap-1.5 hover:text-primary"
                      >
                        <WalletIcon className="h-3 w-3" />
                        <span className="text-muted-foreground hover:text-primary">{e.name}</span>
                      </Link>
                    ))}
                  </div>
                  <Tooltip.Arrow className="fill-card" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
          {/* Show dash if no links, stories, entities, or EMIs */}
          {!t.bank_payment_match && t.category !== 'Credit Card Payment' && t.category !== 'Refund' &&
           stories.length === 0 && entities.length === 0 && emis.length === 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 text-muted-foreground/40 text-xs">-</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-right text-sm text-muted-foreground">
        {t.intl_amount > 0 ? (
          <div className="flex flex-col items-end">
            <span>{t.intl_amount.toFixed(2)} {t.intl_currency || 'USD'}</span>
            {t.exchange_rate && <span className="text-muted-foreground/50 text-xs">@ {t.exchange_rate.toFixed(2)}</span>}
          </div>
        ) : "-"}
      </td>
      <td className="px-4 py-3 align-middle text-right">
        {t.amount < 0 ? (
          <span className="text-(--color-income) font-medium flex items-center justify-end gap-1">
            <FormattedCurrency amount={Math.abs(t.amount)} />
            <ArrowUpIcon className="h-3 w-3 flex-shrink-0" />
          </span>
        ) : (
          <span className="text-(--color-expense) font-medium flex items-center justify-end gap-1">
            <FormattedCurrency amount={t.amount} />
            <ArrowDownIcon className="h-3 w-3 flex-shrink-0" />
          </span>
        )}
      </td>
    </tr>
  )
})

export function CreditCardTransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Helper to get initial values from URL
  const getInitialYear = () => {
    const year = searchParams.get('year')
    return year ? parseInt(year, 10) : null
  }
  const getInitialMonth = () => {
    const month = searchParams.get('month')
    return month ? parseInt(month, 10) : null
  }

  const [transactions, setTransactions] = useState<CreditCardTransaction[]>([])
  const [categories, setCategories] = useState<CreditCardCategoryData[]>([])
  const [creditCards, setCreditCards] = useState<CreditCard[]>([])
  const [availableDataSources, setAvailableDataSources] = useState<Array<{ id: number; source_filename: string; credit_card_id: number | null }>>([])
  const [stats, setStats] = useState<CreditCardTransactionStats | null>(null)
  const [allTimeStats, setAllTimeStats] = useState<{ total: number; stats: CreditCardTransactionStats } | null>(null)
  const [showTotals, setShowTotals] = useState(false)
  const statsRef = useRef<HTMLElement>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [updatingId, setUpdatingId] = useState<number | null>(null)

  // Selection state for adding to stories/entities
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [addToStoryModalOpen, setAddToStoryModalOpen] = useState(false)
  const [addToEntityModalOpen, setAddToEntityModalOpen] = useState(false)
  const [addToEMIModalOpen, setAddToEMIModalOpen] = useState(false)
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false)
  const [bulkCategoryUpdating, setBulkCategoryUpdating] = useState(false)
  const lastSelectedIndexRef = useRef<number | null>(null)

  // Transaction stories, entities, and EMIs
  const [transactionStories, setTransactionStories] = useState<Record<string, StoryBadge[]>>({})
  const [transactionEntities, setTransactionEntities] = useState<Record<string, EntityBadge[]>>({})
  const [transactionEMIs, setTransactionEMIs] = useState<Record<string, EMIBadge[]>>({})

  // Date range state - initialize from URL
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [fullDateRange, setFullDateRange] = useState<DateRange | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(getInitialYear)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(getInitialMonth)
  const [showAllYear, setShowAllYear] = useState<boolean>(() => {
    return searchParams.get('show_all_year') === 'true'
  })

  // Filters - initialize from URL
  const [search, setSearch] = useState(searchParams.get('search') || "")
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get('search') || "")
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get('category') || "")
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') || "")
  const [selectedCreditCard, setSelectedCreditCard] = useState<number | null>(() => {
    const val = searchParams.get('credit_card')
    return val ? parseInt(val, 10) : null
  })
  const [selectedDataSource, setSelectedDataSource] = useState<number | null>(() => {
    const val = searchParams.get('data_source')
    return val ? parseInt(val, 10) : null
  })
  const [page, setPageState] = useState(() => {
    const val = searchParams.get('page')
    return val ? parseInt(val, 10) : 1
  })
  const pageSize = 50
  const paginationRef = useRef<HTMLDivElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const tableSectionRef = useRef<HTMLElement>(null)
  const prevPageRowRef = useRef<HTMLTableRowElement>(null)
  const [lockedHeight, setLockedHeight] = useState<number | null>(null)
  const isPageChangeRef = useRef(false)
  const shouldScrollToTableRef = useRef(false)

  // Auto-scroll preference (synced with Header via custom event)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
    const saved = localStorage.getItem('autoScrollToTable')
    return saved !== null ? saved === 'true' : true // default enabled
  })

  // Cache scroll positions for last 3 pages (page number -> scroll position)
  const scrollCacheRef = useRef<Map<number, number>>(new Map())
  const targetPageRef = useRef<number | null>(null)
  const currentPageRef = useRef<number>(page)

  // Wrapper to preserve scroll position when changing pages
  const setPage = useCallback((newPage: number | ((prev: number) => number)) => {
    const resolvedNewPage = typeof newPage === 'function' ? newPage(currentPageRef.current) : newPage

    // Save current page's scroll position before leaving
    const currentScroll = tableContainerRef.current?.scrollTop ?? 0
    scrollCacheRef.current.set(currentPageRef.current, currentScroll)

    // Limit cache to 3 entries (remove oldest if needed)
    if (scrollCacheRef.current.size > 3) {
      const firstKey = scrollCacheRef.current.keys().next().value
      if (firstKey !== undefined) {
        scrollCacheRef.current.delete(firstKey)
      }
    }

    // Mark target page to restore scroll after load
    targetPageRef.current = resolvedNewPage

    // Save the current table height to prevent layout shift
    if (tableContainerRef.current) {
      setLockedHeight(tableContainerRef.current.offsetHeight)
    }
    isPageChangeRef.current = true
    currentPageRef.current = resolvedNewPage
    setPageState(resolvedNewPage)
  }, [])

  // Update URL when filters change
  const updateURL = useCallback((updates: Record<string, string | number | null>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev)
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || (key === 'page' && value === 1)) {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      })
      return newParams
    }, { replace: true, preventScrollReset: true })
  }, [setSearchParams])

  useEffect(() => {
    document.title = "Credit Cards | FinAccs"
    window.scrollTo(0, 0)
  }, [])

  // Handle click outside to hide totals
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statsRef.current && !statsRef.current.contains(event.target as Node)) {
        setShowTotals(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Listen for auto-scroll changes from Header
  useEffect(() => {
    const handleAutoScrollChange = (e: CustomEvent<boolean>) => {
      setAutoScrollEnabled(e.detail)
    }
    window.addEventListener('autoScrollChange', handleAutoScrollChange as EventListener)
    return () => window.removeEventListener('autoScrollChange', handleAutoScrollChange as EventListener)
  }, [])

  // Sync state to URL
  useEffect(() => {
    updateURL({
      year: selectedYear,
      month: showAllYear ? null : selectedMonth,
      show_all_year: showAllYear ? 'true' : null,
      search: debouncedSearch || null,
      category: selectedCategory || null,
      type: selectedType || null,
      credit_card: selectedCreditCard,
      data_source: selectedDataSource,
      page: page,
    })
  }, [selectedYear, selectedMonth, showAllYear, debouncedSearch, selectedCategory, selectedType, selectedCreditCard, selectedDataSource, page, updateURL])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, setPage])

  // Load full date range (unfiltered, for showing all years/months)
  useEffect(() => {
    async function loadFullDateRange() {
      try {
        const data = await fetchCreditCardDateRange()
        setFullDateRange(data)

        const years = Object.keys(data.years).map(Number).sort((a, b) => b - a)

        // Auto-select most recent year and month on initial load
        if (selectedYear === null && years.length > 0) {
          const latestYear = years[0]
          setSelectedYear(latestYear)
          const months = data.years[latestYear.toString()]
          if (months && months.length > 0) {
            setSelectedMonth(months[months.length - 1])
          }
        }

        // If no data available, stop loading
        if (years.length === 0) {
          setLoading(false)
        }
      } catch (error) {
        logError("Failed to load full date range", error)
        setLoading(false)
      }
    }
    loadFullDateRange()
  }, [])

  // Load date range (re-fetch when filters change)
  useEffect(() => {
    async function loadDateRange() {
      try {
        const filters: CreditCardDateRangeFilters = {}
        if (selectedCreditCard) filters.credit_card = selectedCreditCard
        if (selectedCategory) filters.category = selectedCategory
        if (selectedType) filters.type = selectedType
        if (debouncedSearch) filters.search = debouncedSearch

        const data = await fetchCreditCardDateRange(filters)
        setDateRange(data)

        // If current selection has no data after filtering, try to find valid selection
        if (selectedYear && selectedMonth) {
          const years = Object.keys(data.years).map(Number)
          if (!years.includes(selectedYear)) {
            // Current year has no data with these filters
            // Don't auto-change selection, just let user see greyed out
          }
        }
      } catch (error) {
        logError("Failed to load date range", error)
      }
    }
    loadDateRange()
  }, [selectedCreditCard, selectedCategory, selectedType, debouncedSearch])

  // Scroll pagination slider to show current page
  useEffect(() => {
    setTimeout(() => {
      const container = paginationRef.current
      const activeBtn = container?.querySelector('[data-active="true"]') as HTMLElement
      if (container && activeBtn) {
        const containerRect = container.getBoundingClientRect()
        const btnRect = activeBtn.getBoundingClientRect()
        const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (containerRect.width / 2) + (btnRect.width / 2)
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
      }
    }, 50)
  }, [page, total])

  const handleCategoryChange = useCallback(async (transactionId: number, newCategory: string) => {
    setUpdatingId(transactionId)
    try {
      await updateCreditCardTransactionCategory(transactionId, newCategory)
      // Update local state instead of full refetch
      setTransactions(prev => prev.map(t =>
        t.id === transactionId ? { ...t, category: newCategory } : t
      ))
    } catch (error) {
      logError("Failed to update category", error)
    } finally {
      setUpdatingId(null)
    }
  }, [])

  const handleUnlinkBankPayment = useCallback(async (matchId: number, transactionId: number) => {
    try {
      await deleteCCPaymentMatch(matchId)
      // Update local state instead of full refetch
      setTransactions(prev => prev.map(t =>
        t.id === transactionId ? { ...t, bank_payment_match: null } : t
      ))
    } catch (error) {
      logError("Failed to unlink bank payment", error)
    }
  }, [])

  const handleMatchConfirmed = useCallback((transactionId: number, bankPaymentMatch: BankPaymentMatchInfo) => {
    setTransactions(prev => prev.map(t =>
      t.id === transactionId ? { ...t, bank_payment_match: bankPaymentMatch } : t
    ))
  }, [])

  const handleUnlinkRefund = useCallback(async (linkId: number, _transactionId: number) => {
    try {
      await deleteRefundLink(linkId)
      setTransactions(prev => prev.map(t =>
        t.refund_link?.id === linkId ? { ...t, refund_link: null } : t
      ))
    } catch (error) {
      logError("Failed to unlink refund", error)
    }
  }, [])

  const handleRefundLinkConfirmed = useCallback((transactionId: number, refundLink: RefundLinkInfo, otherTxnId: number, otherTxnType: string, otherRefundLink: RefundLinkInfo) => {
    setTransactions(prev => prev.map(t => {
      if (t.id === transactionId) return { ...t, refund_link: refundLink }
      if (otherTxnType === 'credit_card' && t.id === otherTxnId) return { ...t, refund_link: otherRefundLink }
      return t
    }))
  }, [])

  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await fetchCreditCardCategories({ include_all: true })
        setCategories(data.data)
      } catch (error) {
        logError("Failed to load categories", error)
      }
    }
    loadCategories()
  }, [])

  // Load all-time stats once
  useEffect(() => {
    async function loadAllTimeStats() {
      try {
        const data = await fetchCreditCardTransactions({ limit: 1 })
        setAllTimeStats({ total: data.total, stats: data.stats })
      } catch (error) {
        logError("Failed to load all-time stats", error)
      }
    }
    loadAllTimeStats()
  }, [])

  useEffect(() => {
    async function loadCreditCards() {
      try {
        const data = await fetchCreditCards()
        setCreditCards(data.cards)
      } catch (error) {
        logError("Failed to load credit cards", error)
      }
    }
    loadCreditCards()
  }, [])


  useEffect(() => {
    async function loadTransactions() {
      if (!selectedYear || (!showAllYear && !selectedMonth)) {
        setLoading(false)
        return
      }

      // Only show loading spinner if not a page change (to prevent layout shift)
      const isPageChange = isPageChangeRef.current
      if (!isPageChange) {
        setLoading(true)
      }

      try {
        const data = await fetchCreditCardTransactions({
          category: selectedCategory || undefined,
          type: selectedType || undefined,
          credit_card: selectedCreditCard || undefined,
          data_source_artifact: selectedDataSource || undefined,
          year: selectedYear,
          month: showAllYear ? undefined : (selectedMonth ?? undefined),
          search: debouncedSearch || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        })
        setTransactions(data.data)
        setTotal(data.total)
        setStats(data.stats)
        setAvailableDataSources(data.available_data_sources || [])

        // Fetch stories, entities, and EMIs for these transactions
        if (data.data.length > 0) {
          const transactionRefs = data.data.map(t => ({ type: 'credit_card' as const, id: t.id }))
          try {
            const [storiesData, entitiesData, emisData] = await Promise.all([
              getTransactionStories(transactionRefs),
              getTransactionEntities(transactionRefs),
              getTransactionEMIs(transactionRefs),
            ])
            setTransactionStories(storiesData.transaction_stories)
            setTransactionEntities(entitiesData.transaction_entities)
            setTransactionEMIs(emisData.transaction_emis)
          } catch (error) {
            logError("Failed to load transaction stories/entities/emis", error)
          }
        } else {
          setTransactionStories({})
          setTransactionEntities({})
          setTransactionEMIs({})
        }
      } catch (error) {
        logError("Failed to load transactions", error)
      } finally {
        setLoading(false)
        // Clear the height lock and page change flag after data loads
        const wasPageChange = isPageChangeRef.current
        isPageChangeRef.current = false
        setLockedHeight(null)

        // Clear scroll cache when month/year changed
        if (shouldScrollToTableRef.current) {
          shouldScrollToTableRef.current = false
          scrollCacheRef.current.clear()
          if (autoScrollEnabled && tableSectionRef.current) {
            requestAnimationFrame(() => {
              const headerOffset = 56 + 16 // header height (h-14 = 56px) + margin
              const elementPosition = tableSectionRef.current!.getBoundingClientRect().top
              const offsetPosition = elementPosition + window.scrollY - headerOffset
              window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
            })
          }
        } else if (wasPageChange) {
          // Scroll table container past the "Previous page" row so first transaction is at top
          targetPageRef.current = null
          requestAnimationFrame(() => {
            if (tableContainerRef.current && prevPageRowRef.current) {
              const rowHeight = prevPageRowRef.current.offsetHeight
              tableContainerRef.current.scrollTo(0, rowHeight)
            } else if (tableContainerRef.current) {
              tableContainerRef.current.scrollTo(0, 0)
            }
          })
        }
      }
    }
    loadTransactions()
  }, [selectedCategory, selectedType, selectedCreditCard, selectedDataSource, selectedYear, selectedMonth, showAllYear, debouncedSearch, page])

  const totalPages = Math.ceil(total / pageSize)

  // Clear selection when page/filters change
  useEffect(() => {
    setSelectedIds(new Set())
    lastSelectedIndexRef.current = null
  }, [selectedCategory, selectedType, selectedCreditCard, selectedDataSource, selectedYear, selectedMonth, showAllYear, debouncedSearch, page])

  // Selection helpers
  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)))
    }
    lastSelectedIndexRef.current = null
  }

  const handleSelect = useCallback((id: number, event: React.MouseEvent) => {
    const currentIndex = transactions.findIndex(t => t.id === id)

    if (event.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: select range
      const start = Math.min(lastSelectedIndexRef.current, currentIndex)
      const end = Math.max(lastSelectedIndexRef.current, currentIndex)
      const newSet = new Set(selectedIds)
      for (let i = start; i <= end; i++) {
        newSet.add(transactions[i].id)
      }
      setSelectedIds(newSet)
    } else {
      // Normal click: toggle single item
      const newSet = new Set(selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      setSelectedIds(newSet)
      lastSelectedIndexRef.current = currentIndex
    }
  }, [transactions, selectedIds])

  const handleAddedToStory = async () => {
    setSelectedIds(new Set())
    // Refresh stories for current transactions
    if (transactions.length > 0) {
      const transactionRefs = transactions.map(t => ({ type: 'credit_card' as const, id: t.id }))
      try {
        const storiesData = await getTransactionStories(transactionRefs)
        setTransactionStories(storiesData.transaction_stories)
      } catch (error) {
        logError("Failed to refresh transaction stories", error)
      }
    }
  }

  const handleAddedToEntity = async () => {
    setSelectedIds(new Set())
    // Refresh entities for current transactions
    if (transactions.length > 0) {
      const transactionRefs = transactions.map(t => ({ type: 'credit_card' as const, id: t.id }))
      try {
        const entitiesData = await getTransactionEntities(transactionRefs)
        setTransactionEntities(entitiesData.transaction_entities)
      } catch (error) {
        logError("Failed to refresh transaction entities", error)
      }
    }
  }

  const handleAddedToEMI = async () => {
    setSelectedIds(new Set())
    if (transactions.length > 0) {
      const transactionRefs = transactions.map(t => ({ type: 'credit_card' as const, id: t.id }))
      try {
        const emisData = await getTransactionEMIs(transactionRefs)
        setTransactionEMIs(emisData.transaction_emis)
      } catch (error) {
        logError("Failed to refresh transaction EMIs", error)
      }
    }
  }

  const handleBulkCategoryChange = async (newCategory: string) => {
    setBulkCategoryUpdating(true)
    try {
      // Update all selected transactions in parallel
      await Promise.all(
        Array.from(selectedIds).map(id => updateCreditCardTransactionCategory(id, newCategory))
      )
      // Update local state
      setTransactions(prev => prev.map(t =>
        selectedIds.has(t.id) ? { ...t, category: newCategory } : t
      ))
      setSelectedIds(new Set())
      setBulkCategoryOpen(false)
    } catch (error) {
      logError("Failed to update categories", error)
    } finally {
      setBulkCategoryUpdating(false)
    }
  }

  // Get available years and months (from filtered date range - used to determine which have data)
  const availableYears = dateRange ? Object.keys(dateRange.years).map(Number).sort((a, b) => b - a) : []
  const availableMonths = selectedYear && dateRange ? (dateRange.years[selectedYear.toString()] || []) : []

  // Generate all years in range (from full/unfiltered date range - used to show all years)
  const fullYears = fullDateRange ? Object.keys(fullDateRange.years).map(Number).sort((a, b) => b - a) : []
  const allYearsInRange = fullYears.length > 0
    ? Array.from(
        { length: fullYears[0] - fullYears[fullYears.length - 1] + 1 },
        (_, i) => fullYears[0] - i
      )
    : []

  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    // Reset to first available month in that year
    if (dateRange) {
      const months = dateRange.years[year.toString()]
      if (months && months.length > 0) {
        setSelectedMonth(months[months.length - 1])
      } else {
        setSelectedMonth(null)
      }
    }
    setPageState(1)
    shouldScrollToTableRef.current = true
  }

  const handleMonthChange = (month: number) => {
    setSelectedMonth(month)
    setPageState(1)
    shouldScrollToTableRef.current = true
  }

  return (
    <Tooltip.Provider>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CreditCardIcon className="h-6 w-6 text-primary" />
              </div>
              Transactions
            </h1>
            <p className="text-muted-foreground mt-1">
              Credit card transactions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Domain toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => navigate('/transactions?domain=bank')}
                className="px-3 py-1.5 text-sm rounded-md transition-colors text-muted-foreground hover:text-foreground"
              >
                Bank Account
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded-md transition-colors bg-background text-foreground shadow-sm"
              >
                Credit Card
              </button>
            </div>
          </div>
        </header>

        {/* Year Tabs */}
        <section className="mb-4">
          <div className="flex flex-wrap gap-2">
            {allYearsInRange.map((year) => {
              const hasData = availableYears.includes(year)
              const isSelected = selectedYear === year

              return (
                <button
                  key={year}
                  onClick={() => hasData && handleYearChange(year)}
                  disabled={!hasData}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : hasData
                      ? "bg-card border-border hover:bg-accent"
                      : "bg-muted text-muted-foreground/40 border-muted cursor-not-allowed"
                  }`}
                >
                  {year}
                </button>
              )
            })}
          </div>
        </section>

        {/* Month Tabs */}
        <section className="mb-6">
          <div className="flex items-center gap-4">
            <div className={`flex flex-wrap gap-2 ${showAllYear ? "opacity-40" : ""}`}>
              {[...MONTH_NAMES].reverse().map((name, index) => {
                const monthNum = 12 - index
                const hasData = availableMonths.includes(monthNum)
                const isSelected = selectedMonth === monthNum

                return (
                  <button
                    key={monthNum}
                    onClick={() => hasData && !showAllYear && handleMonthChange(monthNum)}
                    disabled={!hasData || showAllYear}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : hasData
                        ? "bg-card border-border hover:bg-accent"
                        : "bg-muted text-muted-foreground/40 border-muted cursor-not-allowed"
                    }`}
                  >
                    {name}
                  </button>
                )
              })}
            </div>
            {/* All Year Toggle */}
            <button
              onClick={() => {
                setShowAllYear(!showAllYear)
                setPageState(1)
                shouldScrollToTableRef.current = true
              }}
              className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showAllYear
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <div className={`w-8 h-4 rounded-full relative transition-colors ${
                showAllYear ? "bg-primary-foreground/30" : "bg-border"
              }`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                  showAllYear
                    ? "right-0.5 bg-primary-foreground"
                    : "left-0.5 bg-muted-foreground"
                }`} />
              </div>
              All Year
            </button>
          </div>
        </section>

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
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                />
              </div>

              {/* Category Filter */}
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

              {/* Type Filter */}
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
                  <Select.Content className="bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden" position="popper" sideOffset={4}>
                    <Select.Viewport className="p-1 max-h-60 overflow-y-auto">
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
                        value="payment"
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                      >
                        <Select.ItemText>Payments Only</Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                      <Select.Item
                        value="charge"
                        className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                      >
                        <Select.ItemText>Charges Only</Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>

              {/* Credit Card Filter */}
              {creditCards.length > 0 && (
                <Select.Root
                  value={selectedCreditCard?.toString() || "all"}
                  onValueChange={(value) => {
                    const newCreditCard = value === "all" ? null : parseInt(value, 10)
                    setSelectedCreditCard(newCreditCard)
                    // Clear data source filter when credit card changes - available sources will update
                    if (selectedDataSource) {
                      setSelectedDataSource(null)
                    }
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]">
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
                              <span className="text-muted-foreground ml-1">
                                ({card.issuer})
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

              {/* Data Source Filter */}
              {availableDataSources.length > 0 && (
                <Select.Root
                  value={selectedDataSource?.toString() || "all"}
                  onValueChange={(value) => {
                    setSelectedDataSource(value === "all" ? null : parseInt(value, 10))
                    setPage(1)
                  }}
                >
                  <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-w-[160px]">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                      <Select.Value placeholder="All Sources" />
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
                          <Select.ItemText>All Sources</Select.ItemText>
                          <Select.ItemIndicator>
                            <CheckIcon className="h-4 w-4" />
                          </Select.ItemIndicator>
                        </Select.Item>
                        {availableDataSources.map((ds) => (
                          <Select.Item
                            key={ds.id}
                            value={ds.id.toString()}
                            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent cursor-pointer outline-none text-sm"
                          >
                            <Select.ItemText>{ds.source_filename}</Select.ItemText>
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
          <section ref={statsRef} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div
              onClick={() => setShowTotals(!showTotals)}
              className="rounded-xl border border-border bg-card shadow-sm p-4 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <HashIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                  <p className="text-xl font-bold">{total.toLocaleString("en-IN")}</p>
                  <AnimatePresence>
                    {showTotals && allTimeStats && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-muted-foreground"
                      >
                        out of {allTimeStats.total.toLocaleString("en-IN")}
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
                <div className="p-2 rounded-lg bg-red-500/10">
                  <TrendingDownIcon className="h-5 w-5 text-(--color-expense)" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Charges</p>
                  <FormattedCurrency amount={stats.total_charges} className="text-xl font-bold text-(--color-expense)" />
                  <AnimatePresence>
                    {showTotals && allTimeStats && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-muted-foreground"
                      >
                        out of <FormattedCurrency amount={allTimeStats.stats.total_charges} />
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
                  <TrendingUpIcon className="h-5 w-5 text-(--color-income)" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Payments</p>
                  <FormattedCurrency amount={stats.total_payments} className="text-xl font-bold text-(--color-income)" />
                  <AnimatePresence>
                    {showTotals && allTimeStats && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-muted-foreground"
                      >
                        out of <FormattedCurrency amount={allTimeStats.stats.total_payments} />
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
                <div className={`p-2 rounded-lg ${stats.net >= 0 ? "bg-green-500/10" : "bg-red-500/10"}`}>
                  {stats.net >= 0
                    ? <TrendingUpIcon className="h-5 w-5 text-(--color-income)" />
                    : <TrendingDownIcon className="h-5 w-5 text-(--color-expense)" />
                  }
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{stats.net >= 0 ? "Total Received" : "Total Spent"}</p>
                  <p className={`text-xl font-bold inline-flex items-center gap-1 ${
                    stats.net >= 0
                      ? "text-(--color-income)"
                      : "text-(--color-expense)"
                  }`}>
                    <FormattedCurrency amount={Math.abs(stats.net)} />
                    {stats.net >= 0 ? <ArrowUpIcon className="h-4 w-4" /> : <ArrowDownIcon className="h-4 w-4" />}
                  </p>
                  <AnimatePresence>
                    {showTotals && allTimeStats && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-xs text-muted-foreground"
                      >
                        out of <FormattedCurrency amount={Math.abs(allTimeStats.stats.net)} />
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Transactions Table */}
        <section ref={tableSectionRef} className="rounded-xl border border-border bg-card shadow-sm">
          <header className="p-6 pb-2">
            <h3 className="font-semibold">
              Transactions
              {selectedYear && (showAllYear || selectedMonth) && (
                <span className="text-muted-foreground font-normal ml-2">
                  {showAllYear ? `All of ${selectedYear}` : `${MONTH_NAMES[selectedMonth! - 1]} ${selectedYear}`}
                </span>
              )}
            </h3>
          </header>
          <div className="p-6 pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !selectedYear || (!showAllYear && !selectedMonth) ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCardIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{availableYears.length === 0 ? "No credit card transactions available" : "Select a year and month to view transactions"}</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CreditCardIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transactions found for this period</p>
              </div>
            ) : (
              <>
                {/* Top Pagination */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  className="mb-4 pb-4 border-b border-border/50"
                />

                {/* Bulk Action Bar */}
                {selectedIds.size > 0 && (
                  <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {selectedIds.size} transaction{selectedIds.size !== 1 ? "s" : ""} selected
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAddToStoryModalOpen(true)}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5"
                      >
                        <BookOpenIcon className="h-4 w-4" />
                        Add to Story
                      </button>
                      <button
                        onClick={() => setAddToEntityModalOpen(true)}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5"
                      >
                        <UsersIcon className="h-4 w-4" />
                        Add to Entity
                      </button>
                      <button
                        onClick={() => setAddToEMIModalOpen(true)}
                        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5"
                      >
                        <WalletIcon className="h-4 w-4" />
                        Add to EMI
                      </button>
                      {selectedIds.size === 1 && (
                        <button
                          onClick={async () => {
                            const txnId = Array.from(selectedIds)[0]
                            try {
                              const result = await createBreakdown({ transaction_type: 'credit_card', transaction_id: txnId })
                              navigate(`/breakdowns/${result.breakdown_id}`)
                            } catch (err) {
                              logError("Failed to create breakdown", err)
                            }
                          }}
                          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 flex items-center gap-1.5"
                        >
                          <ScissorsIcon className="h-4 w-4" />
                          Breakdown
                        </button>
                      )}
                      <Popover.Root open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
                        <Popover.Trigger asChild>
                          <button
                            disabled={bulkCategoryUpdating}
                            className="px-3 py-1.5 rounded-md bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {bulkCategoryUpdating ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <TagIcon className="h-4 w-4" />
                            )}
                            Assign Category
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content sideOffset={4} align="end" className="z-50">
                            <CategorySelectContent
                              categories={categories}
                              currentValue=""
                              onSelect={handleBulkCategoryChange}
                              onClose={() => setBulkCategoryOpen(false)}
                            />
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                <div
                  ref={tableContainerRef}
                  className="max-h-[60vh] overflow-y-auto"
                  style={lockedHeight ? { minHeight: lockedHeight } : undefined}
                >
                  <table className="w-full caption-bottom text-sm table-fixed">
                    <thead className="border-b border-border/40 sticky top-0 bg-card z-10 shadow-sm">
                      <tr>
                        <th className="h-12 px-3 text-center align-middle font-medium text-muted-foreground w-[40px]">
                          <input
                            type="checkbox"
                            checked={transactions.length > 0 && selectedIds.size === transactions.length}
                            onChange={toggleSelectAll}
                            className="rounded border-border"
                          />
                        </th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">Date</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[260px]">Description</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[100px]">Card</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[140px]">Source</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[120px]">Category</th>
                        <th className="h-12 px-3 text-center align-middle font-medium text-muted-foreground w-[50px]">Link</th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[90px]">
                          <Tooltip.Provider>
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <span className="inline-flex items-center gap-1 cursor-help">
                                  <GlobeIcon className="h-3 w-3" />
                                  Intl
                                </span>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  className="bg-card text-card-foreground px-3 py-1.5 rounded-md shadow-lg border border-border text-sm"
                                  sideOffset={4}
                                >
                                  International Amount
                                  <Tooltip.Arrow className="fill-card" />
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </Tooltip.Provider>
                        </th>
                        <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground w-[110px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page > 1 && (
                        <tr ref={prevPageRowRef} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                          <td colSpan={9} className="px-4 py-3 align-middle text-center">
                            <button
                              onClick={() => setPage(page - 1)}
                              className="text-sm text-muted-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted"
                            >
                              <ChevronLeftIcon className="h-4 w-4" />
                              <span>Previous page</span>
                            </button>
                          </td>
                        </tr>
                      )}
                      {transactions.map((t) => (
                        <TransactionRow
                          key={t.id}
                          transaction={t}
                          isSelected={selectedIds.has(t.id)}
                          isUpdating={updatingId === t.id}
                          categories={categories}
                          stories={transactionStories[`credit_card:${t.id}`] || []}
                          entities={transactionEntities[`credit_card:${t.id}`] || []}
                          emis={transactionEMIs[`credit_card:${t.id}`] || []}
                          onSelect={handleSelect}
                          onCategoryChange={handleCategoryChange}
                          onUnlink={handleUnlinkBankPayment}
                          onMatchConfirmed={handleMatchConfirmed}
                          onRefundUnlink={handleUnlinkRefund}
                          onRefundLinkConfirmed={handleRefundLinkConfirmed}
                        />
                      ))}
                      {page < totalPages && (
                        <tr className="hover:bg-muted/30 transition-colors">
                          <td colSpan={9} className="px-4 py-3 align-middle text-center">
                            <button
                              onClick={() => setPage(page + 1)}
                              className="text-sm text-muted-foreground/80 hover:text-foreground transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted"
                            >
                              <span>Next page</span>
                              <ChevronRightIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Pagination */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  paginationRef={paginationRef}
                  className="pt-4 border-t border-border/50"
                />
              </>
            )}
          </div>
        </section>
      </main>

      <AddToStoryModal
        open={addToStoryModalOpen}
        onOpenChange={setAddToStoryModalOpen}
        selectedTransactions={Array.from(selectedIds).map(id => ({ type: 'credit_card' as const, id }))}
        onAdded={handleAddedToStory}
      />

      <AddToEntityModal
        open={addToEntityModalOpen}
        onOpenChange={setAddToEntityModalOpen}
        selectedTransactions={Array.from(selectedIds).map(id => ({ type: 'credit_card' as const, id }))}
        onAdded={handleAddedToEntity}
      />

      <AddToEMIModal
        open={addToEMIModalOpen}
        onOpenChange={setAddToEMIModalOpen}
        selectedTransactions={Array.from(selectedIds).map(id => ({ type: 'credit_card' as const, id }))}
        onAdded={handleAddedToEMI}
      />

      <Footer />
    </Tooltip.Provider>
  )
}
