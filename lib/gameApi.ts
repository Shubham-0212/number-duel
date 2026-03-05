import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { genRoomCode10, clampInt } from "./utils";
import { MatchDoc, PlayerState } from "./gameTypes";

const matchesCol = collection(db, "matches");

function initialPlayerState(): PlayerState {
  return { secret: null, rangeMin: 1, rangeMax: 99, ready: false };
}

function now() {
  return Date.now();
}

export async function createPrivateMatch(myUid: string, myName: string) {
  const code = genRoomCode10();
  const MatchDoc = {
    mode: "private",
    code,
    status: "waiting",
    playerCount: 1,
    createdAt: now(),
    players: [{ uid: myUid, name: myName }],
    turnUid: null,
    state: { [myUid]: initialPlayerState() },
    history: [],
    winnerUid: null,
  };
  const ref = await addDoc(matchesCol, MatchDoc as any);
  return { matchId: ref.id, code };
}

export async function joinPrivateMatchByCode(code: string, myUid: string, myName: string) {
  // find waiting private match with that code
  const q = query(
    matchesCol,
    where("mode", "==", "private"),
    where("code", "==", code),
    where("status", "==", "waiting"),
    where("playerCount", "==", 1),
    limit(5)
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("Room not found or already started.");

  // Try each candidate in a transaction (rare collisions)
  for (const d of snap.docs) {
    const ref = doc(db, "matches", d.id);
    try {
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists()) throw new Error("Room missing");
        const data = cur.data() as MatchDoc;

        if (data.status !== "waiting") throw new Error("Already started");
        if (data.players.length >= 2) throw new Error("Room is full");

        if (data.players.some((p) => p.uid === myUid)) return; // already joined

        const players = [...data.players, { uid: myUid, name: myName }];
        const playerCount = players.length;
        const state = { ...data.state, [myUid]: initialPlayerState() };

        // activate match
        const turnUid = players[0].uid; // first player starts (simple)
        tx.update(ref, { players,playerCount, state, status: "active", turnUid });
      });

      return { matchId: d.id };
    } catch {
      // try next
    }
  }

  throw new Error("Could not join room. Try again.");
}

export async function findOrCreateRandomMatch(myUid: string, myName: string) {
  // Find a waiting random match with exactly 1 player
  const q = query(
    matchesCol,
    where("mode", "==", "random"),
    where("status", "==", "waiting"),
    where("playerCount", "==", 1),
    limit(10)
  );
  const snap = await getDocs(q);

  // Try join first suitable match
  for (const d of snap.docs) {
    const ref = doc(db, "matches", d.id);
    try {
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(ref);
        if (!cur.exists()) throw new Error("Missing");
        const data = cur.data() as MatchDoc;

        if (data.status !== "waiting") throw new Error("Not waiting");
        if ((data.playerCount ?? data.players.length) >= 2) throw new Error("Full");
        if (data.players.some((p) => p.uid === myUid)) return;

        const players = [...data.players, { uid: myUid, name: myName }];
        const state = { ...data.state, [myUid]: initialPlayerState() };
        const turnUid = players[0].uid;

        tx.update(ref, {
          players,
          playerCount: players.length,
          state,
          status: "active",
          turnUid,
        });
      });

      return { matchId: d.id };
    } catch {
      // try next
    }
  }

  // Else create new waiting random match
  const MatchDoc = {
    mode: "random",
    code: null,
    status: "waiting",
    playerCount: 1,
    createdAt: now(),
    players: [{ uid: myUid, name: myName }],
    turnUid: null,
    state: { [myUid]: initialPlayerState() },
    history: [],
    winnerUid: null,
  };
  const ref = await addDoc(matchesCol, MatchDoc as any);
  return { matchId: ref.id };
}

export async function setMySecret(matchId: string, myUid: string, secret: number) {
  secret = clampInt(Math.floor(secret), 1, 99);

  const ref = doc(db, "matches", matchId);
  await runTransaction(db, async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists()) throw new Error("Match not found");
    const data = cur.data() as MatchDoc;

    if (data.status === "finished") throw new Error("Match finished");
    if (!data.players.some((p) => p.uid === myUid)) throw new Error("Not in match");

    const st = { ...(data.state || {}) };
    const mine = st[myUid] || initialPlayerState();
    mine.secret = secret;
    mine.ready = true;
    mine.rangeMin = 1;
    mine.rangeMax = 99;
    st[myUid] = mine;

    // If both players ready, ensure turnUid exists
    const bothReady =
      data.players.length === 2 &&
      data.players.every((p) => st[p.uid]?.ready);

    const updates: any = { state: st };
    if (bothReady && !data.turnUid) updates.turnUid = data.players[0].uid;
    if (data.status === "waiting" && data.players.length === 2) updates.status = "active";

    tx.update(ref, updates);
  });
}

export async function submitGuess(matchId: string, myUid: string, guess: number) {
  guess = clampInt(Math.floor(guess), 1, 99);

  const ref = doc(db, "matches", matchId);

  await runTransaction(db, async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists()) throw new Error("Match not found");
    const data = cur.data() as MatchDoc;

    if (data.status !== "active") throw new Error("Match not active");
    if (data.winnerUid) throw new Error("Already finished");
    if (!data.turnUid) throw new Error("Turn not set");
    if (data.turnUid !== myUid) throw new Error("Not your turn");

    if (data.players.length !== 2) throw new Error("Waiting for opponent");

    const opponent = data.players.find((p) => p.uid !== myUid)!;
    const oppUid = opponent.uid;

    const st = { ...(data.state || {}) };
    const oppState = st[oppUid];
    const myState = st[myUid];

    if (!oppState?.ready || !myState?.ready) throw new Error("Both players must set secret");

    // Validate guess is within opponent range (optional but nice)
    if (guess < oppState.rangeMin || guess > oppState.rangeMax) {
      throw new Error(`Guess must be between ${oppState.rangeMin} and ${oppState.rangeMax}`);
    }

    const secret = oppState.secret;
    if (typeof secret !== "number") throw new Error("Opponent secret not set");

    let hint: "higher" | "lower" | "correct";
    if (guess < secret) hint = "higher";
    else if (guess > secret) hint = "lower";
    else hint = "correct";

    // Update opponent range based on hint
    const nextOpp = { ...oppState };
    if (hint === "higher") nextOpp.rangeMin = Math.max(nextOpp.rangeMin, guess + 1);
    if (hint === "lower") nextOpp.rangeMax = Math.min(nextOpp.rangeMax, guess - 1);

    st[oppUid] = nextOpp;

    const history = Array.isArray(data.history) ? [...data.history] : [];
    history.push({
      byUid: myUid,
      targetUid: oppUid,
      guess,
      hint,
      at: now(),
    });

    const updates: any = { state: st, history };

    if (hint === "correct") {
      updates.status = "finished";
      updates.winnerUid = myUid;
      updates.turnUid = null;
    } else {
      updates.turnUid = oppUid; // switch turn
    }

    tx.update(ref, updates);
  });
}