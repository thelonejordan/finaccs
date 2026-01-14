import type { Transaction, TopExpense } from "@/lib/api"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  CalendarIcon,
  TagIcon,
  WalletIcon,
  HashIcon,
  FileTextIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react"

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

interface TransactionTooltipProps {
  transaction: Transaction | TopExpense
  children: React.ReactNode
}

function isFullTransaction(t: Transaction | TopExpense): t is Transaction {
  return "balance" in t && "reference" in t
}

export function TransactionTooltip({
  transaction,
  children,
}: TransactionTooltipProps) {
  const t = transaction
  const isCredit = isFullTransaction(t) ? t.credit > 0 : false
  const amount = isFullTransaction(t)
    ? t.credit > 0
      ? t.credit
      : t.debit
    : t.amount

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in-0 zoom-in-95"
        >
          <div className="bg-gradient-to-br from-card via-card to-muted/30">
            {/* Header */}
            <div className="px-4 py-3 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Transaction Details</span>
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    isCredit
                      ? "bg-green-500/20 text-green-700 dark:text-green-400"
                      : "bg-red-500/20 text-red-700 dark:text-red-400"
                  }`}
                >
                  {isCredit ? (
                    <ArrowUpIcon className="h-3 w-3" />
                  ) : (
                    <ArrowDownIcon className="h-3 w-3" />
                  )}
                  {isCredit ? "Credit" : "Debit"}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Amount - Highlighted */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-md ${
                      isCredit ? "bg-green-500/20" : "bg-red-500/20"
                    }`}
                  >
                    <WalletIcon
                      className={`h-4 w-4 ${
                        isCredit ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                      }`}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">Amount</span>
                </div>
                <span
                  className={`text-lg font-bold ${
                    isCredit ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {isCredit ? "+" : "-"}
                  {formatCurrency(amount)}
                </span>
              </div>

              {/* Details Grid */}
              <div className="space-y-2.5">
                {/* Date */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-md bg-blue-500/10">
                    <CalendarIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium">{formatDate(t.date)}</p>
                  </div>
                </div>

                {/* Category */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-md bg-purple-500/10">
                    <TagIcon className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium">{t.category || "Uncategorized"}</p>
                  </div>
                </div>

                {/* Narration */}
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-md bg-amber-500/10">
                    <FileTextIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Narration</p>
                    <p className="text-sm break-words leading-relaxed">{t.narration}</p>
                  </div>
                </div>

                {isFullTransaction(t) && (
                  <>
                    {/* Balance */}
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-md bg-cyan-500/10">
                        <WalletIcon className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Closing Balance</p>
                        <p className="text-sm font-medium">{formatCurrency(t.balance)}</p>
                      </div>
                    </div>

                    {/* Reference */}
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 rounded-md bg-slate-500/10">
                        <HashIcon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Reference</p>
                        <p className="text-sm font-mono break-all">
                          {t.reference || "N/A"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <Tooltip.Arrow className="fill-card" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
