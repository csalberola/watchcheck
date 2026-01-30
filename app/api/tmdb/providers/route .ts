import { NextResponse } from "next/server";

export const runtime = "nodejs";

function pickProvidersForRegion(data: any, region: string) {
  const r = data?.results?.[region];
  if (!r) return { region, flatrate: [], rent: [], buy: [] };

  const flatrate = Array.isArray(r.flatrate) ? r.flatrate : [];
  const rent = Array.isArray(r.rent) ? r.rent : [];
  const buy = Array.isArray(r.buy) ? r.buy : [];

  // devolvemos solo campos útiles
  const mapProvider = (p: any) => ({
    provider_id: p?.provider_id,
    provider_name: p?.provider_name,
    logo_path: p?.logo_path,
    display_priority: p?.display_priority,
  });

  return {
    region,
    flatrate: flatrate.map(mapProvider),
    rent: rent.map(mapProvider),
    buy: buy.map(mapProvider),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type"); // "movie" | "tv"
  const region = (searchParams.get("region") || "ES").toUpperCase();

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing TMDB_API_KEY" }, { status: 400 });
  }

  if (!id || !type || (type !== "movie" && type !== "tv")) {
    return NextResponse.json(
      { error: "Missing or invalid query params. Use ?type=movie|tv&id=123&region=ES" },
      { status: 400 }
    );
  }

  const url = `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${encodeURIComponent(
    apiKey
  )}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.status_message || "TMDB error" }, { status: res.status });
    }

    const payload = pickProvidersForRegion(data, region);

    // Cache “suave” para que Vercel no lo recalcule siempre
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}