import { NextRequest, NextResponse } from "next/server";
import { HOME_ADDRESS } from "@/lib/types";

// Haalt de reistijd (in minuten, met auto) op via de Google Maps Distance Matrix API.
export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geen GOOGLE_MAPS_API_KEY ingesteld. Vul deze in bij .env.local om reistijden automatisch op te halen." },
      { status: 501 }
    );
  }

  const { destination } = await req.json();
  if (!destination || typeof destination !== "string" || !destination.trim()) {
    return NextResponse.json({ error: "Geen bestemming opgegeven." }, { status: 400 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", HOME_ADDRESS);
  url.searchParams.set("destinations", destination.trim());
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    const element = data?.rows?.[0]?.elements?.[0];
    if (data.status !== "OK" || !element || element.status !== "OK") {
      const reason = element?.status ?? data.status ?? "onbekende fout";
      return NextResponse.json(
        { error: `Geen route gevonden voor "${destination}" (${reason}). Controleer het adres.` },
        { status: 422 }
      );
    }

    const minutes = Math.round(element.duration.value / 60);
    return NextResponse.json({ minutes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
