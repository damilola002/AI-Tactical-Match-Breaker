import os
from collections.abc import Generator

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def sqlalchemy_database_url(database_url: str) -> str:
    """Use psycopg 3 as SQLAlchemy's PostgreSQL driver."""
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def create_database_engine(database_url: str) -> Engine:
    return create_engine(sqlalchemy_database_url(database_url), pool_pre_ping=True)


DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_database_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False) if engine else None


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database is not configured")

    with SessionLocal() as session:
        yield session
