/* One page per car: /cars/<slug>/
 *
 * The site had pages for pairs and pages for rankings, and nothing for the
 * question people actually type, which is singular -- "bmw m3 0-60", "golf gti
 * quarter mile". This is that page, and the answer was already in the data.
 *
 * Two things here are worth stating plainly.
 *
 * The background paragraph is GENERATED, entirely from figures this repo holds:
 * mass, power, drivetrain, induction, the car's own simulated times, and where
 * it ranks against the rest of the set. It contains no history, no press-launch
 * anecdote and no opinion about how a car drives, because we have no source for
 * any of that and inventing it would put 2,900 confident fabrications on the
 * internet under our name. What it does instead is explain the numbers -- which
 * end of the run the car is good at, and what it is quick relative to -- which
 * is genuinely useful and genuinely ours.
 *
 * The rivals are picked to make a good race, not merely a close 0-60: two cars
 * can match to a tenth and be a supercar and a diesel estate. See rivals().
 */
const fs=require("fs"), path=require("path");
const RACE=require("./race.js");
const V=require("./vs.js");
const SEO=require("./seo.js");
const {esc,slug,name,rawName,tidy,n2,n1,n0}=V;

const DRIVE={rwd:"rear-drive",awd:"all-wheel-drive",fwd:"front-drive"};
const DRIVEC={rwd:"Rear drive",awd:"All-wheel drive",fwd:"Front drive"};
const BODY={saloon:"saloon",estate:"estate",suv:"SUV",coupe:"coupe",roadster:"roadster",
  mpv:"MPV",van:"van",hatch:"car",super:"supercar",muscle:"muscle car",pickup:"pickup"};
const ENGINE=c=>c.asp==="ev"?"electric":c.fu==="d"?"turbodiesel":
  c.asp==="turbo"?"turbocharged":c.asp==="sc"?"supercharged":"naturally aspirated";

/* "a all-wheel-drive estate". Every descriptor this feeds on starts with a
   plain consonant or vowel sound, so the letter is enough -- no need for the
   hour/university special cases. */
const AN=w=>(/^[aeiou]/i.test(w)?"an ":"a ")+w;

/* Rank 1 is "the quickest", not "the 1st quickest". */
const RANK=n=>n===1?"quickest":`${ORD(n)} quickest`;

const ORD=n=>{
  const s=["th","st","nd","rd"], v=n%100;
  return n.toLocaleString("en-GB")+(s[(v-20)%10]||s[v]||s[0]);
};

/* --- who to race ------------------------------------------------------
   Nearest on 0-60 alone pairs a McLaren with whatever hot hatch happens to
   match it to a tenth, which is a curiosity rather than a comparison. So the
   distance also weighs power-to-weight (on a log scale, because the set spans
   an order of magnitude) and penalises a different body and the same badge --
   the second because "M3 vs M3 Competition" is not what anybody means by a
   similar car. */
function rivals(me,pool,k=3){
  const scored=[];
  for(const r of pool){
    if(r.c.id===me.c.id) continue;
    const d = Math.abs(r.f.s60-me.f.s60)
            + 0.6*Math.abs(r.f.qm-me.f.qm)
            + 1.2*Math.abs(Math.log(r.f.pwt/me.f.pwt))
            + (r.c.bd!==me.c.bd ? 0.35 : 0)
            + (r.c.mk===me.c.mk  ? 0.25 : 0);
    scored.push({r,d,same:r.c.mk===me.c.mk});
  }
  scored.sort((x,y)=>x.d-y.d);
  /* At most one stablemate: three cars from the same maker is a trim ladder,
     not a field. */
  const out=[]; let same=0;
  for(const s of scored){
    if(s.same && same>=1) continue;
    if(s.same) same++;
    out.push(s.r);
    if(out.length>=k) break;
  }
  return out;
}

/* --- the background paragraph -----------------------------------------
   Derived, every clause of it. Where a sentence makes a claim it is a claim
   about a number on this page. */
function blurb(me,ctx){
  const c=me.c, f=me.f;
  const body=BODY[c.bd]||"car";
  const bits=[];

  bits.push(`The ${c.yr} ${esc(name(c))} is ${AN(`${DRIVE[c.dr]||""} ${ENGINE(c)} ${body}`.trim())} `
    + `of <span class="num">${n0(c.kg)} kg</span> with <span class="num">${n0(f.bhp)} bhp</span>, `
    + `which works out at <span class="num">${n0(f.pwt)} bhp per tonne</span>.`);

  /* What the drivetrain does to the launch. 60 ft is the honest place to look:
     it is over before aerodynamics or gearing get a say. */
  const ft=n2(f.ft60);
  if(c.asp==="ev")
    bits.push(`With full torque from a standstill it clears the first 60 ft in `
      + `<span class="num">${ft} s</span>, and the question for an electric car is usually not the `
      + `launch but whether it keeps pulling: it trips the quarter-mile lights at `
      + `<span class="num">${n1(f.trap)} mph</span>.`);
  else if(c.dr==="awd")
    bits.push(`All-wheel drive is worth most in the first car length: it covers 60 ft in `
      + `<span class="num">${ft} s</span>, which is where a four-wheel-drive car takes its margin `
      + `out of a rear-drive one with the same power.`);
  else if(c.dr==="fwd")
    bits.push(`Front drive caps what it can put down off the line &mdash; 60 ft takes `
      + `<span class="num">${ft} s</span> &mdash; so most of what it has to give arrives once it is `
      + `already moving.`);
  else
    bits.push(`Rear drive and ${n0(f.pwt)} bhp per tonne make the launch the hard part of the run: `
      + `60 ft takes <span class="num">${ft} s</span>.`);

  /* Where it sits. Two rankings, because "quick" means nothing without a field. */
  /* The percentile is only worth printing when it says something. "Inside the
     top 26%" is a limp way to describe a car that is 772nd of 2,929, and a
     sentence that reads like faint praise for every mid-field car is worse than
     one that just gives the rank and stops. */
  const pct=100*ctx.rank/ctx.total;
  const band = pct<=1 ? "the fastest one per cent of the set"
             : pct<=5 ? "the fastest five per cent"
             : pct<=10 ? "the fastest tenth"
             : pct<=25 ? "the fastest quarter" : null;
  bits.push(`Against the ${ctx.total.toLocaleString("en-GB")} cars in the set it is the `
    + `<b>${RANK(ctx.rank)} to 60 mph</b>`
    + (band ? `, inside ${band}` : ``)
    + (ctx.makeTotal>1
       ? `, and the ${RANK(ctx.makeRank)} of the ${ctx.makeTotal} `
         + `${esc(c.mk)}${ctx.makeTotal===1?"":"s"} here` : ``)
    + `.`);

  /* Trap speed against 0-60 rank separates a car that launches from a car that
     pulls. This is the one genuinely interpretive sentence, and it is still
     nothing more than two of our own rankings compared. */
  if(ctx.trapRank!=null){
    const d=ctx.rank-ctx.trapRank;
    if(d>=ctx.total*0.06)
      bits.push(`It traps higher than its 0-60 suggests &mdash; <span class="num">${n1(f.trap)} mph</span>, `
        + `the ${ctx.trapRank===1?"highest":ORD(ctx.trapRank)+" highest"} here &mdash; so it is a car that keeps going rather than one `
        + `that simply leaves well.`);
    else if(-d>=ctx.total*0.06)
      bits.push(`It leaves better than it pulls: <span class="num">${n1(f.trap)} mph</span> at the lights `
        + `is only the ${ctx.trapRank===1?"highest":ORD(ctx.trapRank)+" highest"} here, so its 0-60 flatters what it does further out.`);
    else
      bits.push(`Its <span class="num">${n1(f.trap)} mph</span> trap speed sits about where its 0-60 `
        + `puts it, so it launches and pulls in roughly equal measure.`);
  }

  bits.push(f.total
    ? `The simulation is trimmed to <span class="num">${f.used}</span> of `
      + `<span class="num">${f.total}</span> published acceleration figures for this car.`
    : `No published acceleration figures were available to trim against, so this car runs on its `
      + `mass, power, gearing and drivetrain alone &mdash; treat it as the roughest of the set.`);

  return bits.join(" ");
}

function page({me,ctx,foes,site,url,comparisons,carUrl}){
  const c=me.c, f=me.f, nm=name(c);
  const t=`${nm}: 0-60, quarter mile and trap speed`;
  const desc=`The ${nm} reaches 60 mph in ${n2(f.s60)}s and covers the standing quarter mile in `
    + `${n2(f.qm)}s at ${n1(f.trap)} mph, simulated. Full figures, specs and head-to-head races.`;

  const answer=`The <b>${esc(nm)}</b> reaches 60&nbsp;mph in <span class="num">${n2(f.s60)} s</span> `
    + `and covers a standing quarter mile in <span class="num">${n2(f.qm)} s</span>, tripping the lights at `
    + `<span class="num">${n1(f.trap)} mph</span>. It clears the first 60&nbsp;ft in `
    + `<span class="num">${n2(f.ft60)} s</span> and the eighth mile in `
    + `<span class="num">${n2(f.e8)} s</span>`
    + (f.s100!=null ? `, reaching 100&nbsp;mph in <span class="num">${n2(f.s100)} s</span>` : ``) + `.`;

  const plain={
    s60:`The ${nm} reaches 60 mph in ${n2(f.s60)} s, simulated on dry asphalt at 20 °C with a 1 ft `
       +`rollout. That makes it the ${RANK(ctx.rank)} of the ${ctx.total.toLocaleString("en-GB")} `
       +`cars in the set.`,
    qm:`${n2(f.qm)} s at ${n1(f.trap)} mph. It reaches the eighth mile in ${n2(f.e8)} s and clears the `
       +`first 60 ft in ${n2(f.ft60)} s.`,
    spec:`${n0(f.bhp)} bhp and ${n0(c.kg)} kg, which is ${n0(f.pwt)} bhp per tonne. It is `
       +`${DRIVE[c.dr]||""}, ${ENGINE(c)}, with ${c.g} gears`
       +(c.vmx?` and a quoted top speed of ${c.vmx} km/h`:``)+`.`,
    foes:`Closest here on pace: ${foes.map(r=>`${name(r.c)} (${n2(r.f.s60)} s)`).join(", ")}. `
       +`Each one can be raced against the ${nm} in the panel at the top of this page.`,
    real:`No. Every figure on this page is produced by a physics simulation, not by a stopwatch at a `
       +`drag strip. The ${nm} is modelled from its published kerb mass, rated power, drivetrain and `
       +`gearing`
       +(f.total?`, then trimmed until it reproduces ${f.used} of its ${f.total} published acceleration `
         +`figures`:` (no published acceleration figures were available to trim it against)`)
       +`. Conditions are the same for every car in the set: dry asphalt, 20 °C, sea level, 1 ft rollout.`
  };
  const faqs=[
    {q:`What is the ${nm} 0-60 time?`, a:plain.s60},
    {q:`What is the ${nm} quarter mile time?`, a:plain.qm},
    {q:`How much power does the ${nm} have?`, a:plain.spec},
    {q:`What cars are comparable to the ${nm}?`, a:plain.foes},
    {q:`Are these real measured times?`, a:plain.real}
  ];

  const veh=SEO.vehicle(c,f,nm,url);
  const graph=SEO.jsonld({"@context":"https://schema.org","@graph":[
    SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Cars",url:"/cars/"},{name:nm}]),
    {"@type":"WebPage","@id":url,url:url,name:t,description:desc,inLanguage:"en",
     dateModified:SEO.BUILT,
     isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
     mainEntity:veh,
     /* The rivals are part of what this page is for, so they are part of what
        it says it is about. */
     about:foes.map(r=>SEO.vehicle(r.c,r.f,name(r.c),carUrl(r.c.id)?site+carUrl(r.c.id):undefined))},
    SEO.faqPage(faqs)
  ]});

  const foeRow=r=>{
    const u=carUrl(r.c.id);
    return `<tr><th scope="row">${u?`<a href="${site}${u}">${esc(name(r.c))}</a>`:esc(name(r.c))}</th>`
      + `<td>${r.c.yr}</td><td>${n2(r.f.s60)} s</td><td>${n2(r.f.qm)} s</td>`
      + `<td>${n1(r.f.trap)} mph</td><td>${n0(r.f.bhp)} bhp</td></tr>`;
  };

  const comps = comparisons.length
    ? `\n<h2>Head to head</h2>\n<div class="grid">` + comparisons.map(m=>
        `<a href="${site}/vs/${m.dir}/">${esc(name(m.a))} vs ${esc(name(m.b))}`
        + `<span>Full comparison</span></a>`).join("") + `</div>\n`
    : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${site}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${SEO.ICON}
${SEO.ROBOTS}
${graph}
<style>
${RACE.BASE}
${RACE.CSS}
${SEO.ANSWER_CSS}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:1px;
  background:var(--edge);border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.grid a{display:block;padding:11px 13px;background:var(--surface);color:var(--ink);
  text-decoration:none;font-size:14px}
.grid a:hover{background:#161E27;color:var(--amber)}
.grid a span{display:block;font:600 10px var(--cond);letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink3);margin-top:2px}
tbody th a{color:var(--ink);text-decoration:none}
tbody tr:hover th a{color:var(--amber)}
.bg{color:var(--ink2);font-size:15px;line-height:1.7;margin:0}
.bg b{color:var(--ink)}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
</style></head><body><div class="wrap">
<p class="crumbs"><a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/cars/">All cars</a>
<a class="home" href="${site}/0-60-times/${slug(c.mk)}/">${esc(c.mk)} 0-60</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/answers/">Answers</a></p>
<h1>${esc(nm)}</h1>
${SEO.answerBlock(answer,
  `Simulated, not measured &mdash; computed from published kerb mass, rated power, gearing and
   drivetrain, then fitted to this car&rsquo;s own published acceleration figures.
   Dry asphalt, 20&nbsp;&deg;C, sea level, 1&nbsp;ft rollout.`)}

${RACE.pickPanel(nm,foes.map(r=>({id:r.c.id,name:name(r.c)})),
  `Pick who it runs against, then watch it happen &mdash; and change the surface,
   the weather or the distance and run it again.`)}

<h2>Down the strip</h2>
<div class="tablewrap"><table><thead><tr><th style="text-align:left">Standing start</th>
<th>${esc(nm)}</th></tr></thead><tbody>
<tr><th scope="row">0&ndash;60 mph</th><td>${n2(f.s60)} s</td></tr>
<tr><th scope="row">0&ndash;100 mph</th><td>${f.s100==null?"—":n2(f.s100)+" s"}</td></tr>
<tr><th scope="row">60 ft</th><td>${n2(f.ft60)} s</td></tr>
<tr><th scope="row">1/8 mile</th><td>${n2(f.e8)} s</td></tr>
<tr><th scope="row">1/4 mile</th><td>${n2(f.qm)} s</td></tr>
<tr><th scope="row">Trap speed</th><td>${n1(f.trap)} mph</td></tr>
</tbody></table></div>

<h2>About the ${esc(tidy(c.md))}</h2>
<p class="bg">${blurb(me,ctx)}</p>

<h2>On paper</h2>
<div class="tablewrap"><table><thead><tr><th style="text-align:left">Specification</th>
<th>${esc(nm)}</th></tr></thead><tbody>
<tr><th scope="row">Year</th><td>${c.yr}</td></tr>
<tr><th scope="row">Power</th><td>${n0(f.bhp)} bhp</td></tr>
<tr><th scope="row">Kerb mass</th><td>${n0(c.kg)} kg</td></tr>
<tr><th scope="row">Power to weight</th><td>${n0(f.pwt)} bhp/t</td></tr>
<tr><th scope="row">Drivetrain</th><td>${DRIVEC[c.dr]||c.dr}</td></tr>
<tr><th scope="row">Gears</th><td>${c.g}</td></tr>
<tr><th scope="row">Engine</th><td>${ENGINE(c).replace(/^./,m=>m.toUpperCase())}</td></tr>
${c.vmx?`<tr><th scope="row">Top speed</th><td>${c.vmx} km/h</td></tr>`:``}
</tbody></table></div>

<h2>Similar cars</h2>
<div class="tablewrap"><table><thead><tr><th style="text-align:left">Car</th><th>Year</th>
<th>0&ndash;60</th><th>1/4 mile</th><th>Trap</th><th>Power</th></tr></thead><tbody>
${foes.map(foeRow).join("")}
</tbody></table></div>
<p class="note">Picked for a fair race, not just a matching 0-60: pace, power-to-weight and body
shape all count, and at most one is from the same maker.</p>
${comps}
${RACE.embedBox(site,c.id,foes[0].c.id,`${nm} versus ${name(foes[0].c)}, simulated`)}
${SEO.faqHTML(faqs)}
${SEO.updatedLine()}

${RACE.pickScript(c.id,nm,foes.map(r=>({id:r.c.id,name:name(r.c)})))}

<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile &mdash; dry asphalt, 20&nbsp;&deg;C, sea level,
1&nbsp;ft rollout. They are not timing-slip records. Acceleration figures from
<a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

/* --- which cars get a page -------------------------------------------
   Ordered by the demand we have evidence for, not alphabetically:
     1. cars that already appear in a built comparison -- proven interest;
     2. then by make, in the order the search probes were run;
     3. then the rest, quickest first, because that is how people search.
   The tranche size is a knob (CAR_PAGES=all for the lot). Shipping 2,900
   near-identical templates in one push is the shape of a doorway network even
   when the content is real, and publishing in tranches also means the next one
   can be judged against the last -- which is the entire point of doing it this
   way round. */
function order(all,vsMade){
  const inVs=new Set();
  for(const m of vsMade||[]){ inVs.add(m.a.id); inVs.add(m.b.id); }
  let makeRank;
  try{
    const demand=JSON.parse(fs.readFileSync(path.join(__dirname,"..","data/demand.json"),"utf8"));
    const seen=[];
    for(const x of demand){
      if(x.kind!=="car") continue;
      const mk=x.probe.replace(/^how fast is an? /,"").replace(/ 0-60 $/,"")
                      .replace(/ quarter mile $/,"").trim().toLowerCase();
      if(mk && !seen.includes(mk)) seen.push(mk);
    }
    makeRank=mk=>{ const i=seen.indexOf(String(mk).toLowerCase()); return i<0?999:i; };
  }catch(e){ makeRank=()=>999; }

  const byMake=x=>makeRank(x.c.mk);

  /* Tier 1: cars that already appear in a built comparison. Somebody searched
     for that matchup, so we know the car itself is wanted. */
  const tier1=all.filter(r=>inVs.has(r.c.id))
    .sort((x,y)=>byMake(x)-byMake(y)||x.f.s60-y.f.s60||x.c.id.localeCompare(y.c.id));

  /* Tier 2: everything else, ROUND-ROBIN across makes rather than make by make.
     Sorting straight by make rank sounds right and is not: BMW and Porsche alone
     have 543 cars between them, so a 700-page tranche ordered that way publishes
     two and a half makes and nothing else -- no Ferrari page, no Golf page, and
     no way to learn which makes are worth the next tranche. One car from each
     make in turn, quickest first, covers the query space instead of drilling
     one hole in it. */
  const groups=new Map();
  for(const r of all){
    if(inVs.has(r.c.id)) continue;
    if(!groups.has(r.c.mk)) groups.set(r.c.mk,[]);
    groups.get(r.c.mk).push(r);
  }
  const order2=[...groups.keys()].sort((a,b)=>
    makeRank(a)-makeRank(b) || groups.get(b).length-groups.get(a).length || a.localeCompare(b));
  /* Quickest-first inside a make sounds right and is the same mistake as sorting
     straight by make rank, one level down: it publishes every marque's supercar
     and buries its hatchback. Toyota leads with a GRMN Yaris while the Yaris
     people actually search for waits 40 places. Search volume runs the other
     way -- "yaris 0-60" is typed far more often than "grmn yaris 0-60" -- so an
     ordinary car goes first in each make, and the fast ones follow in order. */
  const everyday=r=>r.c.cls==="Everyday"?0:1;
  for(const k of order2) groups.get(k).sort((x,y)=>
    everyday(x)-everyday(y)||x.f.s60-y.f.s60||x.c.id.localeCompare(y.c.id));

  const tier2=[];
  for(let i=0;; i++){
    let any=false;
    for(const k of order2){
      const g=groups.get(k);
      if(i<g.length){ tier2.push(g[i]); any=true; }
    }
    if(!any) break;
  }
  return tier1.concat(tier2);
}

/* Slugs have to be unique and, more importantly, stable: a URL that moves
   between builds loses whatever ranking it had. Same name twice is settled by
   the year, then by a counter, both derived from a fixed source order. */
function slugs(rows){
  const taken=new Map();
  for(const r of rows){
    let base=slug(rawName(r.c)), s=base, n=2;
    if(taken.has(s)) s=`${base}-${r.c.yr}`;
    while(taken.has(s)) s=`${base}-${r.c.yr}-${n++}`;
    taken.set(s,r.c.id);
    r.slug=s;
  }
  return rows;
}

function indexPage(rows,site,total){
  const by={};
  for(const r of rows) (by[r.c.mk] ||= []).push(r);
  const makes=Object.keys(by).sort((a,b)=>a.localeCompare(b));
  for(const m of makes) by[m].sort((x,y)=>x.f.s60-y.f.s60);
  const t="Every car: 0-60, quarter mile and trap speed";
  const d=`Simulated 0-60, quarter mile and trap speed for ${rows.length} cars, one page each, `
    + `grouped by make.`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(d)}">
<link rel="canonical" href="${site}/cars/">
<meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}">
<meta property="og:image" content="${site}/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
${SEO.ICON}
${SEO.ROBOTS}
${SEO.jsonld({"@context":"https://schema.org","@graph":[
  SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Cars"}]),
  {"@type":"CollectionPage","@id":`${site}/cars/`,url:`${site}/cars/`,name:t,description:d,
   dateModified:SEO.BUILT,inLanguage:"en",
   isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
   mainEntity:{"@type":"ItemList",numberOfItems:rows.length,
     itemListElement:rows.slice(0,200).map((r,i)=>({"@type":"ListItem",position:i+1,
       name:name(r.c),url:`${site}/cars/${r.slug}/`}))}}]})}
<style>
${RACE.BASE}
.find{position:sticky;top:0;z-index:3;background:var(--bg);padding:10px 0 12px;margin:0 0 4px}
#q{width:100%;padding:11px 13px;font:15px system-ui,sans-serif;color:var(--ink);
  background:var(--sunk);border:1px solid var(--edge2);border-radius:5px}
#q:focus{outline:0;border-color:var(--amber)}
#q::placeholder{color:var(--ink3)}
.count{font:600 11px var(--cond);letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink3);margin:9px 2px 0}
.jump{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 6px}
.jump a{font:600 11px var(--cond);letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink2);text-decoration:none;background:var(--surface);
  border:1px solid var(--edge);border-radius:3px;padding:4px 8px}
.jump a:hover{color:var(--amber);border-color:var(--edge2)}
h2{scroll-margin-top:74px}
ul{list-style:none;margin:0;padding:0;background:var(--surface);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
li+li{border-top:1px solid var(--edge)}
li a{display:flex;justify-content:space-between;gap:12px;padding:10px 13px;color:var(--ink);
  text-decoration:none;font-size:14px}
li a:hover{background:#161E27;color:var(--amber)}
li a em{font-style:normal;font-family:var(--mono);font-size:12.5px;color:var(--ink3);flex:0 0 auto}
.none{color:var(--ink3);padding:14px 2px}
</style></head><body><div class="wrap">
<p class="crumbs"><a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/0-60-times/">0-60 by make</a>
<a class="home" href="${site}/fastest/">Fastest lists</a></p>
<h1>Every car</h1>
<p class="lede">One page per car: 0-60, 60&nbsp;ft, eighth and quarter mile, trap speed and three
similar cars to race it against. <b>${rows.length.toLocaleString("en-GB")}</b> published so far
of ${total.toLocaleString("en-GB")} in the simulator.</p>
<div class="find">
  <input id="q" type="search" placeholder="Filter &mdash; try &ldquo;m3&rdquo;, &ldquo;golf gti&rdquo;, &ldquo;911&rdquo;" autocomplete="off" aria-label="Filter cars">
  <p class="count" id="count">${rows.length} cars</p>
</div>
<nav class="jump" id="jump">${makes.map(m=>`<a href="#m-${slug(m)}">${esc(m)}</a>`).join("")}</nav>
<p class="none" id="none" hidden>Nothing matches that.</p>
${makes.map(m=>`<section data-make="${esc(m)}"><h2 id="m-${slug(m)}">${esc(m)}</h2><ul>${by[m].map(r=>
  `<li><a href="${site}/cars/${r.slug}/">${esc(V.tidy(r.c.md))}<em>${n2(r.f.s60)} s</em></a></li>`
  ).join("")}</ul></section>`).join("")}
<footer>Acceleration figures from <a href="https://accelerationtimes.com">accelerationtimes.com</a>
and <a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
<script>
/* Every row is already in the page, so filtering is hiding -- no fetch, no index. */
(function(){
  var q=document.getElementById("q"), count=document.getElementById("count"),
      none=document.getElementById("none"), jump=document.getElementById("jump"),
      secs=[].slice.call(document.querySelectorAll("section[data-make]")),
      rows=[].slice.call(document.querySelectorAll("li")), total=rows.length;
  rows.forEach(function(li){ li.dataset.t=(li.closest("section").dataset.make+" "+li.textContent).toLowerCase(); });
  function apply(){
    var t=q.value.trim().toLowerCase(), n=0;
    rows.forEach(function(li){ var hit=!t||li.dataset.t.indexOf(t)>=0; li.hidden=!hit; if(hit) n++; });
    secs.forEach(function(s){ s.hidden=!s.querySelector("li:not([hidden])"); });
    jump.hidden=!!t; none.hidden=n>0;
    count.textContent=n+(n===1?" car":" cars")+(t?" of "+total:"");
  }
  q.addEventListener("input",apply); apply();
})();
<\/script>
</div></body></html>`;
}

/* Every car slug that has ever been published, committed to the repo because
   public/ is not. Two rules depend on it and neither can be derived from a
   fresh checkout: a slug is never reassigned, and a page is never withdrawn. */
const MANIFEST=path.join(__dirname,"..","data/published-cars.json");

function build(all,outDir,site,vsMade,limit){
  /* Slugs are assigned in SOURCE order, before any ranking. When two cars share
     a name the first one seen keeps the bare slug, so a URL depends only on the
     order rows sit in the car array -- new cars are appended, so they can never
     take a slug off a car that is already live. Assigning them after order()
     instead would mean that every change to the ranking silently renamed pages,
     which is how a site loses the ranking it has. */
  const ranked=order(slugs(all.slice()),vsMade);

  let keep=[]; try{ keep=JSON.parse(fs.readFileSync(MANIFEST,"utf8")); }catch(e){}
  const kept=new Set(keep);
  /* Never withdraw a page. Re-ordering the tranche moved 123 cars in and 123
     out; those 123 would have become 404s on a domain still trying to establish
     that it is worth crawling. Anything already published stays published
     whatever the new ranking says, and the cap fills what is left. */
  const was=ranked.filter(r=>kept.has(r.slug));
  const rest=ranked.filter(r=>!kept.has(r.slug));
  const pub = limit==null ? ranked
            : was.concat(rest).slice(0, Math.max(limit, was.length));
  if(limit!=null && was.length>limit) console.log(`  note: ${was.length} already `
    +`published exceeds CAR_PAGES=${limit}; publishing all of them`);
  const bySlug=new Map(pub.map(r=>[r.c.id,r.slug]));
  const carUrl=id=>bySlug.has(id) ? `/cars/${bySlug.get(id)}/` : null;

  /* Rankings are over the WHOLE set, not the published tranche: "the 41st
     quickest car here" has to mean the same thing next month, when more pages
     exist, or every published page quietly becomes wrong. */
  const bys60=all.slice().sort((x,y)=>x.f.s60-y.f.s60);
  const rank=new Map(bys60.map((r,i)=>[r.c.id,i+1]));
  const byTrap=all.filter(r=>r.f.trap!=null).sort((x,y)=>y.f.trap-x.f.trap);
  const trapRank=new Map(byTrap.map((r,i)=>[r.c.id,i+1]));
  const makeRows={};
  for(const r of bys60) (makeRows[r.c.mk] ||= []).push(r.c.id);

  const vsFor=new Map();
  for(const m of vsMade||[]){
    for(const id of [m.a.id,m.b.id]){
      if(!vsFor.has(id)) vsFor.set(id,[]);
      if(vsFor.get(id).length<8) vsFor.get(id).push(m);
    }
  }

  const urls=[], hero=[];
  for(const me of pub){
    const ctx={
      rank:rank.get(me.c.id), total:all.length,
      makeRank:makeRows[me.c.mk].indexOf(me.c.id)+1, makeTotal:makeRows[me.c.mk].length,
      trapRank:trapRank.has(me.c.id)?trapRank.get(me.c.id):null
    };
    const foes=rivals(me,pub,3);
    if(foes.length<3) continue;                 /* a panel needs opponents */
    const url=`${site}/cars/${me.slug}/`;
    fs.mkdirSync(path.join(outDir,"cars",me.slug),{recursive:true});
    fs.writeFileSync(path.join(outDir,"cars",me.slug,"index.html"),
      page({me,ctx,foes,site,url,comparisons:vsFor.get(me.c.id)||[],carUrl}));
    urls.push(`/cars/${me.slug}/`);
    /* the pair this page stages, so a share card can be drawn for it */
    hero.push({slug:me.slug,a:me.c.id,b:foes[0].c.id});
  }
  fs.mkdirSync(path.join(outDir,"cars"),{recursive:true});
  fs.writeFileSync(path.join(outDir,"cars","index.html"),indexPage(pub,site,all.length));
  urls.unshift("/cars/");
  /* Record what went out, so the next build cannot take any of it back. Sorted,
     so the diff shows what was added rather than what moved. */
  const now=[...new Set(keep.concat(pub.map(r=>r.slug)))].sort();
  fs.writeFileSync(MANIFEST,JSON.stringify(now,null,0)+"\n");

  return {urls,carUrl,published:pub,hero};
}

module.exports={rivals,blurb,page,build,order,ORD};
