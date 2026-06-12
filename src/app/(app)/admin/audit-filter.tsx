"use client";

import { useRouter } from "next/navigation";
import { ACTIVITY_ACTIONS } from "@/lib/activity-actions";
import { actionLabel } from "@/lib/activity-text";

interface UserOption {
  id: string;
  namn: string;
}

export function AuditFilter({
  users,
  selectedUser,
  selectedAction,
  selectedDate,
}: {
  users: UserOption[];
  selectedUser: string;
  selectedAction: string;
  selectedDate: string;
}) {
  const router = useRouter();

  function navigate(user: string, action: string, date: string) {
    const q = new URLSearchParams();
    if (user) q.set("anvandare", user);
    if (action) q.set("handling", action);
    if (date) q.set("datum", date);
    router.push(`/admin${q.size > 0 ? `?${q.toString()}` : ""}`);
  }

  return (
    <>
      <select
        className="select"
        aria-label="Filtrera på användare"
        value={selectedUser}
        onChange={(e) => navigate(e.target.value, selectedAction, selectedDate)}
      >
        <option value="">Alla användare</option>
        <option value="system">Systemet (automatik)</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.namn}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Filtrera på handling"
        value={selectedAction}
        onChange={(e) => navigate(selectedUser, e.target.value, selectedDate)}
      >
        <option value="">Alla handlingar</option>
        {ACTIVITY_ACTIONS.map((action) => (
          <option key={action} value={action}>
            {actionLabel(action)}
          </option>
        ))}
      </select>
      <input
        className="input mono"
        type="date"
        aria-label="Filtrera på datum"
        style={{ width: 150 }}
        value={selectedDate}
        onChange={(e) => navigate(selectedUser, selectedAction, e.target.value)}
      />
    </>
  );
}
