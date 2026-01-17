import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts"
import * as Tooltip from "@radix-ui/react-tooltip"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  WalletIcon,
  TrendingUpIcon,
  ClockIcon,
  FlameIcon,
  ArrowRightIcon,
  ActivityIcon,
  BriefcaseIcon,
  ReceiptIcon,
  HelpCircleIcon,
} from "lucide-react"
import { Header } from "@/components/Header"
import { TransactionTooltip } from "@/components/TransactionTooltip"
import {
  fetchSummary,
  fetchMonthly,
  fetchCategories,
  fetchTransactions,
  fetchTopExpenses,
  type Summary,
  type AccountSummary,
  type MonthlyData,
  type CategoryData,
  type Transaction,
  type TopExpense,
} from "@/lib/api"
import { WaffleChart } from "@/components/WaffleChart"

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

function PerAccountTooltip({
  accounts,
  field,
  children,
}: {
  accounts: AccountSummary[]
  field: keyof AccountSummary
  children: React.ReactNode
}) {
  if (!accounts || accounts.length === 0) {
    return <>{children}</>
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger asChild>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-card text-card-foreground px-4 py-3 rounded-lg shadow-lg border border-border text-sm z-50 max-w-xs"
            sideOffset={8}
          >
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Per Account</div>
              {accounts.map((acc) => (
                <div key={acc.id} className="flex justify-between gap-4">
                  <span className="text-muted-foreground truncate">{acc.nickname}</span>
                  <span className="font-medium whitespace-nowrap">
                    {field === 'unaccounted' && (acc[field] as number) >= 0 ? '+' : ''}
                    {field === 'transaction_count'
                      ? (acc[field] as number).toLocaleString()
                      : formatCurrency(acc[field] as number)}
                  </span>
                </div>
              ))}
            </div>
            <Tooltip.Arrow className="fill-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [topExpenses, setTopExpenses] = useState<TopExpense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = "Dashboard | FinAccs"
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const [summaryData, monthlyData, categoryData, transactionsData, topExpensesData] =
          await Promise.all([
            fetchSummary(),
            fetchMonthly(),
            fetchCategories(),
            fetchTransactions({ limit: 10 }),
            fetchTopExpenses(10),
          ])

        setSummary(summaryData)
        setMonthly(monthlyData.data)
        setCategories(categoryData.data)
        setTransactions(transactionsData.data)
        setTopExpenses(topExpensesData.data)
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
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Balance Overview */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <PerAccountTooltip accounts={summary?.per_account ?? []} field="starting_balance">
            <section className="rounded-xl border border-slate-500/20 bg-gradient-to-br from-slate-500/10 via-card to-card hover:shadow-lg hover:border-slate-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Starting Balance</h3>
                <div className="p-2 rounded-lg bg-slate-500/10">
                  <WalletIcon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.starting_balance ?? 0} className="text-2xl font-bold text-slate-600 dark:text-slate-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="total_credits">
            <section className="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 via-card to-card hover:shadow-lg hover:border-green-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Total Credits</h3>
                <div className="p-2 rounded-lg bg-green-500/10">
                  <ArrowUpIcon className="h-4 w-4 text-green-700 dark:text-green-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.total_credits ?? 0} className="text-2xl font-bold text-green-700 dark:text-green-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="total_debits">
            <section className="rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/10 via-card to-card hover:shadow-lg hover:border-red-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Total Debits</h3>
                <div className="p-2 rounded-lg bg-red-500/10">
                  <ArrowDownIcon className="h-4 w-4 text-red-700 dark:text-red-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.total_debits ?? 0} className="text-2xl font-bold text-red-700 dark:text-red-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="unaccounted">
            <section className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card hover:shadow-lg hover:border-amber-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Unaccounted</h3>
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <HelpCircleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                  <FormattedCurrency amount={summary?.unaccounted ?? 0} />
                  {(summary?.unaccounted ?? 0) > 0 ? (
                    <ArrowUpIcon className="h-5 w-5" />
                  ) : (summary?.unaccounted ?? 0) < 0 ? (
                    <ArrowDownIcon className="h-5 w-5" />
                  ) : null}
                </span>
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="current_balance">
            <section className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-card to-card hover:shadow-lg hover:border-blue-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Current Balance</h3>
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <WalletIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.current_balance ?? 0} className="text-2xl font-bold text-blue-600 dark:text-blue-400" />
              </div>
            </section>
          </PerAccountTooltip>
        </div>

        {/* Balance Formula */}
        {summary && (
          <div className="mb-8 p-4 rounded-xl border border-border bg-card/50">
            <div className="flex flex-wrap items-center justify-center gap-2 text-base">
              <span className="text-slate-600 dark:text-slate-400" style={{ fontFamily: "'Rock Salt', cursive" }}>Starting Balance</span>
              <span className="text-muted-foreground" style={{ fontFamily: "'Rock Salt', cursive" }}>+</span>
              <span className="text-green-700 dark:text-green-400" style={{ fontFamily: "'Rock Salt', cursive" }}>Total Credits</span>
              <span className="text-muted-foreground" style={{ fontFamily: "'Rock Salt', cursive" }}>−</span>
              <span className="text-red-700 dark:text-red-400" style={{ fontFamily: "'Rock Salt', cursive" }}>Total Debits</span>
              <span className="text-muted-foreground" style={{ fontFamily: "'Rock Salt', cursive" }}>=</span>
              <span className="text-blue-600 dark:text-blue-400" style={{ fontFamily: "'Rock Salt', cursive" }}>Current Balance</span>
              {Math.abs(summary.unaccounted) > 0.01 ? (
                <>
                  <span className="text-muted-foreground mx-2">→</span>
                  <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400" style={{ fontFamily: "'Shadows Into Light', cursive" }}>
                    Current is <span className="text-xl" style={{ fontFamily: "'Permanent Marker', cursive" }}>{formatCurrency(Math.abs(summary.unaccounted))}</span> {summary.unaccounted > 0 ? 'more' : 'less'} than expected
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground mx-2">→</span>
                  <span className="px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400" style={{ fontFamily: "'Shadows Into Light', cursive" }}>
                    ✓ Balanced
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Income & Expenses Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <PerAccountTooltip accounts={summary?.per_account ?? []} field="salary_income">
            <section className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-card hover:shadow-lg hover:border-emerald-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Salary Income</h3>
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <BriefcaseIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.salary_income ?? 0} className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="other_income">
            <section className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 via-card to-card hover:shadow-lg hover:border-teal-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Other Income</h3>
                <div className="p-2 rounded-lg bg-teal-500/10">
                  <ArrowUpIcon className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.other_income ?? 0} className="text-2xl font-bold text-teal-600 dark:text-teal-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="expenses">
            <section className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-card to-card hover:shadow-lg hover:border-orange-500/30 transition-all shadow-sm cursor-help">
              <header className="flex flex-row items-center justify-between p-6 pb-2">
                <h3 className="text-sm font-medium">Expenses</h3>
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <ReceiptIcon className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </header>
              <div className="p-6 pt-0">
                <FormattedCurrency amount={summary?.expenses ?? 0} className="text-2xl font-bold text-orange-600 dark:text-orange-400" />
              </div>
            </section>
          </PerAccountTooltip>

          <PerAccountTooltip accounts={summary?.per_account ?? []} field="transaction_count">
            <section className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-card to-card hover:shadow-lg hover:border-purple-500/30 transition-all shadow-sm cursor-help">
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
          </PerAccountTooltip>
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
              {/* Fixed Legend */}
              <div className="flex items-center justify-center gap-6 mb-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-(--color-income)" />
                  <span className="text-muted-foreground">Income</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-(--color-expense)" />
                  <span className="text-muted-foreground">Expenses</span>
                </div>
              </div>
              <div className="flex">
                {/* Fixed Y-axis */}
                <div className="flex-shrink-0">
                  <LineChart
                    data={monthly}
                    width={60}
                    height={280}
                    margin={{ top: 5, right: 0, left: 0, bottom: 25 }}
                  >
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                      axisLine={false}
                      tickLine={false}
                      width={55}
                    />
                    {/* Invisible lines to set Y-axis domain */}
                    <Line dataKey="credits" stroke="transparent" dot={false} />
                    <Line dataKey="debits" stroke="transparent" dot={false} />
                  </LineChart>
                </div>
                {/* Scrollable chart area */}
                <div
                  className="flex-1 overflow-x-auto"
                  ref={(el) => {
                    if (el) el.scrollLeft = el.scrollWidth
                  }}
                >
                  <div style={{ width: Math.max(monthly.length * 50, 500) }}>
                    <LineChart
                      data={monthly}
                      width={Math.max(monthly.length * 50, 500)}
                      height={280}
                      margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        formatter={(value) => formatCurrency(value as number)}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card) / 0.85)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid hsl(var(--foreground) / 0.15)',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                          padding: '8px 12px',
                        }}
                        labelStyle={{
                          color: 'hsl(var(--foreground) / 0.7)',
                          fontWeight: 500,
                          fontSize: '11px',
                          marginBottom: '2px',
                        }}
                        itemStyle={{
                          color: 'hsl(var(--foreground) / 0.8)',
                          fontSize: '12px',
                          padding: '1px 0',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="credits"
                        name="Income"
                        stroke="var(--color-income)"
                        strokeWidth={2}
                        dot={{ fill: 'var(--color-income)', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="debits"
                        name="Expenses"
                        stroke="var(--color-expense)"
                        strokeWidth={2}
                        dot={{ fill: 'var(--color-expense)', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </div>
                </div>
              </div>
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
                <thead className="border-b border-border/40">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <tr className="border-b border-border/30 transition-colors hover:bg-muted/50 cursor-pointer">
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
                              {t.category || "Uncategorized"}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {t.bank_account?.nickname || <span className="text-muted-foreground/40">NA</span>}
                        </td>
                        <td className="p-4 align-middle text-right">
                          {t.credit > 0 ? (
                            <span className="text-green-700 dark:text-green-400 font-medium inline-flex items-center gap-1">
                              <FormattedCurrency amount={t.credit} />
                              <ArrowUpIcon className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-red-700 dark:text-red-400 font-medium inline-flex items-center gap-1">
                              <FormattedCurrency amount={t.debit} />
                              <ArrowDownIcon className="h-3 w-3" />
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
                <thead className="border-b border-border/40">
                  <tr>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Description</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Account</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {topExpenses.map((t) => (
                    <TransactionTooltip key={t.id} transaction={t}>
                      <tr className="border-b border-border/30 transition-colors hover:bg-muted/50 cursor-pointer">
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
                              {t.category || "Uncategorized"}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {t.bank_account?.nickname || <span className="text-muted-foreground/40">NA</span>}
                        </td>
                        <td className="p-4 align-middle text-right">
                          <span className="text-red-700 dark:text-red-400 font-medium inline-flex items-center gap-1">
                            <FormattedCurrency amount={t.amount} />
                            <ArrowDownIcon className="h-3 w-3" />
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
