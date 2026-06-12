/**
 * profiles.avatar_url innehåller en lagringssökväg ("userId/123.jpg") som
 * appen byter mot en signerad URL vid varje sidrendering – bucketen är
 * privat. Äldre rader kan innehålla hela den publika URL:en från tiden då
 * bucketen var öppen; plocka ut sökvägen ur den. Returnerar null för
 * externa/okända URL:er.
 */
export function avatarStoragePath(value: string | null): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value;
  const marker = "/avatars/";
  const index = value.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(value.slice(index + marker.length));
}
