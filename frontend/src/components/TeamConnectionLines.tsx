import type { TeamConnection } from "../analysis/teamConnections.ts";

export default function TeamConnectionLines({ connections }: { connections: TeamConnection[] }) {
  return (
    <svg
      className="pitch-connection-lines"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {connections.map((connection) => (
        <line
          key={connection.id}
          className={`pitch-connection-line pitch-connection-line--${connection.side}`}
          x1={connection.start.x}
          y1={connection.start.y}
          x2={connection.end.x}
          y2={connection.end.y}
        />
      ))}
    </svg>
  );
}
