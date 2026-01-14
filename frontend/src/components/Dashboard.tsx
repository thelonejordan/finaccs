import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  WalletIcon,
  TrendingUpIcon,
  ActivityIcon,
  MenuIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  ClockIcon,
  FlameIcon,
  ArrowRightIcon,
  CheckIcon,
} from "lucide-react"
import { useTheme } from "@/lib/theme"
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
  const [allAccounts, setAllAccounts] = useState<BankAccount[]>([])
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [addSourceFile, setAddSourceFile] = useState<string | null>(null)
  const { mode, setMode } = useTheme()

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, monthlyData, categoryData, transactionsData, topExpensesData, accountsData] =
          await Promise.all([
            fetchSummary(),
            fetchMonthly(),
            fetchCategories(),
            fetchTransactions({ limit: 10 }),
            fetchTopExpenses(10),
            fetchBankAccounts(),
          ])

        setSummary(summaryData)
        setMonthly(monthlyData.data)
        setCategories(categoryData.data)
        setTransactions(transactionsData.data)
        setTopExpenses(topExpensesData.data)
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
    <Tooltip.Provider delayDuration={300}>
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary text-primary-foreground shadow-lg relative">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Financial Dashboard</h1>
            <p className="text-primary-foreground/80 text-sm">
              Track your income, expenses, and financial health
            </p>
          </div>

          {/* Radix Dropdown Menu */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
                aria-label="Toggle menu"
              >
                <MenuIcon className="h-6 w-6" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="w-56 bg-card rounded-lg shadow-lg border border-border z-50 p-2 animate-in fade-in-0 zoom-in-95"
                sideOffset={8}
                align="end"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Display Mode
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => setMode(value as "light" | "dark" | "system")}>
                  <DropdownMenu.RadioItem
                    value="light"
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                  >
                    <SunIcon className="h-4 w-4" />
                    <span className="flex-1">Light</span>
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="h-4 w-4" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    value="dark"
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                  >
                    <MoonIcon className="h-4 w-4" />
                    <span className="flex-1">Dark</span>
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="h-4 w-4" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem
                    value="system"
                    className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-card-foreground transition-colors cursor-pointer outline-none"
                  >
                    <MonitorIcon className="h-4 w-4" />
                    <span className="flex-1">System</span>
                    <DropdownMenu.ItemIndicator>
                      <CheckIcon className="h-4 w-4" />
                    </DropdownMenu.ItemIndicator>
                  </DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Accounts & Data Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <AccountsSection
            accounts={allAccounts}
            sourceFiles={sourceFiles}
            onSave={(account) => {
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
            initialAddSourceFile={addSourceFile}
            onAddingStateChange={(isAdding) => {
              if (!isAdding) setAddSourceFile(null)
            }}
          />
          <DataSources
            sourceFiles={sourceFiles}
            accounts={allAccounts}
            onCreateAccount={(filename) => setAddSourceFile(filename)}
            onAccountUpdated={(account) => {
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
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <section className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-card to-card hover:shadow-lg hover:border-blue-500/30 transition-all shadow-sm">
            <header className="flex flex-row items-center justify-between p-6 pb-2">
              <h3 className="text-sm font-medium">Current Balance</h3>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <WalletIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </header>
            <div className="p-6 pt-0">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(summary?.current_balance ?? 0)}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 via-card to-card hover:shadow-lg hover:border-green-500/30 transition-all shadow-sm">
            <header className="flex flex-row items-center justify-between p-6 pb-2">
              <h3 className="text-sm font-medium">Total Income</h3>
              <div className="p-2 rounded-lg bg-green-500/10">
                <ArrowUpIcon className="h-4 w-4 text-green-700 dark:text-green-400" />
              </div>
            </header>
            <div className="p-6 pt-0">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(summary?.total_credits ?? 0)}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-card to-card hover:shadow-lg hover:border-red-500/30 transition-all shadow-sm">
            <header className="flex flex-row items-center justify-between p-6 pb-2">
              <h3 className="text-sm font-medium">Total Expenses</h3>
              <div className="p-2 rounded-lg bg-red-500/10">
                <ArrowDownIcon className="h-4 w-4 text-red-700 dark:text-red-400" />
              </div>
            </header>
            <div className="p-6 pt-0">
              <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                {formatCurrency(summary?.total_debits ?? 0)}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-card to-card hover:shadow-lg hover:border-purple-500/30 transition-all shadow-sm">
            <header className="flex flex-row items-center justify-between p-6 pb-2">
              <h3 className="text-sm font-medium">Transactions</h3>
              <div className="p-2 rounded-lg bg-purple-500/10">
                <ActivityIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </header>
            <div className="p-6 pt-0">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {summary?.transaction_count ?? 0}
              </div>
            </div>
          </section>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Monthly Chart */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted">
                  <TrendingUpIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                Monthly Overview
              </h3>
            </header>
            <div className="p-6 pt-0">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="credits"
                    name="Income"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="debits"
                    name="Expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Category Waffle Chart */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted">
                  <ActivityIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                Spend by Category
              </h3>
            </header>
            <div className="p-6 pt-0">
              <WaffleChart data={categories} />
            </div>
          </section>
        </div>

        {/* Tables Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Transactions */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-2">
              <h3 className="font-semibold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-muted">
                    <ClockIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  Recent Transactions
                </div>
                <Link
                  to="/transactions"
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  View All
                  <ArrowRightIcon className="h-4 w-4" />
                </Link>
              </h3>
            </header>
            <div className="p-6 pt-0">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <tr className="border-b transition-colors hover:bg-muted/50 cursor-pointer">
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {formatDate(t.date)}
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[200px]">
                              {t.narration.split("-")[1]?.substring(0, 30) ||
                                t.narration.substring(0, 30)}
                            </span>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground w-fit mt-1">
                              {t.category}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-right">
                          {t.credit > 0 ? (
                            <span className="text-green-700 dark:text-green-400 font-medium">
                              +{formatCurrency(t.credit)}
                            </span>
                          ) : (
                            <span className="text-red-700 dark:text-red-400 font-medium">
                              -{formatCurrency(t.debit)}
                            </span>
                          )}
                        </td>
                      </tr>
                    </TransactionTooltip>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top Expenses */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="p-6 pb-2">
              <h3 className="font-semibold flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-muted">
                  <FlameIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                Top Expenses
              </h3>
            </header>
            <div className="p-6 pt-0">
              <table className="w-full caption-bottom text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {topExpenses.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <tr className="border-b transition-colors hover:bg-muted/50 cursor-pointer">
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {formatDate(t.date)}
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex flex-col">
                            <span className="text-sm truncate max-w-[200px]">
                              {t.narration.split("-")[1]?.substring(0, 30) ||
                                t.narration.substring(0, 30)}
                            </span>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground w-fit mt-1">
                              {t.category}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-right">
                          <span className="text-red-700 dark:text-red-400 font-medium">
                            {formatCurrency(t.amount)}
                          </span>
                        </td>
                      </tr>
                    </TransactionTooltip>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
    </Tooltip.Provider>
  )
}
