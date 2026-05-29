# Real User QA Summary

Run date: 2026-05-29

## Scope

- Cleared database and settings.
- Created fresh auth state, 3 accounts, preferences, budgets, subscriptions, reimbursement batch, and trip.
- Imported realistic dummy CSVs through the import API:
  - `qa/realistic_checking.csv`
  - `qa/realistic_credit_card.csv`
  - `qa/learned_blue_bottle.csv`
- Covered salary, bonus, transfers, refunds, duplicate rows, same-day debit/credit pairs, recurring bills, subscriptions, reimbursements, split reimbursement, travel, healthcare, investment, cash, unknown merchants, and learned merchant categorization.

## Result

- API/data-integrity checks after fixes: 33 passed, 0 failed.
- Browser UI DOM pass: 9 pages loaded successfully with expected seeded data visible and no visible crash state.
- Screenshot capture in the in-app browser timed out even for clipped viewport screenshots, so UI verification was DOM-visible rather than image-based.

## Fixed Issues

1. Analytics income is inflated by refund credits.
   - Expected May income: `$6,950.00` from salary + bonus.
   - Previous analytics/dashboard income: `$6,984.00`.
   - Fixed analytics income: `$6,950.00`.
   - Fix: income filters now include credits categorized as `Income` plus uncategorized credits, and exclude categorized non-income credits like refunds, transfers, and dividends.

2. Manual backup fails.
   - Endpoint: `POST /api/backup/trigger`.
   - Previous result: HTTP 500 with `Object of type UUID is not JSON serializable`.
   - Fixed result: HTTP 200 gzip JSON snapshot, with backup status recorded as `success`.

## Key Reconciliations

- May gross debit spend: `$5,287.14` expected, `$5,287.14` reported.
- May personal-only analytics spend: `$3,698.14` expected, `$3,698.14` reported.
- Budget net personal actuals: `$4,827.14` expected, `$4,827.14` reported.
- Budget totals: budget `$5,170.00`, remaining `$342.86`.
- Dining partial reimbursement: gross `$181.35`, reimbursed `$40.00`, net `$141.35`.
- Subscription monthly total: `$93.99`; personal `$71.99`, work `$8.00`, shared `$14.00`.
- Reimbursement batch submitted total: `$1,499.00`.
- Trip total for Denver Offsite: `$338.60` expected, `$338.60` reported.
- Final transaction count after review-queue test: `38`.

## AI Autofill And Learning

- Corrected `Blue Bottle Coffee Soma` to `Dining / Coffee`.
- The app created a local merchant rule: `BLUE BOTTLE COFFEE SOMA`.
- A later CSV row `Blue Bottle Coffee Soma 7781` auto-filled as `Dining` with confidence `1.0` and preserved the learned tag.
- `Unknown Vendor Experimental Purchase` remained `Other` with confidence `0.0` and `needs_review`.
- Bulk accept accepted only the learned high-confidence row and correctly left the zero-confidence row for manual review.

## UI Pages Checked

- Dashboard
- Transactions
- Budget
- Analytics
- Reimbursements
- Subscriptions
- Trips
- Import
- Settings

All loaded in the browser after login and showed expected seeded content with no visible application error.

## Data Integrity Checks

- Positive amount invariant passed.
- Reimbursement status and `is_reimbursable` pairing passed.
- Duplicate re-import skipped all 26 checking rows.
- Within-file duplicate skipped 1 duplicate credit-card CSV row.
- Same-day same-merchant debit and credit were not collapsed together because direction is included in the duplicate hash.
- Review queue count and staged import behavior matched backend expectations.

## Notes

- Budget actuals subtract received reimbursements.
- Analytics personal-only mode uses expected reimbursement to exclude fully reimbursable rows and calculate split personal share.
- Those definitions differ, but the tested numbers were internally consistent.
- Refund credits are not netted against budget category spend. This matches current backend behavior, but it may surprise users who expect refunds to reduce category actuals.
