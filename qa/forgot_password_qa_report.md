# Forgot Password QA Report

Result: 11 passed, 0 failed

## Checks

- PASS: baseline seed passes before forgot-password test - real-user QA seed completed
- PASS: seed contains finance data before reset - 38
- PASS: recovery token is configured - {'onboarding_complete': True, 'has_webauthn': False, 'has_password': True, 'has_recovery_token': True}
- PASS: bad recovery token is rejected - {"detail":"Recovery token is incorrect."}
- PASS: reset returns a fresh token - {'access_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsb2NhbC11c2VyIiwidHlwZSI6InBhc3N3b3JkLXJlc2V0IiwiZXhwIjoxNzgwMjAwNTI0fQ.86SuoWT9G47D0nZC3-CEW_L-UYp7I4hQTkqsBNP1HlE', 'token_type': 'bearer', 'message': 'Password reset successfully. Your local finance data was preserved.'}
- PASS: old password no longer works - {"detail":"Incorrect password"}
- PASS: new password logs in
- PASS: reset preserves finance transactions - 38
- PASS: app remains onboarded after reset - {'onboarding_complete': True, 'has_webauthn': False, 'has_password': True, 'has_recovery_token': True}
- PASS: preferences are preserved - {'theme': 'dark', 'ai_provider': 'openai', 'ai_model_categorization': 'claude-haiku-4-5-20251001', 'ai_model_insights': 'claude-sonnet-4-5', 'ai_insights_opt_in': True, 'anthropic_api_key_set': False, 'openai_api_key_set': False, 'anthropic_api_key_preview': None, 'openai_api_key_preview': None, 'expense_tool_name': None, 'backup_path': '~/Finance/Backups', 'backup_to_icloud': True, 'dashboard_layout': None, 'default_budget_rule': {'needs': 50, 'wants': 30, 'savings': 20}, 'onboarding_complete': True, 'webauthn_enrolled': False, 'currency': 'USD'}
- PASS: baseline password is restored after forgot-password test - real-user QA seed completed

## Interpretation

Forgot password is implemented as a recovery-token password reset. The old password cannot be recovered, but local finance data and settings are preserved when the saved recovery token is provided.
