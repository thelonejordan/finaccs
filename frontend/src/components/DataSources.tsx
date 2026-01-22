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
  updateDataSource,
  loadDataSource,
  type BankAccount,
  type DataSourceArtifact,
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
  dataSources: DataSourceArtifact[]
  accounts: BankAccount[]
  onCreateAccount: (filename: string) => void
  onDataSourceUpdated: () => void
  onRefresh?: () => void
  selectedId?: number | null
  onSelect?: (id: number | null) => void
}

export function DataSources({ dataSources, accounts, onCreateAccount, onDataSourceUpdated, onRefresh, selectedId, onSelect }: DataSourcesProps) {
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

  // Helper to get display name for data source
  const getDisplayName = (ds: DataSourceArtifact): string => {
    return ds.source_artifact_key
      ? `${ds.source_artifact_type} (${ds.source_artifact_key})`
      : ds.source_artifact_type
  }

  const handleToggleDisabled = async (ds: DataSourceArtifact) => {
    setTogglingId(ds.id)
    try {
      await updateDataSource(ds.artifact_id, { enabled: !ds.enabled })
      onDataSourceUpdated()
      // Invalidate caches since transactions are now included/excluded
      invalidateInconsistencyCache()
      invalidateStoryCache()
    } catch (error) {
      console.error("Failed to toggle data source:", error)
    } finally {
      setTogglingId(null)
    }
  }

  const handleLinkToAccount = async (ds: DataSourceArtifact, accountId: number) => {
    setIsLinking(true)
    try {
      await updateDataSource(ds.artifact_id, { bank_account_id: accountId })
      onDataSourceUpdated()
    } catch (error) {
      console.error("Failed to link account:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkFromAccount = async (ds: DataSourceArtifact) => {
    setIsLinking(true)
    try {
      await updateDataSource(ds.artifact_id, { bank_account_id: null })
      onDataSourceUpdated()
    } catch (error) {
      console.error("Failed to unlink account:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleChangeLinkToAccount = async (ds: DataSourceArtifact, newAccountId: number) => {
    setIsLinking(true)
    try {
      await updateDataSource(ds.artifact_id, { bank_account_id: newAccountId })
      onDataSourceUpdated()
    } catch (error) {
      console.error("Failed to change link:", error)
    } finally {
      setIsLinking(false)
    }
  }

  const handleLoadDataSource = async (ds: DataSourceArtifact) => {
    setLoadingIds(prev => new Set(prev).add(ds.id))
    try {
      const result = await loadDataSource(ds.artifact_id)
      if (result.success) {
        invalidateInconsistencyCache()
        invalidateStoryCache()
      }
      onDataSourceUpdated()
    } catch (error) {
      console.error("Failed to load data source:", error)
    } finally {
      setLoadingIds(prev => {
        const next = new Set(prev)
        next.delete(ds.id)
        return next
      })
    }
  }

  const handleLoadAllPending = async () => {
    const pendingSources = dataSources.filter(ds => ds.status === 'unloaded')
    if (pendingSources.length === 0) return

    const ids = pendingSources.map(ds => ds.id)
    setLoadingIds(new Set(ids))

    try {
      // Load each data source sequentially
      for (const ds of pendingSources) {
        await loadDataSource(ds.artifact_id)
      }
      // Invalidate caches after loading
      invalidateInconsistencyCache()
      invalidateStoryCache()
      // Refresh to get updated data
      if (onRefresh) {
        await onRefresh()
      }
    } catch (error) {
      console.error("Failed to load data sources:", error)
    } finally {
      setLoadingIds(new Set())
    }
  }

  // Create a map of data source -> account
  const dsToAccount = new Map<number, BankAccount>()
  dataSources.forEach((ds) => {
    if (ds.bank_account_id) {
      const account = accounts.find((acc) => acc.id === ds.bank_account_id)
      if (account) {
        dsToAccount.set(ds.id, account)
      }
    }
  })

  // Separate by status
  const unloadedSources = dataSources.filter((ds) => ds.status === 'unloaded')
  const loadingSources = dataSources.filter((ds) => ds.status === 'loading')
  const loadedSources = dataSources.filter((ds) => ds.status === 'loaded')
  const errorSources = dataSources.filter((ds) => ds.status === 'error')

  const getStatusBadge = (ds: DataSourceArtifact) => {
    switch (ds.status) {
      case 'unloaded':
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
              {ds.error_message && (
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm max-w-xs"
                    sideOffset={4}
                  >
                    {ds.error_message}
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

  const renderDataSourceCard = (ds: DataSourceArtifact) => {
    const linkedAccount = dsToAccount.get(ds.id)
    const isLoading = loadingIds.has(ds.id) || ds.status === 'loading'
    const isSelected = selectedId === ds.id
    const isDisabled = !ds.enabled

    const handleCardClick = () => {
      if (onSelect) {
        onSelect(isSelected ? null : ds.id)
      }
    }

    return (
      <div
        key={ds.id}
        onClick={handleCardClick}
        className={`p-4 rounded-lg border transition-all hover:shadow-md ${isSelected ? 'border-primary bg-primary/5' : isDisabled ? 'border-border/50 bg-muted/30 opacity-60' : 'border-border'} ${onSelect ? 'cursor-pointer' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${isDisabled ? 'bg-muted/50' : 'bg-muted'}`}>
            <FileTextIcon className={`h-5 w-5 ${isDisabled ? 'text-muted-foreground/50' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-mono text-sm truncate font-medium ${isDisabled ? 'line-through text-muted-foreground' : ''}`}>{getDisplayName(ds)}</p>
                <p className="text-xs text-muted-foreground truncate">{ds.source_filename}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isDisabled ? (
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
                {getStatusBadge(ds)}
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleDisabled(ds) }}
                        disabled={togglingId === ds.id}
                        className={`p-1.5 rounded-lg transition-colors ${isDisabled ? 'hover:bg-green-500/20 text-muted-foreground hover:text-green-600' : 'hover:bg-amber-500/20 text-muted-foreground hover:text-amber-600'} disabled:opacity-50`}
                      >
                        <PowerIcon className="h-4 w-4" />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className="bg-card text-card-foreground px-3 py-2 rounded-md shadow-lg border border-border text-sm"
                        sideOffset={4}
                      >
                        {isDisabled ? 'Enable this source' : 'Disable this source'}
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
                        Delete data source
                        <Tooltip.Arrow className="fill-card" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
                {/* Selection indicator */}
                {onSelect && (
                  <ChevronRightIcon className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                )}
              </div>
            </div>

            {/* Row count and date */}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {ds.row_count > 0 && (
                <span className="flex items-center gap-1">
                  <HashIcon className="h-3 w-3" />
                  {ds.row_count} rows
                </span>
              )}
              {ds.transformed_at && (
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {formatDate(ds.transformed_at)}
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
                              onSelect={() => handleChangeLinkToAccount(ds, acc.id)}
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
                        onSelect={() => handleUnlinkFromAccount(ds)}
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
                              onSelect={() => handleLinkToAccount(ds, acc.id)}
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
                        onSelect={() => onCreateAccount(ds.source_filename)}
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
              {(ds.status === 'unloaded' || ds.status === 'error') && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleLoadDataSource(ds) }}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/30 transition-colors font-medium disabled:opacity-50 ml-auto"
                >
                  {isLoading ? (
                    <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlayIcon className="h-3.5 w-3.5" />
                  )}
                  {ds.status === 'error' ? 'Retry' : 'Load'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hasPendingSources = unloadedSources.length > 0

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
            {hasPendingSources && (
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
                Load All ({unloadedSources.length})
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
          {dataSources.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
              <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
                <FolderOpenIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">No data sources found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Transform extractions from the Extractions page
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error Sources Section */}
              {errorSources.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Failed to Load</p>
                  {errorSources.map(renderDataSourceCard)}
                </div>
              )}

              {/* Unloaded Sources Section (Ready to Load) */}
              {unloadedSources.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">Ready to Load</p>
                  {unloadedSources.map(renderDataSourceCard)}
                </div>
              )}

              {/* Loading Sources Section */}
              {loadingSources.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Loading</p>
                  {loadingSources.map(renderDataSourceCard)}
                </div>
              )}

              {/* Loaded Sources Section */}
              {loadedSources.length > 0 && (
                <div className="space-y-3">
                  {(unloadedSources.length > 0 || errorSources.length > 0 || loadingSources.length > 0) && (
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider">Loaded</p>
                  )}
                  {loadedSources.map(renderDataSourceCard)}
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
