from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.database import engine, Base
from api import auth, accounts, transactions, budgets, reimbursements, \
    subscriptions, trips, analytics, import_routes, ios, ai_insights, export, backup


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
    yield
    await engine.dispose()


app = FastAPI(
    title="Finance Dashboard API",
    version="1.0.0",
    description="Local personal finance dashboard — all data stays on your machine.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
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
