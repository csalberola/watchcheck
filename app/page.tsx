"use client";

import { useEffect, useMemo, useState } from "react";

/* =======================
   TYPES
======================= */

type MediaType = "movie" | "tv";

type Result = {
  id: number;
  media_type: MediaType;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
  vote_average?: number;
};

type Status = "started" | "watched";

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

type ProviderEntry = {
  region: string;
  link: string | null;
  providers: Provider[];
};

/* =======================
   CONSTANTS
======================= */

const REGION = "ES";
const STORAGE_STATUS = "watchcheck_status";
const STORAGE_LISTS = "watchcheck_lists";

/* =======================
   HELPERS
======================= */

const keyOf = (r: Result) => `${r.media_type}:${r.id}`;
const titleOf = (r: Result) => r.title || r.name || "Sin título";
const yearOf = (r: Result) =>
  (r.release_date || r.first_air_date || "").slice(0, 4) || "—";

const posterUrl = (p?: string) =>
  p ? `https://image.tmdb.org/t/p/w342${p}` : null;

const providerLogo = (p?: string | null) =>
  p ? `https://image.tmdb.org/t/p/w45${p}` : null;

/* =======================
   MAIN
======================= */

export default function Page() {
  /* -------- state -------- */
  const [tab, setTab] = useState<"search" | "watchlist" | "library" | "reco">(
    "search"
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  const [lists, setLists] = useState<Record<string, "watchlist" | "library">>(
    {}
  );
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [providers, setProviders] = useState<Record<string, ProviderEntry>>(
    {}
  );

  /* -------- load localStorage -------- */
  useEffect(() => {
    setLists(JSON.parse(localStorage.getItem(STORAGE_LISTS) || "{}"));
    setStatus(JSON.parse(localStorage.getItem(STORAGE_STATUS) || "{}"));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_LISTS, JSON.stringify(lists));
  }, [lists]);

  useEffect(() => {
    localStorage.setItem(STORAGE_STATUS, JSON.stringify(status));
  }, [status]);

  /* -------- API -------- */

  async function searchTMDB() {
    if (!query.trim()) return;
    setLoading(true);
    const r = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
    const j = await r.json();
    setResults(j.results || []);
    setLoading(false);
  }

  async function loadProviders(r: Result) {
    const k = keyOf(r);
    if (providers[k]) return;

    const res = await fetch(
      `/api/tmdb/providers?type=${r.media_type}&id=${r.id}&region=${REGION}`
    );
    const data = await res.json();

    if (!res.ok) return;

    setProviders((p) => ({
      ...p,
      [k]: {
        region: data.region,
        link: data.link,
        providers: data.providers || [],
      },
    }));
  }

  /* -------- derived lists -------- */

  const watchlist = Object.entries(lists)
    .filter(([, v]) => v === "watchlist")
    .map(([k]) => k);

  const library = Object.entries(lists)
    .filter(([, v]) => v === "library")
    .map(([k]) => k);

  /* =======================
     UI COMPONENTS
======================= */

  function ProvidersRow({ r }: { r: Result }) {
    const entry = providers[keyOf(r)];

    useEffect(() => {
      loadProviders(r);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!entry || entry.providers.length === 0) return null;

    return (
      <a
        href={entry.link || "#"}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex items-center gap-2 hover:opacity-80"
      >
        <span className="text-[11px] text-zinc-400">Ver en</span>

        {entry.region !== REGION && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
            {entry.region}
          </span>
        )}

        <div className="flex gap-1">
          {entry.providers.slice(0, 5).map((p) => (
            <img
              key={p.provider_id}
              src={providerLogo(p.logo_path) || ""}
              alt={p.provider_name}
              title={p.provider_name}
              className="h-5 w-5 rounded-md border border-white/10 bg-white/5 p-0.5"
            />
          ))}
        </div>
      </a>
    );
  }

  function Card({ r }: { r: Result }) {
    const k = keyOf(r);
    const inWatchlist = lists[k] === "watchlist";
    const inLibrary = lists[k] === "library";

    return (
      <div className="group">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="aspect-[2/3]">
            {posterUrl(r.poster_path) ? (
              <img
                src={posterUrl(r.poster_path)!}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-zinc-500">
                Sin póster
              </div>
            )}
          </div>
        </div>

        <div className="mt-2">
          <div className="truncate text-sm font-bold">{titleOf(r)}</div>
          <div className="text-xs text-zinc-400">
            {yearOf(r)} · {r.media_type === "movie" ? "Movie" : "TV"}
          </div>

          <ProvidersRow r={r} />

          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() =>
                setLists((l) => ({ ...l, [k]: "watchlist" }))
              }
              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              ➕ Watchlist
            </button>

            <button
              onClick={() => setLists((l) => ({ ...l, [k]: "library" }))}
              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            >
              ➕ Biblioteca
            </button>

            <button
              onClick={() =>
                setStatus((s) => ({ ...s, [k]: "watched" }))
              }
              className="rounded-md bg-green-500/20 px-2 py-1 text-xs text-green-200"
            >
              ✅ Visto
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* =======================
     RENDER
======================= */

  return (
    <main className="min-h-screen bg-[#0f1115] text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0f1115]/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 grid place-items-center">
              ✓
            </div>
            <div>
              <div className="text-lg font-black">WatchCheck</div>
              <div className="text-xs text-zinc-400">
                Controla qué ves y dónde
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {[
              ["search", "Buscar"],
              ["watchlist", "Watchlist"],
              ["library", "Biblioteca"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k as any)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  tab === k
                    ? "bg-white/10"
                    : "bg-white/5 hover:bg-white/10"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === "search" && (
            <div className="mt-4 flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchTMDB()}
                placeholder="Buscar Matrix, Dune, Breaking Bad…"
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              />
              <button
                onClick={searchTMDB}
                className="rounded-xl bg-white px-6 py-3 text-black font-bold"
              >
                Buscar
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
        {(tab === "search" ? results : tab === "watchlist"
          ? results.filter((r) => watchlist.includes(keyOf(r)))
          : results.filter((r) => library.includes(keyOf(r)))
        ).map((r) => (
          <Card key={keyOf(r)} r={r} />
        ))}

        {loading && <div className="text-zinc-400">Cargando…</div>}
      </section>
    </main>
  );
}