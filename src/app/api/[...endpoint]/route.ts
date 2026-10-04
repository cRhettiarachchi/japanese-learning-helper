import listening from "../../../../server/handlers/listening";
import { NextRequest } from "next/server";
import videoNotes from "../../../../server/handlers/video-notes";
import account from "../../../../server/handlers/account";
import session from "../../../../server/handlers/auth/session";
import authorize from "../../../../server/handlers/auth/authorize";
import callback from "../../../../server/handlers/auth/callback";
import signout from "../../../../server/handlers/auth/signout";
import progress from "../../../../server/handlers/progress";
import vocabulary from "../../../../server/handlers/vocabulary";
import practice from "../../../../server/handlers/grammar-practice";
import revisionCard from "../../../../server/handlers/revision-card";
import timer from "../../../../server/handlers/study-time";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handlers: Record<string, Function> = {
  listening,
  account,
  "video-notes": videoNotes,
  "revision-card": revisionCard,
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
        if (size > (endpoint.join("/") === "listening" ? 1048576 : 65536)) {
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
