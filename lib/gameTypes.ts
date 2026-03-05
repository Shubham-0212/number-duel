export type MatchStatus = "waiting" | "active" | "finished";
export type MatchMode = "random" | "private";

export type Player = { uid: string; name: string };

export type GuessEvent = {
  byUid: string;
  targetUid: string;
  guess: number;
  hint: "higher" | "lower" | "correct";
  at: number; // Date.now()
};

export type PlayerState = {
  secret: number | null; // MVP (stored in Firestore). For anti-cheat, don’t store it.
  rangeMin: number;
  rangeMax: number;
  ready: boolean;
};

export type MatchDoc = {
  mode: MatchMode;
  code?: string | null;
  status: MatchStatus;
  createdAt: number;
  players: Player[];
  turnUid: string | null;
  state: Record<string, PlayerState>; // key=uid
  history: GuessEvent[];
  winnerUid: string | null;
};