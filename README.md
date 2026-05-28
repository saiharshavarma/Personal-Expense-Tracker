# Fintrack — Local Personal Finance Dashboard

A fully local, privacy-first finance dashboard. Your bank data never leaves your machine — no cloud sync, no subscriptions, no third-party servers.

---

## Quick Start

### First-time setup (one command)

```bash
./setup.sh
```

That's it. The script detects your OS and architecture, installs prerequisites, generates a secret key, builds the containers, and opens your browser.

**Works on:** macOS (Intel + Apple Silicon), Linux, Windows via WSL2.

### Starting / stopping after first setup

```bash
./start.sh   # start containers + open browser
./stop.sh    # trigger backup, then shut down
```

---

## What you need

| Requirement | Notes |
|---|---|
| **Docker Desktop** | [macOS](https://docs.docker.com/desktop/install/mac-install/) · [Linux](https://docs.docker.com/engine/install/) · [Windows/WSL2](https://docs.docker.com/desktop/install/windows-install/) |
| **bash** | Pre-installed on macOS & Linux. Windows users: use WSL2 |

No Python, Node, or any other tool needed on the host machine.

---

## Services

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs (Swagger) | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

---

## Features

### 📥 Transaction Import
- **PDF bank statements** — Chase, Bank of America, Amex, and more parsed automatically
- **Apple Pay / CSV** — drag-and-drop import from any institution
- **Duplicate detection** — hash-based dedup so re-importing the same file is safe
- **Review queue** — low-confidence AI results surface for your approval before saving

### 🤖 AI Categorization
- Connects to **Anthropic (Claude)** or **OpenAI (GPT)** — your choice
- Assigns: category, subcategory, Need/Want/Savings, Fixed/Variable, Personal/Work, Reimbursable, Recurring, and tags
- **Confidence routing**: high confidence → auto-apply; medium → review queue; low → red-flag
- **Rules engine**: learns from every edit you make — future imports apply your corrections automatically
- All AI calls send only: internal UUID, date, merchant string, amount, direction — never your name, account numbers, or balances

### 💳 Transactions
- Grid and list views with uniform card sizes
- Filters: date range, account, category, subcategory, merchant, need/want/savings, fixed/variable, and more
- **Sort** by any field including subcategory and account
- **Batch actions**: select multiple rows → bulk categorize (category + subcategory), mark reimbursable, etc.
- Inline edit with full learning feedback loop

### 📊 Budget
- Set budgets at **category level** or **subcategory level** (e.g., Food & Dining → Groceries)
- Copy last month's budgets in one click
- **50/30/20 rule** — customizable targets (default 50/30/20, adjust in the rule editor)
- Visual progress bars with status badges (Safe / Watch / Over)
- Automatic actual vs. budget comparison updated from live transaction data

### 📈 Analytics
- 20+ charts: spending over time, category breakdown, income vs. expenses, day-of-week patterns, merchant heat maps, and more
- Clean hover tooltips with no distracting grey backgrounds
- Month-to-month comparison

### 💰 Accounts
- Track any number of checking, savings, credit card, and investment accounts
- Per-account transaction filtering

### 💸 Reimbursements
- Mark transactions as reimbursable at import or edit time
- Kanban-style tracking board (submitted → pending → received)
- Net personal cost automatically subtracted from budget actuals

### 🔁 Subscriptions
- Auto-detected recurring charges linked to subscription records
- Rate subscriptions by value and usage to find ones to cut

### ✈️ Trips
- Attach transactions to a business or personal trip
- Per-trip budget and actual spend summary

### 📱 iOS Shortcut
- Log transactions from your iPhone: `POST http://YOUR_MAC_IP:8000/api/ios/transaction`
- Setup instructions in Settings → iOS Shortcut

### 📧 Email Reports
- Monthly finance summary email on a configurable day of month
- Expense upload reminder nudge (configurable day)
- Supports any SMTP provider — Gmail, Outlook, etc.
- Configure in Settings → Email Reports

### 🎨 Appearance & Personalization
- Light / Dark mode
- **15 currency options** — USD, EUR, GBP, JPY, CAD, AUD, CHF, INR, MXN, BRL, CNY, KRW, SGD, SEK, NOK
- Custom categories and subcategories
- Configurable 50/30/20 split targets

### 🔒 Security
- Local-only authentication — no cloud account
- Password + optional **Touch ID / WebAuthn** biometric login
- Session tokens never leave your machine

### 💾 Backup & Export
- Automatic backup on every `./stop.sh`
- Manual backup trigger via Settings or API
- Export transactions as **CSV, Excel, JSON, or PDF**

### 🪙 Finny the Mascot
- A friendly coin character that roams your dashboard
- Context-aware tips and navigation hints
- Click Finny for a page-specific tip; dismiss with the × when you're busy

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
| AI insights | Sends: aggregated category totals and percentage breakdowns — no individual transactions |
| Backups | Written to `~/Finance/Backups/` on your local machine |

---

## Settings Overview

| Tab | What's here |
|---|---|
| Accounts & Income | Manage credit cards, bank accounts, income schedules |
| Categories & Rules | Custom categories, merchant rules, 50/30/20 budget rule |
| AI Configuration | Provider (Anthropic/OpenAI), models, API keys, insights opt-in |
| iOS Shortcut | Endpoint URL and setup guide for the iPhone shortcut |
| Appearance | Theme, currency, display preferences |
| Email Reports | Monthly report + upload reminder config (SMTP) |
| Backup & Export | Manual backup, export formats, backup path |
| Security | Password change, biometric enrollment |
| System Health | Live status of API, auth, AI, backup, and privacy settings |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker Compose                                 │
│                                                 │
│  ┌──────────────┐   ┌──────────────┐            │
│  │   Frontend   │   │   Backend    │            │
│  │  React + TS  │◄──│  FastAPI     │            │
│  │  Vite + TW   │   │  Python 3.12 │            │
│  │  :3000       │   │  :8000       │            │
│  └──────────────┘   └──────┬───────┘            │
│                            │                    │
│                     ┌──────▼───────┐            │
│                     │  PostgreSQL  │            │
│                     │  :5432       │            │
│                     └──────────────┘            │
└─────────────────────────────────────────────────┘
         ▲ All on your local machine ▲
```

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, Zustand

**Backend:** FastAPI, SQLAlchemy 2.0 (async), asyncpg, Pydantic v2, pdfplumber

**AI:** Anthropic Claude / OpenAI GPT — configurable per feature (categorization vs. insights)

---

## Troubleshooting

**Containers won't start**
```bash
docker compose logs backend
docker compose logs frontend
```

**Database issue after update**
Migrations run automatically on every startup. If something breaks:
```bash
docker compose down
docker compose up -d --build
```

**Frontend not loading**
The frontend dev server installs dependencies on first start — this can take 1–2 minutes. Check:
```bash
docker compose logs frontend
```

**Forgotten password**
Reset via the API (running locally):
```bash
curl -X POST http://localhost:8000/api/auth/reset-password-dev \
  -H "Content-Type: application/json" \
  -d '{"new_password": "newpassword"}'
```
