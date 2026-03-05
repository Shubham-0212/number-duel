"use client";
export const dynamic = "force-dynamic";
import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <HomeClient />
    </Suspense>
  );
}