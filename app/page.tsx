"use client";

import React, { useEffect, useMemo, useState } from "react";

/* =======================
   Types
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
  popularity?: number;
};

type Status = "started" | "watched";
type StatusEntry = { status: Status; ts: number };
type StatusMap = Record<string, StatusEntry>;

type ListType = "library" | "watchlist";
type SavedEntry = {
  item: Result;
  list: ListType;
  addedTs: number;
};
type SavedMap = Record<string, SavedEntry>;

/* =======================
   Storage keys
   ======================= */

const STORAGE_STATUS = "watchcheck_status_v2";
const STORAGE_SAVED = "watchcheck_saved_v2";

// Compat keys (por si vienes de versiones anteriores)
const OLD_STORAGE_ITEMS = "watchcheck_items_v1"; // map key->Result
const OLD_STORAGE_WATCHED = "watchcheck_watched_v1"; // map key->ts (visto)

/* =======================
   Helpers
   ======================= */

function makeKey(r: Pick<Result, "media_type" | "id">) {
  return `${r.media_type}:${r.id}`;
}

function titleOf(r: Result) {
  return r.title || r.name || "(Sin título)";
}

function yearOf(r: Result) {
  const d = r.release_date || r.first_air_date || "";
  return d ? d.slice(0, 4) : "—";
}

function labelOf(r: Result) {
  return r.media_type === "movie" ? "Movie" : "TV";
}

function posterUrl(path?: string | null) {
  return path ? `https://image.tmdb.org/t/p/w342${path}` : null;
}

function getStatusLabel(s: Status | null) {
  if (s === "watched") return "Visto";
  if (s === "started") return "Empezado";
  return "No visto";
}

function badgeCls(s: Status | null) {
  if (s === "watched") return "bg-green-500/20 text-green-200 border-green-500/30";
  if (s === "started") return "bg-yellow-500/20 text-yellow-200 border-yellow-500/30";
  return "bg-white/10 text-zinc-200 border-white/20";
}

/* =======================
   Skeleton
   ======================= */

function PosterSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl border border-white/10 bg-white/10" />
      <div className="mt-2 h-4 w-4/5 rounded bg-white/10" />
      <div className="mt-1 h-3 w-2/5 rounded bg-white/10" />
    </div>
  );
}

/* =======================
   Modal (Trakt)
   ======================= */

function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-white/10 bg-[#0f1115] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
          <div>
            <div className="text-base font-black text-white">{title}</div>
            <div className="mt-1 text-sm text-zinc-400">
              Esto deja claro el camino para hacerlo escalable.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-zinc-200 hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>

        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* =======================
   App
   ======================= */

export default function Home() {
  const [tab, setTab] = useState<"buscar" | "library" | "watchlist" | "reco">("buscar");
  const [filter, setFilter] = useState<"todas" | "no_visto" | "empezado" | "visto">("todas");

  // Buscar
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Biblioteca / Watchlist buscador interno
  const [listQuery, setListQuery] = useState("");

  // Recomendaciones
  const [reco, setReco] = useState<Result[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState("");

  // Estado local
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [saved, setSaved] = useState<SavedMap>({});

  // 🎲 No sé qué ver hoy
  const [pick, setPick] = useState<Result | null>(null);

  // Trakt modal / demo integration
  const [showIntegrations, setShowIntegrations] = useState(false);

  /* ===== Load localStorage + migraciones ===== */
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_STATUS);
      if (s) setStatusMap(JSON.parse(s));
    } catch {}

    try {
      const sv = localStorage.getItem(STORAGE_SAVED);
      if (sv) setSaved(JSON.parse(sv));
    } catch {}

    // Migrar antiguos "items" (biblioteca)
    try {
      const oldItems = localStorage.getItem(OLD_STORAGE_ITEMS);
      if (oldItems) {
        const parsed = JSON.parse(oldItems) as Record<string, Result>;
        if (parsed && typeof parsed === "object") {
          setSaved((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            const next: SavedMap = {};
            const now = Date.now();
            for (const [k, item] of Object.entries(parsed)) {
              next[k] = { item, list: "library", addedTs: now };
            }
            return next;
          });
        }
      }
    } catch {}

    // Migrar antiguos "watched"
    try {
      const oldWatched = localStorage.getItem(OLD_STORAGE_WATCHED);
      if (oldWatched) {
        const parsed = JSON.parse(oldWatched) as Record<string, number>;
        if (parsed && typeof parsed === "object") {
          setStatusMap((prev) => {
            if (Object.keys(prev).length > 0) return prev;
            const next: StatusMap = {};
            for (const [k, ts] of Object.entries(parsed)) {
              next[k] = { status: "watched", ts: typeof ts === "number" ? ts : Date.now() };
            }
            return next;
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STATUS, JSON.stringify(statusMap));
    } catch {}
  }, [statusMap]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SAVED, JSON.stringify(saved));
    } catch {}
  }, [saved]);

  const counts = useMemo(() => {
    let watched = 0;
    let started = 0;
    for (const v of Object.values(statusMap)) {
      if (v.status === "watched") watched++;
      if (v.status === "started") started++;
    }
    const libraryCount = Object.values(saved).filter((x) => x.list === "library").length;
    const watchlistCount = Object.values(saved).filter((x) => x.list === "watchlist").length;

    return { watched, started, libraryCount, watchlistCount };
  }, [statusMap, saved]);

  function getStatus(key: string): Status | null {
    return statusMap[key]?.status ?? null;
  }

  function matchesFilterByKey(key: string) {
    const s = getStatus(key);
    if (filter === "todas") return true;
    if (filter === "no_visto") return s === null;
    if (filter === "empezado") return s === "started";
    return s === "watched";
  }

  function upsertSaved(r: Result, list: ListType) {
    const k = makeKey(r);
    setSaved((prev) => ({
      ...prev,
      [k]: {
        item: {
          id: r.id,
          media_type: r.media_type,
          title: r.title,
          name: r.name,
          release_date: r.release_date,
          first_air_date: r.first_air_date,
          poster_path: r.poster_path,
          vote_average: r.vote_average,
          popularity: r.popularity,
        },
        list,
        addedTs: prev[k]?.addedTs ?? Date.now(),
      },
    }));
  }

  function removeSaved(key: string) {
    setSaved((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  }

  function setStatus(r: Result, status: Status) {
    const k = makeKey(r);
    // al marcar estado, asegúrate de que exista en library
    upsertSaved(r, "library");
    setStatusMap((prev) => ({ ...prev, [k]: { status, ts: Date.now() } }));
  }

  function clearStatus(r: Result) {
    const k = makeKey(r);
    setStatusMap((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });
  }

  /* =======================
     Export / Import / Clear
     ======================= */

  function clearAll() {
    if (!confirm("¿Borrar TODO (biblioteca, watchlist y estados) del navegador?")) return;
    setStatusMap({});
    setSaved({});
    setPick(null);
    try {
      localStorage.removeItem(OLD_STORAGE_ITEMS);
      localStorage.removeItem(OLD_STORAGE_WATCHED);
    } catch {}
  }

  function exportData() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      statusMap,
      saved,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchcheck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importDataFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));

        // Compat backup antiguo: watched + savedItems
        if (parsed?.watched && parsed?.savedItems && !parsed?.saved) {
          const oldWatched = parsed.watched as Record<string, number>;
          const oldItems = parsed.savedItems as Record<string, Result>;

          const nextStatus: StatusMap = {};
          for (const [k, ts] of Object.entries(oldWatched || {})) {
            nextStatus[k] = { status: "watched", ts: typeof ts === "number" ? ts : Date.now() };
          }

          const nextSaved: SavedMap = {};
          const now = Date.now();
          for (const [k, item] of Object.entries(oldItems || {})) {
            nextSaved[k] = { item, list: "library", addedTs: now };
          }

          setStatusMap(nextStatus);
          setSaved(nextSaved);
          alert("Importación OK ✅ (migrado desde backup antiguo)");
          return;
        }

        // v2
        const nextStatus = parsed?.statusMap ?? {};
        const nextSaved = parsed?.saved ?? {};
        if (typeof nextStatus !== "object" || typeof nextSaved !== "object") {
          alert("Archivo inválido (estructura incorrecta).");
          return;
        }

        setStatusMap(nextStatus);
        setSaved(nextSaved);
        alert("Importación OK ✅");
      } catch {
        alert("No he podido leer el JSON.");
      }
    };
    reader.readAsText(file);
  }

  function onImportInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importDataFromFile(file);
    e.target.value = "";
  }

  /* =======================
     API calls
     ======================= */

  async function search() {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setResults([]);
        setError(data?.error || `Error HTTP ${res.status}`);
        return;
      }

      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (e: any) {
      setResults([]);
      setError(e?.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecommendations() {
    setRecoLoading(true);
    setRecoError("");

    try {
      const seeds = Object.entries(statusMap)
        .sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0))
        .slice(0, 8)
        .map(([k]) => k);

      if (seeds.length === 0) {
        setReco([]);
        setRecoError("Marca algo como Empezado o Visto para generar recomendaciones.");
        return;
      }

      const res = await fetch(`/api/tmdb/recommend?ids=${encodeURIComponent(seeds.join(","))}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setReco([]);
        setRecoError(data?.error || `Error HTTP ${res.status}`);
        return;
      }

      // no recomendar cosas ya empezadas/vistas
      const blocked = new Set(Object.keys(statusMap));
      const cleaned = (data.results ?? []).filter((r: Result) => !blocked.has(makeKey(r)));
      setReco(cleaned);
    } catch (e: any) {
      setReco([]);
      setRecoError(e?.message || "Error cargando recomendaciones");
    } finally {
      setRecoLoading(false);
    }
  }

  /* =======================
     Lists computed
     ======================= */

  const libraryItems = useMemo(() => {
    return Object.entries(saved)
      .filter(([, v]) => v.list === "library")
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.addedTs || 0) - (a.addedTs || 0));
  }, [saved]);

  const watchlistItems = useMemo(() => {
    return Object.entries(saved)
      .filter(([, v]) => v.list === "watchlist")
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.addedTs || 0) - (a.addedTs || 0));
  }, [saved]);

  function listMatchesQuery(item: Result) {
    if (!listQuery.trim()) return true;
    const t = titleOf(item).toLowerCase();
    return t.includes(listQuery.toLowerCase());
  }

  /* =======================
     🎲 No sé qué ver hoy
     ======================= */

  function pickRandomFromCurrentTab() {
    const source =
      tab === "watchlist" ? watchlistItems : tab === "library" ? libraryItems : watchlistItems;

    const candidates = source
      .filter((x) => listMatchesQuery(x.item))
      .filter((x) => {
        const s = getStatus(x.key);
        // preferimos NO VISTO siempre (si filtro=todas, elegimos no visto)
        if (filter === "todas") return s === null;
        if (filter === "no_visto") return s === null;
        if (filter === "empezado") return s === "started";
        return s === "watched";
      });

    if (candidates.length === 0) {
      setPick(null);
      alert("No hay candidatos con ese filtro. Prueba 'No visto' o añade cosas a tu Watchlist.");
      return;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setPick(chosen.item);
  }

  /* =======================
     UI Components
     ======================= */

  function TabButton({
    active,
    children,
    onClick,
  }: {
    active?: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition border ${
          active
            ? "bg-white/10 text-white border-white/15"
            : "bg-transparent text-zinc-300 border-white/10 hover:bg-white/5"
        }`}
      >
        {children}
      </button>
    );
  }

  function PosterCard({
    r,
    context,
  }: {
    r: Result;
    context: "search" | "library" | "watchlist" | "reco";
  }) {
    const k = makeKey(r);
    const s = getStatus(k);
    if (!matchesFilterByKey(k)) return null;

    const poster = posterUrl(r.poster_path);
    const t = titleOf(r);
    const y = yearOf(r);

    const inSaved = !!saved[k];
    const inLibrary = saved[k]?.list === "library";
    const inWatchlist = saved[k]?.list === "watchlist";

    return (
      <div className="group relative">
        <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-sm transition group-hover:border-white/20 group-hover:shadow-lg">
          <div className="aspect-[2/3] w-full">
            {poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={poster}
                alt={t}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="h-full w-full grid place-items-center text-xs text-zinc-400">
                Sin póster
              </div>
            )}
          </div>

          {/* Badge estado */}
          <div className="absolute left-2 top-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeCls(
                s
              )}`}
            >
              {getStatusLabel(s)}
            </span>
          </div>

          {/* Overlay hover */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 transition group-hover:opacity-100" />

          {/* Acciones hover */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 opacity-0 transition group-hover:opacity-100">
            <div className="pointer-events-auto flex flex-wrap gap-2">
              <button
                onClick={() => setStatus(r, "started")}
                className="rounded-lg px-3 py-2 text-xs font-semibold border border-yellow-500/25 bg-yellow-500/15 text-yellow-100 hover:bg-yellow-500/20"
              >
                🟨 Empezado
              </button>

              <button
                onClick={() => setStatus(r, "watched")}
                className="rounded-lg px-3 py-2 text-xs font-semibold border border-green-500/25 bg-green-500/15 text-green-100 hover:bg-green-500/20"
              >
                ✅ Visto
              </button>

              <button
                onClick={() => clearStatus(r)}
                className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              >
                Quitar estado
              </button>

              {/* Watchlist / Library actions */}
              {context === "search" || context === "reco" ? (
                <>
                  <button
                    onClick={() => upsertSaved(r, "watchlist")}
                    className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  >
                    ➕ Watchlist
                  </button>
                  <button
                    onClick={() => upsertSaved(r, "library")}
                    className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  >
                    ➕ Biblioteca
                  </button>
                </>
              ) : null}

              {inSaved ? (
                <>
                  {inWatchlist ? (
                    <button
                      onClick={() => upsertSaved(r, "library")}
                      className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                    >
                      Mover a Biblioteca
                    </button>
                  ) : null}

                  {inLibrary ? (
                    <button
                      onClick={() => upsertSaved(r, "watchlist")}
                      className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                    >
                      Mover a Watchlist
                    </button>
                  ) : null}

                  <button
                    onClick={() => removeSaved(k)}
                    className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                  >
                    Quitar de lista
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="truncate text-sm font-bold text-white">{t}</div>
          <div className="mt-0.5 text-xs text-zinc-400">
            {labelOf(r)} · {y}
            {typeof r.vote_average === "number" ? (
              <span className="ml-2 text-zinc-500">★ {r.vote_average.toFixed(1)}</span>
            ) : null}
            {inWatchlist ? <span className="ml-2 text-zinc-500">• Watchlist</span> : null}
            {inLibrary ? <span className="ml-2 text-zinc-500">• Biblioteca</span> : null}
          </div>
        </div>
      </div>
    );
  }

  /* =======================
     Render
     ======================= */

  return (
    <main className="min-h-screen bg-[#0f1115] text-white">
      {/* Trakt / Integrations modal */}
      <Modal open={showIntegrations} title="Conectar Trakt (escalable)" onClose={() => setShowIntegrations(false)}>
        <div className="space-y-4 text-zinc-300">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="font-bold text-white">Qué aporta Trakt</div>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
              <li>Sincronizar <span className="font-semibold text-white">Visto/Empezado/Watchlist</span> en la nube.</li>
              <li>Usar la app en móvil/portátil sin depender de localStorage.</li>
              <li>Base sólida para “conectar plataformas” de forma realista (hub).</li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="font-bold text-white">Por qué Netflix/Prime/Disney es complicado</div>
            <div className="mt-2 text-sm text-zinc-300">
              No suelen tener una API pública estándar para que una app lea tu historial “visto”.
              Lo viable es: <span className="font-semibold text-white">Trakt</span> como hub, importadores, o extensión (opcional).
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="font-bold text-white">Siguiente paso técnico (cuando quieras)</div>
            <div className="mt-2 text-sm text-zinc-300">
              Implementar OAuth con Trakt, guardar tokens y sincronizar estados desde servidor.
              (Hoy lo dejamos como demo visual para enseñarlo).
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => alert("Demo: botón listo. Siguiente fase: OAuth real con Trakt.")}
              className="rounded-xl bg-white text-black px-4 py-2 text-sm font-black hover:bg-zinc-200"
            >
              Simular “Conectar”
            </button>
            <button
              onClick={() => setShowIntegrations(false)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10"
            >
              Vale
            </button>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0f1115]/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Logo + name (NO WC) */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 grid place-items-center">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 text-white/90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-lg font-black tracking-tight">WatchCheck</div>
                <div className="text-xs text-zinc-400">Tu control de “visto” por plataforma</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-200">
                📚 {counts.libraryCount}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-200">
                🧾 {counts.watchlistCount}
              </span>
              <span className="rounded-full border border-green-500/25 bg-green-500/10 px-3 py-1.5 text-sm font-semibold text-green-100">
                ✅ {counts.watched}
              </span>
              <span className="rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1.5 text-sm font-semibold text-yellow-100">
                🟨 {counts.started}
              </span>

              {/* Trakt button (demo) */}
              <button
                onClick={() => setShowIntegrations(true)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                🔗 Conectar Trakt
              </button>

              <button
                onClick={exportData}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                Exportar
              </button>

              <label className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10">
                Importar
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={onImportInputChange}
                />
              </label>

              <button
                onClick={clearAll}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
              >
                Borrar todo
              </button>
            </div>
          </div>

          {/* Tabs + filter */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              <TabButton active={tab === "buscar"} onClick={() => setTab("buscar")}>
                Buscar
              </TabButton>
              <TabButton
                active={tab === "watchlist"}
                onClick={() => {
                  setTab("watchlist");
                  setPick(null);
                }}
              >
                Watchlist
              </TabButton>
              <TabButton
                active={tab === "library"}
                onClick={() => {
                  setTab("library");
                  setPick(null);
                }}
              >
                Biblioteca
              </TabButton>
              <TabButton
                active={tab === "reco"}
                onClick={() => {
                  setTab("reco");
                  setPick(null);
                  loadRecommendations();
                }}
              >
                Recomendaciones
              </TabButton>
            </div>

            <div className="sm:ml-auto flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-300">Filtro:</span>
              <select
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 outline-none"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as any);
                  setPick(null);
                }}
              >
                <option value="todas">Todas</option>
                <option value="no_visto">Solo no visto</option>
                <option value="empezado">Solo empezado</option>
                <option value="visto">Solo visto</option>
              </select>
            </div>
          </div>

          {/* Search bar */}
          {tab === "buscar" && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="w-full flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white placeholder:text-zinc-500 outline-none focus:border-white/20"
                placeholder="Buscar: Matrix, Dune, Breaking Bad…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <button
                onClick={search}
                disabled={loading}
                className="rounded-2xl bg-white text-black px-6 py-4 font-black hover:bg-zinc-200 disabled:opacity-60"
              >
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </div>
          )}

          {/* List search + 🎲 */}
          {(tab === "watchlist" || tab === "library") && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                className="w-full flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-base font-semibold text-white placeholder:text-zinc-500 outline-none focus:border-white/20"
                placeholder={tab === "watchlist" ? "Buscar en Watchlist…" : "Buscar en Biblioteca…"}
                value={listQuery}
                onChange={(e) => {
                  setListQuery(e.target.value);
                  setPick(null);
                }}
              />
              <button
                onClick={pickRandomFromCurrentTab}
                className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-black text-zinc-100 hover:bg-white/10"
              >
                🎲 No sé qué ver hoy
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        {/* Roadmap / story for friends (clean + demo) */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-black text-white">Demo hoy (escalable)</div>
              <div className="mt-1 text-zinc-400">
                Base: TMDB + UX. Escalado: Trakt (sync en la nube) + importadores.
              </div>
            </div>
            <button
              onClick={() => setShowIntegrations(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-100 hover:bg-white/10"
            >
              Ver “Integraciones”
            </button>
          </div>
        </div>

        {/* Picker result */}
        {(tab === "watchlist" || tab === "library") && pick && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-16 w-12 overflow-hidden rounded-lg border border-white/10 bg-white/10 flex-shrink-0">
                  {posterUrl(pick.poster_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={posterUrl(pick.poster_path)!}
                      alt={titleOf(pick)}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-lg font-black">{titleOf(pick)}</div>
                  <div className="text-sm text-zinc-400">
                    {labelOf(pick)} · {yearOf(pick)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setStatus(pick, "started")}
                  className="rounded-xl px-4 py-2 text-sm font-bold border border-yellow-500/25 bg-yellow-500/15 text-yellow-100 hover:bg-yellow-500/20"
                >
                  🟨 Empezado
                </button>
                <button
                  onClick={() => setStatus(pick, "watched")}
                  className="rounded-xl px-4 py-2 text-sm font-bold border border-green-500/25 bg-green-500/15 text-green-100 hover:bg-green-500/20"
                >
                  ✅ Visto
                </button>
                <button
                  onClick={() => setPick(null)}
                  className="rounded-xl px-4 py-2 text-sm font-bold border border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Errors */}
        {tab === "buscar" && error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-100 font-semibold">
            {error}
          </div>
        )}

        {tab === "reco" && recoError && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-100 font-semibold">
            {recoError}
          </div>
        )}

        {/* Empty states */}
        {tab === "watchlist" && watchlistItems.length === 0 && (
          <div className="text-zinc-400">
            Tu Watchlist está vacía. Añade títulos desde Buscar o Recomendaciones (➕ Watchlist).
          </div>
        )}

        {tab === "library" && libraryItems.length === 0 && (
          <div className="text-zinc-400">
            Tu Biblioteca está vacía. Marca “Empezado/Visto” o añade (➕ Biblioteca).
          </div>
        )}

        {tab === "buscar" && !loading && !error && results.length === 0 && query.trim() !== "" && (
          <div className="text-zinc-400">Sin resultados.</div>
        )}

        {tab === "reco" && !recoLoading && !recoError && reco.length === 0 && (
          <div className="text-zinc-400">Sin recomendaciones (por ahora).</div>
        )}

        {/* Grids */}
        {tab === "buscar" && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {loading
              ? Array.from({ length: 12 }).map((_, i) => <PosterSkeleton key={`s-${i}`} />)
              : results.map((r) => <PosterCard key={makeKey(r)} r={r} context="search" />)}
          </div>
        )}

        {tab === "watchlist" && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {watchlistItems
              .filter((x) => matchesFilterByKey(x.key))
              .filter((x) => listMatchesQuery(x.item))
              .map((x) => (
                <PosterCard key={x.key} r={x.item} context="watchlist" />
              ))}
          </div>
        )}

        {tab === "library" && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {libraryItems
              .filter((x) => matchesFilterByKey(x.key))
              .filter((x) => listMatchesQuery(x.item))
              .map((x) => (
                <PosterCard key={x.key} r={x.item} context="library" />
              ))}
          </div>
        )}

        {tab === "reco" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                Basado en lo último que has marcado como visto/empezado.
              </div>
              <button
                onClick={loadRecommendations}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                disabled={recoLoading}
              >
                {recoLoading ? "Actualizando…" : "Actualizar"}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {recoLoading
                ? Array.from({ length: 12 }).map((_, i) => <PosterSkeleton key={`r-${i}`} />)
                : reco
                    .filter((r) => matchesFilterByKey(makeKey(r)))
                    .map((r) => <PosterCard key={makeKey(r)} r={r} context="reco" />)}
            </div>
          </>
        )}
      </section>
    </main>
  );
}