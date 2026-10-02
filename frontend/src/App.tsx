import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  database: string;
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }
        return (await response.json()) as HealthResponse;
      })
      .then((result) => {
        if (active) setHealth(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not reach the backend.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <section className="status-card" aria-labelledby="page-title">
        <p className="eyebrow">APPLICATION SKELETON · PHASE 1</p>
        <h1 id="page-title">AI Tactical Match-Breaker</h1>
        <p className="intro">
          A local connection check from the React interface through FastAPI to
          PostgreSQL.
        </p>

        <div className="connection-panel" aria-live="polite">
          {health ? (
            <>
              <span className="status-indicator" aria-hidden="true" />
              <div>
                <strong>Backend response received</strong>
                <p>API status: {health.status}</p>
                <p>PostgreSQL: {health.database}</p>
              </div>
            </>
          ) : error ? (
            <>
              <span className="status-indicator status-indicator--error" aria-hidden="true" />
              <div>
                <strong>Connection check failed</strong>
                <p>{error}</p>
              </div>
            </>
          ) : (
            <>
              <span className="status-indicator status-indicator--loading" aria-hidden="true" />
              <div>
                <strong>Checking local services</strong>
                <p>Waiting for the backend response…</p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
