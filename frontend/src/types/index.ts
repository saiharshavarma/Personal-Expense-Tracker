// ── Enums ──────────────────────────────────────────────────────────────────────

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash'
export type TransactionDirection = 'debit' | 'credit'
export type NeedWantSavings = 'need' | 'want' | 'savings' | 'na'
export type FixedVariable = 'fixed' | 'variable' | 'na'
export type PersonalWorkShared = 'personal' | 'work' | 'shared' | 'mixed'
export type ReimbursementStatus = 'not_reimbursable' | 'to_submit' | 'submitted' | 'approved' | 'paid' | 'partial' | 'rejected'
export type TransactionSource = 'manual' | 'pdf_import' | 'ios_shortcut' | 'csv_import' | 'apple_pay_sheet'
export type TripType = 'business' | 'personal' | 'mixed'
export type TripStatus = 'planning' | 'active' | 'completed' | 'archived'
export type BatchStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'partial' | 'rejected'
export type AIProvider = 'anthropic' | 'openai'

// ── Core Entities ──────────────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  type: AccountType
  institution: string | null
  last_four: string | null
  currency: string
  is_active: boolean
  color: string | null
  icon: string | null
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  date: string
  posted_date: string | null
  amount: number
  direction: TransactionDirection
  description: string | null
  description_clean: string | null
  merchant: string | null
  account_id: string | null
  transaction_type: string | null
  category: string | null
  subcategory: string | null
  need_want_savings: NeedWantSavings | null
  fixed_variable: FixedVariable | null
  personal_work_shared: PersonalWorkShared | null
  notes: string | null
  tags: string[]
  is_reimbursable: boolean
  reimbursement_source: string | null
  reimbursement_status: ReimbursementStatus
  expected_reimbursement: number | null
  received_reimbursement: number
  net_personal_cost: number | null
  reimbursement_due_date: string | null
  reimbursement_received_date: string | null
  reimbursement_batch_id: string | null
  business_trip_id: string | null
  company_expense_category: string | null
  expense_tool: string | null
  is_recurring: boolean
  frequency: string | null
  subscription_id: string | null
  investment_ticker: string | null
  investment_action: string | null
  investment_shares: number | null
  investment_price_per_share: number | null
  source: TransactionSource
  import_batch_id: string | null
  duplicate_hash: string | null
  ai_category: string | null
  ai_subcategory: string | null
  ai_confidence: number | null
  ai_reviewed: boolean
  needs_review: boolean
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  name: string
  amount: number
  monthly_equivalent: number
  annual_equivalent: number
  billing_frequency: string | null
  next_billing_date: string | null
  category: string | null
  subcategory: string | null
  personal_work_shared: PersonalWorkShared | null
  is_reimbursable: boolean
  account_id: string | null
  is_active: boolean
  value_rating: number | null
  usage_rating: string | null
  notes: string | null
  created_at: string
  cancelled_at: string | null
}

export interface Trip {
  id: string
  name: string
  destination: string | null
  start_date: string | null
  end_date: string | null
  trip_type: TripType
  budget: number | null
  status: TripStatus
  expense_tool: string | null
  expense_tool_reference: string | null
  notes: string | null
  created_at: string
}

export interface ReimbursementBatch {
  id: string
  name: string | null
  source: string
  submitted_date: string | null
  expected_payment_date: string | null
  total_submitted: number | null
  total_received: number
  status: BatchStatus
  expense_tool: string | null
  submission_reference: string | null
  submission_method: string | null
  notes: string | null
  created_at: string
}

export interface Budget {
  id: string
  month: number
  year: number
  category: string
  budget_amount: number
  needs_pct: number | null
  wants_pct: number | null
  savings_pct: number | null
}

export interface MerchantRule {
  id: string
  pattern: string
  match_type: 'exact' | 'contains' | 'startswith' | 'regex'
  merchant_clean: string | null
  category: string | null
  subcategory: string | null
  need_want_savings: NeedWantSavings | null
  is_reimbursable: boolean | null
  personal_work_shared: PersonalWorkShared | null
  is_recurring: boolean | null
  confidence: number
  times_applied: number
  times_overridden: number
  created_at: string
}

export interface UserPreferences {
  theme: 'light' | 'dark'
  ai_provider: AIProvider
  ai_model_categorization: string
  ai_model_insights: string
  ai_insights_opt_in: boolean
  expense_tool_name: string | null
  backup_path: string
  backup_to_icloud: boolean
  onboarding_complete: boolean
  dashboard_layout: Record<string, unknown> | null
  default_budget_rule: { needs: number; wants: number; savings: number }
}

export interface ImportBatch {
  id: string
  filename: string | null
  source_type: string | null
  institution: string | null
  total_transactions: number
  imported_transactions: number
  skipped_duplicates: number
  status: string
  imported_at: string
}

// ── API Responses ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ApiError {
  detail: string
  code?: string
}

export interface AuthStatus {
  onboarding_complete: boolean
  has_webauthn: boolean
  has_password: boolean
}

export interface AuthResponse {
  access_token: string
  token_type: string
}

// ── Filter State ───────────────────────────────────────────────────────────────

export interface TransactionFilters {
  date_from?: string
  date_to?: string
  account_id?: string
  category?: string
  subcategory?: string
  direction?: TransactionDirection
  needs_review?: boolean
  is_reimbursable?: boolean
  reimbursement_status?: ReimbursementStatus
  is_recurring?: boolean
  need_want_savings?: NeedWantSavings
  fixed_variable?: FixedVariable
  personal_work_shared?: PersonalWorkShared
  transaction_type?: string
  source?: TransactionSource
  min_amount?: number
  max_amount?: number
  search?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface SpendTrendPoint {
  year: number
  month: number
  total: number
}

export interface CategoryBreakdownItem {
  category: string
  total: number
  count: number
  pct: number
}

export interface ProjectionResult {
  spent_so_far: number
  projected_total: number
  avg_daily_spend: number
  days_elapsed: number
  days_remaining: number
  days_in_month: number
}
