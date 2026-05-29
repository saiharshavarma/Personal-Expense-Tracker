# Fintrack — Local Personal Finance Dashboard

A fully local, privacy-first finance dashboard. Your bank data never leaves your machine — no cloud sync, no subscriptions, no third-party servers.

---

## Quick Start

### 1. Install Docker Desktop

| Platform | Install |
|---|---|
| macOS | [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/) |
| Windows | [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) |
| Linux | [Docker Engine](https://docs.docker.com/engine/install/) |

Open Docker Desktop and leave it running before proceeding.

### 2. Download the app

```bash
git clone https://github.com/saiharshavarma/Personal-Expense-Tracker.git
cd Personal-Expense-Tracker
```

Using `git clone` enables the in-app updater. Downloading a ZIP works but Settings → System Health → Update Application will not function without Git history.

### 3. First-time setup

```bash
./setup.sh
```

Detects your OS and architecture, checks Docker, generates a secret key, builds local containers, starts the app, and opens your browser.

**Works on:** macOS (Intel + Apple Silicon), Linux, Windows via WSL2.

### macOS double-click launcher

After setup, you can also double-click `Finance Dashboard.app` — it opens Terminal, runs `./start.sh`, and opens the dashboard.

### Starting / stopping later

```bash
./start.sh   # start containers + open browser
./stop.sh    # trigger backup, then shut down
```

---

## Requirements

| Requirement | Notes |
|---|---|
| **Docker Desktop** | [macOS](https://docs.docker.com/desktop/install/mac-install/) · [Linux](https://docs.docker.com/engine/install/) · [Windows/WSL2](https://docs.docker.com/desktop/install/windows-install/) |
| **Git** | Recommended — required for the in-app updater |
| **bash** | Pre-installed on macOS & Linux. Windows: use WSL2 |

No Python, Node, or any other runtime needed on the host.

---

## Services

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | Internal Docker network only |

---

## Features

### 📥 Transaction Import

- **PDF bank statements** — Chase, Bank of America, Amex, Apple Pay parsed automatically; generic CSV parser as fallback
- **Duplicate detection** — hash includes date, amount, description, and direction so a same-day refund from the same merchant is never silently dropped
- **AI confidence routing:** ≥ 90% → auto-applied silently; 75–89% → review queue (yellow); < 75% → red-flagged for manual review
- **Review queue** — sorted by confidence ascending so the most uncertain transactions surface first; accept, edit, or reject individually or in bulk
- **Bulk accept** — applies AI suggestions for all yellow-band transactions; zero-confidence transactions are held back and cannot be bulk-accepted (they get "Other" only if you explicitly accept them)
- **Import history** — per-batch review counts stay accurate as you work through the queue

### 🤖 AI Categorization

- Connects to **Anthropic (Claude)** or **OpenAI (GPT)** — your choice, configurable per use-case (categorization vs. insights model)
- Assigns: category, subcategory, Need/Want/Savings, Fixed/Variable, Personal/Work/Shared, Reimbursable, Recurring, and tags
- **Rules engine** — learns from every correction you make; future similar transactions are matched automatically with a confidence score and stable deterministic ordering
- Low-confidence rule matches (75–89%) are passed to AI first; if AI also has no result, the rule match is used as a fallback rather than discarding it entirely
- AI calls send only: internal UUID, date, merchant string, amount, direction — never account numbers, your name, or balances
- 90-second timeout cap on AI categorization so a slow LLM call never blocks an import from completing

### 💳 Transactions

- Grid and list views; uniform card sizes
- Filters: date range, account, category, subcategory, merchant, direction, Need/Want/Savings, Fixed/Variable, reimbursable status, recurring, and more
- Sort by any field
- **Batch actions:** select multiple rows → bulk categorize, bulk mark reimbursable, bulk tag, bulk delete
- Inline edit with full rules-engine learning feedback loop
- `needs_review` flag is always the backend source of truth — the UI does not override it based on field-level heuristics

### 📊 Budget

- Set budgets at **category level** or **subcategory level** (e.g., Food → Groceries)
- Unbudgeted categories with real spending appear with `status: unbudgeted` — visually distinct from a budgeted category at 0% used
- Clicking an unbudgeted row pre-populates the Add Budget dialog with that category
- **Copy last month's budgets** in one click
- **Global budget templates** — define reusable default amounts per category/subcategory in Settings; apply them to any month with one click
- **50/30/20 rule** — customisable targets (adjust in Settings → Categories & Rules)
- Progress bars with status badges: Safe / Watch (≥ 80%) / Over (≥ 100%) / Unbudgeted
- Actuals use **net personal cost** (gross minus received reimbursement) so fully reimbursed expenses don't count against the budget

### 📈 Analytics

Charts and stats across:
- Spending trends over time, category breakdown (as % of all spend including uncategorised), income vs. expenses
- **Month-end projection** — linear extrapolation of daily spend rate; marked unreliable on days 1–2 of the month when data is insufficient
- **Spend velocity** — current daily rate vs. historical average, with zero-spend months excluded from the baseline
- **Health score (0–100)** — composite of savings rate (40 pts), budget adherence (30 pts), and review completion (30 pts); null when no budgets are set rather than showing a misleading 0%
- Need/Want/Savings split, Recurring vs. one-time split, top merchants, day-of-week patterns, budget trend over time, reimbursement pipeline chart
- Exclude-reimbursable toggle applies consistently across all charts including projections
- Month/year picker — all widgets reflect the selected period, not just the current month
- Income definition is consistent across Dashboard and Budget page (excludes Transfer and Financial category credits)

### 🤖 AI Insights — Ask AI

Chat-style Q&A about your finances. Ask anything: "What categories am I overspending in?" or "Am I on track for my savings goal?"

- Date range picker for flexible time windows
- Sends only aggregated category totals, percentages, and trend numbers — never individual transaction descriptions or merchant names
- Requires an Anthropic or OpenAI API key configured in Settings

### 🧠 Finance Advisor

Structured AI financial review for a selected period:

- **Health verdict and executive summary**
- **Expense reduction opportunities** — specific categories with estimated monthly savings
- **Wealth-building strategies** — actionable suggestions with timeframes
- **Habit recommendations** and their projected impact
- **4-week action plan** with items ranked by impact (high / medium / low)
- Same privacy model as Ask AI — aggregated stats only, no raw transaction data

### 💰 Accounts

- Track checking, savings, credit card, and investment accounts
- Per-account transaction filtering throughout the app

### 💸 Reimbursements

- Mark transactions reimbursable at import or edit time; sets `reimbursement_status = to_submit` automatically
- **6-column Kanban board:** To Submit → Submitted → Approved → Paid → Partial → Rejected
- Partial settlements recorded correctly — advancing a partially-paid item to Paid preserves the actual received amount rather than overwriting it
- Batch creation: groups multiple transactions into a single reimbursement batch; batch status reflects whether transactions have been submitted
- Summary cards use payments received within the last 90 days so "Paid" count matches what's visible on the board
- **Net personal cost** (`amount − received_reimbursement`) flows through to Budget actuals and health score

### 🔁 Subscriptions

- Auto-detected recurring charges linked to subscription records
- Billing frequencies: monthly, annual, weekly, biweekly, quarterly — all correctly converted to a monthly equivalent for totals
- **Personal / Work / Shared breakdown** with accurate per-group counts and a `shared_monthly` figure so the three buckets always sum to the total
- Rate subscriptions by value and usage to identify ones to cut
- Monthly cost summary by group

### ✈️ Trips

- Attach transactions to a business or personal trip
- Trip type preserved on edits — updating a trip without providing `trip_type` no longer silently resets it to "business"
- **Auto-tag** — one click tags all non-recurring debits in the trip date range (recurring charges like rent and subscriptions are excluded)
- Candidate transaction list for manual tagging is filtered to debits only so income and refunds don't appear
- Per-trip budget and actual spend: gross amount and net personal cost shown per expense; trip total is net so it matches the budget remaining figure
- Credit transactions (hotel refunds, etc.) do not inflate the trip total

### 🤖 AI Re-categorize

Trigger AI re-categorization for specific transactions from the Transactions page without re-importing.

### 📱 iOS Shortcut

Log transactions from your iPhone:

```
POST http://YOUR_MAC_IP:8000/api/ios/transaction
```

Setup guide in Settings → iOS Shortcut.

### 📧 Email Reports

- Monthly finance summary email on a configurable day of month
- Upload reminder nudge on a configurable day
- Supports any SMTP provider — Gmail, Outlook, Fastmail, etc.
- Configure in Settings → Email Reports

### 🎨 Appearance & Personalisation

- Light / Dark mode
- **15 currency options** — USD, EUR, GBP, JPY, CAD, AUD, CHF, INR, MXN, BRL, CNY, KRW, SGD, SEK, NOK
- Custom categories and subcategories with colour coding
- Configurable 50/30/20 split targets
- Mochi the mascot — context-aware tips and navigation hints (toggle in Settings → Appearance)

### 🔒 Security

- Local-only authentication — no cloud account
- Password + optional **Touch ID / WebAuthn** biometric login
- Session tokens never leave your machine

### 💾 Backup & Export

- Automatic backup on every `./stop.sh`
- Manual backup trigger via Settings or API
- Export transactions as **CSV, Excel, JSON, or PDF**

### 🧭 Application Updates

Settings → System Health → **Update Application**

- Checks whether the local app is behind GitHub `origin/main`
- Pulls updates and rebuilds/restarts containers
- Blocked if local code changes are present so your changes are never overwritten

---

## Configuration

`setup.sh` creates a `.env` file automatically. Edit it to add AI keys:

```env
# Required for AI categorization + insights
ANTHROPIC_API_KEY=sk-ant-...   # Recommended — uses Claude
OPENAI_API_KEY=sk-...          # Alternative

# Auto-set by setup.sh — do not edit manually
DOCKER_PLATFORM=linux/arm64
SECRET_KEY=<generated>
```

---

## Privacy & Data

| What | Where |
|---|---|
| Transaction data | PostgreSQL inside a Docker volume (`postgres_data`) — never leaves your machine |
| Bank statement PDFs | Parsed in-container and discarded — never stored |
| AI categorization | Sends: UUID, date, merchant string, amount, direction — **nothing else** |
| AI insights / advisor | Sends: aggregated category totals, percentages, and trend numbers — no individual transactions |
| Backups | Written to `~/Finance/Backups/` on your local machine |

---

## Settings Overview

| Tab | What's here |
|---|---|
| Accounts & Income | Manage credit cards, bank accounts, income schedules |
| Categories & Rules | Custom categories, merchant rules, 50/30/20 budget rule targets, budget templates |
| AI Configuration | Provider (Anthropic / OpenAI), models per feature, API keys, insights opt-in |
| iOS Shortcut | Endpoint URL and setup guide |
| Appearance | Theme, currency, Mochi mascot toggle |
| Email Reports | Monthly report + upload reminder config (SMTP) |
| Backup & Export | Manual backup, export formats, backup path |
| Security | Password change, biometric enrollment |
| System Health | Live status of API, auth, AI, backup, privacy settings, and app updates |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Compose                                 │
│                                                 │
│  ┌──────────────┐   ┌──────────────┐            │
│  │   Frontend   │   │   Backend    │            │
│  │  React + TS  │◄──│  FastAPI     │            │
│  │ nginx static │   │  Python 3.12 │            │
│  │  :3000       │   │  :8000       │            │
│  └──────────────┘   └──────┬───────┘            │
│                            │                    │
│  ┌──────────────┐          │                    │
│  │   Updater    │          │                    │
│  │ git + docker │          │                    │
│  │ internal     │          │                    │
│  └──────────────┘          │                    │
│                            │                    │
│                     ┌──────▼───────┐            │
│                     │  PostgreSQL  │            │
│                     │  internal    │            │
│                     └──────────────┘            │
└─────────────────────────────────────────────────┘
         ▲ All on your local machine ▲
```

**Frontend:** React 18, TypeScript, Vite, nginx, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, Zustand

**Backend:** FastAPI, SQLAlchemy 2.0 (async), asyncpg, Pydantic v2, pdfplumber

**Updater:** Internal service with Git + Docker Compose access for in-app updates

**AI:** Anthropic Claude / OpenAI GPT — separately configurable for categorization and insights

---

## Troubleshooting

**Containers won't start**
```bash
docker compose logs backend
docker compose logs frontend
```

**In-app updater says local changes are present**
The updater will not overwrite local code changes. Install with `git clone`, keep the app folder unmodified, then retry.

**In-app updater unavailable**
Ensure Docker Desktop is running and the app was installed with `git clone`, not a ZIP download.

**Database issue after update**
Schema migrations run automatically on startup. If something breaks:
```bash
docker compose down
docker compose up -d --build
```

**Frontend not loading**
```bash
docker compose logs frontend
```

**Forgotten password**
```bash
curl -X POST http://localhost:8000/api/auth/reset-password-dev \
  -H "Content-Type: application/json" \
  -d '{"new_password": "newpassword"}'
```
