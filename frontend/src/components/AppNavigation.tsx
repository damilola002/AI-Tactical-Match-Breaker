import type { AppPage } from "../types.ts";

const pages: { page: AppPage; hash: string; label: string; number: string }[] = [
  { page: "planner", hash: "#/planner", label: "Formation Planner", number: "01" },
  { page: "board", hash: "#/board", label: "Tactical Board", number: "02" },
  { page: "reports", hash: "#/reports", label: "Reports", number: "03" },
  { page: "players", hash: "#/players", label: "Player Profiles", number: "04" },
];

export default function AppNavigation({ activePage }: { activePage: AppPage }) {
  return (
    <nav className="app-navigation" aria-label="Main navigation">
      {pages.map((item) => (
        <a
          key={item.page}
          href={item.hash}
          className={`app-navigation-link${activePage === item.page ? " is-active" : ""}`}
          aria-current={activePage === item.page ? "page" : undefined}
        >
          <span className="app-navigation-number">{item.number}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}
