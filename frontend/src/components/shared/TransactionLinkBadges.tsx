import { useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpenIcon,
  UsersIcon,
  WalletIcon,
  Link2Icon,
  CreditCardIcon,
  LandmarkIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Tooltip from "@radix-ui/react-tooltip"
import { deleteRefundLink, type RefundLinkInfo, type StoryBadge, type EntityBadge, type EMIBadge } from "@/lib/api"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function FormattedCurrency({ amount }: { amount: number }) {
  const formatted = formatCurrency(amount)
  const match = formatted.match(/^(.*?)(\.\d{2})$/)
  if (match) {
    return <span>{match[1]}<span className="opacity-50">{match[2]}</span></span>
  }
  return <span>{formatted}</span>
}

interface CurrentTransactionInfo {
  date: string
  description: string
  amount: number
  source: string
  type: 'bank' | 'credit_card'
}

export function RefundLinkBadge({ refundLink, transaction, onUnlinked }: { refundLink: RefundLinkInfo; transaction: CurrentTransactionInfo; onUnlinked?: () => void }) {
  const [open, setOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const other = refundLink.other_transaction
  const otherIcon = other.account?.type === 'credit_card'
    ? <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
    : <LandmarkIcon className="h-4 w-4 text-muted-foreground" />
  const currentIcon = transaction.type === 'credit_card'
    ? <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
    : <LandmarkIcon className="h-4 w-4 text-muted-foreground" />

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await deleteRefundLink(refundLink.id)
      setOpen(false)
      onUnlinked?.()
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="p-1 rounded transition-colors text-green-600 dark:text-green-400 hover:bg-green-500/10">
          <Link2Icon className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl border border-border shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden z-50">
          <div className="p-6 border-b border-border flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold">Linked Refund</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                This transaction is the {refundLink.role === 'refund' ? 'refund' : 'original charge'} in a refund link.
              </Dialog.Description>
            </div>
            <Dialog.Close className="p-1 rounded hover:bg-muted">
              <span className="sr-only">Close</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-4">
            {/* Current transaction */}
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-1">
                {refundLink.role === 'original' ? 'Original Charge' : 'Refund Transaction'}
              </p>
              <div className="flex items-center gap-2 mb-1">
                {currentIcon}
                <span className="font-medium">{transaction.source}</span>
              </div>
              <p className="font-medium">{formatDate(transaction.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{transaction.description}</p>
              <p className="text-sm mt-1">
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

            {/* Other transaction */}
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-muted-foreground mb-1">
                {refundLink.role === 'refund' ? 'Original Charge' : 'Refund'}
              </p>
              <div className="flex items-center gap-2 mb-1">
                {otherIcon}
                <span className="font-medium">{other.account?.nickname || "Unknown"}</span>
              </div>
              <p className="font-medium">{formatDate(other.date)}</p>
              <p className="text-sm text-muted-foreground line-clamp-1">{other.description}</p>
              <p className="text-sm mt-1">
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function StoriesBadges({ stories, excludeStoryId }: { stories: StoryBadge[]; excludeStoryId?: string }) {
  const filtered = excludeStoryId ? stories.filter(s => s.story_id !== excludeStoryId) : stories
  if (filtered.length === 0) return null
  return (
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
          <p className="font-medium mb-1">{excludeStoryId ? 'Also in Stories' : 'Stories'}</p>
          <div className="space-y-1">
            {filtered.map(s => (
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
  )
}

export function EntitiesBadges({ entities, excludeEntityId }: { entities: EntityBadge[]; excludeEntityId?: string }) {
  const filtered = excludeEntityId ? entities.filter(e => e.entity_id !== excludeEntityId) : entities
  if (filtered.length === 0) return null
  return (
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
          <p className="font-medium mb-1">{excludeEntityId ? 'Also in Entities' : 'Entities'}</p>
          <div className="space-y-1">
            {filtered.map(e => (
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
  )
}

export function EMIsBadges({ emis, excludeEmiId }: { emis: EMIBadge[]; excludeEmiId?: string }) {
  const filtered = excludeEmiId ? emis.filter(e => e.emi_id !== excludeEmiId) : emis
  if (filtered.length === 0) return null
  return (
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
          <p className="font-medium mb-1">{excludeEmiId ? 'Also in EMIs' : 'EMIs'}</p>
          <div className="space-y-1">
            {filtered.map(e => (
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
  )
}
