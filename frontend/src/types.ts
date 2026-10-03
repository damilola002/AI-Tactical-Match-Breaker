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
