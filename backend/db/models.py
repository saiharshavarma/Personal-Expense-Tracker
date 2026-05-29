import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Any

import sqlalchemy as sa
from sqlalchemy import (
    String, Integer, Boolean, Text, Date, DateTime, Numeric,
    BigInteger, Computed, ForeignKey, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db.database import Base


def _uuid():
    return uuid.uuid4()


# ============================================================
# Account
# ============================================================
class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    institution: Mapped[Optional[str]] = mapped_column(String(255))
    last_four: Mapped[Optional[str]] = mapped_column(String(4))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    color: Mapped[Optional[str]] = mapped_column(String(7))
    icon: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="account", foreign_keys="Transaction.account_id")
    subscriptions: Mapped[List["Subscription"]] = relationship("Subscription", back_populates="account")
    import_batches: Mapped[List["ImportBatch"]] = relationship("ImportBatch", back_populates="account")
    income_schedules: Mapped[List["IncomeSchedule"]] = relationship("IncomeSchedule", back_populates="account")


# ============================================================
# Trip
# ============================================================
class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    destination: Mapped[Optional[str]] = mapped_column(String(255))
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    trip_type: Mapped[Optional[str]] = mapped_column(String(20))
    budget: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(20), default="planning")
    expense_tool: Mapped[Optional[str]] = mapped_column(String(255))
    expense_tool_reference: Mapped[Optional[str]] = mapped_column(String(255))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="trip")


# ============================================================
# ReimbursementBatch
# ============================================================
class ReimbursementBatch(Base):
    __tablename__ = "reimbursement_batches"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[Optional[str]] = mapped_column(String(255))
    source: Mapped[Optional[str]] = mapped_column(String(50))
    submitted_date: Mapped[Optional[date]] = mapped_column(Date)
    expected_payment_date: Mapped[Optional[date]] = mapped_column(Date)
    total_submitted: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    total_received: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    status: Mapped[str] = mapped_column(String(50), default="draft")
    expense_tool: Mapped[Optional[str]] = mapped_column(String(255))
    submission_reference: Mapped[Optional[str]] = mapped_column(String(255))
    submission_method: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="reimbursement_batch")


# ============================================================
# Subscription
# ============================================================
class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    billing_frequency: Mapped[Optional[str]] = mapped_column(String(50))
    next_billing_date: Mapped[Optional[date]] = mapped_column(Date)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    subcategory: Mapped[Optional[str]] = mapped_column(String(100))
    personal_work_shared: Mapped[Optional[str]] = mapped_column(String(20))
    is_reimbursable: Mapped[bool] = mapped_column(Boolean, default=False)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    value_rating: Mapped[Optional[int]] = mapped_column(Integer)
    usage_rating: Mapped[Optional[str]] = mapped_column(String(20))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="subscriptions")
    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="subscription")


# ============================================================
# ImportBatch
# ============================================================
class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    filename: Mapped[Optional[str]] = mapped_column(String(500))
    source_type: Mapped[Optional[str]] = mapped_column(String(50))
    institution: Mapped[Optional[str]] = mapped_column(String(255))
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"))
    total_transactions: Mapped[int] = mapped_column(Integer, default=0)
    imported_transactions: Mapped[int] = mapped_column(Integer, default=0)
    skipped_duplicates: Mapped[int] = mapped_column(Integer, default=0)
    needs_review_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="processing")
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="import_batches")
    transactions: Mapped[List["Transaction"]] = relationship("Transaction", back_populates="import_batch")


# ============================================================
# Transaction
# ============================================================
class Transaction(Base):
    __tablename__ = "transactions"
    # L-12: Guard against negative amounts at the DB level. All monetary values
    # stored in `amount` represent absolute magnitudes; directionality is expressed
    # via the `direction` column ("debit" / "credit"), not a sign on `amount`.
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_transactions_amount_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    posted_date: Mapped[Optional[date]] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    description_clean: Mapped[Optional[str]] = mapped_column(String(500))
    merchant: Mapped[Optional[str]] = mapped_column(String(255))
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"))
    transaction_type: Mapped[Optional[str]] = mapped_column(String(50))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    subcategory: Mapped[Optional[str]] = mapped_column(String(100))
    need_want_savings: Mapped[Optional[str]] = mapped_column(String(20))
    fixed_variable: Mapped[Optional[str]] = mapped_column(String(20))
    personal_work_shared: Mapped[Optional[str]] = mapped_column(String(20))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    tags = sa.Column(ARRAY(Text()), nullable=True)
    # ── Reimbursement fields ──────────────────────────────────────────────────
    # L-13: Relationship between is_reimbursable and reimbursement_status:
    #   is_reimbursable=False  →  reimbursement_status MUST be "not_reimbursable"
    #   is_reimbursable=True   →  reimbursement_status ∈ {to_submit, submitted,
    #                              approved, paid, partial, rejected}
    # "not_reimbursable" is the only status that may appear when is_reimbursable
    # is False. Conversely, a reimbursable transaction should never sit at
    # "not_reimbursable" — use "to_submit" as the default for those rows.
    is_reimbursable: Mapped[bool] = mapped_column(Boolean, default=False)
    reimbursement_source: Mapped[Optional[str]] = mapped_column(String(50))
    reimbursement_status: Mapped[str] = mapped_column(String(50), default="not_reimbursable")
    expected_reimbursement: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    received_reimbursement: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    # Generated column — never set from Python
    net_personal_cost = sa.Column(
        Numeric(12, 2),
        Computed("amount - COALESCE(received_reimbursement, 0)", persisted=True),
        nullable=True,
    )
    reimbursement_due_date: Mapped[Optional[date]] = mapped_column(Date)
    reimbursement_received_date: Mapped[Optional[date]] = mapped_column(Date)
    reimbursement_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("reimbursement_batches.id", ondelete="SET NULL"))
    # work/travel
    business_trip_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("trips.id", ondelete="SET NULL"))
    company_expense_category: Mapped[Optional[str]] = mapped_column(String(255))
    expense_tool: Mapped[Optional[str]] = mapped_column(String(255))
    # recurring
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    frequency: Mapped[Optional[str]] = mapped_column(String(50))
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"))
    # investment
    investment_ticker: Mapped[Optional[str]] = mapped_column(String(20))
    investment_action: Mapped[Optional[str]] = mapped_column(String(20))
    investment_shares: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6))
    investment_price_per_share: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4))
    # import metadata
    source: Mapped[str] = mapped_column(String(50), default="manual")
    import_batch_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("import_batches.id", ondelete="SET NULL"))
    raw_text: Mapped[Optional[str]] = mapped_column(Text)
    duplicate_hash: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    # AI metadata
    ai_category: Mapped[Optional[str]] = mapped_column(String(100))
    ai_subcategory: Mapped[Optional[str]] = mapped_column(String(100))
    ai_confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(4, 3))
    ai_flags = sa.Column(ARRAY(Text()), nullable=True)
    ai_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="transactions", foreign_keys=[account_id])
    trip: Mapped[Optional["Trip"]] = relationship("Trip", back_populates="transactions")
    reimbursement_batch: Mapped[Optional["ReimbursementBatch"]] = relationship("ReimbursementBatch", back_populates="transactions")
    subscription: Mapped[Optional["Subscription"]] = relationship("Subscription", back_populates="transactions")
    import_batch: Mapped[Optional["ImportBatch"]] = relationship("ImportBatch", back_populates="transactions")


# ============================================================
# Budget
# ============================================================
class Budget(Base):
    __tablename__ = "budgets"
    # Uniqueness is enforced by partial indexes created in the migration (main.py)
    # and NOT by a table-level UniqueConstraint, which would conflict with those indexes.

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    subcategory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    budget_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    needs_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    wants_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    savings_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================
# IncomeSchedule
# ============================================================
class IncomeSchedule(Base):
    __tablename__ = "income_schedules"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    frequency: Mapped[Optional[str]] = mapped_column(String(50))
    custom_days = sa.Column(ARRAY(Integer()), nullable=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    account: Mapped[Optional["Account"]] = relationship("Account", back_populates="income_schedules")


# ============================================================
# MerchantRule
# ============================================================
class MerchantRule(Base):
    __tablename__ = "merchant_rules"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    pattern: Mapped[str] = mapped_column(String(500), nullable=False)
    match_type: Mapped[Optional[str]] = mapped_column(String(20))
    merchant_clean: Mapped[Optional[str]] = mapped_column(String(255))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    subcategory: Mapped[Optional[str]] = mapped_column(String(100))
    need_want_savings: Mapped[Optional[str]] = mapped_column(String(20))
    fixed_variable: Mapped[Optional[str]] = mapped_column(String(20))
    is_reimbursable: Mapped[Optional[bool]] = mapped_column(Boolean)
    personal_work_shared: Mapped[Optional[str]] = mapped_column(String(20))
    is_recurring: Mapped[Optional[bool]] = mapped_column(Boolean)
    tags = sa.Column(ARRAY(Text()), nullable=True)
    confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), default=Decimal("1.0"))
    times_applied: Mapped[int] = mapped_column(Integer, default=0)
    times_overridden: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================
# UserPreferences (single row, id=1)
# ============================================================
class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_budget_rule = sa.Column(JSONB, default={"needs": 50, "wants": 30, "savings": 20})
    # Global budget templates: list of {category, subcategory, amount} dicts
    # used as defaults when creating a new monthly budget via "Apply Templates".
    budget_templates = sa.Column(JSONB, default=list, nullable=True)
    theme: Mapped[str] = mapped_column(String(20), default="light")
    default_account_id: Mapped[Optional[uuid.UUID]] = mapped_column(PgUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"))
    ai_provider: Mapped[str] = mapped_column(String(50), default="anthropic")
    ai_model_categorization: Mapped[str] = mapped_column(String(100), default="claude-haiku-4-5-20251001")
    ai_model_insights: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-5")
    ai_insights_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)
    anthropic_api_key: Mapped[Optional[str]] = mapped_column(Text)
    openai_api_key: Mapped[Optional[str]] = mapped_column(Text)
    expense_tool_name: Mapped[Optional[str]] = mapped_column(String(255))
    backup_path: Mapped[str] = mapped_column(Text, default="~/Finance/Backups")
    backup_to_icloud: Mapped[bool] = mapped_column(Boolean, default=True)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    dashboard_layout = sa.Column(JSONB, nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    password_hash: Mapped[Optional[str]] = mapped_column(Text)
    webauthn_credential = sa.Column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================
# BackupLog
# ============================================================
class BackupLog(Base):
    __tablename__ = "backup_log"

    id: Mapped[uuid.UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=_uuid)
    backup_path: Mapped[Optional[str]] = mapped_column(Text)
    backup_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ============================================================
# DbChangeLog
# ============================================================
class DbChangeLog(Base):
    __tablename__ = "db_change_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    table_name: Mapped[Optional[str]] = mapped_column(String(100))
    operation: Mapped[Optional[str]] = mapped_column(String(10))
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
