import os

import psycopg
from fastapi import FastAPI, HTTPException

app = FastAPI(title="AI Tactical Match-Breaker API")


@app.get("/api/health")
def health_check() -> dict[str, str]:
    """Report backend availability and verify PostgreSQL connectivity."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="Database is not configured")

    try:
        with psycopg.connect(database_url, connect_timeout=3) as connection:
            connection.execute("SELECT 1")
    except psycopg.Error as error:
        raise HTTPException(status_code=503, detail="Database is unavailable") from error

    return {"status": "healthy", "database": "connected"}
