const API_BASE = "http://localhost:8000"

export interface AccountSummary {
  id: number
  nickname: string
  starting_balance: number
  current_balance: number
  total_credits: number
  total_debits: number
  salary_income: number
  other_income: number
  expenses: number
  unaccounted: number
  transaction_count: number
}

export interface Summary {
  starting_balance: number
  current_balance: number
  total_credits: number
  total_debits: number
  net_flow: number
  salary_income: number
  other_income: number
  expenses: number
  unaccounted: number
  transaction_count: number
  per_account: AccountSummary[]
}

export interface MonthlyData {
  month: string
  credits: number
  debits: number
}

export interface CategoryData {
  category: string
  amount: number
}

export interface LinkedTransaction {
  id: number
  date: string
  narration: string
  bank_account: string | null
  amount: number
}

export interface Transaction {
  id: number
  date: string
  narration: string
  debit: number
  credit: number
  balance: number
  category: string
  reference: string
  bank_account: {
    id: number
    nickname: string
  } | null
  source_file: {
    id: number
    filename: string
  } | null
  linked_transaction: LinkedTransaction | null
}

export interface TopExpense {
  id: number
  date: string
  narration: string
  amount: number
  category: string
  bank_account: {
    id: number
    nickname: string
  } | null
}

export interface TransactionStats {
  total_credits: number
  total_debits: number
  net_flow: number
}

export interface BankAccount {
  id: number
  nickname: string
  bank_name: string
  account_number: string
  ifsc_code: string
  branch: string
  source_files: string[]
  created_at?: string
  updated_at?: string
  // Transaction stats
  current_balance?: number | null
  last_transaction_date?: string | null
  starting_balance?: number | null
  first_transaction_date?: string | null
  transaction_count?: number
}

export interface BankAccountInput {
  nickname: string
  bank_name: string
  account_number: string
  ifsc_code: string
  branch: string
  source_files: string[]
}

export interface SourceFile {
  id: number
  filename: string
  status: 'parsed' | 'pending'
  bank_account_id: number | null
  disabled: boolean
  first_transaction_date?: string | null
  last_transaction_date?: string | null
  transaction_count?: number
}

export async function toggleSourceFileDisabled(
  sourceFileId: number,
  disabled: boolean
): Promise<{ id: number; filename: string; disabled: boolean }> {
  const res = await fetch(`${API_BASE}/api/source-files/${sourceFileId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disabled }),
  })
  return res.json()
}

export async function fetchSummary(): Promise<Summary> {
  const res = await fetch(`${API_BASE}/api/summary/`)
  return res.json()
}

export async function fetchMonthly(): Promise<{ data: MonthlyData[] }> {
  const res = await fetch(`${API_BASE}/api/monthly/`)
  return res.json()
}

export async function fetchCategories(includeAll = false): Promise<{ data: CategoryData[] }> {
  const params = includeAll ? '?include_all=true' : ''
  const res = await fetch(`${API_BASE}/api/categories/${params}`)
  return res.json()
}

export async function fetchTransactions(params?: {
  category?: string
  type?: string
  bank_account?: number
  source_file?: number
  year?: number
  month?: number
  search?: string
  limit?: number
  offset?: number
}): Promise<{ data: Transaction[]; total: number; stats: TransactionStats }> {
  const searchParams = new URLSearchParams()
  if (params?.category) searchParams.set("category", params.category)
  if (params?.type) searchParams.set("type", params.type)
  if (params?.bank_account) searchParams.set("bank_account", params.bank_account.toString())
  if (params?.source_file) searchParams.set("source_file", params.source_file.toString())
  if (params?.year) searchParams.set("year", params.year.toString())
  if (params?.month) searchParams.set("month", params.month.toString())
  if (params?.search) searchParams.set("search", params.search)
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/transactions/?${searchParams}`)
  return res.json()
}

export async function fetchTopExpenses(
  limit = 10
): Promise<{ data: TopExpense[] }> {
  const res = await fetch(`${API_BASE}/api/top-expenses/?limit=${limit}`)
  return res.json()
}

export async function fetchBankAccounts(): Promise<{
  accounts: BankAccount[]
  source_files: SourceFile[]
}> {
  const res = await fetch(`${API_BASE}/api/accounts/`)
  return res.json()
}

export async function createBankAccount(
  data: BankAccountInput
): Promise<BankAccount> {
  const res = await fetch(`${API_BASE}/api/accounts/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateBankAccount(
  id: number,
  data: Partial<BankAccountInput>
): Promise<BankAccount> {
  const res = await fetch(`${API_BASE}/api/accounts/${id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateTransactionCategory(
  transactionId: number,
  category: string
): Promise<Transaction> {
  const res = await fetch(`${API_BASE}/api/transactions/${transactionId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  })
  return res.json()
}

export interface PotentialLinkTransaction {
  id: number
  date: string
  narration: string
  debit: number
  credit: number
  category: string
  bank_account: {
    id: number
    nickname: string
  } | null
}

export async function fetchPotentialLinks(
  transactionId: number
): Promise<{ data: PotentialLinkTransaction[] }> {
  const res = await fetch(
    `${API_BASE}/api/transactions/${transactionId}/potential-links/`
  )
  return res.json()
}

export async function linkTransaction(
  transactionId: number,
  linkToId: number
): Promise<{ id: number; linked_transaction: LinkedTransaction }> {
  const res = await fetch(
    `${API_BASE}/api/transactions/${transactionId}/link/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_to: linkToId }),
    }
  )
  return res.json()
}

export async function unlinkTransaction(
  transactionId: number
): Promise<{ id: number; linked_transaction: null }> {
  const res = await fetch(
    `${API_BASE}/api/transactions/${transactionId}/link/`,
    {
      method: "DELETE",
    }
  )
  return res.json()
}

export interface TransactionLogEntry {
  id: string
  log_type: 'transaction' | 'account' | 'file_load'
  action: 'LOAD' | 'CATEGORY_CHANGE' | 'LINK' | 'UNLINK' | 'CREATE' | 'UPDATE' | 'DELETE' | 'LINK_SOURCE' | 'UNLINK_SOURCE'
  action_display: string
  old_value: string
  new_value: string
  created_at: string
  transaction: {
    id: number
    date: string
    narration: string
    bank_account: string | null
  } | null
  bank_account: {
    id: number
    nickname: string
  } | null
  source_file: string | null
  file_load: {
    transaction_count: number
    category_summary: Record<string, number>
    file_hash: string
    source_file_id: number | null
    link_source: 'pre_existing' | 'none'
    link_source_display: string
  } | null
}

export async function fetchTransactionLogs(params?: {
  action?: string
  transaction_id?: number
  limit?: number
  offset?: number
}): Promise<{ data: TransactionLogEntry[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.action) searchParams.set("action", params.action)
  if (params?.transaction_id) searchParams.set("transaction_id", params.transaction_id.toString())
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/logs/?${searchParams}`)
  return res.json()
}

export interface PreviousTransaction {
  id: number
  date: string
  closing_balance: number
}

export interface Inconsistency {
  transaction_id: number
  date: string
  narration: string
  debit: number
  credit: number
  actual_balance: number
  expected_balance: number
  gap: number
  reference: string
  bank_account: {
    id: number
    nickname: string
  }
  source_file: {
    id: number
    filename: string
  } | null
  previous_transaction: PreviousTransaction
}

export async function fetchInconsistencies(params?: {
  bank_account?: number
  limit?: number
  offset?: number
}): Promise<{ data: Inconsistency[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.bank_account) searchParams.set("bank_account", params.bank_account.toString())
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/inconsistencies/?${searchParams}`)
  return res.json()
}

export interface DateRange {
  years: Record<string, number[]>  // { "2024": [1, 2, 3, ...], "2023": [...] }
}

export interface DateRangeFilters {
  bank_account?: number
  category?: string
  type?: string
  source_file?: number
  search?: string
}

export async function fetchDateRange(filters?: DateRangeFilters): Promise<DateRange> {
  const searchParams = new URLSearchParams()
  if (filters?.bank_account) searchParams.set('bank_account', filters.bank_account.toString())
  if (filters?.category) searchParams.set('category', filters.category)
  if (filters?.type) searchParams.set('type', filters.type)
  if (filters?.source_file) searchParams.set('source_file', filters.source_file.toString())
  if (filters?.search) searchParams.set('search', filters.search)

  const queryString = searchParams.toString()
  const url = queryString ? `${API_BASE}/api/date-range/?${queryString}` : `${API_BASE}/api/date-range/`
  const res = await fetch(url)
  return res.json()
}

// ==================== Credit Card API ====================

export interface CreditCard {
  id: number
  nickname: string
  card_name: string
  card_number_mask: string
  issuer: string
  credit_limit: number | null
  source_files: string[]
  created_at?: string
  updated_at?: string
  total_charges?: number
  total_payments?: number
  last_transaction_date?: string | null
  first_transaction_date?: string | null
  transaction_count?: number
}

export interface CreditCardInput {
  nickname: string
  card_name: string
  card_number_mask: string
  issuer: string
  credit_limit?: number | null
  source_files: string[]
}

export interface CreditCardSourceFile {
  id: number
  filename: string
  credit_card_id: number | null
  credit_card_nickname: string | null
  disabled: boolean
  first_transaction_date?: string | null
  last_transaction_date?: string | null
  transaction_count?: number
}

export interface CreditCardTransaction {
  id: number
  date: string
  description: string
  amount: number
  intl_amount: number
  category: string
  credit_card: {
    id: number
    nickname: string
  } | null
  source_file: {
    id: number
    filename: string
  } | null
}

export interface CreditCardTransactionStats {
  total_charges: number
  total_payments: number
  net: number
}

export interface CreditCardCategoryData {
  category: string
  count: number
  total_charges: number
  total_payments: number
}

export async function fetchCreditCards(): Promise<{
  cards: CreditCard[]
  source_files: CreditCardSourceFile[]
}> {
  const res = await fetch(`${API_BASE}/api/credit-cards/`)
  return res.json()
}

export async function createCreditCard(data: CreditCardInput): Promise<CreditCard> {
  const res = await fetch(`${API_BASE}/api/credit-cards/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateCreditCard(id: number, data: Partial<CreditCardInput>): Promise<CreditCard> {
  const res = await fetch(`${API_BASE}/api/credit-cards/${id}/`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteCreditCard(id: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/credit-cards/${id}/`, {
    method: "DELETE",
  })
  return res.json()
}

export async function toggleCreditCardSourceFileDisabled(
  sourceFileId: number,
  disabled: boolean
): Promise<{ id: number; filename: string; disabled: boolean }> {
  const res = await fetch(`${API_BASE}/api/credit-card-source-files/${sourceFileId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ disabled }),
  })
  return res.json()
}

export async function fetchCreditCardTransactions(params?: {
  credit_card?: number
  category?: string
  type?: string  // 'charge' | 'payment'
  source_file?: number
  year?: number
  month?: number
  search?: string
  limit?: number
  offset?: number
}): Promise<{ data: CreditCardTransaction[]; total: number; stats: CreditCardTransactionStats }> {
  const searchParams = new URLSearchParams()
  if (params?.credit_card) searchParams.set("credit_card", params.credit_card.toString())
  if (params?.category) searchParams.set("category", params.category)
  if (params?.type) searchParams.set("type", params.type)
  if (params?.source_file) searchParams.set("source_file", params.source_file.toString())
  if (params?.year) searchParams.set("year", params.year.toString())
  if (params?.month) searchParams.set("month", params.month.toString())
  if (params?.search) searchParams.set("search", params.search)
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/credit-card-transactions/?${searchParams}`)
  return res.json()
}

export async function fetchCreditCardDateRange(): Promise<DateRange> {
  const res = await fetch(`${API_BASE}/api/credit-card-date-range/`)
  return res.json()
}

export async function fetchCreditCardCategories(params?: {
  credit_card?: number
  include_all?: boolean
}): Promise<{ data: CreditCardCategoryData[] }> {
  const searchParams = new URLSearchParams()
  if (params?.credit_card) searchParams.set("credit_card", params.credit_card.toString())
  if (params?.include_all) searchParams.set("include_all", "true")

  const res = await fetch(`${API_BASE}/api/credit-card-categories/?${searchParams}`)
  return res.json()
}

export async function updateCreditCardTransactionCategory(
  transactionId: number,
  category: string
): Promise<{ id: number; category: string }> {
  const res = await fetch(`${API_BASE}/api/credit-card-transactions/${transactionId}/category/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  })
  return res.json()
}

export interface CreditCardInconsistency {
  id: number
  type: 'duplicate' | 'cross_card' | 'missing_description'
  date: string
  description: string
  amount: number
  category: string
  credit_card: {
    id: number
    nickname: string
  } | null
  source_file: {
    id: number
    filename: string
  } | null
  message: string
  related_ids: number[]
  dismissed: boolean
}

export async function fetchCreditCardInconsistencies(params?: {
  credit_card?: number
  include_dismissed?: boolean
}): Promise<{
  data: CreditCardInconsistency[]
  total: number
  counts: {
    duplicate: number
    cross_card: number
    missing_description: number
  }
}> {
  const searchParams = new URLSearchParams()
  if (params?.credit_card) searchParams.set("credit_card", params.credit_card.toString())
  if (params?.include_dismissed) searchParams.set("include_dismissed", "true")

  const res = await fetch(`${API_BASE}/api/credit-card-inconsistencies/?${searchParams}`)
  return res.json()
}

export async function dismissCreditCardInconsistency(
  type: 'duplicate' | 'cross_card' | 'missing_description',
  transactionIds: number[],
  reason?: string
): Promise<{ success: boolean; created: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/api/credit-card-inconsistencies/dismiss/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, transaction_ids: transactionIds, reason }),
  })
  return res.json()
}

export async function restoreCreditCardInconsistency(
  type: 'duplicate' | 'cross_card' | 'missing_description',
  transactionIds: number[]
): Promise<{ success: boolean; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/credit-card-inconsistencies/restore/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, transaction_ids: transactionIds }),
  })
  return res.json()
}
