"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "../../../lib/firebase";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { MatchDoc } from "../../../lib/gameTypes";
import { setMySecret, submitGuess } from "../../../lib/gameApi";

function getMyName() {
  if (typeof window === "undefined") return "Player";
  return localStorage.getItem("nd_name") || "Player";
}

export default function RoomPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const sp = useSearchParams();
  const router = useRouter();

  const [uid, setUid] = useState("");
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [secret, setSecret] = useState("");
  const [guess, setGuess] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }
      setUid(user.uid);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!matchId) return;
    const ref = doc(db, "matches", matchId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setMatch(null);
        setErr("Room not found.");
        return;
      }
      setMatch(snap.data() as MatchDoc);
      setErr("");
    });
    return () => unsub();
  }, [matchId]);

  const myName = useMemo(() => getMyName(), []);
  const players = match?.players || [];
  const me = players.find((p) => p.uid === uid);
  const opp = players.find((p) => p.uid !== uid);

  const myState = (match?.state && uid && match.state[uid]) || null;
  const oppState = (match?.state && opp?.uid && match.state[opp.uid]) || null;

  const myTurn = match?.turnUid === uid && match?.status === "active";

  const shareCode = sp.get("code") || match?.code || "";

  async function onSetSecret() {
    setErr("");
    const n = Number(secret);
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      setErr("Secret must be between 1 and 99");
      return;
    }
    try {
      await setMySecret(matchId, uid, n);
      setSecret("");
    } catch (e: any) {
      setErr(e?.message || "Failed to set secret");
    }
  }

  async function onGuess() {
    setErr("");
    const n = Number(guess);
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      setErr("Guess must be between 1 and 99");
      return;
    }
    try {
      await submitGuess(matchId, uid, n);
      setGuess("");
    } catch (e: any) {
      setErr(e?.message || "Failed to submit guess");
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const winnerName =
    match?.winnerUid
      ? players.find((p) => p.uid === match.winnerUid)?.name || "Winner"
      : "";

  const shareLink =
    typeof window !== "undefined" && shareCode
      ? `${window.location.origin}/?code=${shareCode}`
      : "";

  return (
    <div style={{ minHeight: "100vh", padding: 18, display: "grid", placeItems: "start center" }}>
      <div style={{ width: "100%", maxWidth: 820 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: "8px 0" }}>Room</h2>
          <button onClick={() => router.push("/")} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #111" }}>
            Back
          </button>
        </div>

        {err && (
          <div style={{ background: "#ffecec", border: "1px solid #ffb3b3", padding: 10, borderRadius: 12, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {!match ? (
          <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
            Loading room…
          </div>
        ) : (
          <>
            <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#666" }}>Status</div>
                  <div style={{ fontWeight: 700 }}>{match.status}</div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "#666" }}>Players</div>
                  <div style={{ fontWeight: 700 }}>
                    {players.map((p) => p.name).join(" vs ")}
                    {players.length < 2 ? " (waiting…)" : ""}
                  </div>
                </div>

                {shareCode ? (
                  <div style={{ marginLeft: "auto" }}>
                    <div style={{ fontSize: 12, color: "#666" }}>Private Code</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <code style={{ fontSize: 16, fontWeight: 700 }}>{shareCode}</code>
                      <button onClick={() => copy(String(shareCode))} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #111" }}>
                        Copy
                      </button>
                      {shareLink && (
                        <button onClick={() => copy(shareLink)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #111" }}>
                          Copy Link
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {match.status === "finished" && (
              <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>🎉 {winnerName} won!</h3>
                <button onClick={() => router.push("/")} style={{ padding: 10, borderRadius: 12, border: "1px solid #111" }}>
                  Play Again
                </button>
              </div>
            )}

            {/* Secret setter */}
            {match.status !== "finished" && (
              <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Your secret number</h3>

                {myState?.ready ? (
                  <div style={{ fontWeight: 700 }}>
                    ✅ Set (MVP stores it in DB). You’re ready.
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={secret}
                      onChange={(e) => setSecret(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      placeholder="1-99"
                      style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", width: 120 }}
                    />
                    <button onClick={onSetSecret} style={{ padding: 10, borderRadius: 12, border: "1px solid #111" }}>
                      Set Secret
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                  Both players must set secret before guessing starts.
                </div>
              </div>
            )}

            {/* Guessing section */}
            {match.status === "active" && (
              <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Guess</h3>

                {players.length < 2 ? (
                  <div>Waiting for opponent to join…</div>
                ) : !myState?.ready || !oppState?.ready ? (
                  <div>Waiting for both players to set secret…</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: "#666" }}>Opponent range</div>
                      <div style={{ fontWeight: 800, fontSize: 20 }}>
                        {oppState.rangeMin} — {oppState.rangeMax}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <input
                        value={guess}
                        onChange={(e) => setGuess(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        placeholder="Your guess"
                        disabled={!myTurn}
                        style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", width: 160 }}
                      />
                      <button
                        onClick={onGuess}
                        disabled={!myTurn}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: "1px solid #111",
                          opacity: myTurn ? 1 : 0.5,
                        }}
                      >
                        Submit
                      </button>

                      <div style={{ marginLeft: 10, fontWeight: 700 }}>
                        {myTurn ? "✅ Your turn" : `⏳ ${opp?.name || "Opponent"}'s turn`}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* History */}
            <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 16, padding: 16 }}>
              <h3 style={{ marginTop: 0 }}>History</h3>

              {match.history.length === 0 ? (
                <div style={{ color: "#666" }}>No guesses yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {match.history
                    .slice()
                    .reverse()
                    .map((h, idx) => {
                      const byName = players.find((p) => p.uid === h.byUid)?.name || "Someone";
                      const targetName = players.find((p) => p.uid === h.targetUid)?.name || "Player";
                      const hintEmoji = h.hint === "higher" ? "⬆️ higher" : h.hint === "lower" ? "⬇️ lower" : "🎯 correct";
                      return (
                        <div key={idx} style={{ padding: 10, borderRadius: 12, border: "1px solid #eee" }}>
                          <b>{byName}</b> guessed <b>{h.guess}</b> for <b>{targetName}</b> → {hintEmoji}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}