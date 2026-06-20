import express from "express";
import Redis from "ioredis";

/**
 * Servico de rastreamento de aberturas das demos — self-hosted (Docker na VPS).
 * Usa o Redis da propria VPS (REDIS_URL interno). Custo zero.
 *
 * Rotas:
 *   GET  /d/:id            link enviado ao dono: registra clique e redireciona
 *   GET  /t/:id            pixel da landing: conta abertura ao renderizar
 *   POST /api/register     (x-secret) mapeia id -> URL real da demo
 *   GET  /api/events       (?secret&since) eventos para o dashboard consultar
 *   GET  /health           healthcheck
 */

const PORT = Number(process.env.PORT || 3000);
const SECRET = process.env.TRACKER_SECRET || "";
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
redis.on("error", (e) => console.error("[redis]", e.message));

const app = express();
app.use(express.json());
app.set("trust proxy", true);

// 1x1 gif transparente
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// previews/bots que NAO contam como abertura real (ex.: previa do WhatsApp)
const BOT =
  /bot|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|preview|crawler|spider|curl|wget|headless|lighthouse|monitor|pingdom|uptime/i;
const isBot = (ua = "") => BOT.test(ua);

async function recordOpen(id, req, type) {
  const ts = Date.now();
  const ev = {
    id,
    ts,
    type,
    ip: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim(),
    ua: String(req.headers["user-agent"] || "").slice(0, 200),
    n: Math.random().toString(36).slice(2, 8),
  };
  await redis.zadd("events", ts, JSON.stringify(ev));
  await redis.incr(`opens:${id}`);
  await redis.set(`lastopen:${id}`, ts);
  await redis.zremrangebyrank("events", 0, -5001).catch(() => {});
}

// link rastreavel -> registra e redireciona pra demo real
app.get("/d/:id", async (req, res) => {
  const id = req.params.id;
  let url = null;
  try {
    url = await redis.get(`map:${id}`);
    if (!isBot(req.headers["user-agent"] || "")) await recordOpen(id, req, "click");
  } catch (e) {
    console.error("[d]", e.message);
  }
  if (url) res.redirect(302, url);
  else res.status(404).send("Demo nao encontrada.");
});

// pixel da landing
app.get("/t/:id", async (req, res) => {
  const id = String(req.params.id).replace(/\.gif$/i, "");
  try {
    if (!isBot(req.headers["user-agent"] || "")) await recordOpen(id, req, "pixel");
  } catch (e) {
    console.error("[t]", e.message);
  }
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.status(200).send(PIXEL);
});

// registro do mapeamento id -> URL real (chamado pelo pipeline)
app.post("/api/register", async (req, res) => {
  const secret = req.headers["x-secret"] || req.query.secret;
  if (!SECRET || secret !== SECRET) return res.status(401).json({ error: "unauthorized" });
  const { id, url, name } = req.body || {};
  if (!id || !url) return res.status(400).json({ error: "id e url obrigatorios" });
  try {
    await redis.set(`map:${id}`, url);
    if (name) await redis.set(`name:${id}`, name);
    res.json({ ok: true, link: `/d/${id}` });
  } catch (e) {
    res.status(503).json({ error: "redis indisponivel: " + e.message });
  }
});

// eventos para o dashboard consultar
app.get("/api/events", async (req, res) => {
  if (!SECRET || req.query.secret !== SECRET) return res.status(401).json({ error: "unauthorized" });
  const since = Number(req.query.since || 0);
  try {
    const raw = await redis.zrangebyscore("events", `(${since}`, "+inf");
    const events = raw
      .map((s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    res.set("Cache-Control", "no-store");
    res.json({ events, now: Date.now() });
  } catch (e) {
    res.status(503).json({ error: "redis indisponivel: " + e.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`lead-tracker ouvindo na porta ${PORT}`));
