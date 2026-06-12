"use server";

import { requireUser } from "@/lib/auth";
import { parseListParams, rpcArgs, type LeadListRow } from "@/lib/list-params";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Snabbsöket (Ctrl+K): bolag och kunder på namn/orgnr/ort samt kollegor
 * på namn (till profilsidorna). Återanvänder samma RPC:er som listvyerna
 * – trigramindexen och RLS gäller fullt ut.
 */

export interface SearchBolagHit {
  orgnr: string;
  namn: string;
  ort: string | null;
  status: string;
}

export interface SearchKundHit {
  id: string;
  orgnr: string;
  namn: string;
  ort: string | null;
}

export interface SearchPersonHit {
  id: string;
  namn: string;
  roll: string;
}

export interface GlobalSearchResult {
  bolag: SearchBolagHit[];
  kunder: SearchKundHit[];
  personer: SearchPersonHit[];
}

const EMPTY: GlobalSearchResult = { bolag: [], kunder: [], personer: [] };

export async function globalSearchAction(query: string): Promise<GlobalSearchResult> {
  try {
    await requireUser();
    const q = (query ?? "").trim().slice(0, 120);
    if (q.length < 2) return EMPTY;

    const supabase = await createSupabaseServerClient();
    // Årskolumnerna i list_leads används inte i träfflistan – defaultåren
    // duger och sparar en inställningsfråga per tangenttryckning.
    const [bolagRes, kunderRes, personerRes] = await Promise.all([
      supabase.rpc(
        "list_leads",
        rpcArgs({ ...parseListParams({}), sok: q }, [2021, 2022, 2023, 2024], 6, 0),
      ),
      supabase.rpc("list_customers", { p_search: q, p_limit: 4, p_offset: 0 }),
      supabase
        .from("profiles")
        .select("id, namn, roll")
        .eq("aktiv", true)
        .ilike("namn", `%${q.replaceAll("%", "").replaceAll("_", "")}%`)
        .order("namn")
        .limit(3),
    ]);

    const bolag = ((bolagRes.data ?? []) as LeadListRow[]).map((row) => ({
      orgnr: row.orgnr,
      namn: row.namn,
      ort: row.ort,
      status: row.status,
    }));
    interface KundRow {
      customer_id: string;
      orgnr: string;
      namn: string;
      ort: string | null;
    }
    const kunder = ((kunderRes.data ?? []) as KundRow[]).map((row) => ({
      id: row.customer_id,
      orgnr: row.orgnr,
      namn: row.namn,
      ort: row.ort,
    }));
    const personer = (personerRes.data ?? []).map((row) => ({
      id: row.id as string,
      namn: row.namn as string,
      roll: row.roll as string,
    }));
    return { bolag, kunder, personer };
  } catch {
    // Sök får aldrig krascha UI:t – tomt resultat är alltid ett giltigt svar.
    return EMPTY;
  }
}
