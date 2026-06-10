import { redirect } from "next/navigation";

/** Middleware skickar oinloggade till /login; inloggade hamnar på dashboarden. */
export default function RootPage() {
  redirect("/dashboard");
}
