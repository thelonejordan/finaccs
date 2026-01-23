const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000"

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

export interface CCPaymentMatchInfo {
  id: number
  credit_card_transaction: {
    id: number
    date: string
    description: string
    amount: number
    credit_card: {
      id: number
      nickname: string
    } | null
  }
  offset: number
  confidence_score: number
  match_reasons: string[]
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
  cc_payment_match: CCPaymentMatchInfo | null
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

export interface BankExtractionArtifact {
  artifact_id: string
  artifact_type: string
  artifact_key?: string  // Optional key for disambiguation (e.g., card number)
  content_type: string
  row_count: number
  data_hash: string
}

export interface ExtractedCSV {
  id: number
  name: string
  source_filename: string
  source_file_id: number
  status: 'extracted' | 'transformed' | 'loading' | 'loaded' | 'error'
  bank_account_id: number | null
  disabled: boolean
  hidden: boolean
  row_count: number
  extracted_at: string
  loaded_at: string | null
  first_transaction_date: string | null
  last_transaction_date: string | null
  transaction_count: number
  error_message: string
  artifacts: BankExtractionArtifact[]
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

export interface AccountStats {
  current_balance: number | null
  last_transaction_date: string | null
  starting_balance: number | null
  first_transaction_date: string | null
  transaction_count: number
}

export interface UpdateExtractedCSVResponse extends ExtractedCSV {
  affected_accounts: Record<number, AccountStats>
}

export async function updateExtractedCSV(
  csvId: number,
  data: { bank_account_id?: number | null; disabled?: boolean }
): Promise<UpdateExtractedCSVResponse> {
  const res = await fetch(`${API_BASE}/api/extracted-csvs/${csvId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export interface LoadExtractedCSVResult {
  id: number
  source_filename: string
  status: string
  success: boolean
  message: string
}

export async function loadExtractedCSVs(
  csvIds: number[]
): Promise<{ results: LoadExtractedCSVResult[] }> {
  const res = await fetch(`${API_BASE}/api/extracted-csvs/load/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_ids: csvIds }),
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

export async function fetchCategories(params?: {
  include_all?: boolean
}): Promise<{ data: CategoryData[] }> {
  const searchParams = new URLSearchParams()
  if (params?.include_all) searchParams.set("include_all", "true")
  const query = searchParams.toString()
  const res = await fetch(`${API_BASE}/api/categories/${query ? `?${query}` : ''}`)
  return res.json()
}

export async function fetchTransactions(params?: {
  category?: string
  type?: string
  bank_account?: number
  data_source_artifact?: number
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
  if (params?.data_source_artifact) searchParams.set("data_source_artifact", params.data_source_artifact.toString())
  if (params?.year) searchParams.set("year", params.year.toString())
  if (params?.month) searchParams.set("month", params.month.toString())
  if (params?.search) searchParams.set("search", params.search)
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/transactions/?${searchParams}`)
  return res.json()
}

export async function fetchTopExpenses(params?: {
  limit?: number
}): Promise<{ data: TopExpense[] }> {
  const searchParams = new URLSearchParams()
  searchParams.set("limit", (params?.limit ?? 10).toString())
  const res = await fetch(`${API_BASE}/api/top-expenses/?${searchParams}`)
  return res.json()
}

export async function fetchBankAccounts(): Promise<{
  accounts: BankAccount[]
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

// ==================== Bank Inconsistencies API ====================

export interface BankInconsistencyTransaction {
  id: number
  source_file: string | null
  extracted_csv: string | null
  bank_account?: {
    id: number
    nickname: string
  }
}

export interface BankInconsistency {
  type: 'duplicate' | 'cross_account' | 'balance_gap'
  transaction_ids: number[]
  dismissed: boolean
  date: string
  narration: string
  debit: number
  credit: number
  balance?: number
  count?: number
  bank_account?: {
    id: number
    nickname: string
  }
  transactions?: BankInconsistencyTransaction[]
  accounts?: Array<{
    id: number
    nickname: string
  }>
  // Balance gap specific
  transaction_id?: number
  actual_balance?: number
  expected_balance?: number
  gap?: number
  reference?: string
  source_file?: {
    id: number
    filename: string
  } | null
  previous_transaction?: PreviousTransaction
}

export async function fetchBankInconsistencies(params?: {
  bank_account?: number
  type?: 'duplicate' | 'cross_account' | 'balance_gap'
  show_dismissed?: boolean
  limit?: number
  offset?: number
}): Promise<{
  data: BankInconsistency[]
  total: number
  counts: {
    duplicate: number
    cross_account: number
    balance_gap: number
  }
}> {
  const searchParams = new URLSearchParams()
  if (params?.bank_account) searchParams.set("bank_account", params.bank_account.toString())
  if (params?.type) searchParams.set("type", params.type)
  if (params?.show_dismissed) searchParams.set("show_dismissed", "true")
  if (params?.limit) searchParams.set("limit", params.limit.toString())
  if (params?.offset) searchParams.set("offset", params.offset.toString())

  const res = await fetch(`${API_BASE}/api/bank-inconsistencies/?${searchParams}`)
  return res.json()
}

export async function dismissBankInconsistency(
  type: 'duplicate' | 'cross_account' | 'balance_gap',
  transactionIds: number[],
  reason?: string
): Promise<{ success: boolean; created: boolean; id: number }> {
  const res = await fetch(`${API_BASE}/api/bank-inconsistencies/dismiss/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, transaction_ids: transactionIds, reason }),
  })
  return res.json()
}

export async function restoreBankInconsistency(
  type: 'duplicate' | 'cross_account' | 'balance_gap',
  transactionIds: number[]
): Promise<{ success: boolean; deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/bank-inconsistencies/restore/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, transaction_ids: transactionIds }),
  })
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
  extraction_name?: string | null
}

export interface BankPaymentMatchInfo {
  id: number
  bank_transaction: {
    id: number
    date: string
    narration: string
    amount: number
    bank_account: {
      id: number
      nickname: string
    } | null
  }
  offset: number
  confidence_score: number
  match_reasons: string[]
}

export interface CreditCardTransaction {
  id: number
  date: string
  description: string
  amount: number
  intl_amount: number
  intl_currency: string
  exchange_rate: number | null
  category: string
  credit_card: {
    id: number
    nickname: string
  } | null
  source_file: {
    id: number
    filename: string
  } | null
  bank_payment_match: BankPaymentMatchInfo | null
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
  data_source_artifact?: number
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
  if (params?.data_source_artifact) searchParams.set("data_source_artifact", params.data_source_artifact.toString())
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

// ==================== CC Payment Matching API ====================

export interface CCPaymentBankTransaction {
  id: number
  date: string
  narration: string
  amount: number
  is_debit: boolean
  bank_account: {
    id: number
    nickname: string
  } | null
}

export interface CCPaymentCCTransaction {
  id: number
  date: string
  description: string
  amount: number
  credit_card: {
    id: number
    nickname: string
  } | null
}

export interface CCPaymentSuggestion {
  credit_card_transaction: CCPaymentCCTransaction
  offset: number
  confidence_score: number
  match_reasons: string[]
}

export interface CCPaymentSuggestionItem {
  bank_transaction: CCPaymentBankTransaction
  suggestions: CCPaymentSuggestion[]
}

// Reverse suggestion: CC transaction with bank suggestions
export interface CCPaymentBankSuggestion {
  bank_transaction: CCPaymentBankTransaction
  offset: number
  confidence_score: number
  match_reasons: string[]
}

export interface CCPaymentSuggestionReverseItem {
  credit_card_transaction: CCPaymentCCTransaction
  suggestions: CCPaymentBankSuggestion[]
}

export interface CCPaymentMatch {
  id: number
  bank_transaction: CCPaymentBankTransaction
  credit_card_transaction: CCPaymentCCTransaction
  offset: number
  confidence_score: number
  match_reasons: string[]
  created_at: string
}

export async function fetchCCPaymentSuggestions(params?: {
  bank_account?: number
  year?: number
  offset_threshold?: number
}): Promise<{ data: CCPaymentSuggestionItem[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.bank_account) searchParams.set("bank_account", params.bank_account.toString())
  if (params?.year) searchParams.set("year", params.year.toString())
  if (params?.offset_threshold !== undefined) searchParams.set("offset_threshold", params.offset_threshold.toString())

  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/cc-payment-suggestions/?${queryString}`
    : `${API_BASE}/api/cc-payment-suggestions/`
  const res = await fetch(url)
  return res.json()
}

export async function fetchCCPaymentSuggestionsReverse(params?: {
  credit_card?: number
  year?: number
  offset_threshold?: number
}): Promise<{ data: CCPaymentSuggestionReverseItem[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.credit_card) searchParams.set("credit_card", params.credit_card.toString())
  if (params?.year) searchParams.set("year", params.year.toString())
  if (params?.offset_threshold !== undefined) searchParams.set("offset_threshold", params.offset_threshold.toString())

  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/cc-payment-suggestions/reverse/?${queryString}`
    : `${API_BASE}/api/cc-payment-suggestions/reverse/`
  const res = await fetch(url)
  return res.json()
}

export async function fetchCCPaymentMatches(params?: {
  year?: number
}): Promise<{ data: CCPaymentMatch[]; total: number }> {
  const searchParams = new URLSearchParams()
  if (params?.year) searchParams.set("year", params.year.toString())

  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/cc-payment-matches/?${queryString}`
    : `${API_BASE}/api/cc-payment-matches/`
  const res = await fetch(url)
  return res.json()
}

export async function createCCPaymentMatch(data: {
  bank_transaction_id: number
  credit_card_transaction_id: number
  offset: number
  confidence_score: number
  match_reasons: string[]
}): Promise<{
  id: number
  bank_transaction_id: number
  credit_card_transaction_id: number
  offset: number
  confidence_score: number
  match_reasons: string[]
  created_at: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-payment-matches/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteCCPaymentMatch(matchId: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/cc-payment-matches/${matchId}/`, {
    method: "DELETE",
  })
  return res.json()
}

export async function fetchCCPaymentMatchYears(): Promise<{ years: Record<string, number> }> {
  const res = await fetch(`${API_BASE}/api/cc-payment-matches/years/`)
  return res.json()
}

// ==================== PDF Extractions API ====================

export interface PDFSourceFile {
  id: number
  filename: string
  credit_card: {
    id: number
    nickname: string
  } | null
  disabled: boolean
  has_data: boolean
  file_size: number
  has_password: boolean
  pdf_password: string
  extractions_count: number
  last_extracted: string | null
  last_extraction_id: number | null
}

export interface ExtractionArtifact {
  artifact_id: string
  artifact_type: string  // Now flexible: 'transactions', 'transactions_ingestable', 'emi', 'metadata', etc.
  content_type: 'csv' | 'json'
  row_count: number
  is_transformable: boolean
  is_transformed: boolean
  transformer_name: string | null
  source_artifact_id: string | null
}

export interface CreditCardPDFExtraction {
  id: number
  name: string
  source_file: { id: number; filename: string }
  credit_card: { id: number; nickname: string } | null
  artifacts: ExtractionArtifact[]
  statement_date: string | null
  statement_period_begin: string | null
  statement_period_end: string | null
  payment_due_date: string | null
  card_number_mask: string
  invoice_number: string
  total_amount_due: number | null
  minimum_amount_due: number | null
  status: 'extracted' | 'transformed' | 'loading' | 'loaded' | 'error' | 'superseded'
  extracted_at: string
  loaded_at: string | null
  error_message: string
  extractor_version: string
  hidden: boolean
  // Transformation status summary
  transformable_count: number
  transformed_count: number
  all_transformed: boolean
}

export interface TransactionPreviewRow {
  date: string
  ser_no: string
  description: string
  amount: string
  intl_amount: string
}

export interface IngestableTransactionRow {
  date: string
  value_date: string
  narration: string
  debit_amount: string
  credit_amount: string
  reference_number: string
  closing_balance: string
  intl_amount: string
  intl_currency: string
  exchange_rate: string
}

export interface EMIPreviewRow {
  loan_type: string
  creation_date: string
  finish_date: string
  num_installments: string
  emi_amount: string
  pending_installments: string
  outstanding_amount: string
  monthly_installment: string
}

export interface StatementMetadata {
  metadata: {
    card_no?: string
    invoice_no?: string
    cin_no?: string
  }
  timeline: {
    statement_date?: string
    statement_period_begin?: string
    statement_period_end?: string
    payment_due_date?: string
  }
  statement_summary: {
    previous_balance?: number
    purchases?: number
    cash_advances?: number
    payments_credits?: number
    total_amount_due?: number
    minimum_amount_due?: number
  }
  credit_summary: {
    credit_limit?: number
    available_credit?: number
    cash_limit?: number
    available_cash?: number
  }
}

export async function fetchPDFSourceFiles(): Promise<{ data: PDFSourceFile[] }> {
  const res = await fetch(`${API_BASE}/api/cc-source-files/`)
  return res.json()
}

export async function fetchPDFExtractions(includeHidden = false): Promise<{ data: CreditCardPDFExtraction[] }> {
  const params = includeHidden ? '?include_hidden=true' : ''
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/${params}`)
  return res.json()
}

export async function fetchPDFExtractionDetail(extractionId: number): Promise<CreditCardPDFExtraction> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/${extractionId}/`)
  return res.json()
}

export async function fetchPDFExtractionPreview(
  extractionId: number,
  type: 'transactions' | 'emi' | 'metadata',
  limit?: number
): Promise<{ data: TransactionPreviewRow[] | EMIPreviewRow[] | StatementMetadata; total?: number }> {
  const params = new URLSearchParams({ type })
  if (limit) params.set('limit', limit.toString())
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/${extractionId}/preview/?${params}`)
  return res.json()
}

/** @deprecated Use getArtifactUrl instead */
export function getPDFExtractionArtifactUrl(
  extractionId: number,
  type: 'transactions' | 'emi' | 'metadata'
): string {
  return `${API_BASE}/api/cc-pdf-extractions/${extractionId}/artifact/?type=${type}`
}

// New artifact endpoints by artifact_id
export function getArtifactUrl(artifactId: string): string {
  return `${API_BASE}/api/artifacts/${artifactId}/`
}

export function getArtifactPreviewUrl(artifactId: string, limit?: number): string {
  const params = limit ? `?limit=${limit}` : ''
  return `${API_BASE}/api/artifacts/${artifactId}/preview/${params}`
}

export async function fetchArtifactPreview(
  artifactId: string,
  limit?: number
): Promise<{ data: TransactionPreviewRow[] | IngestableTransactionRow[] | EMIPreviewRow[] | StatementMetadata; total?: number }> {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit.toString())
  const queryString = params.toString()
  const url = queryString
    ? `${API_BASE}/api/artifacts/${artifactId}/preview/?${queryString}`
    : `${API_BASE}/api/artifacts/${artifactId}/preview/`
  const res = await fetch(url)
  return res.json()
}

export async function triggerPDFExtraction(
  sourceFileId: number,
  password?: string
): Promise<{
  success: boolean
  extraction?: {
    id: number
    name: string
    transactions_row_count: number
    emi_row_count: number
    statement_date: string | null
  }
  password_saved?: boolean
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-source-files/${sourceFileId}/extract/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.json()
}

export interface LoadExtractionResult {
  id: number
  success: boolean
  message: string
  transaction_count?: number
}

export async function loadPDFExtractions(
  extractionIds: number[]
): Promise<{ results: LoadExtractionResult[] }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/load/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_ids: extractionIds }),
  })
  return res.json()
}

export interface UnloadExtractionResult {
  id: number
  success: boolean
  message: string
  deleted_count?: number
}

export async function unloadPDFExtractions(
  extractionIds: number[]
): Promise<{ results: UnloadExtractionResult[] }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/unload/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_ids: extractionIds }),
  })
  return res.json()
}

// Artifact-level load/unload (for independent loading of multi-card artifacts)
export interface LoadArtifactResult {
  artifact_id: string
  success: boolean
  message: string
  transaction_count?: number
}

export async function loadArtifacts(
  artifactIds: string[]
): Promise<{ results: LoadArtifactResult[] }> {
  const res = await fetch(`${API_BASE}/api/artifacts/load/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_ids: artifactIds }),
  })
  return res.json()
}

export interface UnloadArtifactResult {
  artifact_id: string
  success: boolean
  message: string
  deleted_count?: number
}

export async function unloadArtifacts(
  artifactIds: string[]
): Promise<{ results: UnloadArtifactResult[] }> {
  const res = await fetch(`${API_BASE}/api/artifacts/unload/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_ids: artifactIds }),
  })
  return res.json()
}

export async function deleteArtifact(
  artifactId: string
): Promise<{ success: boolean; artifact_id: string; transactions_deleted: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/artifacts/delete/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_id: artifactId }),
  })
  return res.json()
}

export interface TransformExtractionResult {
  id: number
  success: boolean
  message: string
  row_count?: number
  artifact_type?: string
}

export async function transformPDFExtractions(
  extractionIds: number[],
  force = false
): Promise<{ results: TransformExtractionResult[] }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/transform/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_ids: extractionIds, force }),
  })
  return res.json()
}

export async function toggleExtractionHidden(
  extractionId: number,
  hidden: boolean
): Promise<{ success: boolean; id: number; hidden: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/toggle-hidden/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId, hidden }),
  })
  return res.json()
}

export async function updateArtifactCreditCard(
  artifactId: string,
  creditCardId: number | null
): Promise<{ success: boolean; artifact_id: string; credit_card: { id: number; nickname: string } | null; error?: string }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/update-card/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_id: artifactId, credit_card_id: creditCardId }),
  })
  return res.json()
}

// Legacy: update extraction's credit card (for single-card extractions)
export async function updateExtractionCreditCard(
  extractionId: number,
  creditCardId: number | null
): Promise<{ success: boolean; id: number; credit_card: { id: number; nickname: string } | null; error?: string }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/update-card/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId, credit_card_id: creditCardId }),
  })
  return res.json()
}

export async function updatePDFSourceFilePassword(
  sourceFileId: number,
  password: string
): Promise<{ success: boolean; id: number; has_password: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/cc-source-files/${sourceFileId}/password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.json()
}

// PDF Extraction Data Sources
export interface PDFExtractionDataSource {
  id: number
  artifact_id: string
  name: string
  source_file: string
  credit_card: { id: number; nickname: string } | null
  status: 'transformed' | 'loading' | 'loaded' | 'error'  // Only transformed+ shown in data sources
  row_count: number
  artifact_type: string  // e.g., 'transactions_ingestable'
  statement_date: string | null
  statement_period_begin: string | null
  statement_period_end: string | null
  extracted_at: string
  loaded_at: string | null
  loaded: boolean  // Whether this artifact has been loaded (has transactions)
  loaded_transaction_count: number  // Number of transactions loaded from this artifact
}

export async function fetchPDFExtractionDataSources(): Promise<{ data: PDFExtractionDataSource[] }> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-data-sources/`)
  return res.json()
}

export async function deletePDFExtraction(extractionId: number): Promise<{
  success: boolean
  id: number
  transactions_affected: number
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/delete/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId }),
  })
  return res.json()
}

export async function deleteAllPDFExtractions(): Promise<{
  success: boolean
  deleted_count: number
  transactions_affected: number
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-pdf-extractions/delete-all/`, {
    method: 'POST',
  })
  return res.json()
}

export async function deletePDFSourceFile(sourceFileId: number): Promise<{
  success: boolean
  id: number
  extractions_deleted: number
  transactions_affected: number
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-source-files/${sourceFileId}/`, {
    method: 'DELETE',
  })
  return res.json()
}

// CSV Source Files
export interface CSVSourceFile {
  id: number
  filename: string
  credit_card: { id: number; nickname: string } | null
  disabled: boolean
  has_data: boolean
  file_size: number
  extractions_count: number
  last_extracted: string | null
  last_extraction_id: number | null
  last_extraction_status: string | null
}

export async function fetchCSVSourceFiles(): Promise<{ data: CSVSourceFile[] }> {
  const res = await fetch(`${API_BASE}/api/cc-csv-source-files/`)
  return res.json()
}

export async function triggerCSVExtraction(
  sourceFileId: number
): Promise<{
  success: boolean
  extraction?: {
    id: number
    name: string
    row_count: number
    status: string
    statement_period_begin: string | null
    statement_period_end: string | null
  }
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/cc-csv-source-files/${sourceFileId}/extract/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.json()
}

// ==================== Bank Extractions API ====================

export interface BankSourceFile {
  id: number
  filename: string
  pipeline: {
    id: number
    name: string
    extractor: string
  } | null
  bank_account: {
    id: number
    nickname: string
  } | null
  extractions_count: number
  last_extracted: string | null
  has_password: boolean
  pipeline_password: string
  file_size: number
  has_data: boolean
  extractor: string | null
  disabled: boolean
}

export async function fetchBankSourceFiles(): Promise<{ data: BankSourceFile[] }> {
  const res = await fetch(`${API_BASE}/api/bank-source-files/`)
  return res.json()
}

export async function triggerBankExtraction(
  sourceFileId: number,
  password?: string
): Promise<{
  success: boolean
  extraction?: {
    id: number
    name: string
    row_count: number
    status: string
    extracted_at: string
  }
  error?: string
  needs_password?: boolean
}> {
  const res = await fetch(`${API_BASE}/api/bank-source-files/${sourceFileId}/extract/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.json()
}

export function getBankExtractedCSVUrl(csvId: number): string {
  return `${API_BASE}/api/bank-extracted-csvs/${csvId}/content/`
}

export async function fetchBankExtractedCSVPreview(
  csvId: number,
  limit?: number
): Promise<{
  data: Record<string, string>[]
  total: number
  columns: string[]
}> {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit.toString())
  const queryString = params.toString()
  const url = queryString
    ? `${API_BASE}/api/bank-extracted-csvs/${csvId}/preview/?${queryString}`
    : `${API_BASE}/api/bank-extracted-csvs/${csvId}/preview/`
  const res = await fetch(url)
  return res.json()
}

export async function toggleBankExtractionHidden(
  extractionId: number,
  hidden: boolean
): Promise<{ success: boolean; id: number; hidden: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/bank-extractions/toggle-hidden/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId, hidden }),
  })
  return res.json()
}

export async function deleteBankExtraction(
  extractionId: number
): Promise<{ success: boolean; id: number; transactions_affected: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/bank-extractions/delete/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction_id: extractionId }),
  })
  return res.json()
}

export async function syncBankSourceFiles(): Promise<{ synced: number; skipped: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/bank-source-files/sync/`, {
    method: 'POST',
  })
  return res.json()
}

export async function syncCCSourceFiles(): Promise<{ synced: number; skipped: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/cc-source-files/sync/`, {
    method: 'POST',
  })
  return res.json()
}

// ==================== Unified Extraction System API ====================

// Source Files (New)
export interface SourceFile {
  id: number
  source_file_id: string
  filename: string
  file_path: string
  file_hash: string
  file_size: number
  mime_type: string
  domain: 'bank_account' | 'credit_card'
  password: string
  extractor: string
  extraction_status: 'not_extracted' | 'extracted'
  hidden: boolean
  created_at: string
  updated_at: string
  auto_detected_extractor: string | null
  extractions?: Extraction[]
}

// Extractions (New)
export interface ExtractionArtifact {
  id: number
  artifact_id: string
  artifact_type: string
  artifact_key: string
  content_format: 'csv' | 'json' | 'txt'
  content_hash: string
  row_count: number
  data_source_target: string
  transformer: string
  transformation_status: 'not_applicable' | 'not_transformed' | 'transformed'
  created_at: string
  data_source_artifacts_count: number
}

export interface Extraction {
  id: number
  extraction_id: string
  source_file_id: string  // UUID from SourceFile
  source_filename: string
  extractor_name: string
  extractor_version: string
  status: 'pending' | 'completed' | 'error'
  error_message: string
  hidden: boolean
  extracted_at: string
  artifacts?: ExtractionArtifact[]
}

// Data Source Artifacts (New)
export interface DataSourceArtifact {
  id: number
  artifact_id: string
  source_artifact_id: string
  source_artifact_type: string
  source_artifact_key: string
  source_extraction_id: string
  source_filename: string
  data_source_target: 'bank_account_transactions' | 'credit_card_transactions'
  content_hash: string
  row_count: number
  bank_account_id: number | null
  bank_account_name: string | null
  credit_card_id: number | null
  credit_card_name: string | null
  transformer: string
  status: 'unloaded' | 'loading' | 'loaded' | 'error'
  error_message: string
  enabled: boolean
  hidden: boolean
  transformed_at: string
  loaded_at: string | null
}

// Extractors
export interface ExtractorInfo {
  name: string
  version: string
  domain: 'bank_account' | 'credit_card'
  supported_extensions: string[]
}

// API Functions for Unified Extraction System

export async function fetchSourceFiles(params?: {
  visibility?: 'visible' | 'hidden' | 'all'
  domain?: 'bank_account' | 'credit_card' | 'all'
}): Promise<{ data: SourceFile[] }> {
  const searchParams = new URLSearchParams()
  if (params?.visibility) searchParams.set('visibility', params.visibility)
  if (params?.domain) searchParams.set('domain', params.domain)
  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/extractions/source-files/?${queryString}`
    : `${API_BASE}/api/extractions/source-files/`
  const res = await fetch(url)
  return res.json()
}

export async function refreshSourceFiles(): Promise<{
  created: number
  skipped: number
  errors: { file: string; error: string }[]
}> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/refresh/`, {
    method: 'POST',
  })
  return res.json()
}

export async function bulkUpdateSourceFiles(
  ids: number[],
  action: 'hide' | 'unhide' | 'set_extractor' | 'set_password' | 'set_domain',
  value?: string
): Promise<{ success: boolean; updated_count: number }> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/bulk-update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action, value }),
  })
  return res.json()
}

export async function getSourceFile(sourceFileId: string): Promise<SourceFile> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/${sourceFileId}/`)
  return res.json()
}

export async function updateSourceFile(
  sourceFileId: string,
  data: Partial<{ password: string; extractor: string; domain: string; hidden: boolean }>
): Promise<SourceFile> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/${sourceFileId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function extractSourceFile(
  sourceFileId: string,
  options?: { password?: string; extractor?: string }
): Promise<{
  success: boolean
  extraction?: Extraction
  error?: string
  needs_password?: boolean
}> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/${sourceFileId}/extract/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  return res.json()
}

export async function validatePassword(
  sourceFileId: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/extractions/source-files/${sourceFileId}/validate-password/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.json()
}

export async function fetchExtractions(params?: {
  visibility?: 'visible' | 'hidden' | 'all'
  domain?: 'bank_account' | 'credit_card' | 'all'
  status?: 'pending' | 'completed' | 'error' | 'all'
}): Promise<{ data: Extraction[] }> {
  const searchParams = new URLSearchParams()
  if (params?.visibility) searchParams.set('visibility', params.visibility)
  if (params?.domain) searchParams.set('domain', params.domain)
  if (params?.status) searchParams.set('status', params.status)
  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/extractions/?${queryString}`
    : `${API_BASE}/api/extractions/`
  const res = await fetch(url)
  return res.json()
}

export async function bulkUpdateExtractions(
  ids: number[],
  action: 'hide' | 'unhide' | 'delete'
): Promise<{ success: boolean; updated_count?: number; deleted_count?: number }> {
  const res = await fetch(`${API_BASE}/api/extractions/bulk-update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action }),
  })
  return res.json()
}

export async function getExtraction(extractionId: string): Promise<Extraction> {
  const res = await fetch(`${API_BASE}/api/extractions/${extractionId}/`)
  return res.json()
}

export async function updateExtraction(
  extractionId: string,
  data: { hidden?: boolean }
): Promise<Extraction> {
  const res = await fetch(`${API_BASE}/api/extractions/${extractionId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteExtraction(extractionId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/extractions/${extractionId}/`, {
    method: 'DELETE',
  })
  return res.json()
}

export async function getArtifact(artifactId: string): Promise<ExtractionArtifact> {
  const res = await fetch(`${API_BASE}/api/extractions/artifacts/${artifactId}/`)
  return res.json()
}

export async function previewArtifact(
  artifactId: string,
  limit?: number
): Promise<{
  data: Record<string, unknown>[] | Record<string, unknown> | string
  total?: number
  columns?: string[]
  format: 'csv' | 'json' | 'text'
}> {
  const params = new URLSearchParams()
  if (limit) params.set('limit', limit.toString())
  const queryString = params.toString()
  const url = queryString
    ? `${API_BASE}/api/extractions/artifacts/${artifactId}/preview/?${queryString}`
    : `${API_BASE}/api/extractions/artifacts/${artifactId}/preview/`
  const res = await fetch(url)
  return res.json()
}

export async function transformArtifact(
  artifactId: string,
  options?: { bank_account_id?: number; credit_card_id?: number }
): Promise<{
  success: boolean
  data_source_artifact?: DataSourceArtifact
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/extractions/artifacts/${artifactId}/transform/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  })
  return res.json()
}

export async function bulkTransformArtifacts(
  artifactIds: string[],
  options?: { bank_account_id?: number; credit_card_id?: number }
): Promise<{
  results: {
    artifact_id: string
    success: boolean
    data_source_artifact_id?: string
    error?: string
  }[]
}> {
  const res = await fetch(`${API_BASE}/api/extractions/artifacts/bulk-transform/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact_ids: artifactIds, ...options }),
  })
  return res.json()
}

export async function fetchDataSources(params?: {
  visibility?: 'visible' | 'hidden' | 'all'
  domain?: 'bank_account_transactions' | 'credit_card_transactions' | 'all'
  status?: 'unloaded' | 'loading' | 'loaded' | 'error' | 'all'
}): Promise<{ data: DataSourceArtifact[] }> {
  const searchParams = new URLSearchParams()
  if (params?.visibility) searchParams.set('visibility', params.visibility)
  if (params?.domain) searchParams.set('domain', params.domain)
  if (params?.status) searchParams.set('status', params.status)
  const queryString = searchParams.toString()
  const url = queryString
    ? `${API_BASE}/api/extractions/data-sources/?${queryString}`
    : `${API_BASE}/api/extractions/data-sources/`
  const res = await fetch(url)
  return res.json()
}

export async function bulkUpdateDataSources(
  ids: number[],
  action: 'hide' | 'unhide' | 'enable' | 'disable' | 'set_bank_account' | 'set_credit_card' | 'load' | 'unload' | 'delete',
  value?: number
): Promise<{
  success?: boolean
  updated_count?: number
  results?: {
    id: number
    artifact_id?: string
    success: boolean
    count?: number
    error?: string
  }[]
}> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/bulk-update/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, action, value }),
  })
  return res.json()
}

export async function getDataSource(artifactId: string): Promise<DataSourceArtifact> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/`)
  return res.json()
}

export async function updateDataSource(
  artifactId: string,
  data: Partial<{
    enabled: boolean
    hidden: boolean
    bank_account_id: number | null
    credit_card_id: number | null
  }>
): Promise<DataSourceArtifact> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteDataSource(artifactId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/`, {
    method: 'DELETE',
  })
  return res.json()
}

export async function loadDataSource(artifactId: string): Promise<{
  success: boolean
  count?: number
  data_source_artifact?: DataSourceArtifact
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/load/`, {
    method: 'POST',
  })
  return res.json()
}

export async function unloadDataSource(artifactId: string): Promise<{
  success: boolean
  count?: number
  data_source_artifact?: DataSourceArtifact
  error?: string
}> {
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/unload/`, {
    method: 'POST',
  })
  return res.json()
}

export async function previewDataSource(
  artifactId: string,
  limit?: number
): Promise<{
  data: Record<string, unknown>[]
  total: number
  columns: string[]
  format: 'csv'
}> {
  const params = limit ? `?limit=${limit}` : ''
  const res = await fetch(`${API_BASE}/api/extractions/data-sources/${artifactId}/preview/${params}`)
  return res.json()
}

export async function fetchExtractors(): Promise<{ data: ExtractorInfo[] }> {
  const res = await fetch(`${API_BASE}/api/extractions/extractors/`)
  return res.json()
}
