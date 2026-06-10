import { avatarClass, initials } from "@/lib/format";

export function Avatar({
  id,
  namn,
  small = false,
}: {
  id: string;
  namn: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${avatarClass(id)}`.trim()}
      title={namn}
      style={small ? { width: 20, height: 20, fontSize: 8.5 } : undefined}
    >
      {initials(namn)}
    </span>
  );
}

export function AvatarWithName({ id, namn }: { id: string; namn: string }) {
  return (
    <span className="ansvarig-cell">
      <Avatar id={id} namn={namn} />
      <span>{namn}</span>
    </span>
  );
}
