import { headers } from "next/headers";
import { session } from "../../../../server/auth.cjs";
import { withUser } from "../../../../server/db.cjs";
import { snapshot } from "../../../../server/listening.cjs";
import { ListeningLibrary } from "../../../components/listening-library";
export const dynamic = "force-dynamic";
export default async function Page() {
  let initial = null,
    error = "";
  try {
    const h = await headers();
    const s = await session({ headers: { cookie: h.get("cookie") || "" } });
    initial = await withUser(s.user_id, (db: any) => snapshot(db, s.user_id));
  } catch (e: any) {
    error =
      e.status === 401
        ? "Sign in to open your personal listening library."
        : "Listening storage is unavailable. Please try again.";
  }
  return <ListeningLibrary initial={initial} initialError={error} />;
}
