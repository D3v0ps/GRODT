/**
 * Seed-skript: skapar första admin-kontot och säkerställer
 * standardinställningarna. Kör:
 *
 *   npm run seed
 *
 * Miljövariabler (utöver Supabase-nycklarna i .env.local):
 *   SEED_ADMIN_EMAIL     (krävs)
 *   SEED_ADMIN_PASSWORD  (krävs, minst 8 tecken)
 *   SEED_ADMIN_NAME      (valfritt, default "Administratör")
 *
 * Flaggor:
 *   --with-mock-data   Kör dessutom en synk med MockProvider (~45 fiktiva
 *                      bolag) – ENDAST för demo/utveckling. Produktionsdata
 *                      importeras via CSV i appen eller via tic.io-synk.
 *
 * Skriptet är idempotent: befintlig admin återanvänds, inställningar
 * skrivs bara om de saknas och mock-synken skapar inga dubbletter.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

import { MockProvider } from "../src/lib/providers/mock";
import { DEFAULT_SYNC_FILTER } from "../src/lib/settings";
import { runSync } from "../src/lib/sync/engine";
import { SupabaseSyncStore } from "../src/lib/sync/supabase-store";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Saknar miljövariabeln ${name}. Se .env.example.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administratör";
  const withMockData = process.argv.includes("--with-mock-data");

  if (adminPassword.length < 8) {
    console.error("SEED_ADMIN_PASSWORD måste vara minst 8 tecken.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Skapa eller återanvänd admin-kontot.
  console.log(`→ Säkerställer admin-konto för ${adminEmail} …`);
  let userId: string;
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { namn: adminName },
    });

  if (createError) {
    if (!/already/i.test(createError.message)) {
      console.error(`Kunde inte skapa användaren: ${createError.message}`);
      process.exit(1);
    }
    // Hitta befintlig användare via e-post.
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) {
      console.error(`Kunde inte lista användare: ${listError.message}`);
      process.exit(1);
    }
    const existing = list.users.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase(),
    );
    if (!existing) {
      console.error("Användaren finns men kunde inte hittas via listUsers.");
      process.exit(1);
    }
    userId = existing.id;
    console.log("  Kontot fanns redan – återanvänder det.");
  } else {
    userId = created.user.id;
    console.log("  Konto skapat.");
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    namn: adminName,
    roll: "admin",
    aktiv: true,
  });
  if (profileError) {
    console.error(`Kunde inte skriva profilen: ${profileError.message}`);
    process.exit(1);
  }
  console.log("  Profil: admin, aktiv.");

  // 2. Standardinställningar (skrivs inte över om de redan finns).
  console.log("→ Säkerställer standardinställningar …");
  const { data: existingFilter } = await supabase
    .from("app_settings")
    .select("key")
    .eq("key", "sync_filter")
    .maybeSingle();
  if (!existingFilter) {
    await supabase.from("app_settings").insert({
      key: "sync_filter",
      value: {
        sni_codes: DEFAULT_SYNC_FILTER.sniCodes,
        revenue_min_sek: DEFAULT_SYNC_FILTER.revenueMinSek,
        revenue_years: DEFAULT_SYNC_FILTER.revenueYears,
      },
    });
    console.log("  sync_filter skapad (5 MSEK, 2021/2022, SNI 78.100).");
  } else {
    console.log("  sync_filter fanns redan – rör den inte.");
  }
  const { data: existingAuto } = await supabase
    .from("app_settings")
    .select("key")
    .eq("key", "auto_sync")
    .maybeSingle();
  if (!existingAuto) {
    await supabase
      .from("app_settings")
      .insert({ key: "auto_sync", value: { enabled: true } });
    console.log("  auto_sync skapad (på).");
  }

  // 3. Valfri mock-synk för demo – aldrig default.
  if (withMockData) {
    console.log("→ Kör synk med MockProvider (demo-data) …");
    const { data: run } = await supabase
      .from("import_runs")
      .insert({ started_by: userId, status: "running", source: "mock", trigger: "manuell" })
      .select("id")
      .single();
    const result = await runSync(
      new MockProvider(),
      new SupabaseSyncStore(supabase),
      DEFAULT_SYNC_FILTER,
    );
    if (run) {
      await supabase
        .from("import_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: result.errors.length > 0 ? "fel" : "ok",
          fetched: result.fetched,
          created: result.created,
          updated: result.updated,
          errors: result.errors,
        })
        .eq("id", run.id);
    }
    console.log(
      `  Klart: ${result.fetched} hämtade, ${result.created} nya, ${result.updated} uppdaterade, ${result.leadsCreated} leads, ${result.errors.length} fel.`,
    );
  } else {
    console.log(
      "→ Hoppar över testdata. Importera din CSV i appen (Import & synk) eller kör `npm run seed -- --with-mock-data` för demo-data.",
    );
  }

  console.log("");
  console.log("Klart! Logga in med:");
  console.log(`  E-post:   ${adminEmail}`);
  console.log("  Lösenord: (det du satte i SEED_ADMIN_PASSWORD)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
