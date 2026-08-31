/* Builds the /vs/ comparison pages.
 *
 * Every number on these pages is computed by the simulator itself, not typed in:
 * the DOM-free prefix of src/app.html (car data + the physics) is evaluated in a
 * VM, so a page cannot drift from what the app would show for the same cars.
 */
const fs=require("fs"), path=require("path"), vm=require("vm");
const RACE=require("./race.js");

const MPH=2.23694, ROOT=path.join(__dirname,"..");

function physics(appSrc){
  /* Not the first <script> in the file -- that one is the embed-mode probe --
     but the last one opened before the DOM code starts. */
  const dom=appSrc.indexOf("const $=s=>document.querySelector");
  if(dom<0) throw new Error("vs.js: cannot find the DOM boundary in app.html");
  const body=appSrc.slice(appSrc.lastIndexOf("<script>",dom)+8);
  const cut=body.indexOf("const $=s=>document.querySelector");
  const ctx={console}; vm.createContext(ctx);
  vm.runInContext(body.slice(0,cut)+";globalThis.__api={CARS,run,tAtD,tAtV,vAtD,FT,QM};",ctx);
  return ctx.__api;
}

const ENV={surf:"dry",tempC:20,alt:0,wind:0,grade:0,load:0};   /* the app's defaults */

function figures(A,c){
  const tr=A.run(c,ENV,{maxD:A.QM,maxT:90});
  const roll=A.tAtD(tr,A.FT)||0;                                /* 1 ft rollout, as the app does */
  const tv=v=>{ const t=A.tAtV(tr,v/MPH); return t==null?null:t-roll; };
  const td=d=>{ const t=A.tAtD(tr,d);      return t==null?null:t-roll; };
  return {
    s60:tv(60), s100:tv(100),
    ft60:td(60*0.3048), e8:td(A.QM/2), qm:td(A.QM),
    trap:A.vAtD(tr,A.QM)==null?null:A.vAtD(tr,A.QM)*MPH,
    bhp:c.kW*1.34102, pwt:c.kW*1.34102/c.kg*1000,
    used:c.f?c.f[0]:null, total:c.f?c.f[1]:null
  };
}

const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
/* fold accents first, or "Coupé" slugs as "coup" */
const slug=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const n2=v=>v==null?"—":v.toFixed(2);
const n1=v=>v==null?"—":v.toFixed(1);
const n0=v=>v==null?"—":Math.round(v).toLocaleString();
/* 18 model names in the source data have their brackets scrambled -- "Cayenne
   Coupé S 9YB) (Facelift" -- which is survivable in a dropdown but not in a
   page title, an H1 and a URL. Strip the brackets when they make no sense. */
function tidy(md){
  const i=md.indexOf(")"), j=md.indexOf("(");
  const scrambled = (i>=0 && (j<0 || i<j)) ||
                    (md.match(/\(/g)||[]).length!==(md.match(/\)/g)||[]).length;
  return (scrambled ? md.replace(/[()]/g," ") : md).replace(/\s{2,}/g," ").trim();
}
const name=c=>`${c.mk} ${tidy(c.md)}`;

const DRIVE={rwd:"Rear drive",awd:"All-wheel drive",fwd:"Front drive"};
const ASP={na:"Naturally aspirated",turbo:"Turbocharged",sc:"Supercharged",ev:"Electric"};

function row(label,a,b,fmt,lowerWins=true){
  const va=a, vb=b;
  let wa=false, wb=false;
  if(va!=null&&vb!=null&&va!==vb){ const aWins=lowerWins?va<vb:va>vb; wa=aWins; wb=!aWins; }
  return `<tr><th scope="row">${label}</th>`
       + `<td class="${wa?"w":""}">${fmt(va)}</td><td class="${wb?"w":""}">${fmt(vb)}</td></tr>`;
}

function page({a,b,fa,fb,site,related}){
  const t=`${name(a)} vs ${name(b)}: 0-60, quarter mile and trap speed`;
  const winner = fa.qm!=null&&fb.qm!=null ? (fa.qm<fb.qm?a:b) : null;
  const loser  = winner ? (winner===a?b:a) : null;
  const gap    = fa.qm!=null&&fb.qm!=null ? Math.abs(fa.qm-fb.qm) : null;
  const desc = winner
    ? `${name(winner)} runs the quarter mile in ${n2(Math.min(fa.qm,fb.qm))}s, `
      + `${n2(gap)}s ahead of the ${name(loser)}. Simulated 0-60, 1/8 and 1/4 mile times, trap speeds and specs.`
    : `Simulated 0-60, quarter mile and trap speed for the ${name(a)} and the ${name(b)}.`;
  const url=`${site}/vs/${slug(name(a))}-vs-${slug(name(b))}/`;

  /* No result on these links. Printing "loses by 0.41 s" answers the question
     the page exists to make you want to watch, so the run is left to tell it. */
  const nextCol=(c,cls,list)=> !list.length ? "" :
    `<div><h3><span class="${cls}">${esc(name(c))}</span> against</h3><ul>`
    + list.map(r=>`<li><a href="${site}/vs/${r.dir}/">`
        + `<span class="o">${esc(name(r.opp))}</span></a></li>`).join("")
    + `</ul></div>`;
  const rel=related||{a:[],b:[]};
  const nextHTML = (rel.a.length||rel.b.length)
    ? `\n<h2>Try another matchup</h2>\n<div class="next">`
      + nextCol(a,"ca",rel.a) + nextCol(b,"cb",rel.b) + `</div>\n`
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
<meta name="twitter:card" content="summary_large_image">
<style>
${RACE.BASE}
${RACE.CSS}
thead th:nth-child(2){color:var(--A)} thead th:nth-child(3){color:var(--B)}
td.w{color:var(--amber)}
/* "It beats the RS3 -- but how would it go against the M4?" is the question
   every one of these pages provokes, and we already have the answer built. */
.next{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}
.next h3{margin:0 0 7px;font:600 11px var(--cond);letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink3)}
.next h3 .ca{color:var(--A)} .next h3 .cb{color:var(--B)}
.next ul{list-style:none;margin:0;padding:0;background:var(--surface);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.next li+li{border-top:1px solid var(--edge)}
.next a{display:block;padding:9px 12px;color:var(--ink);text-decoration:none;font-size:13.5px}
.next a:hover{background:#161E27} .next a:hover .o{color:var(--amber)}
@media(max-width:620px){.next{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<p class="crumbs"><a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/0-60-times/">0-60 by make</a>
<a class="home" href="${site}/fastest/">Fastest lists</a></p>
<h1>${esc(name(a))} vs ${esc(name(b))}</h1>
<p class="lede">${winner
  ? `Over a standing quarter mile on dry asphalt, the <b>${esc(name(winner))}</b> gets there in
     <span class="num">${n2(Math.min(fa.qm,fb.qm))} s</span> &mdash;
     <span class="num">${n2(gap)} s</span> ahead of the ${esc(name(loser))}.`
  : `A simulated standing quarter mile between the ${esc(name(a))} and the ${esc(name(b))}.`}</p>

${RACE.panel(name(a),name(b),
  `Watch the run in full &mdash; then change the surface, the weather
   or the distance and run it again.`)}
<h2>Down the strip</h2>
<table><thead><tr><th>Standing start</th><th>${esc(name(a))}</th><th>${esc(name(b))}</th></tr></thead><tbody>
${row("0&ndash;60 mph",fa.s60,fb.s60,v=>n2(v)+" s")}
${row("0&ndash;100 mph",fa.s100,fb.s100,v=>n2(v)+" s")}
${row("60 ft",fa.ft60,fb.ft60,v=>n2(v)+" s")}
${row("1/8 mile",fa.e8,fb.e8,v=>n2(v)+" s")}
${row("1/4 mile",fa.qm,fb.qm,v=>n2(v)+" s")}
${row("Trap speed",fa.trap,fb.trap,v=>n1(v)+" mph",false)}
</tbody></table>
<p class="note">${fa.total&&fb.total
  ? `Each car is trimmed to its own published figures &mdash;
     <span class="num">${fa.used}/${fa.total}</span> for the ${esc(name(a))},
     <span class="num">${fb.used}/${fb.total}</span> for the ${esc(name(b))} &mdash;
     so a heavier car can still be the quicker one if that is what it tests.`
  : ""}</p>

<h2>On paper</h2>
<table><thead><tr><th>Specification</th><th>${esc(name(a))}</th><th>${esc(name(b))}</th></tr></thead><tbody>
<tr><th scope="row">Year</th><td>${a.yr}</td><td>${b.yr}</td></tr>
${row("Power",fa.bhp,fb.bhp,v=>n0(v)+" bhp",false)}
${row("Kerb mass",a.kg,b.kg,v=>n0(v)+" kg")}
${row("Power to weight",fa.pwt,fb.pwt,v=>n0(v)+" bhp/t",false)}
<tr><th scope="row">Drivetrain</th><td>${DRIVE[a.dr]||a.dr}</td><td>${DRIVE[b.dr]||b.dr}</td></tr>
<tr><th scope="row">Engine</th><td>${ASP[a.asp]||a.asp}</td><td>${ASP[b.asp]||b.asp}</td></tr>
</tbody></table>
${nextHTML}
<p class="alt"><a href="${site}/?a=${encodeURIComponent(a.id)}&amp;b=${encodeURIComponent(b.id)}">Or open the full simulator &rarr;</a></p>

${RACE.script(a.id,b.id,`${name(a)} versus ${name(b)}, simulated`)}

<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile &mdash; dry asphalt, 20&nbsp;&deg;C, sea level,
1&nbsp;ft rollout. They are not timing-slip records. Acceleration figures from
<a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

function indexPage(rows,site){
  /* The source data spells it both "McLaren" and "Mclaren", which put two
     identical headings in the nav. Group case-blind, label with whichever
     spelling the data uses more. */
  const by={}, spell={};
  for(const r of rows){
    const k=r.a.mk.toLowerCase();
    (by[k] ||= []).push(r);
    (spell[k] ||= {})[r.a.mk]=(spell[k][r.a.mk]||0)+1;
  }
  const label=k=>Object.entries(spell[k]).sort((x,y)=>y[1]-x[1])[0][0];
  /* Alphabetical, and no result on the row: a list that tells you who wins is a
     list of races nobody needs to watch. */
  for(const m in by) by[m].sort((x,y)=>name(x.a).localeCompare(name(y.a))||name(x.b).localeCompare(name(y.b)));
  const makes=Object.keys(by).sort((x,y)=>label(x).localeCompare(label(y)));
  const t="Car comparisons — 0-60, quarter mile and trap speed";
  const d=`Simulated drag races between ${rows.length} pairs of real cars: 0-60, 1/8 and 1/4 mile times, trap speeds and specs.`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(d)}">
<link rel="canonical" href="${site}/vs/">
<meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}">
<meta property="og:image" content="${site}/og.png"><meta name="twitter:card" content="summary_large_image">
<style>
:root{--bg:#0B0F14;--surface:#12181F;--sunk:#0E141A;--edge:#1E2833;--edge2:#2A3644;
  --ink:#E9EDF2;--ink2:#9BA9B8;--ink3:#6C7B8A;--amber:#F2A20C;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --cond:"Barlow Condensed",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:26px 18px 60px}
a{color:var(--amber)}
.crumbs{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 22px}
.home{font:600 11px var(--cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);
  text-decoration:none}.home:hover{color:var(--amber)}
h1{font-family:var(--cond);font-size:34px;margin:0 0 10px}
.lede{color:var(--ink2);margin:0 0 18px}
/* A list this long needs a way in that is not scrolling. */
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
h2{font-family:var(--cond);text-transform:uppercase;letter-spacing:.15em;font-size:12px;
  color:var(--ink3);margin:26px 0 8px;scroll-margin-top:74px}
ul{list-style:none;margin:0;padding:0;background:var(--surface);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
li+li{border-top:1px solid var(--edge)}
li a{display:block;padding:10px 13px;color:var(--ink);text-decoration:none;font-size:14px}
li a:hover{background:#161E27;color:var(--amber)}
.none{color:var(--ink3);padding:14px 2px}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--edge);color:var(--ink3);font-size:12px}
</style></head><body><div class="wrap">
<p class="crumbs"><a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/0-60-times/">0-60 by make</a>
<a class="home" href="${site}/fastest/">Fastest lists</a></p>
<h1>Car comparisons</h1>
<p class="lede">${rows.length} head-to-head drag races, simulated from each car&rsquo;s published
acceleration data. Every one runs live in the page.</p>
<div class="find">
  <input id="q" type="search" placeholder="Filter &mdash; try &ldquo;m3&rdquo;, &ldquo;porsche&rdquo;, &ldquo;rs6&rdquo;" autocomplete="off" aria-label="Filter comparisons">
  <p class="count" id="count">${rows.length} comparisons</p>
</div>
<nav class="jump" id="jump">${makes.map(m=>
  `<a href="#m-${slug(label(m))}">${esc(label(m))}</a>`).join("")}</nav>
<p class="none" id="none" hidden>Nothing matches that.</p>
${makes.map(m=>`<section data-make="${esc(label(m))}"><h2 id="m-${slug(label(m))}">${esc(label(m))}</h2><ul>${by[m].map(r=>
  `<li><a href="${site}/vs/${r.dir}/">${esc(name(r.a))} vs ${esc(name(r.b))}</a></li>`
  ).join("")}</ul></section>`).join("")}
<footer>Acceleration figures from <a href="https://accelerationtimes.com">accelerationtimes.com</a>
and <a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
<script>
/* Every row is already in the page, so filtering is a matter of hiding -- no
   fetch, no index, and it still works with the list read straight from HTML. */
(function(){
  var q=document.getElementById("q"), count=document.getElementById("count"),
      none=document.getElementById("none"), jump=document.getElementById("jump"),
      secs=[].slice.call(document.querySelectorAll("section[data-make]")),
      rows=[].slice.call(document.querySelectorAll("li")), total=rows.length;
  rows.forEach(function(li){ li.dataset.t=li.textContent.toLowerCase(); });
  function apply(){
    var t=q.value.trim().toLowerCase(), n=0;
    rows.forEach(function(li){
      var hit=!t||li.dataset.t.indexOf(t)>=0; li.hidden=!hit; if(hit) n++;
    });
    secs.forEach(function(s){
      s.hidden=!s.querySelector("li:not([hidden])");
    });
    jump.hidden=!!t; none.hidden=n>0;
    count.textContent=n+(n===1?" comparison":" comparisons")+(t?" of "+total:"");
  }
  q.addEventListener("input",apply);
  apply();
})();
</script>
</div></body></html>`;
}

function build(appSrc,outDir,site){
  const pairs=JSON.parse(fs.readFileSync(path.join(ROOT,"data/pages.json"),"utf8"));
  const A=physics(appSrc);
  const car=id=>A.CARS.find(c=>c.id===id);
  const _fig=new Map();                       /* a car appears on several pages */
  const fig=c=>{ if(!_fig.has(c.id)) _fig.set(c.id,figures(A,c)); return _fig.get(c.id); };

  /* Resolve the whole set first: no page can link to its neighbours until every
     page is known. */
  const made=[];
  for(const p of pairs){
    const a=car(p.a), b=car(p.b);
    if(!a||!b){ console.warn("  vs: skipping unknown car",p.a,p.b); continue; }
    made.push({a,b,fa:fig(a),fb:fig(b),dir:`${slug(name(a))}-vs-${slug(name(b))}`});
  }

  /* Every other race we have built for this car, each carrying the gap it would
     run -- kept in source order, which is the order search demand put them in. */
  const LIMIT=8;
  const others=(c,self)=>made
    .filter(m=>m!==self&&(m.a.id===c.id||m.b.id===c.id))
    .slice(0,LIMIT)                          /* the most searched-for first... */
    .map(m=>({opp:m.a.id===c.id?m.b:m.a, dir:m.dir}))
    .sort((x,y)=>name(x.opp).localeCompare(name(y.opp)));  /* ...then A to Z */

  const urls=[];
  for(const m of made){
    fs.mkdirSync(path.join(outDir,"vs",m.dir),{recursive:true});
    fs.writeFileSync(path.join(outDir,"vs",m.dir,"index.html"),
      page({...m,site,related:{a:others(m.a,m),b:others(m.b,m)}}));
    urls.push(`/vs/${m.dir}/`);
  }
  fs.writeFileSync(path.join(outDir,"vs","index.html"),indexPage(made,site));
  urls.unshift("/vs/");
  return {urls,made};
}
module.exports={build,physics,figures,esc,slug,name,tidy,n2,n1,n0};
