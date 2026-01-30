import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) return NextResponse.json({ results: [] });

  const key = process.env.TMDB_API_KEY;
  if (!key)
    return NextResponse.json({ error: "Missing TMDB_API_KEY" }, { status: 500 });

  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("api_key", key);
  url.searchParams.set("query", q);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("language", "es-ES");
  url.searchParams.set("page", "1");

  const r = await fetch(url.toString(), { cache: "no-store" });
  const data = await r.json();

  const results = (data.results ?? []).filter(
    (x: any) => x.media_type === "movie" || x.media_type === "tv"
  );

  return NextResponse.json({ results });
}