/* Builds the /vs/ comparison pages.
 *
 * Every number on these pages is computed by the simulator itself, not typed in:
 * the DOM-free prefix of src/app.html (car data + the physics) is evaluated in a
 * VM, so a page cannot drift from what the app would show for the same cars.
 */
const fs=require("fs"), path=require("path"), vm=require("vm");

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

  /* Each neighbour is stated as a result, not just a link: the gap is the whole
     reason someone clicks it. */
  const gapText=g => g==null ? "&mdash;"
    : Math.abs(g)<0.005 ? "dead heat"
    : (g>0?"wins by ":"loses by ")+n2(Math.abs(g))+" s";
  const nextCol=(c,cls,list)=> !list.length ? "" :
    `<div><h3><span class="${cls}">${esc(name(c))}</span> against</h3><ul>`
    + list.map(r=>`<li><a href="${site}/vs/${r.dir}/">`
        + `<span class="o">${esc(name(r.opp))}</span>`
        + `<span class="d${r.gap!=null&&r.gap>0?" win":""}">${gapText(r.gap)}</span></a></li>`).join("")
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
:root{--bg:#0B0F14;--surface:#12181F;--sunk:#0E141A;--edge:#1E2833;--edge2:#2A3644;
  --ink:#E9EDF2;--ink2:#9BA9B8;--ink3:#6C7B8A;--amber:#F2A20C;--A:#1B9CCE;--B:#EE4A63;--win:#2FCB6E;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --cond:"Barlow Condensed",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);overflow-x:hidden;
  font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
/* The race deserves more room than a column of prose. */
.bleed{width:min(1160px,calc(100vw - 34px));margin-left:50%;transform:translateX(-50%)}
.wrap{max-width:860px;margin:0 auto;padding:26px 18px 60px}
a{color:var(--amber)}
.home{font:600 11px var(--cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);
  text-decoration:none;display:inline-block;margin-bottom:22px}
.home:hover{color:var(--amber)}
h1{font-family:var(--cond);font-size:34px;line-height:1.1;letter-spacing:.01em;margin:0 0 12px}
.lede{color:var(--ink2);font-size:16px;margin:0 0 26px}
.lede b{color:var(--ink)}
.num{font-family:var(--mono);color:var(--amber)}
h2{font-family:var(--cond);text-transform:uppercase;letter-spacing:.15em;font-size:13px;
  color:var(--ink2);margin:30px 0 10px}
table{width:100%;border-collapse:collapse;background:var(--surface);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
th,td{padding:9px 12px;text-align:right;border-bottom:1px solid var(--edge);font-family:var(--mono);font-size:13px}
thead th{text-align:right;font-family:var(--cond);text-transform:uppercase;letter-spacing:.1em;
  font-size:11px;color:var(--ink2);background:var(--sunk)}
tbody th{text-align:left;font-family:system-ui,sans-serif;font-weight:400;color:var(--ink2);font-size:13px}
thead th:nth-child(2){color:var(--A)} thead th:nth-child(3){color:var(--B)}
td.w{color:var(--amber)}
tr:last-child th,tr:last-child td{border-bottom:0}
.note{color:var(--ink3);font-size:12.5px;margin:9px 2px 0}
.sim{background:linear-gradient(180deg,#141B23,#10161D);border:1px solid var(--edge2);
  border-radius:6px;padding:22px 20px 20px;text-align:center}
.sim .note{margin:12px auto 0;max-width:46ch}
/* The placeholder has to earn the top of the page: name the two cars in their
   own colours and put the tree above the button, so it reads as a start line. */
.stage{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;
  margin:0 0 16px;font:600 15px var(--cond);letter-spacing:.06em;text-transform:uppercase}
.tag{color:var(--ink)} .tag.ta{color:var(--A)} .tag.tb{color:var(--B)}
.lights{display:flex;gap:5px}
.lights i{width:8px;height:8px;border-radius:50%;background:var(--amber);opacity:.28;
  animation:tree 2.4s infinite}
.lights i:nth-child(2){animation-delay:.22s} .lights i:nth-child(3){animation-delay:.44s}
@keyframes tree{0%,10%{opacity:1}45%,100%{opacity:.28}}
@media(prefers-reduced-motion:reduce){.lights i{animation:none;opacity:.7}}
/* Stacked, the tree sits between the two cars instead of trailing the first. */
@media(max-width:560px){.stage{flex-direction:column;gap:9px}}
.simframe{display:block;width:100%;height:545px;border:0;border-radius:4px;background:var(--bg);transition:height .18s ease}
.sim{position:relative}
.sim.busy{padding:0}
/* The app is one ~950KB file: there is a real wait between the click and the
   first frame. Cover it with the start line the button came from, rather than
   letting the frame show its own half-built UI. */
.veil{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:15px;border-radius:5px;
  background:linear-gradient(180deg,#141B23,#10161D);transition:opacity .32s ease}
.sim.ready .veil{opacity:0;pointer-events:none}
.veil .stage{margin:0}
.bar{width:132px;height:3px;border-radius:2px;background:var(--edge2);overflow:hidden}
.bar i{display:block;width:38%;height:100%;background:var(--amber);border-radius:2px;
  animation:stage 1.15s ease-in-out infinite}
@keyframes stage{0%{transform:translateX(-105%)}100%{transform:translateX(275%)}}
.veil p{margin:0;font:600 10px var(--cond);letter-spacing:.2em;text-transform:uppercase;color:var(--ink3)}
@media(prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}
/* "It beats the RS3 -- but how would it go against the M4?" is the question
   every one of these pages provokes, and we already have the answer built. */
.next{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px}
.next h3{margin:0 0 7px;font:600 11px var(--cond);letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink3)}
.next h3 .ca{color:var(--A)} .next h3 .cb{color:var(--B)}
.next ul{list-style:none;margin:0;padding:0;background:var(--surface);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.next li+li{border-top:1px solid var(--edge)}
.next a{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
  padding:9px 12px;color:var(--ink);text-decoration:none;font-size:13.5px}
.next a:hover{background:#161E27} .next a:hover .o{color:var(--amber)}
.d{font-family:var(--mono);font-size:11.5px;white-space:nowrap;color:var(--ink3)}
.d.win{color:var(--win)}
@media(max-width:620px){.next{grid-template-columns:1fr}}
.alt{margin:22px 2px 0;font-size:13px}
.alt a{color:var(--ink2)}
@media(max-width:560px){.simframe{height:470px}}
.cta{display:inline-block;margin:0;background:var(--amber);color:#12181F;border:0;cursor:pointer;
  font:700 13px var(--cond);letter-spacing:.14em;text-transform:uppercase;
  padding:12px 22px;border-radius:5px;text-decoration:none}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--edge);
  color:var(--ink3);font-size:12px}
@media(max-width:560px){h1{font-size:26px}th,td{padding:8px 9px;font-size:12px}}
</style></head><body><div class="wrap">
<a class="home" href="${site}/">&larr; Trap Speed</a>
<h1>${esc(name(a))} vs ${esc(name(b))}</h1>
<p class="lede">${winner
  ? `Over a standing quarter mile on dry asphalt, the <b>${esc(name(winner))}</b> gets there in
     <span class="num">${n2(Math.min(fa.qm,fb.qm))} s</span> &mdash;
     <span class="num">${n2(gap)} s</span> ahead of the ${esc(name(loser))}.`
  : `A simulated standing quarter mile between the ${esc(name(a))} and the ${esc(name(b))}.`}</p>

<div class="bleed"><div class="sim" id="sim">
  <div class="stage">
    <span class="tag ta">${esc(name(a))}</span>
    <span class="lights"><i></i><i></i><i></i></span>
    <span class="tag tb">${esc(name(b))}</span>
  </div>
  <button class="cta" type="button" id="simgo">&#9654;&nbsp; Run this race</button>
  <p class="note">Watch the run in full &mdash; then change the surface, the weather
  or the distance and run it again.</p>
</div></div>
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

<script>
/* The app is a ~950KB single file. Loading it in an iframe on page load would
   cost this page the speed scores it needs to rank, so it arrives on click. */
var sim=document.getElementById("sim");
function reveal(){ sim.classList.add("ready");
  setTimeout(function(){ var v=sim.querySelector(".veil"); if(v) v.remove(); },400); }
document.getElementById("simgo").addEventListener("click",function(){
  var f=document.createElement("iframe");
  f.src=${JSON.stringify(`/?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}&embed=1`)};
  f.title=${JSON.stringify(`${name(a)} versus ${name(b)}, simulated`)};
  f.loading="lazy"; f.className="simframe";
  /* Keep the two names on screen through the wait -- the panel should look
     like it is staging the race, not like it blanked. */
  var stage=sim.querySelector(".stage");
  var veil=document.createElement("div"); veil.className="veil";
  if(stage) veil.appendChild(stage);
  veil.insertAdjacentHTML("beforeend",'<div class="bar"><i></i></div><p>Staging</p>');
  sim.textContent=""; sim.className="sim busy";
  sim.appendChild(f); sim.appendChild(veil);
  /* If the app never reports in -- a script error, a blocked frame -- show it
     anyway rather than leaving a bar running forever. */
  f.addEventListener("load",function(){ setTimeout(reveal,1800); });
  setTimeout(reveal,9000);
});
addEventListener("message",function(ev){
  if(ev.origin!==location.origin) return;
  var d=ev.data; if(!d) return;
  if(d.trapspeed==="ready") reveal();
  /* The frame reports its own height, so the race is never behind a scrollbar. */
  if(d.trapspeed==="height"){
    var f=document.querySelector(".simframe");
    if(f) f.style.height=Math.max(300,Math.min(900,d.h))+"px";
  }
});
</script>

<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile &mdash; dry asphalt, 20&nbsp;&deg;C, sea level,
1&nbsp;ft rollout. They are not timing-slip records. Acceleration figures from
<a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

function indexPage(rows,site){
  const by={};
  for(const r of rows){ (by[r.a.mk] ||= []).push(r); }
  const makes=Object.keys(by).sort((x,y)=>x.localeCompare(y));
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
:root{--bg:#0B0F14;--surface:#12181F;--edge:#1E2833;--ink:#E9EDF2;--ink2:#9BA9B8;--ink3:#6C7B8A;
  --amber:#F2A20C;--cond:"Barlow Condensed",system-ui,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:26px 18px 60px}
a{color:var(--amber)}
.home{font:600 11px var(--cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);
  text-decoration:none;display:inline-block;margin-bottom:22px}.home:hover{color:var(--amber)}
h1{font-family:var(--cond);font-size:34px;margin:0 0 10px}
.lede{color:var(--ink2);margin:0 0 26px}
h2{font-family:var(--cond);text-transform:uppercase;letter-spacing:.15em;font-size:12px;
  color:var(--ink3);margin:26px 0 8px}
ul{list-style:none;margin:0;padding:0;display:grid;gap:1px;background:var(--edge);
  border:1px solid var(--edge);border-radius:5px;overflow:hidden}
li{background:var(--surface)}
li a{display:block;padding:10px 13px;color:var(--ink);text-decoration:none;font-size:14px}
li a:hover{background:#161E27;color:var(--amber)}
footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--edge);color:var(--ink3);font-size:12px}
</style></head><body><div class="wrap">
<a class="home" href="${site}/">&larr; Trap Speed</a>
<h1>Car comparisons</h1>
<p class="lede">${rows.length} head-to-head drag races, simulated from each car&rsquo;s published
acceleration data. Every one runs live in the page.</p>
${makes.map(m=>`<h2>${esc(m)}</h2><ul>${by[m].map(r=>
  `<li><a href="${site}/vs/${r.dir}/">${esc(name(r.a))} vs ${esc(name(r.b))}</a></li>`).join("")}</ul>`).join("")}
<footer>Acceleration figures from <a href="https://accelerationtimes.com">accelerationtimes.com</a>
and <a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
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
    .slice(0,LIMIT)
    .map(m=>{
      const own=m.a.id===c.id, mine=own?m.fa:m.fb, theirs=own?m.fb:m.fa;
      return {opp:own?m.b:m.a, dir:m.dir,
              gap: mine.qm!=null&&theirs.qm!=null ? theirs.qm-mine.qm : null};
    });

  const urls=[];
  for(const m of made){
    fs.mkdirSync(path.join(outDir,"vs",m.dir),{recursive:true});
    fs.writeFileSync(path.join(outDir,"vs",m.dir,"index.html"),
      page({...m,site,related:{a:others(m.a,m),b:others(m.b,m)}}));
    urls.push(`/vs/${m.dir}/`);
  }
  fs.writeFileSync(path.join(outDir,"vs","index.html"),indexPage(made,site));
  urls.unshift("/vs/");
  return urls;
}
module.exports={build};
