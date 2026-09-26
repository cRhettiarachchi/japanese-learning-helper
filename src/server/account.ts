import "server-only";
import { headers } from "next/headers";
import { loadAccount } from "../../server/account.cjs";
import type { AccountSnapshot } from "../lib/types";
export async function initialAccount(): Promise<AccountSnapshot> {
  const incoming = await headers();
  // This stays on the server. No self-HTTP request or cookie forwarding occurs.
  return loadAccount({ headers: { cookie: incoming.get("cookie") || "" } });
}
