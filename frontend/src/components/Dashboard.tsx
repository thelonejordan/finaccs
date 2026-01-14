import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  WalletIcon,
  TrendingUpIcon,
  ActivityIcon,
  MenuIcon,
  XIcon,
  SunIcon,
  MoonIcon,
  ClockIcon,
  FlameIcon,
} from "lucide-react"
import { useTheme } from "@/lib/theme"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TransactionTooltip } from "@/components/TransactionTooltip"
import {
  fetchSummary,
  fetchMonthly,
  fetchCategories,
  fetchTransactions,
  fetchTopExpenses,
  fetchBankAccounts,
  type Summary,
  type MonthlyData,
  type CategoryData,
  type Transaction,
  type TopExpense,
  type BankAccount,
  type SourceFile,
} from "@/lib/api"
import { AccountsSection } from "@/components/AccountsSection"
import { DataSources } from "@/components/DataSources"
import { WaffleChart } from "@/components/WaffleChart"

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

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [topExpenses, setTopExpenses] = useState<TopExpense[]>([])
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null)
  const [allAccounts, setAllAccounts] = useState<BankAccount[]>([])
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, monthlyData, categoryData, transactionsData, topExpensesData, accountsData] =
          await Promise.all([
            fetchSummary(),
            fetchMonthly(),
            fetchCategories(),
            fetchTransactions({ limit: 15 }),
            fetchTopExpenses(10),
            fetchBankAccounts(),
          ])

        setSummary(summaryData)
        setMonthly(monthlyData.data)
        setCategories(categoryData.data)
        setTransactions(transactionsData.data)
        setTopExpenses(topExpensesData.data)
        setBankAccount(accountsData.accounts[0] || null)
        setAllAccounts(accountsData.accounts)
        setSourceFiles(accountsData.source_files)
      } catch (error) {
        console.error("Failed to load data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary text-primary-foreground shadow-lg relative">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Financial Dashboard</h1>
            <p className="text-primary-foreground/80 text-sm">
              Track your income, expenses, and financial health
            </p>
          </div>

          {/* Hamburger Menu Button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <XIcon className="h-6 w-6" />
            ) : (
              <MenuIcon className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="absolute right-4 top-full mt-2 w-56 bg-card rounded-lg shadow-lg border border-border z-50">
            <div className="p-2">
              <button
                onClick={() => {
                  toggleTheme()
                  setMenuOpen(false)
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md hover:bg-accent text-card-foreground transition-colors"
              >
                {theme === "light" ? (
                  <>
                    <MoonIcon className="h-5 w-5" />
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <SunIcon className="h-5 w-5" />
                    <span>Light Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Accounts & Data Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AccountsSection
            accounts={allAccounts}
            sourceFiles={sourceFiles}
            onSave={(account) => {
              setBankAccount(account)
              setAllAccounts((prev) => {
                const existing = prev.findIndex((a) => a.id === account.id)
                if (existing >= 0) {
                  const updated = [...prev]
                  updated[existing] = account
                  return updated
                }
                return [...prev, account]
              })
            }}
          />
          <DataSources sourceFiles={sourceFiles} accounts={allAccounts} />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-card to-card hover:shadow-lg hover:border-blue-500/30 transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Current Balance
              </CardTitle>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <WalletIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(summary?.current_balance ?? 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 via-card to-card hover:shadow-lg hover:border-green-500/30 transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <div className="p-2 rounded-lg bg-green-500/10">
                <ArrowUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(summary?.total_credits ?? 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-500/20 bg-gradient-to-br from-red-500/10 via-card to-card hover:shadow-lg hover:border-red-500/30 transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Expenses
              </CardTitle>
              <div className="p-2 rounded-lg bg-red-500/10">
                <ArrowDownIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(summary?.total_debits ?? 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-card to-card hover:shadow-lg hover:border-purple-500/30 transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ActivityIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {summary?.transaction_count ?? 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Monthly Chart */}
          <Card className="border-indigo-500/20 bg-gradient-to-br from-card via-card to-indigo-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10">
                  <TrendingUpIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                Monthly Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="credits" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="debits" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category Waffle Chart */}
          <Card className="border-pink-500/20 bg-gradient-to-br from-card via-card to-pink-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-pink-500/10">
                  <ActivityIcon className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                </div>
                Spending by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WaffleChart data={categories} />
            </CardContent>
          </Card>
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <Card className="border-teal-500/20 bg-gradient-to-br from-card via-card to-teal-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-teal-500/10">
                  <ClockIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </div>
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <TableRow className="cursor-pointer">
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(t.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[200px]">
                              {t.narration.split("-")[1]?.substring(0, 30) ||
                                t.narration.substring(0, 30)}
                            </span>
                            <Badge variant="secondary" className="w-fit mt-1">
                              {t.category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.credit > 0 ? (
                            <span className="text-green-600 font-medium">
                              +{formatCurrency(t.credit)}
                            </span>
                          ) : (
                            <span className="text-red-600 font-medium">
                              -{formatCurrency(t.debit)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    </TransactionTooltip>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top Expenses */}
          <Card className="border-orange-500/20 bg-gradient-to-br from-card via-card to-orange-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-orange-500/10">
                  <FlameIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                Top Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topExpenses.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <TableRow className="cursor-pointer">
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(t.date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[200px]">
                              {t.narration.split("-")[1]?.substring(0, 30) ||
                                t.narration.substring(0, 30)}
                            </span>
                            <Badge variant="secondary" className="w-fit mt-1">
                              {t.category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-red-600 font-medium">
                            {formatCurrency(t.amount)}
                          </span>
                        </TableCell>
                      </TableRow>
                    </TransactionTooltip>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
    </TooltipProvider>
  )
}
