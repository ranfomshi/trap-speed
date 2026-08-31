/* Two page types the search data asked for, both built straight from the set.
 *
 *   /0-60-times/<make>/   -- "bmw 0-60 times" is the top autocomplete for
 *                            practically every make, and we hold the answer.
 *   /fastest/<what>/      -- "fastest estate cars uk", "fastest hot hatch",
 *                            "quickest 0-60 car".
 *
 * Neither is a table nobody can do anything with: each one opens with a race
 * between its own top two, and every row is a link that puts that car on the
 * line against the leader. The list is the argument; the race settles it.
 */
const fs=require("fs"), path=require("path");
const RACE=require("./race.js");
const V=require("./vs.js");
const {esc,slug,name,n2,n1,n0}=V;

/* The hot hatches, by name, because the data cannot tell us. */
const HOT=new RegExp("\\b("+[
  "golf gti","golf r","golf gte","polo gti","up gti","scirocco r",
  "civic type r","civic si","integra type r",
  "focus rs","focus st","fiesta st","fiesta rs","escort rs","puma st",
  "megane r\\.?s","megane rs","clio r\\.?s","clio rs","clio williams","5 gt turbo","twingo",
  "i30 ?n","i20 ?n","veloster n","ceed gt",
  "gr yaris","gr corolla","yaris grmn","corolla gr",
  "a ?45","a ?35","a ?250",   /* the CLA and the Evo are saloons, not hatches */
  "rs ?3 sportback","rs ?3 \\(","s3 sportback","a3 sportback",
  "m135i","m140i","128ti","m130i",
  "leon cupra","leon r","ibiza cupra","cupra leon","cupra formentor",
  "abarth","mini cooper","john cooper works",
  "308 gti","208 gti","205 gti","306 gti","ds3 racing","c4 vts",
  "swift sport","ibiza fr","fabia rs","octavia rs","octavia vrs","fabia vrs",
  "astra vxr","corsa vxr","astra opc","corsa opc","note nismo","juke nismo",
  "brabus b45","mazda 3 mps","mazda3 mps","mazdaspeed"
].join("|")+")\\b","i");

const CATS=[
  {s:"accelerating-cars", h:"Fastest accelerating cars",
   t:"Fastest accelerating cars: 0-60, quarter mile and trap speed",
   w:"in the set", f:()=>true},
  {s:"saloons",       h:"Fastest saloon cars",  t:"Fastest saloon cars: 0-60 and quarter mile times",
   w:"saloon",   f:c=>c.bd==="saloon"},
  {s:"estate-cars",   h:"Fastest estate cars",  t:"Fastest estate cars: 0-60 and quarter mile times",
   w:"estate",   f:c=>c.bd==="estate"},
  {s:"hot-hatches",   h:"Fastest hot hatches",  t:"Fastest hot hatches: 0-60 and quarter mile times",
   /* "hatch" is the set's fallback body, so it holds R8s, Alpina coupes and a
      Le Mans homologation Nissan alongside the actual hatchbacks -- no
      combination of mass, drive and power separates them. A hot hatch is a
      known list of cars, so this is that list. */
   w:"hot hatch", f:c=>HOT.test(`${c.mk} ${c.md}`)},
  {s:"suvs",          h:"Fastest SUVs",         t:"Fastest SUVs: 0-60 and quarter mile times",
   w:"SUV",      f:c=>c.bd==="suv"},
  {s:"coupes",        h:"Fastest coupes",       t:"Fastest coupes: 0-60 and quarter mile times",
   w:"coupe",    f:c=>c.bd==="coupe"},
  {s:"roadsters",     h:"Fastest roadsters",    t:"Fastest roadsters: 0-60 and quarter mile times",
   w:"roadster", f:c=>c.bd==="roadster"},
  {s:"electric-cars", h:"Fastest electric cars",t:"Fastest electric cars: 0-60 and quarter mile times",
   w:"electric car", f:c=>c.asp==="ev"},
  {s:"supercars",     h:"Fastest supercars",    t:"Fastest supercars: 0-60 and quarter mile times",
   w:"supercar", f:c=>c.cls==="Supercar"||c.cls==="Hypercar"||c.bd==="super"},
  {s:"muscle-cars",   h:"Fastest muscle cars",  t:"Fastest muscle cars: 0-60 and quarter mile times",
   w:"muscle car", f:c=>c.bd==="muscle"}
];

const MAKE_MIN=8;      /* below this a make page is a stub, not an answer */
const CAP=60;          /* rows on a fastest-list; a make page shows everything */

function shell({title,desc,url,site,h1,lede,crumbs,body,extraCSS}){
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${site}/og.png">
<meta name="twitter:card" content="summary_large_image">
<style>
${RACE.BASE}
${RACE.CSS}
.rank{width:1%;color:var(--ink3);text-align:right}
tbody th a{color:var(--ink);text-decoration:none}
tbody tr:hover{background:#161E27} tbody tr:hover th a{color:var(--amber)}
.win{color:var(--amber)}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:1px;
  background:var(--edge);border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.grid a{display:block;padding:11px 13px;background:var(--surface);color:var(--ink);
  text-decoration:none;font-size:14px}
.grid a:hover{background:#161E27;color:var(--amber)}
.grid a span{display:block;font:600 10px var(--cond);letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink3);margin-top:2px}
${extraCSS||""}
</style></head><body><div class="wrap">
<p class="crumbs">${crumbs}</p>
<h1>${h1}</h1>
<p class="lede">${lede}</p>
${body}
<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile &mdash; dry asphalt, 20&nbsp;&deg;C, sea level,
1&nbsp;ft rollout. They are not timing-slip records. Acceleration figures from
<a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

const crumbs=site=>`<a class="home" href="${site}/">&larr; Trap Speed</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/0-60-times/">0-60 by make</a>
<a class="home" href="${site}/fastest/">Fastest lists</a>`;

/* Every row is a race: the car on this row against the one at the top of the
   list, which is the comparison the list itself sets up. */
function table(rows,site,bench,showMake){
  return `<div class="tablewrap"><table><thead><tr>
<th class="rank">#</th><th style="text-align:left">Car</th><th>Year</th>
<th>0&ndash;60</th><th>1/4 mile</th><th>Trap</th><th>Power</th></tr></thead><tbody>
${rows.map((r,i)=>{
  const foe = r.c.id===bench.id ? rows[1] : {c:bench};
  const href=`${site}/?a=${encodeURIComponent(r.c.id)}&amp;b=${encodeURIComponent(foe.c.id)}`;
  const label=showMake?name(r.c):V.tidy(r.c.md);
  return `<tr><td class="rank">${i+1}</td>`
    + `<th scope="row"><a href="${href}" title="Race the ${esc(name(r.c))}">${esc(label)}</a></th>`
    + `<td>${r.c.yr}</td><td class="${i===0?"win":""}">${n2(r.f.s60)} s</td>`
    + `<td>${n2(r.f.qm)} s</td><td>${n1(r.f.trap)} mph</td><td>${n0(r.f.bhp)} bhp</td></tr>`;
}).join("")}
</tbody></table></div>`;
}

function listPage({h1,title,desc,url,site,lede,rows,related,showMake}){
  const a=rows[0].c, b=rows[1].c;
  return shell({title,desc,url,site,h1:esc(h1),lede,crumbs:crumbs(site),
    body:`${RACE.panel(name(a),name(b),
      `The two quickest here, on the line together. Change the surface, the weather
       or the distance and run it again.`)}
<h2>Every one, quickest first</h2>
${table(rows,site,a,showMake!==false)}
<p class="note">Tap any car to put it on the line against the ${esc(name(a))}.</p>
${related||""}
${RACE.script(a.id,b.id,`${name(a)} versus ${name(b)}, simulated`)}`});
}

function build(appSrc,outDir,site,vsPages){
  const A=V.physics(appSrc);
  const t0=Date.now();
  /* One pass over the whole field: every list below is a view of this. */
  const all=A.CARS.map(c=>({c,f:V.figures(A,c)})).filter(r=>r.f.s60!=null&&r.f.qm!=null);
  all.sort((x,y)=>x.f.s60-y.f.s60);
  console.log(`  lists: ran ${all.length} cars in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  const urls=[];
  const w=(dir,html)=>{ fs.mkdirSync(path.join(outDir,dir),{recursive:true});
    fs.writeFileSync(path.join(outDir,dir,"index.html"),html); urls.push("/"+dir+"/"); };

  /* ---- one page per make ------------------------------------------------ */
  const byMake={};
  for(const r of all) (byMake[r.c.mk] ||= []).push(r);
  const makes=Object.keys(byMake).filter(m=>byMake[m].length>=MAKE_MIN)
    .sort((x,y)=>x.localeCompare(y));
  for(const mk of makes){
    const rows=byMake[mk];
    /* the comparisons we have already built that feature this make */
    const seen=new Set(), rel=[];
    for(const p of vsPages||[]){
      if(p.a.mk!==mk && p.b.mk!==mk) continue;
      if(seen.has(p.dir)) continue; seen.add(p.dir);
      rel.push(p); if(rel.length>=12) break;
    }
    w(`0-60-times/${slug(mk)}`, listPage({
      h1:`${mk} 0-60 times`,
      title:`${mk} 0-60 times, quarter mile and trap speed`,
      desc:`Simulated 0-60, quarter mile and trap speed for ${rows.length} ${mk} models, quickest first. `
        +`The quickest is the ${name(rows[0].c)} at ${n2(rows[0].f.s60)}s.`,
      url:`${site}/0-60-times/${slug(mk)}/`, site,
      lede:`All <b>${rows.length}</b> ${esc(mk)} models in the set, quickest to 60&nbsp;mph first.
        The <b>${esc(name(rows[0].c))}</b> leads at <span class="num">${n2(rows[0].f.s60)} s</span>.`,
      rows, showMake:false,   /* the badge is in the H1 already */
      related: rel.length ? `<h2>${esc(mk)} head to head</h2><div class="grid">${rel.map(p=>
        `<a href="${site}/vs/${p.dir}/">${esc(name(p.a))} vs ${esc(name(p.b))}<span>Full comparison</span></a>`
        ).join("")}</div>` : ""
    }));
  }

  /* ---- the fastest-X lists ---------------------------------------------- */
  for(const cat of CATS){
    const rows=all.filter(r=>cat.f(r.c)).slice(0,CAP);
    if(rows.length<6) continue;
    w(`fastest/${cat.s}`, listPage({
      h1:cat.h, title:cat.t,
      desc:`The ${rows.length} quickest ${cat.w}s to 60 mph, simulated: 0-60, quarter mile and trap `
        +`speed. The ${name(rows[0].c)} leads at ${n2(rows[0].f.s60)}s.`,
      url:`${site}/fastest/${cat.s}/`, site,
      lede:`The <b>${rows.length}</b> quickest ${esc(cat.w)}s to 60&nbsp;mph in the set.
        The <b>${esc(name(rows[0].c))}</b> leads at <span class="num">${n2(rows[0].f.s60)} s</span>.`,
      rows
    }));
  }

  /* ---- the two indexes -------------------------------------------------- */
  w("0-60-times", shell({
    title:"0-60 times by make: every model, quickest first",
    desc:`0-60, quarter mile and trap speed for every model, grouped by make across ${makes.length} makes.`,
    url:`${site}/0-60-times/`, site, crumbs:crumbs(site),
    h1:"0-60 times by make",
    lede:`Every model we hold, grouped by the badge on the nose and sorted by how fast it reaches
      60&nbsp;mph. <b>${makes.length}</b> makes, <b>${all.length}</b> cars.`,
    body:`<div class="grid">${makes.map(m=>
      `<a href="${site}/0-60-times/${slug(m)}/">${esc(m)}<span>${byMake[m].length} cars &middot; from ${n2(byMake[m][0].f.s60)} s</span></a>`
      ).join("")}</div>`
  }));
  w("fastest", shell({
    title:"The fastest cars, by kind",
    desc:"Fastest accelerating cars, saloons, estates, hot hatches, SUVs, coupes, roadsters, electric cars, supercars and muscle cars, by 0-60.",
    url:`${site}/fastest/`, site, crumbs:crumbs(site),
    h1:"Fastest, by kind",
    lede:`The quickest to 60&nbsp;mph in each shape of car, out of <b>${all.length}</b> in the set
      &mdash; and a race at the top of every one.`,
    body:`<div class="grid">${CATS.map(cat=>{
      const rows=all.filter(r=>cat.f(r.c));
      return rows.length<6 ? "" :
        `<a href="${site}/fastest/${cat.s}/">${esc(cat.h)}<span>${esc(name(rows[0].c))} &middot; ${n2(rows[0].f.s60)} s</span></a>`;
    }).join("")}</div>`
  }));

  return urls;
}
module.exports={build};
