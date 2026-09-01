# My Auto Racer

A drag race simulator for real cars. Pick any two of 2,843 models, set the
distance (or a target speed, a rolling start, a fixed time), set the surface,
the air and the gradient, and watch them run side-on in real time.

Live: **https://trap-speed.netlify.app**

## What it actually does

Nobody publishes official acceleration data, so nothing here is looked up — every
run is simulated, then each car is fitted against its own published figures.

At every 2.5 ms step the car makes the smallest of three forces: what the engine
can deliver (`power ÷ speed`, shaped by where it sits in the gear), what the
tyres can hold (grip × the load on the driven axle, including the load that
shifts rearward under acceleration, capped at the wheelie limit), and what the
transmission allows. Against that go aerodynamic drag (`½ρ·CdA·v²`), rolling
resistance and gradient. Air density follows altitude and temperature; it scales
drag for everyone and scales power by how much the engine can claw it back —
fully for a naturally aspirated engine, barely for a turbo, not at all for an EV.

Physics gets the shape of a run right but not the last few percent, so each car
carries two fitted scalars: **grip trim** (test-day surface, tyre, launch) and
**power trim** (driveline losses, real curve versus rated peak). They are
separable only because most cars have anchors at several speeds and distances —
a 60 ft time constrains grip, a trap speed constrains power. Fitting is a build
step, not something a visitor's browser redoes.

Validation is a hold-out: **0–60 mph is never used in any fit**. Across the 2,827
cars that publish one, mean error is 4.2%, median 3.4%.

## The cars are drawn, not sprited

Each car on the strip is one canvas path built from its own length, height,
wheelbase, front overhang and wheel radius — 1,103 of them measured, the rest
estimated from mass and body type. The body archetype sets only the roofline;
on top of it go engine position, the era the car was built in, an open top, and
a wing where the car has one. The wheel arches are cut to fit under whatever
bodywork is above them, which is why a mid-engined car ends up with the low flat
arch and proud front wing that a mid-engined car has.

## Data

| Source | What it gives |
| --- | --- |
| [accelerationtimes.com](https://accelerationtimes.com) | Full acceleration profiles: 0–100 and 0–200 km/h, time and speed at 100 m and 300 m, the quarter mile and its trap speed |
| [cardata.wiki](https://cardata.wiki) (CC BY 4.0) | Mass, power, real gearbox and gear count, and body dimensions |
| [car-logos-dataset](https://github.com/filippofilip95/car-logos-dataset) | Maker badges, sourced from carlogos.org |

Every badge is the trademark of its owner and is shown only to identify that
maker's cars. This project is not affiliated with, endorsed by or connected to
any manufacturer.

## Build

No dependencies. `build.js` wraps `src/app.html` in a document shell, writes the
logo map into it, and copies the assets to `public/`.

```sh
node build.js                 # -> public/
npx serve public              # or any static server
node tools/make-og.js         # regenerates the social card (needs chromium)
```

Netlify runs `node build.js` and publishes `public/`.

## Being found

Two audiences, one body of work, all of it generated at build time by
`lib/seo.js`:

- **Search.** Every page carries a canonical, a `BreadcrumbList`, and
  `max-snippet:-1` so a result is not truncated to 160 characters. The sitemap
  carries a real `lastmod`.
- **Answer engines.** Every generated page opens with one self-contained
  paragraph that names both cars, carries every unit, and says where the number
  came from — written so it survives being quoted with nothing around it. Below
  it, a visible Q&A block, mirrored exactly in `FAQPage` markup: schema that
  describes content the page does not show is a guidelines violation, so the two
  are always written together. `robots.txt` names the model crawlers
  individually, and `/llms.txt` maps the site for anything that reads it.

What this **cannot** tell you is whether a model crawled you. GPTBot, ClaudeBot
and PerplexityBot do not run JavaScript, so they raise no analytics event. Being
read by a model and being clicked through from one are different things, and
only the second is visible from a browser. Server logs are the only place the
first shows up.

## Measurement

Every event carries `channel` (`ai` / `search` / `social` / `referral` /
`direct`), `page_type`, `page_id`, `first_channel` and `build` — the commit the
pages were generated from. That last one is what makes an experiment legible:
segment any metric by `build` and the before and after separate themselves
without anyone having to remember which day a deploy happened.

The funnel on a generated page is `Page viewed` -> `Page engaged` (10 s with
scroll, or 25% depth) -> `Sim opened` (the conversion; the visitor staged a
race). `Internal link clicked` says which page they went to next.

## Layout

```
src/app.html      the whole app: markup, styles and script in one file
src/analytics.js  events, consent, and where the visit came from
src/robots.txt    the wildcard, plus every model crawler by name
src/logos/        126 maker badges
src/logomap.json  make name -> badge file
build.js          wraps app.html into public/index.html; writes llms.txt
lib/seo.js        JSON-LD, answer blocks, FAQ markup, crawl directives
lib/vs.js         the /vs/ comparison pages
lib/lists.js      /0-60-times/<make>/ and /fastest/<what>/
lib/race.js       the race panel shared by every generated page
netlify.toml      build command, publish dir, cache headers
```

## Deploying

GitHub Actions builds; Netlify only receives the files.

Netlify's own git builds are **off** for this site (`stop_builds`), because a
Netlify build costs credits and this build is `node build.js` — two seconds,
zero dependencies. Actions minutes are free on a public repo, so the same work
costs nothing. `.github/workflows/deploy.yml` runs the build and then
`netlify deploy --prod --no-build --dir=public`, tagging the deploy with the
commit SHA so what is live is still traceable to a commit.

Needs two repo secrets: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`.

To deploy by hand from a clean checkout:

    node build.js
    netlify deploy --prod --no-build --dir=public --site=<site id>

Re-enabling Netlify's builds means setting `stop_builds` back to false —
otherwise a push would deploy twice.
