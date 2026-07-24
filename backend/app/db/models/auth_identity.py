from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# closed set of login methods that can unlock a Loci account; enforced in the db
# so application bugs cannot introduce an unknown provider
PROVIDERS = ("telegram", "google", "email")


class AuthIdentity(Base):
    """A verified way to sign in to one Loci user.

    The Loci user (``users.id``) is the permanent account; an identity is a
    provider-issued credential pointing at it. Identity keys differ per provider:
    telegram/email key on ``provider_subject`` alone, google keys on the
    (issuer, subject) pair — never on email, which is optional metadata only.
    """

    __tablename__ = "auth_identities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    # normalized oidc issuer; null for providers that are not oidc (telegram, email)
    provider_issuer: Mapped[str | None] = mapped_column(Text)
    provider_subject: Mapped[str] = mapped_column(Text, nullable=False)
    # verified email is metadata only and is never an identity key
    verified_email: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "provider IN ('telegram', 'google', 'email')", name="provider_known"
        ),
        # an issuer is present exactly when the provider is oidc (google)
        CheckConstraint(
            "(provider = 'google') = (provider_issuer IS NOT NULL)",
            name="issuer_only_for_google",
        ),
        # a user holds at most one identity per provider
        UniqueConstraint("user_id", "provider", name="uq_auth_identities_user_provider"),
        # telegram/email identities are globally unique by provider + subject
        Index(
            "uq_auth_identities_telegram_subject",
            "provider",
            "provider_subject",
            unique=True,
            postgresql_where=text("provider = 'telegram'"),
        ),
        Index(
            "uq_auth_identities_email_subject",
            "provider",
            "provider_subject",
            unique=True,
            postgresql_where=text("provider = 'email'"),
        ),
        # google identities are unique by issuer + subject
        Index(
            "uq_auth_identities_google_issuer_subject",
            "provider_issuer",
            "provider_subject",
            unique=True,
            postgresql_where=text("provider = 'google'"),
        ),
    )
