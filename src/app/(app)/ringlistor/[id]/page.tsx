import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IconBack } from "@/components/icons";
import { RinglistaView, type RinglistaItem } from "./ringlista-view";

export const metadata = { title: "Ringlista – GRODT" };

interface ProfileRef {
  namn: string;
}

function refNamn(value: ProfileRef | ProfileRef[] | null): string | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0]?.namn ?? null) : value.namn;
}

export default async function RinglistaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();
  const [profile, listRes, itemsRes] = await Promise.all([
    getSessionProfile(),
    supabase
      .from("call_lists")
      .select("id, namn, created_at, created_by, profiles(namn)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("call_list_items")
      .select(
        "lead_id, position, called_at, ringd_av:profiles!call_list_items_called_by_fkey(namn), leads(id, orgnr, status, owner:profiles!leads_owner_id_fkey(namn), companies(namn, ort, telefon, telefon_kalla))",
      )
      .eq("list_id", id)
      .order("position", { ascending: true }),
  ]);

  const list = listRes.data;
  if (!list) notFound();

  interface ItemRow {
    lead_id: string;
    called_at: string | null;
    ringd_av: ProfileRef | ProfileRef[] | null;
    leads: {
      orgnr: string;
      status: string;
      owner: ProfileRef | ProfileRef[] | null;
      companies:
        | { namn: string; ort: string | null; telefon: string | null; telefon_kalla: string | null }
        | { namn: string; ort: string | null; telefon: string | null; telefon_kalla: string | null }[]
        | null;
    } | null;
  }

  const items: RinglistaItem[] = ((itemsRes.data ?? []) as unknown as ItemRow[]).flatMap(
    (row) => {
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      if (!lead) return [];
      const company = Array.isArray(lead.companies) ? lead.companies[0] : lead.companies;
      return [
        {
          leadId: row.lead_id,
          orgnr: lead.orgnr,
          namn: company?.namn ?? lead.orgnr,
          ort: company?.ort ?? null,
          telefon: company?.telefon ?? null,
          telefonGoogle: company?.telefon_kalla === "google",
          status: lead.status,
          ownerNamn: refNamn(lead.owner),
          ringd: row.called_at !== null,
          ringdAt: row.called_at,
          ringdAvNamn: refNamn(row.ringd_av),
        },
      ];
    },
  );

  return (
    <section className="view view-wide">
      <Link className="backlink" href="/ringlistor">
        <IconBack />
        Alla ringlistor
      </Link>
      <RinglistaView
        listId={list.id}
        namn={list.namn}
        createdByNamn={refNamn(list.profiles as ProfileRef | ProfileRef[] | null)}
        createdAt={list.created_at}
        items={items}
        canDelete={profile?.roll === "admin" || list.created_by === profile?.userId}
      />
    </section>
  );
}
