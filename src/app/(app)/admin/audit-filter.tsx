"use client";

import { useRouter } from "next/navigation";

interface UserOption {
  id: string;
  namn: string;
}

export function AuditFilter({
  users,
  selectedUser,
  selectedDate,
}: {
  users: UserOption[];
  selectedUser: string;
  selectedDate: string;
}) {
  const router = useRouter();

  function navigate(user: string, date: string) {
    const q = new URLSearchParams();
    if (user) q.set("anvandare", user);
    if (date) q.set("datum", date);
    router.push(`/admin${q.size > 0 ? `?${q.toString()}` : ""}`);
  }

  return (
    <>
      <select
        className="select"
        aria-label="Filtrera på användare"
        value={selectedUser}
        onChange={(e) => navigate(e.target.value, selectedDate)}
      >
        <option value="">Alla användare</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.namn}
          </option>
        ))}
      </select>
      <input
        className="input mono"
        type="date"
        aria-label="Filtrera på datum"
        style={{ width: 150 }}
        value={selectedDate}
        onChange={(e) => navigate(selectedUser, e.target.value)}
      />
    </>
  );
}
