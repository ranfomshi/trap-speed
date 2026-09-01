/* Builds the site out of src/. No dependencies on purpose: Netlify runs
   `node build.js` and everything it needs is in this repo. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "public");

const SITE  = "https://myautoracer.com";
const TITLE = "My Auto Racer — drag race any two real cars";
const DESC  = "A drag race simulator for real cars. Pick two of 2,843 models, set the "
            + "distance, the surface and the weather, and watch them run. Every car is "
            + "simulated from its published mass, power and drivetrain, then fitted "
            + "against its own published acceleration figures.";

const app = fs.readFileSync(path.join(SRC, "app.html"), "utf8");
const logomap = JSON.parse(fs.readFileSync(path.join(SRC, "logomap.json"), "utf8"));

/* The artifact host wraps the file itself, so title, font links and the whole
   stylesheet sit at the top of the body. A real page wants them in the head. */
const headBits = [];
let body = app.replace(/^<title>[\s\S]*?<\/title>\n/m, "");   /* the page title is set below */
body = body.replace(/^<link [^>]*>\n/gm, m => {
  headBits.push(m.trim());
  return "";
});
body = body.replace(/^<style>[\s\S]*?<\/style>\n/m, m => {
  headBits.push(m.trim());
  return "";
});
if (!headBits.some(h => h.startsWith("<style>"))) throw new Error("stylesheet not found in src/app.html");

const withLogos = body.replace(
  /const LOGOMAP=\/\*\[\[LOGOMAP\]\]\*\/\{\};/,
  "const LOGOMAP=" + JSON.stringify(logomap) + ";"
);
if (withLogos === body) throw new Error("LOGOMAP marker not found in src/app.html");

const favicon =
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="#0B0D10"/>` +
    `<circle cx="16" cy="8"  r="3.4" fill="#F2A20C"/>` +
    `<circle cx="16" cy="16" r="3.4" fill="#F2A20C"/>` +
    `<circle cx="16" cy="24" r="3.4" fill="#2FCB6E"/></svg>`
  )}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0B0D10">
<meta name="description" content="${DESC}">
<title>${TITLE}</title>\n<link rel="canonical" href="${SITE}/">
<link rel="icon" href="${favicon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="My Auto Racer">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${SITE}/og.png">
${headBits.join("\n")}
<style>
  html{color-scheme:dark}
  body{margin:0;background:#0B0D10;color:#E9EDF2}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
</head>
<body>
${withLogos}
</body>
</html>
`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "logos"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html);

let n = 0;
for (const f of fs.readdirSync(path.join(SRC, "logos"))) {
  fs.copyFileSync(path.join(SRC, "logos", f), path.join(OUT, "logos", f));
  n++;
}
/* IndexNow: Bing and Yandex accept a push of changed URLs from anyone who can
   prove they own the host, and the proof is this file sitting at its root. */
const INDEXNOW_KEY = "4c5a35b261552b253134c84f789dbac4";
/* Google verifies ownership by fetching a file it named; it has to survive
   every rebuild or the property silently loses its owner. */
const GOOGLE_VERIFY = "googlee3b1cf31674cc5d9.html";
for (const f of ["robots.txt", "og.png", INDEXNOW_KEY + ".txt", GOOGLE_VERIFY]) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f));
}

/* Comparison pages. Their numbers come from the simulator itself, run in a VM
   over the same car data the app ships, so a page cannot disagree with the app. */
const vs = require("./lib/vs.js").build(app, OUT, SITE);
/* Make pages and the fastest-lists. They get the comparison manifest so a make
   page can point at the head-to-heads that already exist for it. */
const listUrls = require("./lib/lists.js").build(app, OUT, SITE, vs.made);
/* Every car must produce a finite run. A NaN here is silent in the browser --
   the car just never finishes its race -- and one slipped through once when a
   field the physics reads stopped being a value it recognised. */
{
  const vm=require("vm");
  const dom=app.indexOf("const $=s=>document.querySelector");
  const ctx={console}; vm.createContext(ctx);
  vm.runInContext(app.slice(app.lastIndexOf("<script>",dom)+8).slice(0,
    app.slice(app.lastIndexOf("<script>",dom)+8).indexOf("const $=s=>document.querySelector"))
    +";globalThis.__c={CARS,run,QM};",ctx);
  const {CARS,run,QM}=ctx.__c;
  const env={surf:"dry",tempC:20,alt:0,wind:0,grade:0,load:0};
  const bad=CARS.filter(c=>!Number.isFinite(run(c,env,{maxD:QM,maxT:90}).vEnd));
  if(bad.length) throw new Error("build: "+bad.length+" car(s) produce a non-finite run: "
    +bad.slice(0,5).map(c=>c.id).join(", "));
}

const vsUrls = vs.urls.concat(listUrls);

fs.writeFileSync(path.join(OUT, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
${vsUrls.map(u => `  <url><loc>${SITE}${u}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>
`);

/* Analytics and the consent that gates it, as one file shared by the app and by
   every generated page, so there is a single implementation of the question and
   a single answer stored per visitor. The Mixpanel project token is a public
   client-side identifier -- it can only write events, never read them -- but it
   is still injected from the environment rather than committed, so a fork of
   this repo does not post into someone else's project. With MIXPANEL_TOKEN
   unset the file loads, the consent prompt still works, and nothing is sent. */
{
  const src = fs.readFileSync(path.join(SRC, "analytics.js"), "utf8");
  const token = process.env.MIXPANEL_TOKEN || "";
  if (!/^[a-f0-9]{0,64}$/i.test(token)) throw new Error("build: MIXPANEL_TOKEN is not a plausible token");
  /* Set MIXPANEL_HOST to https://api.mixpanel.com if the project turns out to
     live in US residency. Getting this wrong loses every event silently. */
  const mpHost = process.env.MIXPANEL_HOST || "https://api-eu.mixpanel.com";
  if (!/^https:\/\/api(-eu)?\.mixpanel\.com$/.test(mpHost)) throw new Error("build: MIXPANEL_HOST is not a Mixpanel ingestion host");
  fs.writeFileSync(path.join(OUT, "analytics.js"),
    src.replace("__MP_TOKEN__", token).replace("__MP_HOST__", mpHost));
  if (!token) console.log("  note: MIXPANEL_TOKEN unset -- analytics.js will no-op");

  /* Injected into every page the build produced, rather than into each of the
     three templates that produce them, so a new template cannot ship untracked
     and un-consented. */
  const tag = '<script src="/analytics.js" defer></script>';
  let pages = 0;
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!e.name.endsWith(".html")) continue;
      if (e.name === GOOGLE_VERIFY) continue;   /* a bare token file, not a page */
      const doc = fs.readFileSync(f, "utf8");
      if (doc.includes(tag)) continue;
      const i = doc.lastIndexOf("</body>");
      if (i < 0) throw new Error("build: no </body> to inject analytics into: " + f);
      fs.writeFileSync(f, doc.slice(0, i) + tag + doc.slice(i));
      pages++;
    }
  };
  walk(OUT);
  console.log(`  analytics injected into ${pages} pages`);
}

console.log(`built public/index.html (${(html.length / 1024).toFixed(0)} KB) + ${n} logos + `
  + `${vs.urls.length} comparison pages + ${listUrls.length} list pages`);
