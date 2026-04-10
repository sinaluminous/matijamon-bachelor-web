"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, getRoom } from "@/lib/room";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"main" | "join">("main");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    try {
      const { code, hostId } = await createRoom();
      if (typeof window !== "undefined") {
        localStorage.setItem(`host_${code}`, hostId);
      }
      router.push(`/host/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greska");
      setBusy(false);
    }
  }

  async function handleJoin() {
    const code = joinCode.toUpperCase().trim();
    if (code.length !== 4) {
      setError("Kod mora imati 4 slova");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await getRoom(code);
      if (!room) {
        setError("Soba ne postoji");
        setBusy(false);
        return;
      }
      router.push(`/play/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greska");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0c0c14] text-white font-pixel p-6">
      <div className="text-center mb-12 select-none">
        <h1 className="text-5xl md:text-7xl font-bold text-[#FFC828] drop-shadow-[0_0_20px_rgba(255,200,40,0.4)] mb-2 tracking-wider">
          BACHELOR
        </h1>
        <h2 className="text-4xl md:text-6xl font-bold text-[#DC3232] drop-shadow-[0_0_20px_rgba(220,50,50,0.4)] mb-4 tracking-wider">
          SPECIAL
        </h2>
        <p className="text-sm md:text-base text-zinc-400 mt-4">
          Igra za pijenje • Matijamon • 2-15 igraca
        </p>
      </div>

      {mode === "main" && (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            onClick={handleCreate}
            disabled={busy}
            className="bg-[#FFC828] text-black font-bold py-6 px-8 rounded-lg text-xl hover:bg-[#FFD850] active:scale-95 transition disabled:opacity-50 shadow-lg"
          >
            {busy ? "..." : "POKRENI IGRU"}
          </button>
          <button
            onClick={() => setMode("join")}
            disabled={busy}
            className="bg-[#28508C] hover:bg-[#3264B4] text-white font-bold py-6 px-8 rounded-lg text-xl active:scale-95 transition disabled:opacity-50 shadow-lg"
          >
            PRIDRUZI SE
          </button>
          <p className="text-xs text-zinc-500 text-center mt-4 leading-relaxed">
            POKRENI IGRU - na TV-u<br/>
            PRIDRUZI SE - na mobitelu
          </p>
        </div>
      )}

      {mode === "join" && (
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <p className="text-center text-zinc-300 mb-2">Unesi kod sobe:</p>
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
            maxLength={4}
            placeholder="ABCD"
            className="bg-[#1a1a28] border-2 border-[#FFC828] text-center text-4xl font-bold tracking-[0.5em] py-4 rounded-lg uppercase text-[#FFC828] focus:outline-none focus:border-[#FFD850]"
            autoFocus
          />
          <button
            onClick={handleJoin}
            disabled={busy || joinCode.length !== 4}
            className="bg-[#FFC828] text-black font-bold py-4 px-8 rounded-lg text-xl hover:bg-[#FFD850] active:scale-95 transition disabled:opacity-50"
          >
            {busy ? "..." : "UDJI"}
          </button>
          <button
            onClick={() => { setMode("main"); setError(null); }}
            className="text-zinc-400 hover:text-white underline text-sm"
          >
            Natrag
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 px-6 py-3 bg-red-900 text-red-200 rounded-lg text-sm">
          {error}
        </div>
      )}

      <p className="text-xs text-zinc-600 mt-12 text-center">
        Dečki pečki • 2026
      </p>
    </div>
  );
}
