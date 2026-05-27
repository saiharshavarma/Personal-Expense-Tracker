// Full category / subcategory taxonomy for the finance dashboard

export const CATEGORY_MAP: Record<string, string[]> = {
  'Food & Dining': ['Groceries', 'Restaurants', 'Fast Food', 'Coffee & Tea', 'Food Delivery', 'Alcohol & Bars', 'Specialty Food'],
  'Transportation': ['Gas & Fuel', 'Parking', 'Rideshare / Taxi', 'Public Transit', 'Car Rental', 'Auto Maintenance', 'Auto Insurance', 'Car Wash', 'Tolls'],
  'Housing': ['Rent / Mortgage', 'Property Tax', 'Home Insurance', 'HOA Fees', 'Furniture & Decor', 'Home Improvement', 'Cleaning & Maintenance', 'Lawn & Garden'],
  'Utilities': ['Electricity', 'Gas / Heat', 'Water', 'Trash & Recycling', 'Internet', 'Mobile Phone', 'Cable / Satellite'],
  'Entertainment': ['Movies & Concerts', 'Sports & Recreation', 'Video Games', 'Hobbies', 'Books & Magazines', 'Amusement Parks', 'Night Out'],
  'Shopping': ['Clothing & Apparel', 'Electronics', 'Home Goods', 'Beauty & Personal Care', 'Baby & Kids', 'Gifts', 'Online Shopping'],
  'Health & Medical': ['Doctor Visit', 'Dentist', 'Pharmacy', 'Gym & Fitness', 'Mental Health', 'Eye Care', 'Health Insurance', 'Vitamins & Supplements'],
  'Travel': ['Airfare', 'Hotels & Lodging', 'Vacation Rentals', 'Car Rental', 'Cruise', 'Travel Insurance', 'Baggage & Fees'],
  'Business & Work': ['Office Supplies', 'Software & SaaS', 'Professional Services', 'Business Travel', 'Client Entertainment', 'Conferences & Events', 'Coworking'],
  'Education': ['Tuition', 'Books & Supplies', 'Online Courses', 'Tutoring', 'School Fees'],
  'Subscriptions': ['Streaming Video', 'Streaming Music', 'News & Media', 'Cloud Storage', 'Productivity Tools', 'Security & VPN', 'Other Subscription'],
  'Financial': ['Bank Fees', 'Interest Charges', 'Life Insurance', 'Investment Purchase', 'Savings Transfer', 'Taxes', 'Loan Payment'],
  'Personal': ['Donations & Charity', 'Gifts Given', 'Pet Care', 'Child Care', 'Haircut & Grooming', 'Lottery / Gambling'],
  'Income': ['Salary / Paycheck', 'Freelance', 'Investment Returns', 'Refund', 'Reimbursement Received', 'Rental Income', 'Other Income'],
  'Transfer': ['Bank Transfer', 'Credit Card Payment', 'Peer Payment (Venmo etc)', 'Internal Transfer'],
  'Other': ['Miscellaneous', 'Unknown'],
}

export const ALL_CATEGORIES = Object.keys(CATEGORY_MAP)

export function getSubcategories(category: string): string[] {
  return CATEGORY_MAP[category] ?? []
}

export const NEED_WANT_SAVINGS_OPTIONS = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'savings', label: 'Savings' },
  { value: 'na', label: 'N/A' },
]

export const FIXED_VARIABLE_OPTIONS = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'variable', label: 'Variable' },
  { value: 'na', label: 'N/A' },
]

export const PERSONAL_WORK_OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'work', label: 'Work' },
  { value: 'shared', label: 'Shared' },
  { value: 'mixed', label: 'Mixed' },
]

export const REIMBURSEMENT_STATUS_OPTIONS = [
  { value: 'not_reimbursable', label: 'Not Reimbursable' },
  { value: 'to_submit', label: 'To Submit' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'rejected', label: 'Rejected' },
]

export const TRANSACTION_SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'pdf_import', label: 'PDF Import' },
  { value: 'csv_import', label: 'CSV Import' },
  { value: 'ios_shortcut', label: 'iOS Shortcut' },
  { value: 'apple_pay_sheet', label: 'Apple Pay Sheet' },
]

// Category badge colors
export const CATEGORY_COLORS: Record<string, string> = {
  'Food & Dining': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Transportation': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Housing': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'Utilities': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Entertainment': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'Shopping': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'Health & Medical': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'Travel': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Business & Work': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Education': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'Subscriptions': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'Financial': 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300',
  'Personal': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'Income': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Transfer': 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  'Other': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

export function getCategoryColor(category: string | null): string {
  if (!category) return CATEGORY_COLORS['Other']
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS['Other']
}
