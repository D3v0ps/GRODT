"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignLeadAction, updateLeadStatusAction } from "@/actions/leads";
import { StatusBadge } from "@/components/status-badge";
import { useToast } from "@/components/toast";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";

interface UserOption {
  id: string;
  namn: string;
}

export function DetailActions({
  leadId,
  status,
  ownerId,
  users,
}: {
  leadId: string;
  status: string;
  ownerId: string | null;
  users: UserOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [currentOwner, setCurrentOwner] = useState(ownerId ?? "");

  function changeStatus(next: string) {
    const prev = currentStatus;
    setCurrentStatus(next);
    startTransition(async () => {
      const result = await updateLeadStatusAction({
        leadId,
        status: next as LeadStatus,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (!result.ok) setCurrentStatus(prev);
      else router.refresh();
    });
  }

  function changeOwner(next: string) {
    const prev = currentOwner;
    setCurrentOwner(next);
    startTransition(async () => {
      const result = await assignLeadAction({
        leadId,
        ownerId: next === "" ? null : next,
      });
      toast(result.message, result.ok ? "ok" : "err");
      if (!result.ok) setCurrentOwner(prev);
      else router.refresh();
    });
  }

  return (
    <div className="actions">
      <StatusBadge status={currentStatus} />
      <select
        className="select"
        aria-label="Byt status"
        value={currentStatus}
        disabled={pending}
        onChange={(e) => changeStatus(e.target.value)}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Tilldela ansvarig"
        value={currentOwner}
        disabled={pending}
        onChange={(e) => changeOwner(e.target.value)}
      >
        <option value="">Ej tilldelad</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.namn}
          </option>
        ))}
      </select>
    </div>
  );
}
