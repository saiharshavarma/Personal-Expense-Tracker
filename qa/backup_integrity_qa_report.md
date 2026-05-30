# Backup Integrity QA Report

Result: 21 passed, 0 failed

## Snapshot Counts

{
  "accounts": 3,
  "budgets": 14,
  "import_batches": 4,
  "income_schedules": 0,
  "merchant_rules": 35,
  "reimbursement_batches": 1,
  "subscriptions": 4,
  "transactions": 38,
  "trips": 1,
  "user_preferences": 1
}

## Checks

- PASS: baseline seed passes before backup integrity test - oad>', 'size_bytes': 10988}
- PASS: data integrity: reimbursement flags and statuses consistent - []
- PASS: data integrity: transaction amounts positive - []

## Observations

- No hard data-integrity failures were found in reimbursement status pairing, positive amount storage, duplicate handling, or learned-rule autofill.
- Analytics income now excludes categorized refund credits; May income matches salary + bonus at $6,950.00.
- Manual backup now returns a gzip JSON snapshot and records a successful backup log.
- Budget actuals intentionally subtract received reimbursement, while analytics personal-only uses expected reimbursement for split/fully reimbursable filtering. Those definitions are different but internally consistent for their stated use cases.
- Credit refunds are not netted against budget category spend; this is consistent with the current backend but may surprise users expecting refunds to reduce category actuals.
- Final transaction count after review-queue test: 38.


- PASS: backup endpoint returns gzip download - 200 application/gzip 10988 bytes
- PASS: snapshot contains all production restore domains - missing=[]
- PASS: snapshot version is current - 1.1
- PASS: transaction count matches snapshot - snapshot=38 api=38
- PASS: account count matches snapshot - snapshot=3 api=3
- PASS: budget count covers API budgets - snapshot=14 api=12
- PASS: subscription count matches snapshot - snapshot=4 api=4
- PASS: trip count matches snapshot - snapshot=1 api=1
- PASS: merchant rules count matches snapshot - snapshot=35 api=35
- PASS: reimbursement batch count matches snapshot - snapshot=1 api=1
- PASS: preferences are included and auth/secrets are redacted - [{'theme': 'dark', 'expense_tool_name': None, 'default_account_id': None, 'backup_path': '~/Finance/Backups', 'ai_provider': 'openai', 'backup_to_icloud': True, 'updated_at': '2026-05-30T04:10:22.982407', 'ai_model_categorization': 'claude-haiku-4-5-20251001', 'onboarding_complete': True, 'default_budget_rule': {'needs': 50, 'wants': 30, 'savings': 20}, 'id': 1, 'ai_model_insights': 'claude-sonnet-4-5', 'dashboard_layout': None, 'budget_templates': [{'amount': 400.0, 'category': 'Food', 'subcategory': 'Groceries'}, {'amount': 250.0, 'category': 'Utilities', 'subcategory': None}], 'ai_insights_opt_in': True, 'currency': 'USD'}]
- PASS: import batches are included - 4
- PASS: snapshot transaction ids are unique
- PASS: snapshot duplicate hashes are unique
- PASS: snapshot contains no generated net_personal_cost field
- PASS: mutation before restore changes transaction count - 39
- PASS: restore endpoint reports restored counts - {'status': 'success', 'backup_version': '1.1', 'created_at': '2026-05-30T04:10:23.296109', 'restored': {'accounts': 3, 'trips': 1, 'reimbursement_batches': 1, 'import_batches': 4, 'subscriptions': 4, 'budgets': 14, 'income_schedules': 0, 'merchant_rules': 35, 'user_preferences': 1, 'transactions': 38}}
- PASS: restore removes post-backup mutation - 38
- PASS: restore preserves usable login credentials
- PASS: restore preserves restored preferences metadata - {'theme': 'dark', 'ai_provider': 'openai', 'ai_model_categorization': 'claude-haiku-4-5-20251001', 'ai_model_insights': 'claude-sonnet-4-5', 'ai_insights_opt_in': True, 'anthropic_api_key_set': False, 'openai_api_key_set': False, 'anthropic_api_key_preview': None, 'openai_api_key_preview': None, 'expense_tool_name': None, 'backup_path': '~/Finance/Backups', 'backup_to_icloud': True, 'dashboard_layout': None, 'default_budget_rule': {'needs': 50, 'wants': 30, 'savings': 20}, 'onboarding_complete': True, 'webauthn_enrolled': False, 'currency': 'USD'}

## Restore Note

This validates backup artifact coverage and performs a destructive restore round-trip through POST /api/backup/restore.
