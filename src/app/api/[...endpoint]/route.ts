import { NextRequest } from "next/server";
import account from "../../../../api/account";
import session from "../../../../api/auth/session";
import authorize from "../../../../api/auth/authorize";
import callback from "../../../../api/auth/callback";
import signout from "../../../../api/auth/signout";
import progress from "../../../../api/progress";
import vocabulary from "../../../../api/vocabulary";
import practice from "../../../../api/grammar-practice";
import timer from "../../../../api/study-time";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handlers: Record<string, Function> = {
  account,
  "grammar-practice": practice,
  "auth/session": session,
  "auth/authorize": authorize,
  "auth/callback": callback,
  "auth/signout": signout,
  progress,
  vocabulary,
  "study-time": timer,
};
async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ endpoint: string[] }> },
) {
  const { endpoint } = await params;
  const handler = handlers[endpoint.join("/")];
  if (!handler) return Response.json({ error: "Not found" }, { status: 404 });
  const headers = new Headers({ "Cache-Control": "no-store" });
  let status = 200,
    result: string | undefined;
  let body: string | undefined;
  if (!["GET", "HEAD"].includes(request.method)) {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return Response.json(
            { error: "Request too large" },
            { status: 413, headers },
          );
        }
        chunks.push(value);
      }
    }
    body = Buffer.concat(chunks).toString("utf8");
  }
  const req = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };
  const res = {
    get statusCode() {
      return status;
    },
    set statusCode(value: number) {
      status = value;
    },
    setHeader(key: string, value: string | string[]) {
      headers.delete(key);
      for (const item of Array.isArray(value) ? value : [value])
        headers.append(key, item);
    },
    getHeader(key: string) {
      return key.toLowerCase() === "set-cookie"
        ? headers.getSetCookie()
        : headers.get(key);
    },
    end(value?: string) {
      result = value;
    },
  };
  await handler(req, res);
  return new Response(result, { status, headers });
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
  handle as OPTIONS,
};
