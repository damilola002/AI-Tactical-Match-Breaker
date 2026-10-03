import { useEffect, useState } from "react";
import TacticalBoard from "./components/TacticalBoard";
import type { Team } from "./types";

type HealthResponse = {
  status: string;
  database: string;
};

type TeamResponse = {
  data_label: string;
  count: number;
  items: Team[];
};

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [dataLabel, setDataLabel] = useState("DEMO DATA — fictional examples");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/health").then(async (response) => {
        if (!response.ok) throw new Error(`Health check returned HTTP ${response.status}`);
        return (await response.json()) as HealthResponse;
      }),
      fetch("/api/teams").then(async (response) => {
        if (!response.ok) throw new Error(`Could not load teams (HTTP ${response.status})`);
        return (await response.json()) as TeamResponse;
      }),
    ])
      .then(([healthResult, teamResult]) => {
        if (!active) return;
        setHealth(healthResult);
        setTeams(teamResult.items);
        setDataLabel(teamResult.data_label);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load the demo data.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Matchday home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>TOUCHLINE<span className="brand-dot">.</span></span>
        </a>
        <div className="topbar-meta">
          <span className="season-label">TACTICAL LAB <span>·</span> 2026</span>
          <span className={`api-status ${health ? "is-online" : ""}`}>
            <span className="api-status-dot" />
            {health ? `API ${health.status}` : "CONNECTING"}
          </span>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" /> MATCH PREPARATION · BOARD 01</p>
          <h1>Shape the <em>matchup.</em></h1>
          <p className="hero-copy">
            Set two sides on the pitch. Choose a shape, assign your squad, and compare the formations.
          </p>
        </div>
        <div className="data-stamp">
          <span className="stamp-icon" aria-hidden="true">✳</span>
          <span>{dataLabel}</span>
        </div>
      </section>

      {error ? (
        <section className="load-error" role="alert">
          <strong>We couldn’t load the board data.</strong>
          <span>{error}</span>
          <span>Check that the Phase 2 API is running, then refresh.</span>
        </section>
      ) : teams.length === 0 ? (
        <section className="loading-state" aria-live="polite">Loading demo teams and squad data…</section>
      ) : (
        <TacticalBoard teams={teams} />
      )}

      <footer className="page-footer">
        <span>TOUCHLINE TACTICAL LAB</span>
        <span>FORMATION COMPARISON <i>·</i> DEMO DATA</span>
      </footer>
    </main>
  );
}
