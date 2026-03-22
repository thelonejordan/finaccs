import { useState, useEffect } from "react"
import {
  LayersIcon,
  PlusIcon,
  Trash2Icon,
  PlayIcon,
  CheckCircleIcon,
  Loader2Icon,
  XIcon,
  AlertCircleIcon,
  PencilIcon,
} from "lucide-react"
import * as Dialog from "@radix-ui/react-dialog"
import {
  fetchOverlappingGroups,
  createOverlappingGroup,
  deleteOverlappingGroup,
  startResolution,
  type OverlappingSourceGroup,
  type DataSourceArtifact,
} from "@/lib/api"

interface OverlappingGroupsProps {
  dataSources: DataSourceArtifact[]
  onStartResolution?: (sessionId: string) => void
  onRefresh?: () => void
  refreshTrigger?: number
}

export function OverlappingGroups({ dataSources, onStartResolution, onRefresh, refreshTrigger }: OverlappingGroupsProps) {
  const [groups, setGroups] = useState<OverlappingSourceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [groupName, setGroupName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)

  useEffect(() => {
    loadGroups()
  }, [refreshTrigger])

  const loadGroups = async () => {
    try {
      const data = await fetchOverlappingGroups()
      setGroups(data.groups || [])
    } catch (err) {
      console.error("Failed to load overlapping groups:", err)
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    if (selectedSources.length < 2) {
      setCreateError("Select at least 2 data sources")
      return
    }

    setCreating(true)
    setCreateError(null)
    try {
      // Auto-generate name if not provided
      const name = groupName.trim() || `Resolution Group ${new Date().toLocaleDateString()}`
      await createOverlappingGroup({
        name,
        artifact_ids: selectedSources,
      })
      setCreateModalOpen(false)
      setSelectedSources([])
      setGroupName("")
      await loadGroups()
      onRefresh?.()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create group")
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    setDeletingId(groupId)
    try {
      await deleteOverlappingGroup(groupId)
      await loadGroups()
      onRefresh?.()
    } catch (err) {
      console.error("Failed to delete group:", err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleStartResolution = async (groupId: string) => {
    setStartingId(groupId)
    try {
      const session = await startResolution(groupId)
      onStartResolution?.(session.session_id)
      await loadGroups()
    } catch (err) {
      console.error("Failed to start resolution:", err)
    } finally {
      setStartingId(null)
    }
  }

  const toggleSourceSelection = (artifactId: string) => {
    setSelectedSources((prev) =>
      prev.includes(artifactId) ? prev.filter((s) => s !== artifactId) : [...prev, artifactId]
    )
  }

  // Group data sources by account
  const bankSources = dataSources.filter((ds) => ds.data_source_target === "bank_account_transactions")
  const ccSources = dataSources.filter((ds) => ds.data_source_target === "credit_card_transactions")

  // Get account info for selected sources
  const getSelectedAccountInfo = () => {
    if (selectedSources.length === 0) return null
    const first = dataSources.find((ds) => ds.artifact_id === selectedSources[0])
    if (!first) return null
    return {
      bank_account_id: first.bank_account_id,
      credit_card_id: first.credit_card_id,
    }
  }

  // Filter available sources (must match same account)
  const getAvailableSources = () => {
    const accountInfo = getSelectedAccountInfo()
    if (!accountInfo) return dataSources.filter((ds) => ds.status === "loaded")

    return dataSources.filter((ds) => {
      if (ds.status !== "loaded") return false
      if (accountInfo.bank_account_id) {
        return ds.bank_account_id === accountInfo.bank_account_id
      }
      if (accountInfo.credit_card_id) {
        return ds.credit_card_id === accountInfo.credit_card_id
      }
      return false
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
            Pending
          </span>
        )
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-600 dark:text-blue-400">
            <Loader2Icon className="h-3 w-3 animate-spin" />
            In Progress
          </span>
        )
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
            <CheckCircleIcon className="h-3 w-3" />
            Resolved
          </span>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <Loader2Icon className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    )
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-muted">
              <LayersIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            Overlapping Source Groups
          </div>
          <Dialog.Root open={createModalOpen} onOpenChange={setCreateModalOpen}>
            <Dialog.Trigger asChild>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium inline-flex items-center gap-1.5">
                <PlusIcon className="h-3.5 w-3.5" />
                Mark as Overlapping
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card rounded-xl shadow-lg border border-border w-full max-w-lg max-h-[85vh] overflow-hidden z-50">
                <div className="p-6">
                  <Dialog.Title className="text-lg font-semibold mb-1">
                    Mark Sources as Overlapping
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    Select data sources that contain the same transactions. They must belong to the same account.
                  </Dialog.Description>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Group Name</label>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="e.g., 2024 Bank Statements"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1.5">
                        Select Data Sources ({selectedSources.length} selected)
                      </label>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                        {bankSources.length > 0 && (
                          <div className="p-2">
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                              Bank Account Sources
                            </p>
                            {bankSources
                              .filter((ds) => ds.status === "loaded")
                              .map((ds) => {
                                const available = getAvailableSources()
                                const isAvailable = available.some((a) => a.artifact_id === ds.artifact_id)
                                const isSelected = selectedSources.includes(ds.artifact_id)
                                return (
                                  <button
                                    key={ds.artifact_id}
                                    onClick={() => isAvailable && toggleSourceSelection(ds.artifact_id)}
                                    disabled={!isAvailable && !isSelected}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                      isSelected
                                        ? "bg-primary/10 text-primary"
                                        : isAvailable
                                        ? "hover:bg-accent"
                                        : "opacity-50 cursor-not-allowed"
                                    }`}
                                  >
                                    <p className="font-medium truncate">{ds.source_artifact_type}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {ds.source_filename} - {ds.bank_account_name || "Unlinked"}
                                    </p>
                                  </button>
                                )
                              })}
                          </div>
                        )}
                        {ccSources.length > 0 && (
                          <div className="p-2 border-t border-border">
                            <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                              Credit Card Sources
                            </p>
                            {ccSources
                              .filter((ds) => ds.status === "loaded")
                              .map((ds) => {
                                const available = getAvailableSources()
                                const isAvailable = available.some((a) => a.artifact_id === ds.artifact_id)
                                const isSelected = selectedSources.includes(ds.artifact_id)
                                return (
                                  <button
                                    key={ds.artifact_id}
                                    onClick={() => isAvailable && toggleSourceSelection(ds.artifact_id)}
                                    disabled={!isAvailable && !isSelected}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                      isSelected
                                        ? "bg-primary/10 text-primary"
                                        : isAvailable
                                        ? "hover:bg-accent"
                                        : "opacity-50 cursor-not-allowed"
                                    }`}
                                  >
                                    <p className="font-medium truncate">{ds.source_artifact_type}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {ds.source_filename} - {ds.credit_card_name || "Unlinked"}
                                    </p>
                                  </button>
                                )
                              })}
                          </div>
                        )}
                      </div>
                    </div>

                    {createError && (
                      <div className="flex items-center gap-2 text-sm text-red-500">
                        <AlertCircleIcon className="h-4 w-4" />
                        {createError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/30">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handleCreateGroup}
                    disabled={creating || selectedSources.length < 2}
                    className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 font-medium inline-flex items-center gap-2"
                  >
                    {creating && <Loader2Icon className="h-4 w-4 animate-spin" />}
                    Create Group
                  </button>
                </div>

                <Dialog.Close asChild>
                  <button
                    className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-accent transition-colors"
                    aria-label="Close"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </h3>
      </header>

      <div className="p-6 pt-0">
        {groups.length === 0 ? (
          <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
            <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
              <LayersIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No overlapping groups</p>
            <p className="text-sm text-muted-foreground mt-1">
              Mark data sources as overlapping to resolve duplicate transactions
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.group_id}
                className="p-4 rounded-lg border border-border hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{group.name}</p>
                      {getStatusBadge(group.resolution_status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {group.artifact_count} sources
                      {group.bank_account_id && ` • Bank Account`}
                      {group.credit_card_id && ` • Credit Card`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.resolution_status === "pending" && (
                      <>
                        <button
                          onClick={() => handleStartResolution(group.group_id)}
                          disabled={startingId === group.group_id}
                          className="px-3 py-1.5 text-sm rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/30 transition-colors font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {startingId === group.group_id ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PlayIcon className="h-3.5 w-3.5" />
                          )}
                          Resolve
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(group.group_id)}
                          disabled={deletingId === group.group_id}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          {deletingId === group.group_id ? (
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2Icon className="h-4 w-4" />
                          )}
                        </button>
                      </>
                    )}
                    {group.resolution_status === "in_progress" && (
                      <>
                        {group.active_session_id && (
                          <button
                            onClick={() => onStartResolution?.(group.active_session_id!)}
                            className="px-3 py-1.5 text-sm rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 transition-colors font-medium inline-flex items-center gap-1.5"
                          >
                            <PlayIcon className="h-3.5 w-3.5" />
                            Continue
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGroup(group.group_id)}
                          disabled={deletingId === group.group_id}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete group"
                        >
                          {deletingId === group.group_id ? (
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2Icon className="h-4 w-4" />
                          )}
                        </button>
                      </>
                    )}
                    {group.resolution_status === "completed" && (
                      <>
                        {group.completed_session_id && (
                          <button
                            onClick={() => onStartResolution?.(group.completed_session_id!)}
                            className="px-3 py-1.5 text-sm rounded-lg bg-muted hover:bg-accent transition-colors font-medium inline-flex items-center gap-1.5"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => { if (window.confirm('Delete this completed group? Links will be preserved on individual transactions.')) handleDeleteGroup(group.group_id) }}
                          disabled={deletingId === group.group_id}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                          title="Delete group"
                        >
                          {deletingId === group.group_id ? (
                            <Loader2Icon className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2Icon className="h-4 w-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
