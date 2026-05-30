from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.database import engine, Base
from api import auth, accounts, transactions, budgets, reimbursements, \
    subscriptions, trips, analytics, import_routes, ios, ai_insights, export, backup, preferences, rules, email_reports, system, product_analytics


_MIGRATIONS = [
    # 2026-05: Expand merchant_rules with fixed_variable + tags columns
    "ALTER TABLE merchant_rules ADD COLUMN IF NOT EXISTS fixed_variable VARCHAR(20)",
    "ALTER TABLE merchant_rules ADD COLUMN IF NOT EXISTS tags TEXT[]",
    # 2026-05: Currency preference
    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD'",
    # 2026-05: Global budget templates for monthly budget defaults
    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS budget_templates JSONB DEFAULT '[]'::jsonb",
    # 2026-05: Local password recovery token hash
    "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS recovery_token_hash TEXT",
    # 2026-05: Budget subcategory support
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS subcategory VARCHAR(100)",
    # Drop old unique constraint so partial indexes can take over
    "ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_month_year_category_key",
    # Partial index: category-level budgets (subcategory IS NULL) must be unique per (month, year, category)
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_cat_only ON budgets (month, year, category) WHERE subcategory IS NULL",
    # Partial index: subcategory-level budgets must be unique per (month, year, category, subcategory)
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_budgets_cat_sub ON budgets (month, year, category, subcategory) WHERE subcategory IS NOT NULL",
    # 2026-05: Performance indexes for hot transaction query paths
    "CREATE INDEX IF NOT EXISTS ix_transactions_date ON transactions (date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_transactions_account_date ON transactions (account_id, date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_transactions_category ON transactions (category) WHERE category IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_transactions_direction_date ON transactions (direction, date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_transactions_needs_review ON transactions (needs_review) WHERE needs_review = TRUE",
    # 2026-05: Performance index for budget actuals query
    "CREATE INDEX IF NOT EXISTS ix_budgets_month_year ON budgets (month, year)",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        # Apply idempotent column migrations for tables that already exist
        from sqlalchemy import text
        for stmt in _MIGRATIONS:
            await conn.execute(text(stmt))

    # Start background email scheduler
    from services.email_reports import start_scheduler
    start_scheduler()

    yield

    from services.email_reports import stop_scheduler
    stop_scheduler()
    await engine.dispose()


app = FastAPI(
    title="Finance Dashboard API",
    version="1.0.0",
    description="Local personal finance dashboard — all data stays on your machine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-iOS-API-Key"],
)


@app.get("/health")
@app.get("/api/health")  # proxied path for the frontend health-check UI
async def health():
    return {"status": "ok", "version": "1.0.0"}


app.include_router(auth.router, prefix="/api/auth")
app.include_router(accounts.router, prefix="/api/accounts")
app.include_router(transactions.router, prefix="/api/transactions")
app.include_router(budgets.router, prefix="/api/budgets")
app.include_router(reimbursements.router, prefix="/api/reimbursements")
app.include_router(subscriptions.router, prefix="/api/subscriptions")
app.include_router(trips.router, prefix="/api/trips")
app.include_router(analytics.router, prefix="/api/analytics")
app.include_router(import_routes.router, prefix="/api/import")
app.include_router(ios.router, prefix="/api/ios")
app.include_router(ai_insights.router, prefix="/api/ai")
app.include_router(export.router, prefix="/api/export")
app.include_router(backup.router, prefix="/api/backup")
app.include_router(preferences.router, prefix="/api/preferences")
app.include_router(rules.router, prefix="/api/rules")
app.include_router(email_reports.router, prefix="/api/email-reports")
app.include_router(system.router, prefix="/api/system")
app.include_router(product_analytics.router, prefix="/api/app-insights")
