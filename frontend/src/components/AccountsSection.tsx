import { useState, useEffect } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  createBankAccount,
  updateBankAccount,
  type BankAccount,
  type BankAccountInput,
  type SourceFile,
} from "@/lib/api"

interface AccountsSectionProps {
  accounts: BankAccount[]
  sourceFiles: SourceFile[]
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
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<BankAccountInput>({
    nickname: account?.nickname || "",
    bank_name: account?.bank_name || "",
    account_number: account?.account_number || "",
    ifsc_code: account?.ifsc_code || "",
    branch: account?.branch || "",
    source_file: account?.source_file || defaultSourceFile || "",
  })

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
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border border-amber-500/30 rounded-lg bg-gradient-to-br from-amber-500/10 to-transparent">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Nickname</label>
          <input
            type="text"
            required
            placeholder="e.g., Salary Account"
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500/50"
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
            className="w-full px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
        </div>
        {formData.source_file && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Linked Source File</label>
            <div className="w-full px-3 py-1.5 rounded-md border border-input bg-muted/50 text-sm font-mono truncate">
              {formData.source_file}
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
          className="px-3 py-1.5 text-sm rounded-md bg-amber-500 text-white hover:bg-amber-600 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
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

function AccountCard({
  account,
  onEdit,
}: {
  account: BankAccount
  onEdit: () => void
}) {
  return (
    <div className="p-4 border border-primary/20 rounded-lg bg-gradient-to-br from-primary/5 via-primary/5 to-transparent hover:border-primary/40 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-sm">
            <BuildingIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{account.nickname}</p>
            <p className="text-sm text-muted-foreground">{account.bank_name}</p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-2 rounded-lg hover:bg-primary/10 transition-colors"
        >
          <PencilIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Balance Info */}
      {account.current_balance != null && (
        <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-transparent border border-green-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(account.current_balance)}
              </p>
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
            <div className="mt-2 pt-2 border-t border-green-500/20 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUpIcon className="h-3 w-3" />
                Started: {formatCurrency(account.starting_balance)}
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
          <CreditCardIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">****{account.account_number.slice(-4)}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
          <HashIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{account.ifsc_code}</span>
        </div>
        {account.branch && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
            <MapPinIcon className="h-3.5 w-3.5 text-primary" />
            <span className="truncate">{account.branch}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function AccountsSection({ accounts, sourceFiles, onSave, initialAddSourceFile, onAddingStateChange }: AccountsSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [prefilledSourceFile, setPrefilledSourceFile] = useState<string | null>(null)

  // Only parsed files can be linked to accounts
  const parsedFileNames = sourceFiles
    .filter((f) => f.status === 'parsed')
    .map((f) => f.filename)

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
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <WalletIcon className="h-5 w-5 text-primary" />
            </div>
            Accounts
          </CardTitle>
          {!isAdding && parsedFileNames.length > 0 && accounts.length > 0 && (
            <button
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 && !isAdding ? (
          <div className="text-center py-8 rounded-xl bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20">
            <div className="p-3 rounded-full bg-amber-500/20 w-fit mx-auto mb-3">
              <SparklesIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="font-medium">No accounts configured</p>
            <p className="text-sm text-muted-foreground mt-1">Add a bank account to get started</p>
            {parsedFileNames.length > 0 && (
              <button
                onClick={() => setIsAdding(true)}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors inline-flex items-center gap-2 font-medium shadow-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add Account
              </button>
            )}
          </div>
        ) : (
          <>
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
        {isAdding && (
          <AccountForm
            account={null}
            onSave={handleSave}
            onCancel={() => setIsAdding(false)}
            defaultSourceFile={prefilledSourceFile}
          />
        )}
      </CardContent>
    </Card>
  )
}
