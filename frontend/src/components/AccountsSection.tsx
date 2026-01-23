import { useState, useEffect, useRef } from "react"
import {
  BuildingIcon,
  CreditCardIcon,
  MapPinIcon,
  HashIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  WalletIcon,
  SparklesIcon,
  CalendarIcon,
  TrendingUpIcon,
  ClockIcon,
} from "lucide-react"
import {
  createBankAccount,
  updateBankAccount,
  type BankAccount,
  type BankAccountInput,
} from "@/lib/api"

interface AccountsSectionProps {
  accounts: BankAccount[]
  onSave: (account: BankAccount) => void
  initialAddSourceFile?: string | null
  onAddingStateChange?: (isAdding: boolean) => void
}

function AccountForm({
  account,
  onSave,
  onCancel,
  defaultSourceFile,
}: {
  account: BankAccount | null
  onSave: (account: BankAccount) => void
  onCancel: () => void
  defaultSourceFile?: string | null
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const initialSourceFiles = account?.source_files || (defaultSourceFile ? [defaultSourceFile] : [])
  const [formData, setFormData] = useState<BankAccountInput>({
    nickname: account?.nickname || "",
    bank_name: account?.bank_name || "",
    account_number: account?.account_number || "",
    ifsc_code: account?.ifsc_code || "",
    branch: account?.branch || "",
    source_files: initialSourceFiles,
  })

  useEffect(() => {
    // Scroll the parent container so the form is fully visible with some padding
    const scrollParent = formRef.current?.parentElement
    if (scrollParent && formRef.current) {
      const formTop = formRef.current.offsetTop - 12 // 12px padding above form
      scrollParent.scrollTo({ top: formTop, behavior: 'smooth' })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let savedAccount: BankAccount
      if (account) {
        savedAccount = await updateBankAccount(account.id, formData)
      } else {
        savedAccount = await createBankAccount(formData)
      }
      onSave(savedAccount)
    } catch (error) {
      console.error("Failed to save account:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-4 border border-primary/30 rounded-lg bg-gradient-to-br from-primary/10 to-transparent">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nickname</label>
          <input
            type="text"
            required
            placeholder="e.g., Salary Account"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Bank Name</label>
          <input
            type="text"
            required
            placeholder="e.g., HDFC Bank"
            value={formData.bank_name}
            onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Account Number</label>
          <input
            type="text"
            required
            placeholder="Enter account number"
            value={formData.account_number}
            onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">IFSC Code</label>
          <input
            type="text"
            required
            placeholder="e.g., HDFC0001234"
            value={formData.ifsc_code}
            onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value.toUpperCase() })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
            maxLength={11}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Branch (Optional)</label>
          <input
            type="text"
            placeholder="e.g., Koramangala"
            value={formData.branch}
            onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {formData.source_files.length > 0 && (
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">
              Linked Source File{formData.source_files.length > 1 ? 's' : ''}
            </label>
            <div className="flex flex-wrap gap-2">
              {formData.source_files.map((file) => (
                <div
                  key={file}
                  className="px-3 py-1.5 rounded-md border border-input bg-muted/50 text-sm font-mono truncate max-w-xs"
                >
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-md border border-input hover:bg-accent transition-colors inline-flex items-center gap-1.5"
        >
          <XIcon className="h-3.5 w-3.5" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  )
}

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

function AccountCard({
  account,
  onEdit,
}: {
  account: BankAccount
  onEdit: () => void
}) {
  return (
    <div className="p-4 border border-border rounded-lg hover:border-border hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-muted">
            <BuildingIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">{account.nickname}</p>
            <p className="text-sm text-muted-foreground">{account.bank_name}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <PencilIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Balance Info */}
      {account.current_balance != null && (
        <div className="mt-3 p-3 rounded-lg border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <FormattedCurrency amount={account.current_balance} className="text-lg font-bold text-green-700 dark:text-green-400" />
            </div>
            {account.last_transaction_date && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                  <ClockIcon className="h-3 w-3" />
                  Last updated
                </p>
                <p className="text-sm font-medium">{formatDate(account.last_transaction_date)}</p>
              </div>
            )}
          </div>
          {account.starting_balance != null && account.first_transaction_date && (
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUpIcon className="h-3 w-3" />
                Started: <FormattedCurrency amount={account.starting_balance} />
              </span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {formatDate(account.first_transaction_date)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
          <CreditCardIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">****{account.account_number.slice(-4)}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
          <HashIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono">{account.ifsc_code}</span>
        </div>
        {account.branch && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
            <MapPinIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{account.branch}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountsSection({ accounts, onSave, initialAddSourceFile, onAddingStateChange }: AccountsSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [prefilledSourceFile, setPrefilledSourceFile] = useState<string | null>(null)

  // Handle external trigger to add account with pre-filled source file
  useEffect(() => {
    if (initialAddSourceFile) {
      setPrefilledSourceFile(initialAddSourceFile)
      setIsAdding(true)
    }
  }, [initialAddSourceFile])

  // Notify parent when adding state changes
  useEffect(() => {
    onAddingStateChange?.(isAdding)
    if (!isAdding) {
      setPrefilledSourceFile(null)
    }
  }, [isAdding, onAddingStateChange])

  const handleSave = (account: BankAccount) => {
    onSave(account)
    setEditingId(null)
    setIsAdding(false)
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-muted">
              <WalletIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            Accounts
          </h3>
          {!isAdding && accounts.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 space-y-3 max-h-[512px] overflow-y-auto">
          {accounts.length === 0 && !isAdding ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
              <div className="p-3 rounded-full bg-primary/20 w-fit mx-auto mb-3">
                <SparklesIcon className="h-6 w-6 text-primary" />
              </div>
              <p className="font-medium">No accounts configured</p>
              <p className="text-sm text-muted-foreground mt-1">Add a bank account to get started</p>
              <button
                onClick={() => setIsAdding(true)}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2 font-medium shadow-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add Account
              </button>
            </div>
          ) : (
            <>
              {isAdding && (
                <AccountForm
                  account={null}
                  onSave={handleSave}
                  onCancel={() => setIsAdding(false)}
                  defaultSourceFile={prefilledSourceFile}
                />
              )}
              {accounts.map((account) =>
                editingId === account.id ? (
                  <AccountForm
                    key={account.id}
                    account={account}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onEdit={() => setEditingId(account.id)}
                  />
                )
              )}
            </>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}
