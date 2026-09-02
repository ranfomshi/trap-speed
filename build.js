/* Builds the site out of src/. No dependencies on purpose: Netlify runs
   `node build.js` and everything it needs is in this repo.
   Wrapped in an async main() only because the share-card step drives a browser
   over a websocket, which cannot be done synchronously. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const OUT = path.join(__dirname, "public");

const SITE  = "https://myautoracer.com";
/* The tranche of car pages. Raise it, or set CAR_PAGES=all, once the previous
   tranche has had time to be indexed and judged.

   700 -> 850 because pages are now additive: the manifest pins everything
   already published, so re-ordering the tranche can no longer swap 123 cars out
   and 404 them -- it can only decide who fills the space above the pin. At 700
   there was no space, and the whole point of the re-order (ordinary cars ahead
   of each marque's supercar, because that is where the searches are) had nowhere
   to land. The extra 150 are that re-order, and they are almost all everyday
   cars. Still a measured tranche: 850 of 2,941. */
const CAR_PAGES_DEFAULT = 850;
const TITLE = "My Auto Racer — drag race any two real cars";
/* The count is in the description, so the description cannot be a constant --
   it is written once the car data has actually been read. */
const DESC_ = n => "A drag race simulator for real cars. Pick two of " + n + " models, set the "
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

/* Every car must produce a finite run. A NaN here is silent in the browser --
   the car just never finishes its race -- and one slipped through once when a
   field the physics reads stopped being a value it recognised. Run before
   anything is written: a build that is going to fail should fail in a second,
   not after thirteen seconds of list-building. */
const CARS = (() => {
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
  return CARS;
})();

/* The About block states a number of models; it has to be the real one, and it
   has to be in the HTML rather than filled in by script, because the readers it
   is written for do not run any. */
body = body.replace('<b id="aboutCount">2,900</b>', `<b id="aboutCount">${CARS.length.toLocaleString("en-GB")}</b>`);

const withLogos = body.replace(
  /const LOGOMAP=\/\*\[\[LOGOMAP\]\]\*\/\{\};/,
  "const LOGOMAP=" + JSON.stringify(logomap) + ";"
);
if (withLogos === body) throw new Error("LOGOMAP marker not found in src/app.html");

/* Written to a file rather than inlined as a data URI on the home page only.
   The generated pages declared no icon at all, so every one of the 470 of them
   cost a 404 on /favicon.ico -- harmless to a reader, wasted requests to a
   crawler, and the kind of thing that shows up in an audit as a real finding. */
const FAVICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="7" fill="#0B0D10"/>` +
  `<circle cx="16" cy="8"  r="3.4" fill="#F2A20C"/>` +
  `<circle cx="16" cy="16" r="3.4" fill="#F2A20C"/>` +
  `<circle cx="16" cy="24" r="3.4" fill="#2FCB6E"/></svg>`;
const favicon = "/favicon.svg";

const SEO = require("./lib/seo.js");
const DESC = DESC_(CARS.length.toLocaleString("en-GB"));

/* The home page is the strongest page on the site and, being an app, the one
   with least for a machine to read. These three nodes say what it is: a piece
   of software, the dataset behind it, and the questions the About block below
   answers in visible prose. Nothing here is marked up that the page does not
   actually show. */
const HOME_LD = SEO.jsonld({ "@context":"https://schema.org", "@graph":[
  { "@type":"WebSite", "@id":`${SITE}/#website`, url:`${SITE}/`, name:"My Auto Racer",
    description:DESC, inLanguage:"en" },
  { "@type":"SoftwareApplication", "@id":`${SITE}/#app`, name:"My Auto Racer",
    url:`${SITE}/`, applicationCategory:"Simulation", applicationSubCategory:"Drag race simulator",
    operatingSystem:"Any browser", browserRequirements:"Requires JavaScript",
    description:DESC, inLanguage:"en", isAccessibleForFree:true,
    offers:{ "@type":"Offer", price:"0", priceCurrency:"GBP" },
    featureList:["Standing 60 ft, 1/8 mile, 1/4 mile and standing kilometre",
      "Trap speed and speed trace", "Dry to wet surface grip", "Air temperature, altitude and wind",
      "Gradient, passenger load and rolling starts", "Head-to-head between any two models"] },
  { "@type":"Dataset", "@id":`${SITE}/#dataset`, name:"My Auto Racer simulated acceleration figures",
    url:`${SITE}/vs/`, inLanguage:"en", dateModified:SEO.BUILT,
    description:`Simulated 0-60 mph, 60 ft, 1/8 mile, 1/4 mile and trap-speed figures for `
      + `${CARS.length.toLocaleString("en-GB")} car models, each computed from published kerb mass, `
      + `rated power, drivetrain and gearing and then fitted to that model's own published `
      + `acceleration figures. Identical conditions for every car: dry asphalt, 20 C, sea level, `
      + `1 ft rollout. Simulated, not measured.`,
    variableMeasured:["0-60 mph time","60 ft time","1/8 mile time","1/4 mile time",
      "quarter-mile trap speed","kerb mass","rated power","power to weight"],
    /* Where the inputs came from. An answer engine deciding whether to trust a
       number wants the chain, not a claim of accuracy. */
    isBasedOn:["https://accelerationtimes.com","https://cardata.wiki"],
    creator:{ "@type":"Organization", name:"My Auto Racer", url:`${SITE}/` } },
  SEO.faqPage([
    { q:"Are the times on My Auto Racer real measured times?",
      a:"No. They are produced by a physics simulation, not by a stopwatch at a drag strip. The "
       +"simulation is calibrated against each car's published acceleration figures, so it agrees "
       +"with the manufacturer where the manufacturer has published a number, and interpolates "
       +"between those points everywhere else." },
    { q:"What can I change about the race?",
      a:"Distance (60 ft, 1/8 mile, 1/4 mile, standing kilometre, or a roll-on), surface grip from "
       +"dry to wet, air temperature, altitude, headwind or tailwind, gradient, passenger load, and "
       +"a rolling start." },
    { q:"Where does the car data come from?",
      a:"Kerb mass, power, drivetrain and published acceleration figures come from "
       +"accelerationtimes.com and cardata.wiki, both CC BY 4.0. Kerb mass is recorded as the DIN "
       +"figure - the car with no driver - and the simulator adds a 75 kg driver of its own." },
    { q:"Does it cost anything?",
      a:"No. It runs in the browser, there is no account, and there are no ads." }
  ])
]});

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
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${TITLE}">
<meta name="twitter:description" content="${DESC}">
<meta name="twitter:image" content="${SITE}/og.png">
${SEO.ROBOTS}
${HOME_LD}
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
fs.writeFileSync(path.join(OUT, "favicon.svg"), FAVICON_SVG);

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
const V = require("./lib/vs.js");
const vs = V.build(app, OUT, SITE);

/* Every car, run once. Three page types need this and it is the expensive part
   of the build, so it is computed here and handed down rather than recomputed
   in each of them. */
const A = V.physics(app);
const t0 = Date.now();
const all = A.CARS.map(c => ({ c, f: V.figures(A, c) }))
                  .filter(r => r.f.s60 != null && r.f.qm != null);
console.log(`  ran ${all.length} cars in ${((Date.now()-t0)/1000).toFixed(1)}s`);

/* One page per car. CAR_PAGES caps the tranche -- "all" for the lot -- because
   2,900 pages arriving in one push reads as a doorway network however real the
   content is, and because a tranche you can measure is worth more than a
   backlog you cannot. */
const capRaw = process.env.CAR_PAGES || String(CAR_PAGES_DEFAULT);
if (!/^(all|\d{1,5})$/.test(capRaw)) throw new Error("build: CAR_PAGES must be a number or 'all'");
const cap = capRaw === "all" ? null : Number(capRaw);

/* A handful of cars share a name AND a year with another car, so nothing we can
   put in a title tells them apart. They are either one car entered twice or two
   cars one of which is wrong -- a data question, not a naming one. Publishing
   both would put two pages with one title on a domain that cannot afford to
   have either discarded, so they are held back and written down instead. */
const stuckIds = new Set(A.collisions.flatMap(c => c.ids.slice(1)));
if (A.collisions.length) {
  fs.writeFileSync(path.join(__dirname, "data/name-collisions.json"),
    JSON.stringify(A.collisions, null, 1) + "\n");
  console.log(`  ${A.collisions.length} name collisions held back `
    + `(${[...stuckIds].join(", ")}) -> data/name-collisions.json`);
}
const cars = require("./lib/cars.js").build(all.filter(r => !stuckIds.has(r.c.id)),
                                            OUT, SITE, vs.made, cap);
console.log(`  ${cars.urls.length - 1} car pages of ${all.length} (CAR_PAGES=${capRaw})`);

/* Make pages and the fastest-lists. They get the comparison manifest so a make
   page can point at the head-to-heads that already exist for it, and the car-page
   lookup so a listed car links to its own page instead of straight into the app. */
const listUrls = require("./lib/lists.js").build(app, OUT, SITE, vs.made, all, cars.carUrl);

/* The pages nobody else can write: threshold lists ("cars that do 0-60 in under
   four seconds", which is a real search with an exact answer we hold), and the
   condition pages, which re-run every car in the wet, at altitude and with a
   passenger. Those last three are the only content on this site a rival with the
   same spec sheets could not reproduce. */
const t1 = Date.now();
const answers = require("./lib/answers.js").build(A, all, OUT, SITE, cars.carUrl);
const answerUrls = answers.map(a => a.url);
console.log(`  ${answers.length} answer pages in ${((Date.now()-t1)/1000).toFixed(1)}s`);

/* A temporary page for judging how the cars are drawn: /lab/cars/. Noindex,
   unlinked, and deliberately NOT added to vsUrls, so it reaches no sitemap. */
console.log("  lab page:", require("./lib/lab.js").build(app, OUT, SITE));

const vsUrls = vs.urls.concat(cars.urls, listUrls, answerUrls);

/* lastmod is the one field crawlers actually act on, and it has to be honest:
   every page here is regenerated from the car data on every build, so the build
   date is the true modification date for all of them. The index pages get a
   higher priority than the leaves because they are how a crawler reaches them. */
const isIndex = u => /^\/(vs|0-60-times|fastest)\/$/.test(u);

/* One sitemap per page type, behind a sitemap index.
   Search Console reports coverage per submitted sitemap, so a single file can
   only ever answer "n of 1,188 indexed" -- a blended number across four kinds of
   page that are working or failing for completely different reasons. Split, the
   same report answers the question we actually have to decide on: which KIND of
   page earns indexing. If the answer pages index and the car pages do not, then
   releasing the remaining 2,200 car pages is precisely the wrong move, and with
   one sitemap we would never have seen it.
   /sitemap.xml stays the entry point, so the URL already submitted to Google and
   Bing keeps working and the children are discovered through it. */
const SETS = [
  ["core",    ["/"]],
  ["vs",      vs.urls],
  ["cars",    cars.urls],
  ["lists",   listUrls],
  ["answers", answerUrls]
].filter(([, us]) => us.length);

const urlset = us =>
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${us.map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${SEO.BUILT}</lastmod>`
  + `<changefreq>${u === "/" || isIndex(u) ? "weekly" : "monthly"}</changefreq>`
  + `<priority>${u === "/" ? "1.0" : isIndex(u) ? "0.9" : "0.7"}</priority></url>`).join("\n")}
</urlset>
`;
for (const [k, us] of SETS) fs.writeFileSync(path.join(OUT, `sitemap-${k}.xml`), urlset(us));

fs.writeFileSync(path.join(OUT, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SETS.map(([k]) => `  <sitemap><loc>${SITE}/sitemap-${k}.xml</loc>`
  + `<lastmod>${SEO.BUILT}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`);
console.log(`  sitemap: ${SETS.map(([k, us]) => `${k} ${us.length}`).join(", ")}`
  + ` = ${SETS.reduce((n, [, us]) => n + us.length, 0)} urls`);

/* --- llms.txt ------------------------------------------------------------
   A proposed convention (llmstxt.org): a markdown map of the site at a fixed
   path, for a model that has landed here and wants to know what else is worth
   fetching. Be straight about its status -- no major crawler has committed to
   reading it, so this is a cheap bet, not a mechanism. It costs one file and it
   is the only place on the site that states the whole shape of it in one page,
   which makes it worth having even if nothing ever requests it. */
{
  const cats = listUrls.filter(u => u.startsWith("/fastest/") && u !== "/fastest/");
  const makesU = listUrls.filter(u => u.startsWith("/0-60-times/") && u !== "/0-60-times/");
  const pretty = u => u.replace(/^\/[a-z0-9-]+\//, "").replace(/\/$/, "").replace(/-/g, " ");
  const llms = `# My Auto Racer

> A drag race simulator for real cars, at ${SITE}. ${CARS.length.toLocaleString("en-GB")} models.
> Pick any two, set the distance, surface and weather, and watch them run: 60 ft,
> 1/8 mile, 1/4 mile, standing kilometre, trap speed and a speed trace for each car.

## What the numbers are

Every figure on this site is **simulated, not measured**. Each car is modelled from its
published kerb mass, rated power, drivetrain and gearing; the model then trims tyre grip
and delivered power until the car reproduces its own published acceleration figures. Every
car runs in identical conditions -- dry asphalt, 20 C, sea level, 1 ft rollout -- so the
comparison between two cars is fair even though no individual time is a timing slip.

Kerb mass is held as the **DIN** figure (the car with no driver); the simulator adds a
75 kg driver of its own. Source data: accelerationtimes.com and cardata.wiki, both CC BY 4.0.

If you cite a figure from this site, please say that it is simulated.

Last regenerated: ${SEO.BUILT}. Build: see /analytics.js.

## Cars

One page per car: 0-60, 60 ft, eighth and quarter mile, trap speed, the specification
it was simulated from, where it ranks in the set, and three similar cars to race it
against. ${cars.urls.length - 1} published of ${CARS.length.toLocaleString("en-GB")}.

- [Every car](${SITE}/cars/): filterable, grouped by make.
${cars.published.slice(0, 25).map(r => `- [${r.c.mk} ${r.c.md}](${SITE}/cars/${r.slug}/)`).join("\n")}

## Questions a spec sheet cannot answer

Every other car site publishes the same manufacturer 0-60. These are the questions
only a simulation can answer, computed by re-running every car under changed conditions.

- [All of them](${SITE}/answers/)
${answers.filter(a => a.url !== "/answers/")
  .map(a => `- [${a.label}](${SITE}${a.url})${a.n ? ` — ${a.n} cars` : ""}`).join("\n")}

## Head-to-head comparisons

- [All ${vs.urls.length - 1} comparisons](${SITE}/vs/): every pair we have built, filterable.
${vs.made.slice(0, 25).map(m => `- [${m.a.mk} ${m.a.md} vs ${m.b.mk} ${m.b.md}](${SITE}/vs/${m.dir}/)`).join("\n")}

## 0-60 times by make

- [Every make](${SITE}/0-60-times/): ${makesU.length} makes, each model ranked by 0-60.
${makesU.map(u => `- [${pretty(u)} 0-60 times](${SITE}${u})`).join("\n")}

## Fastest lists

- [All lists](${SITE}/fastest/)
${cats.map(u => `- [Fastest ${pretty(u)}](${SITE}${u})`).join("\n")}

## Optional

- [Sitemap](${SITE}/sitemap.xml)
- [robots.txt](${SITE}/robots.txt) -- all answer-engine crawlers are explicitly allowed.
`;
  fs.writeFileSync(path.join(OUT, "llms.txt"), llms);
  console.log(`  llms.txt written (${(llms.length/1024).toFixed(1)} KB)`);
}

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
  /* The commit these pages were generated from, stamped into every event. It
     is what turns "we changed the SEO" into something you can put on an axis:
     segment any metric by build and the before and after separate themselves,
     with no need to remember which day a deploy happened. Falls back to the
     date when git is not available (Netlify's own build image, a tarball). */
  let build = "";
  try {
    build = require("child_process")
      .execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8", stdio:["ignore","pipe","ignore"] })
      .trim();
  } catch (e) {}
  if (!/^[0-9a-f]{6,12}$/.test(build)) build = "d" + SEO.BUILT.replace(/-/g, "");
  fs.writeFileSync(path.join(OUT, "analytics.js"),
    src.replace("__MP_TOKEN__", token).replace("__MP_HOST__", mpHost)
       .replace("__MP_BUILD__", build));
  console.log(`  analytics build stamp ${build}`);
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

(async()=>{
/* Per-page share images. Generated after the pages exist and then patched INTO
   them, rather than promised by them up front: if there is no browser on the
   machine, or the render fails, the pages keep the static card and the build
   still ships. A page must never claim an og:image that was not written. */
{
  const og=require("./lib/og.js");
  const t2=Date.now();
  /* Both page families that get shared: the comparison pages, and each car page
     staged against its closest rival. */
  const wanted=[
    ...vs.made.map(m=>({a:m.a.id,b:m.b.id,slug:m.dir,file:path.join(OUT,"vs",m.dir,"index.html")})),
    ...cars.hero.map(h=>({a:h.a,b:h.b,slug:"car-"+h.slug,file:path.join(OUT,"cars",h.slug,"index.html")}))
  ];
  const n=await og.build({outDir:OUT,site:SITE,pairs:wanted,onCard:(p,url)=>{
    const f=p.file;
    if(!fs.existsSync(f)) return;
    const doc=fs.readFileSync(f,"utf8").split(`${SITE}/og.png`).join(url);
    fs.writeFileSync(f,doc);
  }});
  console.log(`  ${n} share cards in ${((Date.now()-t2)/1000).toFixed(1)}s`);
}
})();
