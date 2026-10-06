export type Team = {
  id: number;
  name: string;
};

export type AvailabilityStatus = "active" | "doubtful" | "injured" | "suspended";

export type Player = {
  id: number;
  name: string;
  position: string;
  team: Team;
  availability: {
    player_id: number;
    status: AvailabilityStatus;
    updated_at: string;
  } | null;
};

export type FormationName = "4-3-3" | "4-4-2" | "3-5-2";

export type FormationSlot = {
  line: "GK" | "DEF" | "MID" | "FWD";
  x: number;
  y: number;
};

export type Side = "home" | "away";

export type PitchPosition = {
  x: number;
  y: number;
};

export type PlayerPositions = Record<Side, Record<number, PitchPosition>>;

export type HistoricalResultFilter = "all" | "win" | "draw" | "loss";

export type HistoricalMetric = {
  total: number | null;
  mean_per_measured_player: number | null;
  measured_player_count: number;
};

export type HistoricalPhysicalSide = {
  distance: HistoricalMetric;
  sprints: HistoricalMetric;
};

export type HistoricalPlayerMeasurement = {
  player_id: number;
  player_name: string;
  team_id: number;
  distance_covered_meters: number | null;
  sprint_count: number | null;
};

export type HistoricalMatch = {
  id: number;
  kickoff_at: string;
  home_team: Team;
  away_team: Team;
  selected_team: Team;
  opponent: Team;
  venue_context: "home" | "away";
  result: "win" | "draw" | "loss" | null;
  goals_for: number | null;
  goals_against: number | null;
  physical_comparison: {
    selected_team: HistoricalPhysicalSide;
    opponent: HistoricalPhysicalSide;
    selected_minus_opponent: {
      distance_total: number | null;
      sprint_total: number | null;
    };
  } | null;
  players: HistoricalPlayerMeasurement[];
};

export type HistoricalSummary = {
  data_label: string;
  match_count: number;
  results: { wins: number; draws: number; losses: number };
  physical_averages: {
    distance: {
      selected_team_average_total: number | null;
      opponent_average_total: number | null;
      selected_team_average_per_measured_player: number | null;
      opponent_average_per_measured_player: number | null;
      selected_minus_opponent_average_delta: number | null;
    };
    sprints: {
      selected_team_average_total: number | null;
      opponent_average_total: number | null;
      selected_team_average_per_measured_player: number | null;
      opponent_average_per_measured_player: number | null;
      selected_minus_opponent_average_delta: number | null;
    };
  };
  measurement_coverage: Record<string, Record<string, {
    measured_player_appearances: number;
    player_appearances: number;
    percentage: number | null;
  }>>;
};
