import { useState } from "react"
import {
  FileTextIcon,
  DatabaseIcon,
  LinkIcon,
  Link2OffIcon,
  BuildingIcon,
  FolderOpenIcon,
  ClockIcon,
  FileSpreadsheetIcon,
  PlusIcon,
  ChevronDownIcon,
  CalendarIcon,
  HashIcon,
} from "lucide-react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { updateBankAccount, type BankAccount, type SourceFile } from "@/lib/api"

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

interface DataSourcesProps {
  sourceFiles: SourceFile[]
  accounts: BankAccount[]
  onCreateAccount: (filename: string) => void
  onAccountUpdated: (account: BankAccount) => void
}

export function DataSources({ sourceFiles, accounts, onCreateAccount, onAccountUpdated }: DataSourcesProps) {
  const [isLinking, setIsLinking] = useState(false)
  // Create a map of source_file -> account for quick lookup
  const fileToAccount = new Map<string, BankAccount>()
  accounts.forEach((acc) => {
    if (acc.source_file) {
      fileToAccount.set(acc.source_file, acc)
    }
  })

  // Separate parsed and pending files
  const parsedFiles = sourceFiles.filter((f) => f.status === 'parsed')
  const pendingFiles = sourceFiles.filter((f) => f.status === 'pending')

  const handleLinkToAccount = async (filename: string, accountId: number) => {
    setIsLinking(true)
    try {
      const updatedAccount = await updateBankAccount(accountId, { source_file: filename })
      onAccountUpdated(updatedAccount)
    } catch (error) {
      console.error("Failed to link account:", error)
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="p-6 pb-3">
        <h3 className="font-semibold flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <DatabaseIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          Data Sources
        </h3>
      </header>
      <div className="p-6 pt-0">
        {sourceFiles.length === 0 ? (
          <div className="text-center py-8 rounded-xl bg-gradient-to-br from-muted/50 to-transparent border border-border">
            <div className="p-3 rounded-full bg-muted w-fit mx-auto mb-3">
              <FolderOpenIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No data source files found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add bank statement files to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">bank_accs/data/</code>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending Files Section */}
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Waiting to be parsed</p>
                {pendingFiles.map((file) => (
                  <div
                    key={file.filename}
                    className="p-4 rounded-lg border border-border"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-muted">
                        <FileSpreadsheetIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-sm truncate font-medium">{file.filename}</p>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/20 text-violet-600 dark:text-violet-400">
                            <ClockIcon className="h-3 w-3" />
                            Pending
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          This file needs to be parsed before it can be used
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Parsed Files Section */}
            {parsedFiles.length > 0 && (
              <div className="space-y-2">
                {pendingFiles.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parsed files</p>
                )}
                {parsedFiles.map((file) => {
                  const linkedAccount = fileToAccount.get(file.filename)
                  return (
                    <div
                      key={file.filename}
                      className="p-4 rounded-lg border border-border transition-all hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-muted">
                          <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono text-sm truncate font-medium">{file.filename}</p>
                            {linkedAccount ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-400">
                                <LinkIcon className="h-3 w-3" />
                                Linked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                <Link2OffIcon className="h-3 w-3" />
                                Not linked
                              </span>
                            )}
                          </div>

                          {/* Date range and transaction count */}
                          {file.first_transaction_date && file.last_transaction_date && (
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {formatDate(file.first_transaction_date)} — {formatDate(file.last_transaction_date)}
                              </span>
                              {file.transaction_count != null && file.transaction_count > 0 && (
                                <span className="flex items-center gap-1">
                                  <HashIcon className="h-3 w-3" />
                                  {file.transaction_count} transactions
                                </span>
                              )}
                            </div>
                          )}

                          {linkedAccount ? (
                            <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50">
                                <BuildingIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{linkedAccount.nickname}</span>
                              </div>
                              <span className="text-muted-foreground">
                                {linkedAccount.bank_name} • <span className="font-mono">****{linkedAccount.account_number.slice(-4)}</span>
                              </span>
                            </div>
                          ) : (
                            <div className="mt-2">
                              <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium">
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
                                            onSelect={() => handleLinkToAccount(file.filename, acc.id)}
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
                                      onSelect={() => onCreateAccount(file.filename)}
                                      className="flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent transition-colors cursor-pointer outline-none font-medium"
                                    >
                                      <PlusIcon className="h-4 w-4" />
                                      Create new account
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Root>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
