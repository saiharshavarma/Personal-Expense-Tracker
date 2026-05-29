# Load QA Report

Result: 18 passed, 0 failed

Generated transactions: 5000

## Timings

{
  "backup_status_ms": 4.5,
  "budget_actuals_ms": 8.1,
  "category_breakdown_ms": 4.9,
  "commit_avg_ms": 419.1,
  "commit_max_ms": 446.2,
  "dashboard_ms": 12.0,
  "income_expenses_ms": 5.9,
  "transactions_ms": 12.7
}

## Checks

- PASS: import chunk 1 committed - result={'batch_id': 'b02d8dd5-6094-4bd3-956d-39037e7d1d19', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=392.6
- PASS: import chunk 2 committed - result={'batch_id': '2e58146c-ff25-4588-8bcb-536e14e9ce40', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=420.1
- PASS: import chunk 3 committed - result={'batch_id': '262617aa-e6be-43c2-9e69-844e85a1f696', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=404.3
- PASS: import chunk 4 committed - result={'batch_id': '6ffc917a-9f10-4dd9-b324-c286813a72fa', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=393.1
- PASS: import chunk 5 committed - result={'batch_id': 'a60a0829-439c-4924-a371-9390a0a02f14', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=419.3
- PASS: import chunk 6 committed - result={'batch_id': '154609a8-e760-4d8e-b086-b953d5938a66', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=424.3
- PASS: import chunk 7 committed - result={'batch_id': '5df7b772-d301-4c6e-9aef-09c0792cf973', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=406.6
- PASS: import chunk 8 committed - result={'batch_id': '8b0cf76a-8e20-47a7-adc5-2c411d5e4958', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=443.6
- PASS: import chunk 9 committed - result={'batch_id': 'b2d62665-a857-405c-ba6f-5f2e07b3f4ae', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=446.2
- PASS: import chunk 10 committed - result={'batch_id': 'f30a178b-b2b2-423c-ba3b-504483c08e83', 'institution': 'QA Load', 'imported': 500, 'duplicates': 0} ms=440.5
- PASS: all load transactions exist - 5000
- PASS: dashboard summary returns sane May numbers - {'month': 5, 'year': 2026, 'expenses': 30174.54, 'income': 48650.0, 'savings': 18475.46, 'savings_rate': 38.0, 'transaction_count': 264, 'top_category': 'Shopping', 'top_category_total': 4210.33, 'mom_change_pct': -7.8, 'prev_month_expenses': 32738.96, 'reimbursement_pending': 30779.59, 'reimbursement_count': 206, 'recurring_total': 1813.62, 'needs_review_count': 0, 'exclude_reimbursable': False}
- PASS: income-expenses returns requested history - 18
- PASS: category breakdown percentages are sane under load - [{'category': 'Shopping', 'total': 4210.33, 'count': 35, 'pct': 14.0}, {'category': 'Dining', 'total': 4038.02, 'count': 34, 'pct': 13.4}, {'category': 'Food', 'total': 4031.32, 'count': 35, 'pct': 13.4}]
- PASS: budget actuals endpoint stays structured under load - {'budget': 0.0, 'gross_spend': 30174.54, 'reimbursed': 0.0, 'net_personal': 30174.54, 'remaining': -30174.54}
- PASS: hot endpoints respond within local threshold - {"commit_max_ms": 446.2, "commit_avg_ms": 419.1, "transactions_ms": 12.7, "dashboard_ms": 12.0, "income_expenses_ms": 5.9, "category_breakdown_ms": 4.9, "budget_actuals_ms": 8.1, "backup_status_ms": 4.5}
- PASS: import chunks stay within local threshold - {"commit_max_ms": 446.2, "commit_avg_ms": 419.1, "transactions_ms": 12.7, "dashboard_ms": 12.0, "income_expenses_ms": 5.9, "category_breakdown_ms": 4.9, "budget_actuals_ms": 8.1, "backup_status_ms": 4.5}
- PASS: backup status remains available under load - {'last_backup': None, 'status': 'never'}
