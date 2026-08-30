# Trap Speed

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

## Layout

```
src/app.html      the whole app: markup, styles and script in one file
src/logos/        126 maker badges
src/logomap.json  make name -> badge file
build.js          wraps app.html into public/index.html
netlify.toml      build command, publish dir, cache headers
```
