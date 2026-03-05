"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { createPrivateMatch, findOrCreateRandomMatch, joinPrivateMatchByCode } from "../lib/gameApi";

function getStoredName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("nd_name") || "";
}
function setStoredName(v: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("nd_name", v);
}

export default function HomePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const joinCodeFromUrl = sp.get("code") || "";

  const [uid, setUid] = useState<string>("");
  const [name, setName] = useState<string>(getStoredName());
  const [code, setCode] = useState<string>(joinCodeFromUrl);
  const [busy, setBusy] = useState<string>("");

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
    if (joinCodeFromUrl) setCode(joinCodeFromUrl);
  }, [joinCodeFromUrl]);

  const canPlay = uid && name.trim().length >= 2;

  async function playRandom() {
    if (!canPlay) return;
    setBusy("random");
    try {
      setStoredName(name.trim());
      const out = await findOrCreateRandomMatch(uid, name.trim());
      router.push(`/room/${out.matchId}`);
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setBusy("");
    }
  }

  async function createPrivate() {
    if (!canPlay) return;
    setBusy("create");
    try {
      setStoredName(name.trim());
      const out = await createPrivateMatch(uid, name.trim());
      router.push(`/room/${out.matchId}?code=${out.code}`);
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setBusy("");
    }
  }

  async function joinPrivate() {
    if (!canPlay) return;
    const c = code.trim();
    if (!/^\d{10}$/.test(c)) {
      alert("Enter a 10-digit code");
      return;
    }
    setBusy("join");
    try {
      setStoredName(name.trim());
      const out = await joinPrivateMatchByCode(c, uid, name.trim());
      router.push(`/room/${out.matchId}`);
    } catch (e: any) {
      alert(e?.message || "Failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 520, border: "1px solid #ddd", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Number Duel</h1>
        <p style={{ marginTop: 6, color: "#444" }}>
          Two players choose a secret number (1–99). Take turns guessing. Hints: Higher / Lower.
        </p>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shubham"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
          />
          <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
            UID: {uid ? uid.slice(0, 8) + "…" : "connecting…"}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <button
            onClick={playRandom}
            disabled={!canPlay || !!busy}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #111", cursor: "pointer" }}
          >
            {busy === "random" ? "Finding match…" : "Play Random"}
          </button>

          <button
            onClick={createPrivate}
            disabled={!canPlay || !!busy}
            style={{ padding: 12, borderRadius: 12, border: "1px solid #111", cursor: "pointer" }}
          >
            {busy === "create" ? "Creating…" : "Create Private Match (10-digit code)"}
          </button>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter 10-digit code"
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
            />
            <button
              onClick={joinPrivate}
              disabled={!canPlay || !!busy}
              style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #111", cursor: "pointer" }}
            >
              {busy === "join" ? "Joining…" : "Join"}
            </button>
          </div>

          <div style={{ fontSize: 12, color: "#666" }}>
            Tip: Share a link like <code>/ ?code=1234567890</code> or share the 10-digit code.
          </div>
        </div>
      </div>
    </div>
  );
}