const API_BASE = "http://localhost:8000"

export interface Summary {
  total_credits: number
  total_debits: number
  net_flow: number
  current_balance: number
  transaction_count: number
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

export interface Transaction {
  id: number
  date: string
  narration: string
  debit: number
  credit: number
  balance: number
  category: string
  reference: string
}

export interface TopExpense {
  id: number
  date: string
  narration: string
  amount: number
  category: string
}

export interface BankAccount {
  id: number
  nickname: string
  bank_name: string
  account_number: string
  ifsc_code: string
  branch: string
  source_file: string
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
  source_file: string
}

export interface SourceFile {
  filename: string
  status: 'parsed' | 'pending'
  first_transaction_date?: string | null
  last_transaction_date?: string | null
  transaction_count?: number
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
  limit?: number
  offset?: number
}): Promise<{ data: Transaction[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.category) searchParams.set("category", params.category)
  if (params?.type) searchParams.set("type", params.type)
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
