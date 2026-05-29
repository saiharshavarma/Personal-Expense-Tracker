# Backup Integrity QA Report

Result: 16 passed, 0 failed

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

- PASS: baseline seed passes before backup integrity test - oad>', 'size_bytes': 11074}
- PASS: data integrity: reimbursement flags and statuses consistent - []
- PASS: data integrity: transaction amounts positive - []

## Observations

- No hard data-integrity failures were found in reimbursement status pairing, positive amount storage, duplicate handling, or learned-rule autofill.
- Analytics income now excludes categorized refund credits; May income matches salary + bonus at $6,950.00.
- Manual backup now returns a gzip JSON snapshot and records a successful backup log.
- Budget actuals intentionally subtract received reimbursement, while analytics personal-only uses expected reimbursement for split/fully reimbursable filtering. Those definitions are different but internally consistent for their stated use cases.
- Credit refunds are not netted against budget category spend; this is consistent with the current backend but may surprise users expecting refunds to reduce category actuals.
- Final transaction count after review-queue test: 38.


- PASS: backup endpoint returns gzip download - 200 application/gzip 11075 bytes
- PASS: snapshot contains all production restore domains - missing=[]
- PASS: snapshot version is current - 1.1
- PASS: transaction count matches snapshot - snapshot=38 api=38
- PASS: account count matches snapshot - snapshot=3 api=3
- PASS: budget count covers API budgets - snapshot=14 api=12
- PASS: subscription count matches snapshot - snapshot=4 api=4
- PASS: trip count matches snapshot - snapshot=1 api=1
- PASS: merchant rules count matches snapshot - snapshot=35 api=35
- PASS: reimbursement batch count matches snapshot - snapshot=1 api=1
- PASS: preferences are included and masked enough for restore metadata - [{'expense_tool_name': None, 'webauthn_credential': None, 'default_account_id': None, 'backup_path': '~/Finance/Backups', 'updated_at': '2026-05-29T19:44:05.079386', 'ai_provider': 'openai', 'backup_to_icloud': True, 'id': 1, 'ai_model_categorization': 'claude-haiku-4-5-20251001', 'onboarding_complete': True, 'default_budget_rule': {'needs': 50, 'wants': 30, 'savings': 20}, 'ai_model_insights': 'claude-sonnet-4-5', 'dashboard_layout': None, 'budget_templates': [{'amount': 400.0, 'category': 'Food', 'subcategory': 'Groceries'}, {'amount': 250.0, 'category': 'Utilities', 'subcategory': None}], 'ai_insights_opt_in': True, 'currency': 'USD', 'anthropic_api_key': None, 'theme': 'dark', 'openai_api_key': None, 'password_hash': '$2b$12$CX9P.n.TUe0JmVez/h613.gMIme/VF/T.gDt7WIoPxf5yyc36fiFq'}]
- PASS: import batches are included - 4
- PASS: snapshot transaction ids are unique
- PASS: snapshot duplicate hashes are unique
- PASS: snapshot contains no generated net_personal_cost field

## Restore Note

This validates that the backup artifact contains the domains required for restore. A restore endpoint/CLI is still not implemented, so a destructive automated restore round-trip cannot be claimed yet.
