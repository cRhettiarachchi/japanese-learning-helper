// LOCAL DEMO ONLY: loopback servers + a separate PGlite database. Never imported by app code.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  { spawn } = require("node:child_process"),
  { randomBytes, createHash } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
(async () => {
  const root = path.resolve(__dirname, "..");
  if (!fs.existsSync(path.join(root, ".next/BUILD_ID")))
    throw Error("Run npm run build first.");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const data = path.join(os.tmpdir(), "hirogaru-listening-local-preview");
  const db = await PGlite.create(data);
  for (const name of [
    "schema",
    "study-time",
    "study-time-unbounded",
    "vocabulary",
    "revision-cards",
    "grammar-practice",
    "video-notes",
    "listening",
  ])
    await db.exec(
      fs.readFileSync(path.join(root, "db", name + ".sql"), "utf8"),
    );
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url");
  await db.query(
    "DELETE FROM learner_sessions WHERE user_id='local-listening-preview'",
  );
  await db.query(
    "INSERT INTO learner_sessions(token_hash,user_id,display_name,csrf,expires_at) VALUES($1,'local-listening-preview','Local listening preview',$2,now()+interval '1 day')",
    [createHash("sha256").update(token).digest("hex"), csrf],
  );
  const socket = new PGLiteSocketServer({
    db,
    host: "127.0.0.1",
    port: 55440,
    maxConnections: 8,
  });
  await socket.start();
  const app = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3011",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://postgres@127.0.0.1:55440/postgres?sslmode=disable",
        APP_ORIGIN: "http://127.0.0.1:3010",
        OPENAI_API_KEY: "",
        VERCEL_APP_CLIENT_SECRET: "",
      },
      stdio: "inherit",
    },
  );
  const proxy = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1:3010");
    // Demo sign-in is confined to this loopback process; no production auth path is changed.
    if (
      url.pathname.startsWith("/api/auth/") ||
      ["/api/grammar-practice", "/api/revision-card"].includes(url.pathname)
    ) {
      res.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          error:
            "This local preview uses an isolated demo account. External sign-in and AI calls are disabled.",
        }),
      );
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3011,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: "127.0.0.1:3010",
          cookie: "learner_session=" + token,
        },
      },
      (incoming) => {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent)
        res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Local preview is starting. Refresh shortly.");
    });
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(3010, "127.0.0.1", resolve);
  });
  console.log("Listening demo: http://127.0.0.1:3010/listening/library");
  console.log(
    "Isolated local storage: " + data + ". No production data or AI calls.",
  );
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    proxy.close();
    app.kill("SIGTERM");
    await socket.stop();
    await db.close();
    process.exit(0);
  }
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  app.on("exit", () => {
    if (!stopping) void stop();
  });
})().catch(() => {
  console.error(
    "Local listening preview could not start. Check that ports 3010, 3011 and 55440 are free and run npm run build first.",
  );
  process.exit(1);
});
