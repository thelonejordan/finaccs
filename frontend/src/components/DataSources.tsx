import {
  FileTextIcon,
  DatabaseIcon,
  LinkIcon,
  Link2OffIcon,
  BuildingIcon,
  FolderOpenIcon,
  ClockIcon,
  FileSpreadsheetIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { BankAccount, SourceFile } from "@/lib/api"

interface DataSourcesProps {
  sourceFiles: SourceFile[]
  accounts: BankAccount[]
}

export function DataSources({ sourceFiles, accounts }: DataSourcesProps) {
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

  return (
    <Card className="border-cyan-500/20 bg-gradient-to-br from-card via-card to-cyan-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-cyan-500/10">
            <DatabaseIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          Data Sources
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                    className="p-4 rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-transparent"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl shadow-sm bg-gradient-to-br from-violet-500/20 to-violet-500/10">
                        <FileSpreadsheetIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
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
                      className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                        linkedAccount
                          ? "border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent"
                          : "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2.5 rounded-xl shadow-sm ${
                            linkedAccount
                              ? "bg-gradient-to-br from-green-500/20 to-green-500/10"
                              : "bg-gradient-to-br from-amber-500/20 to-amber-500/10"
                          }`}
                        >
                          <FileTextIcon
                            className={`h-5 w-5 ${
                              linkedAccount
                                ? "text-green-600 dark:text-green-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono text-sm truncate font-medium">{file.filename}</p>
                            {linkedAccount ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-600 dark:text-green-400">
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

                          {linkedAccount ? (
                            <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10">
                                <BuildingIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                <span className="font-medium">{linkedAccount.nickname}</span>
                              </div>
                              <span className="text-muted-foreground">
                                {linkedAccount.bank_name} • <span className="font-mono">****{linkedAccount.account_number.slice(-4)}</span>
                              </span>
                            </div>
                          ) : (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Add a bank account to link this data source
                            </p>
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
      </CardContent>
    </Card>
  )
}
