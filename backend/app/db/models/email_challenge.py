from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmailChallenge(Base):
    """A pending email verification (register) or password reset.

    The verification code is stored only as a keyed HMAC, never in plaintext. For
    registration the account does not yet exist, so the pending password hash lives
    here and ``user_id`` is null until verification creates the account — abandoned
    registrations therefore never leave a permanent unusable user behind.
    """

    __tablename__ = "email_challenges"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE")
    )
    code_hmac: Mapped[str] = mapped_column(Text, nullable=False)
    # pending argon2 hash for register challenges; null for reset
    password_hash: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("purpose IN ('register', 'reset')", name="purpose_known"),
        Index("ix_email_challenges_email_purpose", "email", "purpose"),
    )
