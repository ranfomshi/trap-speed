/* Number plate -> the DVSA MOT history for that vehicle.
 *
 * This exists only because the DVSA credentials cannot go anywhere near a
 * browser. It is a thin proxy: authenticate, ask, hand back the few facts the
 * page needs to narrow the car list. It deliberately does NOT try to pick a
 * car -- the page owns the whole CARS array already, so matching happens there
 * where the data is, rather than shipping a second copy of it up here.
 *
 * A registration is personal data under UK GDPR the moment it is tied to a
 * person, so nothing here logs one, stores one, or lets a cache hold one: no
 * console.log of the input, no plate in an error message we return, and
 * no-store on the way out. Errors are logged by CODE only.
 *
 * A regular function rather than an edge function on purpose. The OAuth token
 * lives an hour, and a warm container reuses one token across many lookups;
 * edge isolates are many and short-lived, so each cold one would re-authenticate
 * against Microsoft and we would spend our rate limit on tokens.
 */
const TOKEN_URL = process.env.MOT_TOKEN_URL;
const CLIENT_ID = process.env.MOT_CLIENT_ID;
const CLIENT_SECRET = process.env.MOT_CLIENT_SECRET;
const SCOPE = process.env.MOT_SCOPE;
const API_KEY = process.env.MOT_API_KEY;
const API = "https://history.mot.api.gov.uk/v1/trade/vehicles/registration/";

/* survives between invocations on a warm container, which is the whole reason
   this is not an edge function. Refreshed a minute early so a request cannot
   be handed a token that expires mid-flight. */
let cached = { token: null, expires: 0 };

async function token() {
  if (cached.token && Date.now() < cached.expires) return cached.token;
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      scope: SCOPE, grant_type: "client_credentials"
    })
  });
  if (!r.ok) throw new Error("token_" + r.status);
  const j = await r.json();
  cached = { token: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

/* Best-effort throttle. A plate endpoint is trivially scrapeable and every
   request we pass on is spent from a quota we do not control. This is per
   container, so it is a speed bump rather than a guarantee -- a real limiter
   would need shared state, and is not worth it before there is traffic. */
const seen = new Map();
const LIMIT = 12, WINDOW = 60_000;
function overLimit(ip) {
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter(t => now - t < WINDOW);
  hits.push(now);
  seen.set(ip, hits);
  if (seen.size > 5000) for (const [k, v] of seen) if (!v.some(t => now - t < WINDOW)) seen.delete(k);
  return hits.length > LIMIT;
}

const json = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export default async (req, ctx) => {
  if (req.method !== "GET") return json(405, { error: "method" });
  if (!TOKEN_URL || !CLIENT_ID || !CLIENT_SECRET || !SCOPE || !API_KEY)
    return json(503, { error: "unconfigured" });

  /* strip everything that is not a plate character, so "YD70 JHF", "yd70-jhf"
     and "YD70JHF" are one lookup rather than three against the quota */
  const raw = new URL(req.url).searchParams.get("reg") || "";
  const reg = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (reg.length < 2 || reg.length > 8) return json(400, { error: "format" });

  const ip = ctx?.ip || req.headers.get("x-nf-client-connection-ip") || "?";
  if (overLimit(ip)) return json(429, { error: "rate" });

  let r;
  try {
    r = await fetch(API + encodeURIComponent(reg), {
      headers: { Authorization: "Bearer " + await token(), "X-API-Key": API_KEY }
    });
  } catch (e) {
    console.error("plate: upstream", e.message);        /* never the plate */
    return json(502, { error: "upstream" });
  }

  if (r.status === 404) return json(404, { error: "notfound" });
  if (r.status === 401 || r.status === 403) {
    cached = { token: null, expires: 0 };               /* force a fresh token next time */
    console.error("plate: auth", r.status);
    return json(502, { error: "upstream" });
  }
  if (!r.ok) { console.error("plate: status", r.status); return json(502, { error: "upstream" }); }

  const v = await r.json();
  const latest = (v.motTests || [])[0];
  /* only what the page needs to filter and to show. The MOT test history, the
     defect list and the odometer are not ours to pass on for a race sim. */
  return json(200, {
    make: v.make || null,
    model: v.model || null,
    fuel: v.fuelType || null,
    engineCC: v.engineSize ? Number(v.engineSize) : null,
    colour: v.primaryColour || null,
    firstUsed: v.firstUsedDate || null,
    year: v.firstUsedDate ? Number(String(v.firstUsedDate).slice(0, 4)) : null,
    motExpiry: latest?.expiryDate || null
  });
};

export const config = { path: "/api/plate" };
