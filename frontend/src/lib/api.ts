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
}): Promise<{
  data: CreditCardTransaction[];
  total: number;
  stats: CreditCardTransactionStats;
  available_data_sources: Array<{ id: number; source_filename: string; credit_card_id: number | null }>;
}> {
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

export interface CreditCardDateRangeFilters {
  credit_card?: number
  category?: string
  type?: string
  search?: string
}

export async function fetchCreditCardDateRange(filters?: CreditCardDateRangeFilters): Promise<DateRange> {
  const searchParams = new URLSearchParams()
  if (filters?.credit_card) searchParams.set('credit_card', filters.credit_card.toString())
  if (filters?.category) searchParams.set('category', filters.category)
  if (filters?.type) searchParams.set('type', filters.type)
  if (filters?.search) searchParams.set('search', filters.search)

  const queryString = searchParams.toString()
  const url = queryString ? `${API_BASE}/api/credit-card-date-range/?${queryString}` : `${API_BASE}/api/credit-card-date-range/`
  const res = await fetch(url)
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

export async function fetchSuggestionsForBankTransaction(bankTxnId: number): Promise<{
  suggestions: CCPaymentSuggestion[]
}> {
  const res = await fetch(`${API_BASE}/api/cc-payment-suggestions/for-bank-transaction/${bankTxnId}/`)
  return res.json()
}

export async function fetchSuggestionsForCCTransaction(ccTxnId: number): Promise<{
  suggestions: CCPaymentBankSuggestion[]
}> {
  const res = await fetch(`${API_BASE}/api/cc-payment-suggestions/for-cc-transaction/${ccTxnId}/`)
  return res.json()
}

// Artifact URL helper (used by ExtractionsPage)
export function getArtifactUrl(artifactId: string): string {
  return `${API_BASE}/api/artifacts/${artifactId}/`
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

// ==================== Stories API ====================

export interface Story {
  id: number
  story_id: string
  name: string
  description: string
  icon: string
  transaction_count: number
  total_spent: number
  min_date: string | null
  max_date: string | null
  created_at: string
  updated_at: string
}

export interface StoryTransaction {
  id: number
  type: 'bank' | 'credit_card'
  date: string
  description: string
  amount: number
  category: string
  source: string
}

export interface StoryDetail extends Story {
  transactions: StoryTransaction[]
}

export interface TransactionRef {
  type: 'bank' | 'credit_card'
  id: number
}

export interface StoryBadge {
  story_id: string
  name: string
  icon: string
}

export async function fetchStories(): Promise<{ stories: Story[] }> {
  const res = await fetch(`${API_BASE}/api/stories/`)
  if (!res.ok) {
    throw new Error('Failed to fetch stories')
  }
  return res.json()
}

export async function fetchStory(storyId: string): Promise<StoryDetail> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/`)
  if (!res.ok) {
    throw new Error('Failed to fetch story')
  }
  return res.json()
}

export async function createStory(data: {
  name: string
  description?: string
  icon?: string
}): Promise<Story> {
  const res = await fetch(`${API_BASE}/api/stories/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create story')
  }
  return res.json()
}

export async function updateStory(
  storyId: string,
  data: Partial<{ name: string; description: string; icon: string }>
): Promise<Story> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update story')
  }
  return res.json()
}

export async function deleteStory(storyId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete story')
  }
  return res.json()
}

export async function addTransactionsToStory(
  storyId: string,
  transactions: TransactionRef[]
): Promise<{ success: boolean; added: number }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/transactions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to add transactions to story')
  }
  return res.json()
}

export async function removeTransactionsFromStory(
  storyId: string,
  transactions: TransactionRef[]
): Promise<{ success: boolean; removed: number }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/transactions/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove transactions from story')
  }
  return res.json()
}

export async function getTransactionStories(
  transactions: TransactionRef[]
): Promise<{ transaction_stories: Record<string, StoryBadge[]> }> {
  const res = await fetch(`${API_BASE}/api/stories/transaction-stories/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    throw new Error('Failed to get transaction stories')
  }
  return res.json()
}

export interface StoryComparisonSummary {
  story_id: string
  name: string
  icon: string
  transaction_count: number
  total_spent: number
}

export interface StoryComparisonResult {
  stories: StoryComparisonSummary[]
  common_transactions: StoryTransaction[]
  unique_transactions: Record<string, StoryTransaction[]>
  overlap_stats: {
    common_count: number
    total_unique: number
  }
}

export async function compareStories(storyIds: string[]): Promise<StoryComparisonResult> {
  const res = await fetch(`${API_BASE}/api/stories/compare/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story_ids: storyIds }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to compare stories')
  }
  return res.json()
}

// ==================== Entities API ====================

export type EntityType = 'person' | 'business'

export interface Entity {
  id: number
  entity_id: string
  name: string
  description: string
  icon: string
  entity_type: EntityType
  transaction_count: number
  total_spent: number
  min_date: string | null
  max_date: string | null
  created_at: string
  updated_at: string
}

export interface EntityTransaction {
  id: number
  type: 'bank' | 'credit_card'
  date: string
  description: string
  amount: number
  category: string
  source: string
}

export interface EntityDetail extends Entity {
  transactions: EntityTransaction[]
}

export interface EntityBadge {
  entity_id: string
  name: string
  icon: string
  entity_type: EntityType
}

export async function fetchEntities(): Promise<{ entities: Entity[] }> {
  const res = await fetch(`${API_BASE}/api/entities/`)
  if (!res.ok) {
    throw new Error('Failed to fetch entities')
  }
  return res.json()
}

export async function fetchEntity(entityId: string): Promise<EntityDetail> {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/`)
  if (!res.ok) {
    throw new Error('Failed to fetch entity')
  }
  return res.json()
}

export async function createEntity(data: {
  name: string
  description?: string
  icon?: string
  entity_type?: EntityType
}): Promise<Entity> {
  const res = await fetch(`${API_BASE}/api/entities/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create entity')
  }
  return res.json()
}

export async function updateEntity(
  entityId: string,
  data: Partial<{ name: string; description: string; icon: string; entity_type: EntityType }>
): Promise<Entity> {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to update entity')
  }
  return res.json()
}

export async function deleteEntity(entityId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error('Failed to delete entity')
  }
  return res.json()
}

export async function addTransactionsToEntity(
  entityId: string,
  transactions: TransactionRef[]
): Promise<{ success: boolean; added: number }> {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/transactions/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to add transactions to entity')
  }
  return res.json()
}

export async function removeTransactionsFromEntity(
  entityId: string,
  transactions: TransactionRef[]
): Promise<{ success: boolean; removed: number }> {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}/transactions/`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to remove transactions from entity')
  }
  return res.json()
}

export async function getTransactionEntities(
  transactions: TransactionRef[]
): Promise<{ transaction_entities: Record<string, EntityBadge[]> }> {
  const res = await fetch(`${API_BASE}/api/entities/transaction-entities/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  })
  if (!res.ok) {
    throw new Error('Failed to get transaction entities')
  }
  return res.json()
}

export interface EntityComparisonSummary {
  entity_id: string
  name: string
  icon: string
  entity_type: EntityType
  transaction_count: number
  total_spent: number
}

export interface EntityComparisonResult {
  entities: EntityComparisonSummary[]
  common_transactions: EntityTransaction[]
  unique_transactions: Record<string, EntityTransaction[]>
  overlap_stats: {
    common_count: number
    total_unique: number
  }
}

export async function compareEntities(entityIds: string[]): Promise<EntityComparisonResult> {
  const res = await fetch(`${API_BASE}/api/entities/compare/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_ids: entityIds }),
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to compare entities')
  }
  return res.json()
}
