import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Provider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

function pickProviders(regionBlock: any): Provider[] {
  if (!regionBlock) return [];

  const flatrate: Provider[] = Array.isArray(regionBlock.flatrate) ? regionBlock.flatrate : [];
  const rent: Provider[] = Array.isArray(regionBlock.rent) ? regionBlock.rent : [];
  const buy: Provider[] = Array.isArray(regionBlock.buy) ? regionBlock.buy : [];

  const merged = [...flatrate, ...rent, ...buy];

  const seen = new Set<number>();
  const out: Provider[] = [];
  for (const p of merged) {
    if (!p?.provider_id) continue;
    if (seen.has(p.provider_id)) continue;
    seen.add(p.provider_id);

    out.push({
      provider_id: p.provider_id,
      provider_name: p.provider_name,
      logo_path: p.logo_path ?? null,
    });
  }

  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const type = searchParams.get("type"); // "movie" | "tv"
  const id = searchParams.get("id");
  const regionRequested = (searchParams.get("region") || "ES").toUpperCase();

  if (!type || !id) {
    return NextResponse.json({ error: "Missing type or id" }, { status: 400 });
  }
  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing TMDB_API_KEY" }, { status: 500 });
  }

  const url = `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${encodeURIComponent(
    apiKey
  )}`;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 1800 },
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `TMDB error ${r.status}`, detail: txt.slice(0, 200) },
        { status: 502 }
      );
    }

    const data = await r.json();

    const esBlock = data?.results?.[regionRequested] || null;
    const usBlock = data?.results?.["US"] || null;

    const usedBlock = esBlock || usBlock || null;
    const usedRegion = esBlock ? regionRequested : "US";

    // TMDB suele dar un "link" por región para ir a la página "Where to watch"
    const link =
      (esBlock && typeof esBlock?.link === "string" ? esBlock.link : null) ||
      (usBlock && typeof usBlock?.link === "string" ? usBlock.link : null) ||
      null;

    const providers = pickProviders(usedBlock);

    return NextResponse.json(
      { region: usedRegion, link, providers },
      {
        headers: {
          "Cache-Control": "public, max-age=900, s-maxage=1800",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}