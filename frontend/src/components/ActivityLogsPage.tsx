import { useEffect, useState } from "react"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckIcon,
  FileTextIcon,
  TagIcon,
  Link2Icon,
  Link2OffIcon,
  DownloadIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BuildingIcon,
} from "lucide-react"
import * as Select from "@radix-ui/react-select"
import { Footer } from "@/components/Footer"
import {
  fetchTransactionLogs,
  type TransactionLogEntry,
} from "@/lib/api"

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  // Transaction actions
  LOAD: <DownloadIcon className="h-4 w-4" />,
  CATEGORY_CHANGE: <TagIcon className="h-4 w-4" />,
  LINK: <Link2Icon className="h-4 w-4" />,
  UNLINK: <Link2OffIcon className="h-4 w-4" />,
  // Account actions
  CREATE: <PlusIcon className="h-4 w-4" />,
  UPDATE: <PencilIcon className="h-4 w-4" />,
  DELETE: <TrashIcon className="h-4 w-4" />,
  LINK_SOURCE: <Link2Icon className="h-4 w-4" />,
  UNLINK_SOURCE: <Link2OffIcon className="h-4 w-4" />,
}

const ACTION_COLORS: Record<string, string> = {
  // Transaction actions
  LOAD: "text-blue-500 bg-blue-500/10",
  CATEGORY_CHANGE: "text-amber-500 bg-amber-500/10",
  LINK: "text-green-500 bg-green-500/10",
  UNLINK: "text-red-500 bg-red-500/10",
  // Account actions
  CREATE: "text-emerald-500 bg-emerald-500/10",
  UPDATE: "text-purple-500 bg-purple-500/10",
  DELETE: "text-red-500 bg-red-500/10",
  LINK_SOURCE: "text-cyan-500 bg-cyan-500/10",
  UNLINK_SOURCE: "text-orange-500 bg-orange-500/10",
}

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<TransactionLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [page, setPage] = useState(0)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const pageSize = 50

  useEffect(() => {
    document.title = "Activity Log | FinAccs"
  }, [])

  const toggleExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  useEffect(() => {
    async function loadLogs() {
      setLoading(true)
      const actionParam = actionFilter === "all" ? undefined : actionFilter
      try {
        const result = await fetchTransactionLogs({
          action: actionParam,
          limit: pageSize,
          offset: page * pageSize,
        })
        setLogs(result.data)
        setTotal(result.total)
      } catch (err) {
        console.error("Failed to load logs:", err)
      } finally {
        setLoading(false)
      }
    }
    loadLogs()
  }, [actionFilter, page])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <>
      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-4">
          <Select.Root value={actionFilter} onValueChange={setActionFilter}>
            <Select.Trigger className="inline-flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-input bg-background hover:bg-accent transition-colors min-w-[180px]">
              <Select.Value placeholder="All Actions" />
              <Select.Icon>
                <ChevronDownIcon className="h-4 w-4 opacity-50" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-card rounded-lg shadow-lg border border-border overflow-hidden z-50">
                <Select.Viewport className="p-1">
                  <Select.Item
                    value="all"
                    className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none data-[highlighted]:bg-accent"
                  >
                    <Select.ItemText>All Actions</Select.ItemText>
                    <Select.ItemIndicator>
                      <CheckIcon className="h-4 w-4 ml-auto" />
                    </Select.ItemIndicator>
                  </Select.Item>
                  <Select.Group>
                    <Select.Label className="px-2 py-1 text-xs text-muted-foreground">Transaction</Select.Label>
                    {["LOAD", "CATEGORY_CHANGE", "LINK", "UNLINK"].map((action) => (
                      <Select.Item
                        key={action}
                        value={action}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none data-[highlighted]:bg-accent"
                      >
                        <span className={`p-1 rounded ${ACTION_COLORS[action]}`}>
                          {ACTION_ICONS[action]}
                        </span>
                        <Select.ItemText>
                          {action === "LOAD" && "Initial Load"}
                          {action === "CATEGORY_CHANGE" && "Category Change"}
                          {action === "LINK" && "Transaction Linked"}
                          {action === "UNLINK" && "Transaction Unlinked"}
                        </Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4 ml-auto" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Group>
                  <Select.Separator className="h-px bg-border my-1" />
                  <Select.Group>
                    <Select.Label className="px-2 py-1 text-xs text-muted-foreground">Account</Select.Label>
                    {["CREATE", "UPDATE", "DELETE", "LINK_SOURCE", "UNLINK_SOURCE"].map((action) => (
                      <Select.Item
                        key={action}
                        value={action}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer hover:bg-accent outline-none data-[highlighted]:bg-accent"
                      >
                        <span className={`p-1 rounded ${ACTION_COLORS[action]}`}>
                          {ACTION_ICONS[action]}
                        </span>
                        <Select.ItemText>
                          {action === "CREATE" && "Account Created"}
                          {action === "UPDATE" && "Account Updated"}
                          {action === "DELETE" && "Account Deleted"}
                          {action === "LINK_SOURCE" && "Source File Linked"}
                          {action === "UNLINK_SOURCE" && "Source File Unlinked"}
                        </Select.ItemText>
                        <Select.ItemIndicator>
                          <CheckIcon className="h-4 w-4 ml-auto" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Group>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      </div>

      {/* Logs Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No log entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-44">
                      Timestamp
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-40">
                      Action
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm whitespace-nowrap align-top">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${ACTION_COLORS[log.action]}`}
                        >
                          {ACTION_ICONS[log.action]}
                          {log.action_display}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {/* File load */}
                        {log.log_type === "file_load" && log.file_load && (
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5">
                                <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{log.source_file || "Unknown file"}</span>
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-muted-foreground">
                                {log.bank_account?.nickname || "Unlinked"}
                              </span>
                              {log.file_load.link_source === 'pre_existing' && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600">
                                  Pre-existing Link
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => toggleExpanded(log.id)}
                              className="flex items-center gap-1 mt-1 text-muted-foreground hover:text-foreground"
                            >
                              <span>{log.file_load.transaction_count} transactions loaded</span>
                              {expandedLogs.has(log.id) ? (
                                <ChevronUpIcon className="h-4 w-4" />
                              ) : (
                                <ChevronDownIcon className="h-4 w-4" />
                              )}
                            </button>
                            {expandedLogs.has(log.id) && (
                              <div className="mt-2 pl-3 border-l-2 border-border space-y-1">
                                {Object.entries(log.file_load.category_summary)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([category, count]) => (
                                    <div key={category} className="flex items-center justify-between text-xs max-w-xs">
                                      <span className="text-muted-foreground">{category}</span>
                                      <span className="font-medium">{count}</span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Transaction: Category change */}
                        {log.action === "CATEGORY_CHANGE" && log.transaction && (
                          <div>
                            <div className="font-medium truncate max-w-lg">
                              {log.transaction.narration}
                            </div>
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {formatDate(log.transaction.date)}
                              {log.transaction.bank_account && <> · {log.transaction.bank_account}</>}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-muted-foreground">{log.old_value || "Uncategorized"}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium">{log.new_value}</span>
                            </div>
                          </div>
                        )}
                        {/* Transaction: Link */}
                        {log.action === "LINK" && log.transaction && (
                          <div>
                            <div className="font-medium truncate max-w-lg">
                              {log.transaction.narration}
                            </div>
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {formatDate(log.transaction.date)}
                              {log.transaction.bank_account && <> · {log.transaction.bank_account}</>}
                            </div>
                            <div className="text-muted-foreground mt-1">
                              Linked to transaction #{log.new_value}
                            </div>
                          </div>
                        )}
                        {/* Transaction: Unlink */}
                        {log.action === "UNLINK" && log.transaction && (
                          <div>
                            <div className="font-medium truncate max-w-lg">
                              {log.transaction.narration}
                            </div>
                            <div className="text-muted-foreground text-xs mt-0.5">
                              {formatDate(log.transaction.date)}
                              {log.transaction.bank_account && <> · {log.transaction.bank_account}</>}
                            </div>
                            <div className="text-muted-foreground mt-1">
                              Unlinked from transaction #{log.old_value}
                            </div>
                          </div>
                        )}
                        {/* Account: Create */}
                        {log.action === "CREATE" && (
                          <div className="flex items-center gap-2">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{log.new_value}</span>
                            <span className="text-muted-foreground">created</span>
                          </div>
                        )}
                        {/* Account: Update */}
                        {log.action === "UPDATE" && (
                          <div className="flex items-center gap-2">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">{log.old_value}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">{log.new_value}</span>
                          </div>
                        )}
                        {/* Account: Delete */}
                        {log.action === "DELETE" && (
                          <div className="flex items-center gap-2">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{log.old_value}</span>
                            <span className="text-muted-foreground">deleted</span>
                          </div>
                        )}
                        {/* Account: Link source */}
                        {log.action === "LINK_SOURCE" && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{log.bank_account?.nickname || "Account"}</span>
                            <span className="text-muted-foreground">←</span>
                            <span className="inline-flex items-center gap-1">
                              <FileTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              {log.new_value}
                            </span>
                          </div>
                        )}
                        {/* Account: Unlink source */}
                        {log.action === "UNLINK_SOURCE" && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <BuildingIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{log.bank_account?.nickname || "Account"}</span>
                            <span className="text-muted-foreground">↚</span>
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <FileTextIcon className="h-3.5 w-3.5" />
                              {log.old_value}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
              <div className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1} -{" "}
                {Math.min((page + 1) * pageSize, total)} of {total}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <span className="text-sm">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2 rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  )
}
