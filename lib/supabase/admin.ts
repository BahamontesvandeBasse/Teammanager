import { createClient } from "@supabase/supabase-js";

// Alléén server-side gebruiken (bv. de /api/mijn/[token]-routes). Deze client
// gebruikt de service-role key en omzeilt daarmee RLS — nodig omdat spelers
// geen Supabase-auth sessie hebben (ze loggen niet in, ze gebruiken een token).
// NOOIT importeren in client components of routes die door de browser draaien.

export function adminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
