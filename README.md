# Finance Dashboard

A local-first personal finance dashboard. All processing happens on your machine — your bank data never leaves your computer.

## Requirements

- **Docker Desktop** (macOS) — [download here](https://www.docker.com/products/docker-desktop/)
- **bash** (pre-installed on macOS)

That's it. No Python, Node, or any other tools needed on your host machine.

## Quick Start

### Option A — Double-click app
Double-click **Finance Dashboard.app** in Finder. It will open a Terminal window and start everything automatically.

### Option B — Terminal
```bash
./start.sh
```

The app will be available at **http://localhost:3000**.

## Stopping

```bash
./stop.sh
```

This triggers a backup before shutting down containers.

## First Launch

On first launch you'll be prompted to create a password and optionally enroll TouchID. This is local-only authentication — no account creation, no cloud sign-in.

## Services

| Service   | URL                          |
|-----------|------------------------------|
| Frontend  | http://localhost:3000        |
| Backend   | http://localhost:8000        |
| API docs  | http://localhost:8000/docs   |
| Postgres  | localhost:5432               |

## Configuration

Copy `.env.example` to `.env` (done automatically on first run) and optionally set:

```env
ANTHROPIC_API_KEY=sk-ant-...   # For AI categorization + insights (Claude)
OPENAI_API_KEY=sk-...          # Alternative AI provider
```

AI features are **opt-in** and only receive aggregated statistics — never raw transaction data.

## Privacy & Security

- Bank PDFs are parsed locally inside Docker containers
- Raw statement files are never stored after parsing
- AI categorization sends only: internal UUID, date, merchant string, amount, direction
- AI insights send only: aggregated category totals and percentage breakdowns
- **Never sent to any external API:** account numbers, card numbers, your name, bank IDs, balances, or individual transactions

## Data Storage

Your financial data is stored in a PostgreSQL database inside a Docker volume (`postgres_data`). Backups are written to `~/Finance/Backups/`.

## iOS Shortcut

Log transactions from your iPhone: `POST http://YOUR_MAC_IP:8000/api/ios/transaction`

See Settings → iOS Shortcut for setup instructions.

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Foundation: Docker, DB, API skeleton, React shell, Auth |
| 2 | 🔜 | Accounts CRUD + Transaction table + filters |
| 3 | 🔜 | PDF import (Chase, BoA, Amex) + Apple Pay CSV + dedup |
| 4 | 🔜 | AI categorization pipeline + rules engine |
| 5 | 🔜 | Budget system + 50/30/20 tracker |
| 6 | 🔜 | Reimbursements kanban + Splitwise tracker |
| 7 | 🔜 | Subscriptions grid + quarterly audit |
| 8 | 🔜 | Trip manager + expense tracking |
| 9 | 🔜 | Analytics (24 charts) |
| 10 | 🔜 | Dashboard widgets (drag/resize) |
| 11 | 🔜 | Ask AI (aggregated insights) |
| 12 | 🔜 | Export (CSV/PDF/JSON/Excel) + backup system |
| 13 | 🔜 | iOS endpoint + all Settings fully wired |
| 14 | 🔜 | Polish: animations, onboarding, error boundaries |
