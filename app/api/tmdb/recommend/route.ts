import { NextResponse } from "next/server";

type MediaType = "movie" | "tv";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const idsRaw = searchParams.get("ids") || "";
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (ids.length === 0) return NextResponse.json({ results: [] });

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing TMDB_API_KEY" }, { status: 500 });
  }
  const apiKey: string = key;

  const language = searchParams.get("lang") || "es-ES";

  async function fetchRecs(media_type: MediaType, id: string) {
    const url = new URL(
      `https://api.themoviedb.org/3/${media_type}/${id}/recommendations`
    );
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("language", language);
    url.searchParams.set("page", "1");

    const r = await fetch(url.toString(), { cache: "no-store" });
    const data = await r.json();

    return (data.results ?? []).map((x: any) => ({
      id: x.id,
      media_type,
      title: x.title,
      name: x.name,
      release_date: x.release_date,
      first_air_date: x.first_air_date,
      poster_path: x.poster_path,
      vote_average: x.vote_average,
      popularity: x.popularity,
    }));
  }

  const all: any[] = [];
  for (const token of ids) {
    const [media_type, id] = token.split(":") as [MediaType, string];
    if (!media_type || !id) continue;
    if (media_type !== "movie" && media_type !== "tv") continue;

    try {
      const recs = await fetchRecs(media_type, id);
      all.push(...recs);
    } catch {
      // seguimos
    }
  }

  const uniq = new Map<string, any>();
  for (const r of all) {
    const k = `${r.media_type}:${r.id}`;
    if (!uniq.has(k)) uniq.set(k, r);
  }

  const results = Array.from(uniq.values()).sort((a, b) => {
    const sa = (a.vote_average ?? 0) * 2 + (a.popularity ?? 0) / 50;
    const sb = (b.vote_average ?? 0) * 2 + (b.popularity ?? 0) / 50;
    return sb - sa;
  });

  return NextResponse.json({ results: results.slice(0, 40) });
}