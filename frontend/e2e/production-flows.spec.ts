import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const password = 'QA-Test-Password-2026'
const apiBase = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api'

async function resetAndSetup(request: Parameters<Parameters<typeof test.beforeAll>[0]>[0]['request']) {
  execFileSync('docker', [
    'exec', 'finance-postgres', 'psql', '-U', 'financeuser', '-d', 'finance_dashboard',
    '-c',
    'TRUNCATE TABLE accounts, transactions, import_batches, budgets, income_schedules, merchant_rules, user_preferences, backup_log, db_change_log, reimbursement_batches, subscriptions, trips RESTART IDENTITY CASCADE;',
  ])
  const setup = await request.post(`${apiBase}/auth/setup`, {
    data: { password, confirm_password: password },
  })
  expect(setup.ok()).toBeTruthy()
  const token = (await setup.json()).access_token
  const account = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'E2E Checking', type: 'checking', institution: 'QA Bank', last_four: '1212', currency: 'USD' },
  })
  expect(account.ok()).toBeTruthy()
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/')
  if (await page.getByText('Sign in to continue').isVisible().catch(() => false)) {
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign In' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test.beforeAll(async ({ request }) => {
  await resetAndSetup(request)
})

test('accounts modal supports validation and create', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: /Manage Accounts/ }).click()
  await expect(page.getByRole('dialog', { name: /Manage Accounts/ })).toBeVisible()
  await page.getByRole('button', { name: /Add Account/ }).last().click()
  await expect(page.getByText('Account name is required')).toBeVisible()
  await page.getByLabel('Account Name *').fill('E2E Cash Wallet')
  await page.getByLabel('Institution').fill('QA Bank')
  await page.getByLabel('Last 4 Digits').fill('9876')
  await page.getByRole('button', { name: /Add Account/ }).last().click()
  await expect(page.getByText('E2E Cash Wallet')).toBeVisible()
})

test('manual transaction form validates and creates a transaction', async ({ page }) => {
  await signIn(page)
  await page.goto('/transactions')
  await page.getByRole('button', { name: /Add Transaction/ }).click()
  await page.getByRole('button', { name: /^Add Transaction$/ }).click()
  await expect(page.getByText(/Amount is required|Paid To/)).toBeVisible()
  await page.locator('input[type="number"]').first().fill('12.34')
  await page.locator('input[placeholder*="DoorDash"], input[placeholder*="Acme Corp"]').fill('E2E Coffee Shop')
  await page.locator('textarea').fill('Manual E2E coffee transaction')
  await page.getByRole('button', { name: /^Add Transaction$/ }).click()
  await expect(page.getByText('E2E Coffee Shop')).toBeVisible()
})

test('CSV import reaches staged review and commit path', async ({ page }) => {
  await signIn(page)
  const csvPath = join(tmpdir(), `finance-e2e-${Date.now()}.csv`)
  writeFileSync(csvPath, 'Date,Description,Amount,Direction\n2026-05-29,E2E Import Coffee,4.56,debit\n2026-05-29,E2E Import Refund,1.23,credit\n')
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(csvPath)
  await expect(page.getByText(/finance-e2e-|E2E/)).toBeVisible()
  await page.getByRole('button', { name: /Parse & Stage/ }).click()
  await expect(page.getByRole('button', { name: /Commit/ })).toBeVisible()
  await page.getByRole('button', { name: /Commit/ }).click()
  await expect(page.getByText(/Imported|committed|success|Committed/i)).toBeVisible()
})

test('subscriptions and trips can be created from UI', async ({ page }) => {
  await signIn(page)
  await page.goto('/subscriptions')
  await page.getByRole('button', { name: /Quarterly Audit/ }).click()
  await expect(page.getByRole('button', { name: /Exit Audit/ })).toBeVisible()
  await page.getByRole('button', { name: /Add Subscription/ }).click()
  await page.locator('input[placeholder*="Netflix"], input').first().fill('E2E Streaming')
  await page.locator('input[type="number"]').first().fill('9.99')
  await page.getByRole('button', { name: /Add Subscription/ }).last().click()
  await expect(page.getByText('E2E Streaming')).toBeVisible()

  await page.goto('/trips')
  await page.getByRole('button', { name: /New Trip/ }).click()
  await page.locator('input').nth(0).fill('E2E Boston Trip')
  await page.locator('input').nth(1).fill('Boston')
  await page.locator('input[type="date"]').nth(0).fill('2026-05-10')
  await page.locator('input[type="date"]').nth(1).fill('2026-05-13')
  await page.getByRole('button', { name: /Create Trip/ }).click()
  await expect(page.getByText('E2E Boston Trip')).toBeVisible()
})
