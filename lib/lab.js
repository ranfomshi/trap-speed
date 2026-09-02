/* /lab/cars/ -- a temporary page for judging how the cars are DRAWN.
 *
 * Four looks, six iconic cars, side by side, so the choice can be made by
 * looking rather than by describing. Not linked from anywhere, noindex, and
 * absent from every sitemap: it exists to be shown to one person and then to
 * be deleted or promoted.
 *
 * The renderer is not copied. The block of src/app.html that draws a car --
 * BODY through the end of drawCar() -- is sliced out at build time and inlined
 * verbatim, so this page cannot drift from the app it is meant to be judging.
 * The looks are applied on top as compositing recipes over the finished
 * silhouette, which is why none of them needed a line of production code
 * changed to try. Whichever wins gets ported into drawCar properly.
 */
const fs=require("fs"), path=require("path");

/* The cars people picture when they picture a car. All six have an authored
   per-model outline, so what is being judged is the paint and not the shape. */
const PICKS=["992ts","mustang","lamborghini-huracan-lp-610-4",
             "bmw-m3-competition-n-a","m3p","gti8"];

function slice(appSrc){
  const g=appSrc.indexOf("const G=9.80665");
  const gEnd=appSrc.indexOf("\n",g);
  const a=appSrc.indexOf("const BODY={");
  const b=appSrc.indexOf("\nfunction markers(span,x0){");
  if(g<0||a<0||b<0||b<a) throw new Error("lab: cannot find the renderer in app.html");
  return appSrc.slice(g,gEnd)+"\n"+appSrc.slice(a,b);
}

const LOOKS=[
  ["base","As it ships",
   "One vertical gradient over the body, flat glass, a soft shadow on the tarmac."],
  ["lit","Lit",
   "The same path, lit: sky down the upper surfaces, a specular band along the "
   +"shoulder, the sill dropped into shadow. No new artwork -- only light."],
  ["studio","Studio",
   "Lit, plus what a real photograph of a car has and a drawing usually forgets: "
   +"tarmac bounced back into the lower panels, a rim light down the leading "
   +"edge, a reflection band at belt height and a contact shadow that is dark "
   +"and tight under the wheels rather than soft everywhere."],
  ["poster","Poster",
   "Deliberately NOT photoreal: two tones and a hard light split. If we cannot "
   +"win on realism -- and against licensed photography we cannot -- this is the "
   +"other way to look deliberate rather than unfinished."]
];

function build(appSrc,outDir,site){
  const dir=path.join(outDir,"lab","cars");
  fs.mkdirSync(dir,{recursive:true});

  const A=require("./vs.js").physics(appSrc);
  const cars=PICKS.map(id=>{
    const c=A.CARS.find(x=>x.id===id);
    if(!c) throw new Error("lab: no car "+id);
    return c;
  });
  const names=cars.map(c=>require("./vs.js").name(c));

  const html=`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Car rendering lab</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
:root{--bg:#0B0E12;--card:#12171D;--line:#1E252D;--ink:#E7ECF2;--dim:#93A0AE;--A:#2FCB6E}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1400px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:26px;margin:0 0 6px}
p.lede{color:var(--dim);margin:0 0 26px;max-width:70ch}
.legend{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:0 0 30px}
.legend div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.legend h3{margin:0 0 4px;font-size:14px;letter-spacing:.02em}
.legend p{margin:0;color:var(--dim);font-size:13px;line-height:1.5}
.car{margin:0 0 34px}
.car h2{font-size:17px;margin:0 0 10px;font-weight:600}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(310px,1fr))}
.cell{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.cell figcaption{font-size:12px;color:var(--dim);padding:8px 12px;border-top:1px solid var(--line);
  letter-spacing:.04em;text-transform:uppercase}
canvas{display:block;width:100%;height:auto}
.note{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--A);
  border-radius:8px;padding:14px 16px;color:var(--dim);font-size:14px;max-width:80ch}
.note b{color:var(--ink)}
</style>
</head><body>
<div class="wrap">
<h1>Car rendering lab</h1>
<p class="lede">Four ways of painting the same car. The shapes are identical in every
column &mdash; all six of these have their own authored outline &mdash; so what differs
here is only the light. Tell me which column to keep and I will port it into the
simulator properly.</p>

<div class="legend">
${LOOKS.map(([k,t,d])=>`  <div><h3>${t}</h3><p>${d}</p></div>`).join("\n")}
</div>

${cars.map((c,i)=>`<section class="car"><h2>${names[i]}</h2><div class="grid">
${LOOKS.map(([k,t])=>`  <figure class="cell"><canvas data-car="${i}" data-look="${k}"></canvas>`
  +`<figcaption>${t}</figcaption></figure>`).join("\n")}
</div></section>`).join("\n")}

<div class="note"><b>What this can and cannot settle.</b> Every look here is drawn
from the car's own dimensions, with no photography and no licensed artwork, so any
of them can ship for all 2,941 cars at no cost and no risk. What none of them can
do is match per-model photography &mdash; if that is the bar, the question stops
being how we draw and becomes where images come from, which is a licensing
question rather than a rendering one.</div>
</div>

<script>
const CARS=${JSON.stringify(cars)};
${slice(appSrc)}

/* --- the looks --------------------------------------------------------
   Each is a recipe applied to the FINISHED car on its own canvas. Compositing
   with source-atop confines every stroke to pixels the car already painted, so
   a highlight cannot leak into the background and none of this needs to know
   anything about the body path. That is the whole reason four looks cost one
   afternoon instead of four rewrites. */
function lit(g,W,H,box){
  const {x,y,w,h}=box;
  /* sky above, ground below: the single biggest cue that a surface is curved */
  const v=g.createLinearGradient(0,y-h,0,y);
  v.addColorStop(0,"rgba(255,255,255,.30)");
  v.addColorStop(.34,"rgba(255,255,255,.06)");
  v.addColorStop(.62,"rgba(0,0,0,0)");
  v.addColorStop(1,"rgba(0,0,0,.45)");
  g.fillStyle=v; g.fillRect(0,0,W,H);
  /* the shoulder: a hard, narrow band where the flank turns over to the roof */
  const s=g.createLinearGradient(0,y-h*0.72,0,y-h*0.44);
  s.addColorStop(0,"rgba(255,255,255,0)");
  s.addColorStop(.5,"rgba(255,255,255,.22)");
  s.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=s; g.fillRect(x,0,w,H);
}
function studio(g,W,H,box){
  lit(g,W,H,box);
  const {x,y,w,h}=box;
  /* tarmac throwing light back up into the sills and lower doors */
  const b=g.createLinearGradient(0,y,0,y-h*0.30);
  b.addColorStop(0,"rgba(150,175,205,.26)");
  b.addColorStop(1,"rgba(150,175,205,0)");
  g.fillStyle=b; g.fillRect(0,0,W,H);
  /* rim light down the leading edge. The cars are drawn nose-right, so that
     edge is x+w, not x -- lighting the tail instead reads as a mistake even to
     someone who could not say why. */
  const r=g.createLinearGradient(x+w,0,x+w*0.90,0);
  r.addColorStop(0,"rgba(255,255,255,.34)");
  r.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=r; g.fillRect(0,0,W,H);
  /* the horizon, reflected in the flank at belt height */
  const f=g.createLinearGradient(0,y-h*0.50,0,y-h*0.38);
  f.addColorStop(0,"rgba(255,255,255,0)");
  f.addColorStop(.5,"rgba(210,230,255,.16)");
  f.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=f; g.fillRect(x,0,w,H);
}
function poster(g,W,H,box){
  const {x,y,w,h}=box;
  /* flatten it: one tone over everything, then one hard edge of light */
  g.fillStyle="rgba(14,20,28,.42)"; g.fillRect(0,0,W,H);
  const d=g.createLinearGradient(x,y-h,x+w*0.85,y);
  d.addColorStop(0,"rgba(255,255,255,.30)");
  d.addColorStop(.495,"rgba(255,255,255,.30)");
  d.addColorStop(.505,"rgba(0,0,0,.22)");
  d.addColorStop(1,"rgba(0,0,0,.22)");
  g.fillStyle=d; g.fillRect(0,0,W,H);
}
const LOOK={base:null,lit:lit,studio:studio,poster:poster};

const COL=["#2FCB6E","#F2A20C","#8B7BFF","#4DA3FF","#E23C3C","#37C8C3"];

for(const cv of document.querySelectorAll("canvas[data-car]")){
  const c=CARS[+cv.dataset.car], look=LOOK[cv.dataset.look];
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const W=620, H=250;
  cv.width=W*dpr; cv.height=H*dpr;
  cv.style.aspectRatio=W+"/"+H;
  const g=cv.getContext("2d");
  g.scale(dpr,dpr);

  /* ground */
  const bg=g.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,"#10161D"); bg.addColorStop(1,"#0A0D11");
  g.fillStyle=bg; g.fillRect(0,0,W,H);
  const gy=H-46;
  g.strokeStyle="rgba(255,255,255,.07)"; g.lineWidth=1;
  g.beginPath(); g.moveTo(0,gy+.5); g.lineTo(W,gy+.5); g.stroke();

  /* fit the car across the frame from its own real length */
  const {L,H:CH}=shapeOf(c);
  const ppm=Math.min((W-70)/L,(gy-26)/CH);
  const nose=(W-L*ppm)/2;
  const box={x:nose,y:gy,w:L*ppm,h:CH*ppm};

  /* The car goes on its OWN transparent canvas first. source-atop confines a
     highlight to pixels that are already painted -- so if the background were
     painted underneath it, "already painted" would mean the whole frame and
     every look would wash over the tarmac too. On a transparent layer the only
     painted pixels are the car. */
  const oc=document.createElement("canvas");
  oc.width=W*dpr; oc.height=H*dpr;
  const og=oc.getContext("2d");
  og.scale(dpr,dpr);
  drawCar(og,nose+L*ppm,gy,ppm,c,COL[+cv.dataset.car%COL.length],0,0,0);
  g.drawImage(oc,0,0,W,H);

  /* Light only the SOLID bodywork.
     drawCar lays a soft shadow on the tarmac before it draws the car, and to a
     compositor those semi-transparent pixels are painted pixels like any other
     -- so "confine this highlight to the car" quietly means "and to the wide
     ellipse of haze under it", which is what washed the poster look across the
     whole frame. Thresholding alpha separates the two: bodywork is filled
     opaque, the shadow never exceeds about 0.62. */
  if(look){
    const mask=document.createElement("canvas");
    mask.width=oc.width; mask.height=oc.height;
    const mg=mask.getContext("2d");
    const src=og.getImageData(0,0,oc.width,oc.height);
    const out=mg.createImageData(oc.width,oc.height);
    for(let i=3;i<src.data.length;i+=4){
      if(src.data[i]>190){ out.data[i-3]=255; out.data[i-2]=255; out.data[i-1]=255; out.data[i]=255; }
    }
    mg.putImageData(out,0,0);

    const lc=document.createElement("canvas");
    lc.width=oc.width; lc.height=oc.height;
    const lg=lc.getContext("2d");
    lg.scale(dpr,dpr);
    look(lg,W,H,box);                       /* paint the light freely ... */
    lg.setTransform(1,0,0,1,0,0);
    lg.globalCompositeOperation="destination-in";
    lg.drawImage(mask,0,0);                 /* ... then keep only what lands on the car */
    g.drawImage(lc,0,0,W,H);
  }
}
</script>
</body></html>
`;
  fs.writeFileSync(path.join(dir,"index.html"),html);
  return "/lab/cars/";
}

module.exports={build,PICKS};
