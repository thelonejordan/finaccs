import { useState } from "react"
import {
  FileTextIcon,
  DatabaseIcon,
  LinkIcon,
  Link2OffIcon,
  BuildingIcon,
  FolderOpenIcon,
  ClockIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CalendarIcon,
  HashIcon,
  RefreshCwIcon,
  PowerIcon,
  PlayIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  updateExtractedCSV,
  loadExtractedCSVs,
  updateDataSourceNew,
  loadDataSourceNew,
  type BankAccount,
  type ExtractedCSV,
  type AccountStats,
} from "@/lib/api"
import { useInconsistencyCache } from "@/lib/inconsistency-cache"
import { useStoryCache } from "@/lib/story-cache"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

interface DataSourcesProps {
  extractedCSVs: ExtractedCSV[]
  accounts: BankAccount[]
  onCreateAccount: (filename: string) => void
  onCSVUpdated: (csv: ExtractedCSV) => void
  onAccountStatsUpdated?: (affectedAccounts: Record<number, AccountStats>) => void
  onRefresh?: () => void
  selectedCSVId?: number | null
  onSelectCSV?: (csvId: number | null) => void
  source?: 'legacy' | 'experimental'
}

export function DataSources({ extractedCSVs, accounts, onCreateAccount, onCSVUpdated, onAccountStatsUpdated, onRefresh, selectedCSVId, onSelectCSV, source = 'legacy' }: DataSourcesProps) {
  const { invalidate: invalidateInconsistencyCache } = useInconsistencyCache()
  const { invalidate: invalidateStoryCache } = useStoryCache()
  const [isLinking, setIsLinking] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [loadingIds, setLoadingIds] = useState<Set<number>>(new Set())

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true)
      await onRefresh()
      setIsRefreshing(false)
    }
  }

  // Helper to get artifact_id from csv (for experimental mode)
  const getArtifactId = (csv: ExtractedCSV): string | null => {
    return csv.artifacts?.[0]?.artifact_id || null
  }

  const handleToggleDisabled = async (csv: ExtractedCSV) => {
    setTogglingId(csv.id)
    try {
      if (source === 'experimental') {
        const artifactId = getArtifactId(csv)
        if (artifactId) {
          await updateDataSourceNew(artifactId, { enabled: csv.disabled }) // Toggle: disabled -> enabled
          onCSVUpdated({ ...csv, disabled: !csv.disabled })
        }
      } else {
        const updated = await updateExtractedCSV(csv.id, { disabled: !csv.disabled })
        onCSVUpdated({ ...csv, ...updated })
        if (updated.affected_accounts && onAccountStatsUpdated) {
          onAccountStatsUpdated(updated.affected_accounts)
        }
      }
      // Invalidate caches since transactions are now included/excluded
      invalidateInconsistencyCache()
      invalidateStoryCache()
    } catch (error) {
      console.error("Failed to toggle CSV:", error)
    } finally {
      setTogglingId(null)
    }
  }

  const handleLinkToAccount = async (csv: ExtractedCSV, accountId: number) => {
    setIsLinking(true)
    try {
      if (source === 'experimental') {
        const artifactId = getArtifactId(csv)
        if (artifactId) {
          await updateDataSourceNew(artifactId, { bank_account_id: accountId })
          onCSVUpdated({ ...csv, bank_account_id: accountId })
        }
      } else {
        const updated = await updateExtractedCSV(csv.id, { bank_account_id: accountId })
        onCSVUpdated({ ...csv, ...updated })
        if (updated.affected_accounts && onAccountStatsUpdated) {
          onAccountStatsUpdated(updated.affected_accounts)
        }
      }
    } catch (error) {
      console.error("Failed to link account:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkFromAccount = async (csv: ExtractedCSV) => {
    setIsLinking(true)
    try {
      if (source === 'experimental') {
        const artifactId = getArtifactId(csv)
        if (artifactId) {
          await updateDataSourceNew(artifactId, { bank_account_id: null })
          onCSVUpdated({ ...csv, bank_account_id: null })
        }
      } else {
        const updated = await updateExtractedCSV(csv.id, { bank_account_id: null })
        onCSVUpdated({ ...csv, ...updated })
        if (updated.affected_accounts && onAccountStatsUpdated) {
          onAccountStatsUpdated(updated.affected_accounts)
        }
      }
    } catch (error) {
      console.error("Failed to unlink account:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleChangeLinkToAccount = async (csv: ExtractedCSV, newAccountId: number) => {
    setIsLinking(true)
    try {
      if (source === 'experimental') {
        const artifactId = getArtifactId(csv)
        if (artifactId) {
          await updateDataSourceNew(artifactId, { bank_account_id: newAccountId })
          onCSVUpdated({ ...csv, bank_account_id: newAccountId })
        }
      } else {
        const updated = await updateExtractedCSV(csv.id, { bank_account_id: newAccountId })
        onCSVUpdated({ ...csv, ...updated })
        if (updated.affected_accounts && onAccountStatsUpdated) {
          onAccountStatsUpdated(updated.affected_accounts)
        }
      }
    } catch (error) {
      console.error("Failed to change link:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleLoadCSV = async (csv: ExtractedCSV) => {
    setLoadingIds(prev => new Set(prev).add(csv.id))
    try {
      // Set status to loading immediately for UI feedback
      onCSVUpdated({ ...csv, status: 'loading' })

      if (source === 'experimental') {
        const artifactId = getArtifactId(csv)
        if (artifactId) {
          const result = await loadDataSourceNew(artifactId)
          onCSVUpdated({
            ...csv,
            status: result.success ? 'loaded' : 'error',
            error_message: result.error,
            loaded_at: result.success ? new Date().toISOString() : csv.loaded_at,
          })
          if (result.success) {
            invalidateInconsistencyCache()
            invalidateStoryCache()
          }
        }
      } else {
        const result = await loadExtractedCSVs([csv.id])
        if (result.results && result.results.length > 0) {
          const loadResult = result.results[0]
          onCSVUpdated({
            ...csv,
            status: loadResult.success ? 'loaded' : 'error',
            error_message: loadResult.success ? '' : loadResult.message,
          })
        }
        // Invalidate inconsistency cache - new data may create inconsistencies
        invalidateInconsistencyCache()
        // Refresh to get updated data
        if (onRefresh) {
          await onRefresh()
        }
      }
    } catch (error) {
      console.error("Failed to load CSV:", error)
      onCSVUpdated({
        ...csv,
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(csv.id)
        return next
      })
    }
  }

  const handleLoadAllPending = async () => {
    const pendingCSVs = extractedCSVs.filter(csv => csv.status === 'extracted' || csv.status === 'transformed')
    if (pendingCSVs.length === 0) return

    const ids = pendingCSVs.map(csv => csv.id)
    setLoadingIds(new Set(ids))

    // Update UI immediately
    pendingCSVs.forEach(csv => {
      onCSVUpdated({ ...csv, status: 'loading' })
    })

    try {
      await loadExtractedCSVs(ids)
      // Invalidate inconsistency cache - batch load may create inconsistencies
      invalidateInconsistencyCache()
      // Refresh to get updated data
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error("Failed to load CSVs:", error)
    } finally {
      setLoadingIds(new Set())
    }
  }

  // Create a map of csv -> account using bank_account_id from ExtractedCSV
  const csvToAccount = new Map<number, BankAccount>()
  extractedCSVs.forEach((csv) => {
    if (csv.bank_account_id) {
      const account = accounts.find((acc) => acc.id === csv.bank_account_id)
      if (account) {
        csvToAccount.set(csv.id, account)
      }
    }
  })

  // Separate by status (extracted and transformed are both "ready to load")
  const extractedFiles = extractedCSVs.filter((f) => f.status === 'extracted' || f.status === 'transformed')
  const loadingFiles = extractedCSVs.filter((f) => f.status === 'loading')
  const loadedFiles = extractedCSVs.filter((f) => f.status === 'loaded')
  const errorFiles = extractedCSVs.filter((f) => f.status === 'error')

  const getStatusBadge = (csv: ExtractedCSV) => {
    switch (csv.status) {
      case 'extracted':
      case 'transformed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/20 text-violet-600 dark:text-violet-400">
            <ClockIcon className="h-3 w-3" />
            Ready to Load
          </span>
        )
      case 'loading':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400">
            <Loader2Icon className="h-3 w-3 animate-spin" />
            Loading...
          </span>
        )
      case 'loaded':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
            <CheckCircleIcon className="h-3 w-3" />
            Loaded
          </span>
        )
      case 'error':
        return (
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400 cursor-help">
                  <AlertCircleIcon className="h-3 w-3" />
                  Error
                </span>
              </Tooltip.Trigger>
              {csv.error_message && (
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-xs"
                    sideOffset={4}
                  >
                    {csv.error_message}
                    <Tooltip.Arrow className="fill-card" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              )}
            </Tooltip.Root>
          </Tooltip.Provider>
        )
      default:
        return null
    }
  }

  const renderCSVCard = (csv: ExtractedCSV) => {
    const linkedAccount = csvToAccount.get(csv.id)
    const isLoading = loadingIds.has(csv.id) || csv.status === 'loading'
    const isSelected = selectedCSVId === csv.id

    const handleCardClick = () => {
      if (onSelectCSV) {
        onSelectCSV(isSelected ? null : csv.id)
      }
    }

    return (
      <div
        key={csv.id}
        onClick={handleCardClick}
        className={`p-4 rounded-lg border transition-all hover:shadow-md ${isSelected ? 'border-primary bg-primary/5' : csv.disabled ? 'border-border/50 bg-muted/30 opacity-60' : 'border-border'} ${onSelectCSV ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${csv.disabled ? 'bg-muted/50' : 'bg-muted'}`}>
            <FileTextIcon className={`h-5 w-5 ${csv.disabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-mono text-sm truncate font-medium ${csv.disabled ? 'line-through text-muted-foreground' : ''}`}>{csv.name}</p>
                <p className="text-xs text-muted-foreground truncate">{csv.source_filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {csv.disabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-600 dark:text-red-400">
                    <PowerIcon className="h-3 w-3" />
                    Disabled
                  </span>
                ) : !linkedAccount && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Link2OffIcon className="h-3 w-3" />
                    Not linked
                  </span>
                )}
                {getStatusBadge(csv)}
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleDisabled(csv) }}
                        disabled={togglingId === csv.id}
                        className={`p-1.5 rounded-lg transition-colors ${csv.disabled ? 'hover:bg-green-500/20 text-muted-foreground hover:text-green-600' : 'hover:bg-amber-500/20 text-muted-foreground hover:text-amber-600'} disabled:opacity-50`}
                      >
                        <PowerIcon className="h-4 w-4" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                        sideOffset={4}
                      >
                        {csv.disabled ? 'Enable this source' : 'Disable this source'}
                        <Tooltip.Arrow className="fill-card" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
                {/* Delete source button */}
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); /* TODO: implement delete */ }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                        sideOffset={4}
                      >
                        Delete source file
                        <Tooltip.Arrow className="fill-card" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
                {/* Selection indicator */}
                {onSelectCSV && (
                  <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                )}
              </div>
            </div>

            {/* Date range, transaction count, and row count */}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {csv.first_transaction_date && csv.last_transaction_date && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDate(csv.first_transaction_date)} — {formatDate(csv.last_transaction_date)}
                </span>
              )}
              {csv.transaction_count > 0 && (
                <span className="flex items-center gap-1">
                  <HashIcon className="h-3 w-3" />
                  {csv.transaction_count} transactions
                </span>
              )}
              {(csv.status === 'extracted' || csv.status === 'transformed') && csv.row_count > 0 && (
                <span className="flex items-center gap-1">
                  <HashIcon className="h-3 w-3" />
                  {csv.row_count} rows
                </span>
              )}
            </div>

            {/* Account linking and Load button */}
            <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
              {linkedAccount ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer">
                      <BuildingIcon className="h-3.5 w-3.5" />
                      <span className="font-medium">{linkedAccount.nickname}</span>
                      <ChevronDownIcon className="h-3 w-3 opacity-60" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="w-64 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                      sideOffset={4}
                      align="start"
                    >
                      {accounts.filter((acc) => acc.id !== linkedAccount.id).length > 0 && (
                        <>
                          <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Change to different account
                          </DropdownMenu.Label>
                          {accounts.filter((acc) => acc.id !== linkedAccount.id).map((acc) => (
                            <DropdownMenu.Item
                              key={acc.id}
                              disabled={isLinking}
                              onSelect={() => handleChangeLinkToAccount(csv, acc.id)}
                              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none disabled:opacity-50"
                            >
                              <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{acc.nickname}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {acc.bank_name} • ****{acc.account_number.slice(-4)}
                                </p>
                              </div>
                            </DropdownMenu.Item>
                          ))}
                          <DropdownMenu.Separator className="h-px bg-border my-1" />
                        </>
                      )}
                      <DropdownMenu.Item
                        disabled={isLinking}
                        onSelect={() => handleUnlinkFromAccount(csv)}
                        className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors cursor-pointer outline-none disabled:opacity-50"
                      >
                        <Link2OffIcon className="h-4 w-4" />
                        Unlink from account
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
                      <LinkIcon className="h-3.5 w-3.5" />
                      Link Account
                      <ChevronDownIcon className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="w-64 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                      sideOffset={4}
                      align="start"
                    >
                      {accounts.length > 0 && (
                        <>
                          <DropdownMenu.Label className="text-xs font-medium text-muted-foreground px-2 py-1">
                            Link to existing account
                          </DropdownMenu.Label>
                          {accounts.map((acc) => (
                            <DropdownMenu.Item
                              key={acc.id}
                              disabled={isLinking}
                              onSelect={() => handleLinkToAccount(csv, acc.id)}
                              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none disabled:opacity-50"
                            >
                              <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{acc.nickname}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {acc.bank_name} • ****{acc.account_number.slice(-4)}
                                </p>
                              </div>
                            </DropdownMenu.Item>
                          ))}
                          <DropdownMenu.Separator className="h-px bg-border my-1" />
                        </>
                      )}
                      <DropdownMenu.Item
                        onSelect={() => onCreateAccount(csv.source_filename)}
                        className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none font-medium"
                      >
                        <PlusIcon className="h-4 w-4" />
                        Create new account
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}

              {linkedAccount && (
                <span className="text-sm text-muted-foreground">
                  {linkedAccount.bank_name} • <span className="font-mono">****{linkedAccount.account_number.slice(-4)}</span>
                </span>
              )}

              {/* Load/Retry button */}
              {(csv.status === 'extracted' || csv.status === 'transformed' || csv.status === 'error') && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleLoadCSV(csv) }}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/30 transition-colors font-medium disabled:opacity-50 ml-auto"
                >
                  {isLoading ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayIcon className="h-3.5 w-3.5" />
                  )}
                  {csv.status === 'error' ? 'Retry' : 'Load'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hasPendingCSVs = extractedFiles.length > 0

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted">
              <DatabaseIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            Data Sources
          </div>
          <div className="flex items-center gap-2">
            {hasPendingCSVs && (
              <button
                onClick={handleLoadAllPending}
                disabled={loadingIds.size > 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/30 transition-colors font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {loadingIds.size > 0 ? (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayIcon className="h-3.5 w-3.5" />
                )}
                Load All ({extractedFiles.length})
              </button>
            )}
            {onRefresh && (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                title="Refresh data sources"
              >
                <RefreshCwIcon className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </h3>
      </header>
      <div className="relative">
        <div className="p-6 pt-0 max-h-[512px] overflow-y-auto">
          {extractedCSVs.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FolderOpenIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No extracted CSVs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Extract bank statement files to create CSVs
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error Files Section */}
              {errorFiles.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Failed to Load</p>
                  {errorFiles.map(renderCSVCard)}
                </div>
              )}

              {/* Extracted Files Section (Ready to Load) */}
              {extractedFiles.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">Ready to Load</p>
                  {extractedFiles.map(renderCSVCard)}
                </div>
              )}

              {/* Loading Files Section */}
              {loadingFiles.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Loading</p>
                  {loadingFiles.map(renderCSVCard)}
                </div>
              )}

              {/* Loaded Files Section */}
              {loadedFiles.length > 0 && (
                <div className="space-y-3">
                  {(extractedFiles.length > 0 || errorFiles.length > 0 || loadingFiles.length > 0) && (
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">Loaded</p>
                  )}
                  {loadedFiles.map(renderCSVCard)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent pointer-events-none rounded-b-xl" />
      </div>
    </section>
  )
}
