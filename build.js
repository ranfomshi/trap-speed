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
for (const f of ["robots.txt", "og.png"]) {
  const p = path.join(SRC, f);
  if (fs.existsSync(p)) fs.copyFileSync(p, path.join(OUT, f));
}

/* Comparison pages. Their numbers come from the simulator itself, run in a VM
   over the same car data the app ships, so a page cannot disagree with the app. */
const vs = require("./lib/vs.js").build(app, OUT, SITE);
/* Make pages and the fastest-lists. They get the comparison manifest so a make
   page can point at the head-to-heads that already exist for it. */
const listUrls = require("./lib/lists.js").build(app, OUT, SITE, vs.made);
const vsUrls = vs.urls.concat(listUrls);

fs.writeFileSync(path.join(OUT, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
${vsUrls.map(u => `  <url><loc>${SITE}${u}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
</urlset>
`);

console.log(`built public/index.html (${(html.length / 1024).toFixed(0)} KB) + ${n} logos + `
  + `${vs.urls.length} comparison pages + ${listUrls.length} list pages`);
