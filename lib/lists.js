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
const SEO=require("./seo.js");
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

/* w is the singular noun ("estate"), p the plural phrase ("estate cars").
   They are BOTH written out because appending an "s" produced "hot hatchs" and
   "the quickest in the sets to 60 mph" -- in the meta description of the two
   pages that matter most. */
const CATS=[
  {s:"accelerating-cars", h:"Fastest accelerating cars",
   t:"Fastest accelerating cars: 0-60, quarter mile and trap speed",
   w:"car", p:"cars in the set", f:()=>true},
  {s:"saloons",       h:"Fastest saloon cars",  t:"Fastest saloon cars: 0-60 and quarter mile times",
   w:"saloon",   p:"saloons",     f:c=>c.bd==="saloon"},
  {s:"estate-cars",   h:"Fastest estate cars",  t:"Fastest estate cars: 0-60 and quarter mile times",
   w:"estate",   p:"estates",     f:c=>c.bd==="estate"},
  {s:"hot-hatches",   h:"Fastest hot hatches",  t:"Fastest hot hatches: 0-60 and quarter mile times",
   /* "hatch" is the set's fallback body, so it holds R8s, Alpina coupes and a
      Le Mans homologation Nissan alongside the actual hatchbacks -- no
      combination of mass, drive and power separates them. A hot hatch is a
      known list of cars, so this is that list. */
   w:"hot hatch", p:"hot hatches", f:c=>HOT.test(`${c.mk} ${c.md}`)},
  {s:"suvs",          h:"Fastest SUVs",         t:"Fastest SUVs: 0-60 and quarter mile times",
   w:"SUV",      p:"SUVs",        f:c=>c.bd==="suv"},
  {s:"coupes",        h:"Fastest coupes",       t:"Fastest coupes: 0-60 and quarter mile times",
   w:"coupe",    p:"coupes",      f:c=>c.bd==="coupe"},
  {s:"roadsters",     h:"Fastest roadsters",    t:"Fastest roadsters: 0-60 and quarter mile times",
   w:"roadster", p:"roadsters",   f:c=>c.bd==="roadster"},
  {s:"electric-cars", h:"Fastest electric cars",t:"Fastest electric cars: 0-60 and quarter mile times",
   w:"electric car", p:"electric cars", f:c=>c.asp==="ev"},
  {s:"supercars",     h:"Fastest supercars",    t:"Fastest supercars: 0-60 and quarter mile times",
   w:"supercar", p:"supercars",   f:c=>c.cls==="Supercar"||c.cls==="Hypercar"||c.bd==="super"},
  {s:"muscle-cars",   h:"Fastest muscle cars",  t:"Fastest muscle cars: 0-60 and quarter mile times",
   w:"muscle car", p:"muscle cars", f:c=>c.bd==="muscle"},

  /* Everything below here became answerable only with the cardata.wiki batches.
     A "fastest diesel" list off 162 diesels was a list of six AMGs and a Bentley;
     off 2,849 it is a real ranking. Each of these is a query people actually
     type -- they are in data/demand.json -- and each has enough cars behind it
     that the list is not padding. */
  {s:"diesel-cars",   h:"Fastest diesel cars",  t:"Fastest diesel cars: 0-60 and quarter mile times",
   w:"diesel",   p:"diesels",     f:c=>c.fu==="d"},
  {s:"hatchbacks",    h:"Fastest hatchbacks",   t:"Fastest hatchbacks: 0-60 and quarter mile times",
   /* the whole hatchback body, where hot-hatches is a curated nameplate list */
   w:"hatchback", p:"hatchbacks", f:c=>c.bd==="hatch"},
  {s:"4x4s",          h:"Fastest 4x4s and all-wheel-drive cars",
   t:"Fastest 4x4s: 0-60 and quarter mile times for all-wheel-drive cars",
   w:"4x4",      p:"4x4s",        f:c=>c.dr==="awd"},
  {s:"mpvs",          h:"Fastest MPVs and people carriers",
   t:"Fastest MPVs: 0-60 and quarter mile times for people carriers",
   w:"MPV",      p:"MPVs",        f:c=>c.bd==="mpv"},
  {s:"small-cars",    h:"Fastest small cars",   t:"Fastest small cars: 0-60 and quarter mile times",
   /* Length alone put a Porsche 917/10 Can-Am car at the top of a page about
      superminis, and adding a body filter did not fix it: "hatch" is the older
      data's fallback archetype, so it holds a Shelby Cobra, a TVR Chimaera and
      a Nissan R390 too. What actually separates a small car from a short sports
      car is the layout -- a supermini is front-engined and drives its front or
      all four wheels; every one of those interlopers is rear-drive, mid- or
      rear-engined. With that, the list reads Sport Quattro, GR Yaris, Clio RS,
      208 GTi, 205 T16, which is the question people are asking. */
   w:"small car", p:"small cars",
   f:c=>c.sh&&c.sh[0]<4.05&&(c.bd==="hatch"||c.bd==="saloon"||c.bd==="mpv")
        &&c.dr!=="rwd"&&!c.en&&c.cls!=="Hypercar"&&c.cls!=="Supercar"},
  {s:"80s-cars",      h:"Fastest cars of the 1980s",
   t:"Fastest 1980s cars: 0-60 and quarter mile times",
   w:"1980s car", p:"cars of the 1980s", f:c=>c.yr>=1980&&c.yr<1990},
  {s:"90s-cars",      h:"Fastest cars of the 1990s",
   t:"Fastest 1990s cars: 0-60 and quarter mile times",
   w:"1990s car", p:"cars of the 1990s", f:c=>c.yr>=1990&&c.yr<2000},
  {s:"2000s-cars",    h:"Fastest cars of the 2000s",
   t:"Fastest 2000s cars: 0-60 and quarter mile times",
   w:"2000s car", p:"cars of the 2000s", f:c=>c.yr>=2000&&c.yr<2010}
];

const MAKE_MIN=8;      /* below this a make page is a stub, not an answer */
const CAP=60;          /* rows on a fastest-list; a make page shows everything */

function shell({title,desc,url,site,h1,lede,crumbs,body,extraCSS,head}){
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${site}/og.png">
<meta name="twitter:card" content="summary_large_image">
${SEO.ICON}
${SEO.ROBOTS}
${head||""}
<style>
${RACE.BASE}
${RACE.CSS}
${SEO.ANSWER_CSS}
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

const crumbs=site=>`<a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/cars/">All cars</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/answers/">Answers</a>
<a class="home" href="${site}/0-60-times/">0-60 by make</a>
<a class="home" href="${site}/fastest/">Fastest lists</a>`;

/* Every row is a race: the car on this row against the one at the top of the
   list, which is the comparison the list itself sets up. */
function table(rows,site,bench,showMake,carLink){
  return `<div class="tablewrap"><table><thead><tr>
<th class="rank">#</th><th style="text-align:left">Car</th><th>Year</th>
<th>0&ndash;60</th><th>1/4 mile</th><th>Trap</th><th>Power</th></tr></thead><tbody>
${rows.map((r,i)=>{
  const foe = r.c.id===bench.id ? rows[1] : {c:bench};
  /* A car with its own page goes there; the rest still go straight to the line
     against the leader, which is what this table used to do for everything. */
  const own=carLink(r.c.id);
  const href=own ? `${site}${own}`
    : `${site}/?a=${encodeURIComponent(r.c.id)}&amp;b=${encodeURIComponent(foe.c.id)}`;
  const title=own ? `${name(r.c)} figures` : `Race the ${name(r.c)}`;
  const label=showMake?name(r.c):V.tidy(r.c.md);
  return `<tr><td class="rank">${i+1}</td>`
    + `<th scope="row"><a href="${href}" title="${esc(title)}">${esc(label)}</a></th>`
    + `<td>${r.c.yr}</td><td class="${i===0?"win":""}">${n2(r.f.s60)} s</td>`
    + `<td>${n2(r.f.qm)} s</td><td>${n1(r.f.trap)} mph</td><td>${n0(r.f.bhp)} bhp</td></tr>`;
}).join("")}
</tbody></table></div>`;
}

/* The list leader over 60 mph and the leader over the quarter mile are often
   two different cars -- a light turbo hatch wins the launch, a heavy quick car
   wins the run -- and saying which is which is the one thing a ranked table
   cannot say for itself. */
function leaders(rows){
  const q=rows.filter(r=>r.f.qm!=null).sort((x,y)=>x.f.qm-y.f.qm)[0];
  const t=rows.filter(r=>r.f.trap!=null).sort((x,y)=>y.f.trap-x.f.trap)[0];
  return {s60:rows[0], qm:q, trap:t};
}

function listPage({h1,title,desc,url,site,lede,rows,related,showMake,trail,answer,faqs,carLink}){
  const a=rows[0].c, b=rows[1].c;
  const graph = SEO.jsonld({ "@context":"https://schema.org", "@graph":[
    SEO.breadcrumb(site,trail),
    { "@type":"WebPage", "@id":url, url:url, name:title, description:desc,
      inLanguage:"en", dateModified:SEO.BUILT,
      isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
      mainEntity:{ "@type":"ItemList", name:h1, numberOfItems:rows.length,
        itemListOrder:"Ascending",
        /* Twenty, not sixty: the list is the ranking, and a retriever that has
           to parse sixty vehicle nodes to find the leader is being handed noise
           rather than an answer. */
        itemListElement:rows.slice(0,20).map((r,i)=>({
          "@type":"ListItem", position:i+1, item:SEO.vehicle(r.c,r.f,name(r.c))}))}},
    SEO.faqPage(faqs)
  ]});
  return shell({title,desc,url,site,h1:esc(h1),lede,crumbs:crumbs(site),head:graph,
    body:`${SEO.answerBlock(answer,
      `Simulated, not measured &mdash; every car computed from its published kerb mass, rated power
       and drivetrain, then fitted to its own published acceleration figures.
       Dry asphalt, 20&nbsp;&deg;C, sea level, 1&nbsp;ft rollout.`)}
${RACE.panel(name(a),name(b),
      `The two quickest here, on the line together. Change the surface, the weather
       or the distance and run it again.`)}
<h2>Every one, quickest first</h2>
${table(rows,site,a,showMake!==false,carLink)}
<p class="note">Tap any car to put it on the line against the ${esc(name(a))}.</p>
${related||""}
${SEO.faqHTML(faqs)}
${SEO.updatedLine()}
${RACE.script(a.id,b.id,`${name(a)} versus ${name(b)}, simulated`)}`});
}

/* The five answers every one of these lists is asked for, written as sentences
   that stand up on their own. `what` is the noun ("BMW model", "hot hatch"). */
function listFAQ(what,plural,rows,L){
  const qs=[
    {q:`What is the fastest ${what}?`,
     a:`The ${name(L.s60.c)} (${L.s60.c.yr}), which reaches 60 mph in ${n2(L.s60.f.s60)} s. `
       +`It is the quickest of the ${rows.length} ${plural} listed here.`},
    L.qm && {q:`Which ${what} is quickest over the quarter mile?`,
     a:L.qm.c.id===L.s60.c.id
       ? `The ${name(L.qm.c)} again, in ${n2(L.qm.f.qm)} s at ${n1(L.qm.f.trap)} mph — it leads both `
         +`the 0-60 and the quarter mile.`
       : `The ${name(L.qm.c)}, in ${n2(L.qm.f.qm)} s at ${n1(L.qm.f.trap)} mph. That is a different car `
         +`from the 0-60 leader, the ${name(L.s60.c)}: a quick launch and a quick quarter mile are not `
         +`the same thing.`},
    L.trap && {q:`Which ${what} has the highest trap speed?`,
     a:`The ${name(L.trap.c)} at ${n1(L.trap.f.trap)} mph through the quarter-mile lights. Trap speed `
       +`tracks power against weight, so it rewards a different car from the one that launches best.`},
    {q:`How many ${plural} are listed?`,
     a:`${rows.length}, ranked by simulated 0-60 mph time, from the ${name(rows[0].c)} at `
       +`${n2(rows[0].f.s60)} s to the ${name(rows[rows.length-1].c)} at `
       +`${n2(rows[rows.length-1].f.s60)} s.`},
    {q:`Are these real measured times?`,
     a:`No. Every figure here is produced by a physics simulation, not by a stopwatch at a drag strip. `
       +`Each car is modelled from its published kerb mass, rated power, drivetrain and gearing, then `
       +`trimmed until it reproduces its own published acceleration figures. Because every car is run `
       +`in identical conditions — dry asphalt, 20 °C, sea level, 1 ft rollout — the ranking is a fair `
       +`comparison even though no individual time is a timing slip.`}
  ];
  return qs.filter(Boolean);
}

function build(appSrc,outDir,site,vsPages,pre,carUrl){
  /* `pre` is the whole field, already run by build.js. Recomputing it here cost
     thirteen seconds for no reason once the car pages needed it too. */
  const all=(pre||(()=>{ const A=V.physics(appSrc);
    return A.CARS.map(c=>({c,f:V.figures(A,c)})).filter(r=>r.f.s60!=null&&r.f.qm!=null); })())
    .slice().sort((x,y)=>x.f.s60-y.f.s60);
  const carLink=carUrl||(()=>null);

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
    const L=leaders(rows);
    w(`0-60-times/${slug(mk)}`, listPage({
      h1:`${mk} 0-60 times`,
      title:`${mk} 0-60 times, quarter mile and trap speed`,
      desc:`Simulated 0-60, quarter mile and trap speed for ${rows.length} ${mk} models, quickest first. `
        +`The quickest is the ${name(rows[0].c)} at ${n2(rows[0].f.s60)}s.`,
      url:`${site}/0-60-times/${slug(mk)}/`, site,
      lede:`All <b>${rows.length}</b> ${esc(mk)} models in the set, quickest to 60&nbsp;mph first.
        The <b>${esc(name(rows[0].c))}</b> leads at <span class="num">${n2(rows[0].f.s60)} s</span>.`,
      trail:[{name:"My Auto Racer",url:"/"},{name:"0-60 by make",url:"/0-60-times/"},{name:mk}],
      answer:`The quickest <b>${esc(mk)}</b> of the ${rows.length} listed here is the
        <b>${esc(name(L.s60.c))}</b>, which reaches 60&nbsp;mph in
        <span class="num">${n2(L.s60.f.s60)} s</span>${L.qm&&L.qm.c.id!==L.s60.c.id
          ? ` — though the quickest over the standing quarter mile is the
              <b>${esc(name(L.qm.c))}</b> at <span class="num">${n2(L.qm.f.qm)} s</span>`
          : ` and covers the standing quarter mile in <span class="num">${n2(L.s60.f.qm)} s</span>`}.
        The slowest here is the ${esc(name(rows[rows.length-1].c))} at
        <span class="num">${n2(rows[rows.length-1].f.s60)} s</span>.`,
      faqs:listFAQ(`${mk} model`,`${mk} models`,rows,L), carLink,
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
    const L=leaders(rows);
    w(`fastest/${cat.s}`, listPage({
      h1:cat.h, title:cat.t,
      desc:`The ${rows.length} quickest ${cat.p} to 60 mph, simulated: 0-60, quarter mile and trap `
        +`speed. The ${name(rows[0].c)} leads at ${n2(rows[0].f.s60)}s.`,
      url:`${site}/fastest/${cat.s}/`, site,
      lede:`The <b>${rows.length}</b> quickest ${esc(cat.p)} to 60&nbsp;mph in the set.
        The <b>${esc(name(rows[0].c))}</b> leads at <span class="num">${n2(rows[0].f.s60)} s</span>.`,
      trail:[{name:"My Auto Racer",url:"/"},{name:"Fastest lists",url:"/fastest/"},{name:cat.h}],
      answer:`The fastest ${esc(cat.w)} here is the <b>${esc(name(L.s60.c))}</b>
        (${L.s60.c.yr}), which reaches 60&nbsp;mph in
        <span class="num">${n2(L.s60.f.s60)} s</span>${L.qm&&L.qm.c.id!==L.s60.c.id
          ? ` — but over a standing quarter mile the <b>${esc(name(L.qm.c))}</b> is quicker still, at
              <span class="num">${n2(L.qm.f.qm)} s</span>`
          : ` and the standing quarter mile in <span class="num">${n2(L.s60.f.qm)} s</span>`}.
        ${L.trap?`The highest trap speed of any ${esc(cat.w)} here is the
        ${esc(name(L.trap.c))}&rsquo;s <span class="num">${n1(L.trap.f.trap)} mph</span>.`:``}`,
      faqs:listFAQ(cat.w,cat.p,rows,L), carLink,
      rows
    }));
  }

  /* ---- the two indexes -------------------------------------------------- */
  w("0-60-times", shell({
    title:"0-60 times by make: every model, quickest first",
    desc:`0-60, quarter mile and trap speed for every model, grouped by make across ${makes.length} makes.`,
    url:`${site}/0-60-times/`, site, crumbs:crumbs(site),
    head:SEO.jsonld({"@context":"https://schema.org","@graph":[
      SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"0-60 by make"}]),
      {"@type":"CollectionPage","@id":`${site}/0-60-times/`,url:`${site}/0-60-times/`,
       name:"0-60 times by make",dateModified:SEO.BUILT,inLanguage:"en",
       isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
       mainEntity:{"@type":"ItemList",numberOfItems:makes.length,
         itemListElement:makes.map((m,i)=>({"@type":"ListItem",position:i+1,
           name:`${m} 0-60 times`,url:`${site}/0-60-times/${slug(m)}/`}))}}]}),
    h1:"0-60 times by make",
    lede:`Every model we hold, grouped by the badge on the nose and sorted by how fast it reaches
      60&nbsp;mph. <b>${makes.length}</b> makes, <b>${all.length}</b> cars.`,
    body:`<div class="grid">${makes.map(m=>
      `<a href="${site}/0-60-times/${slug(m)}/">${esc(m)}<span>${byMake[m].length} cars &middot; from ${n2(byMake[m][0].f.s60)} s</span></a>`
      ).join("")}</div>`
  }));
  const liveCats=CATS.filter(cat=>all.filter(r=>cat.f(r.c)).length>=6);
  w("fastest", shell({
    title:"The fastest cars, by kind",
    /* written from the categories that actually built, so adding one cannot
       leave the description describing the set it used to be */
    desc:"Fastest "+liveCats.map(c=>c.p).join(", ").replace(/, ([^,]*)$/," and $1")+", by 0-60.",
    url:`${site}/fastest/`, site, crumbs:crumbs(site),
    head:SEO.jsonld({"@context":"https://schema.org","@graph":[
      SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Fastest lists"}]),
      {"@type":"CollectionPage","@id":`${site}/fastest/`,url:`${site}/fastest/`,
       name:"The fastest cars, by kind",dateModified:SEO.BUILT,inLanguage:"en",
       isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
       mainEntity:{"@type":"ItemList",numberOfItems:liveCats.length,
         itemListElement:liveCats.map((cat,i)=>({"@type":"ListItem",position:i+1,
           name:cat.h,url:`${site}/fastest/${cat.s}/`}))}}]}),
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
