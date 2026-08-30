/* Builds the /vs/ comparison pages.
 *
 * Every number on these pages is computed by the simulator itself, not typed in:
 * the DOM-free prefix of src/app.html (car data + the physics) is evaluated in a
 * VM, so a page cannot drift from what the app would show for the same cars.
 */
const fs=require("fs"), path=require("path"), vm=require("vm");

const MPH=2.23694, ROOT=path.join(__dirname,"..");

function physics(appSrc){
  const body=appSrc.slice(appSrc.indexOf("<script>")+8);
  const cut=body.indexOf("const $=s=>document.querySelector");
  if(cut<0) throw new Error("vs.js: cannot find the DOM boundary in app.html");
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
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const n2=v=>v==null?"—":v.toFixed(2);
const n1=v=>v==null?"—":v.toFixed(1);
const n0=v=>v==null?"—":Math.round(v).toLocaleString();
const name=c=>`${c.mk} ${c.md}`;

const DRIVE={rwd:"Rear drive",awd:"All-wheel drive",fwd:"Front drive"};
const ASP={na:"Naturally aspirated",turbo:"Turbocharged",sc:"Supercharged",ev:"Electric"};

function row(label,a,b,fmt,lowerWins=true){
  const va=a, vb=b;
  let wa=false, wb=false;
  if(va!=null&&vb!=null&&va!==vb){ const aWins=lowerWins?va<vb:va>vb; wa=aWins; wb=!aWins; }
  return `<tr><th scope="row">${label}</th>`
       + `<td class="${wa?"w":""}">${fmt(va)}</td><td class="${wb?"w":""}">${fmt(vb)}</td></tr>`;
}

function page({a,b,fa,fb,site}){
  const t=`${name(a)} vs ${name(b)}: 0-60, quarter mile and trap speed`;
  const winner = fa.qm!=null&&fb.qm!=null ? (fa.qm<fb.qm?a:b) : null;
  const loser  = winner ? (winner===a?b:a) : null;
  const gap    = fa.qm!=null&&fb.qm!=null ? Math.abs(fa.qm-fb.qm) : null;
  const desc = winner
    ? `${name(winner)} runs the quarter mile in ${n2(Math.min(fa.qm,fb.qm))}s, `
      + `${n2(gap)}s ahead of the ${name(loser)}. Simulated 0-60, 1/8 and 1/4 mile times, trap speeds and specs.`
    : `Simulated 0-60, quarter mile and trap speed for the ${name(a)} and the ${name(b)}.`;
  const url=`${site}/vs/${slug(name(a))}-vs-${slug(name(b))}/`;

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
  --ink:#E9EDF2;--ink2:#9BA9B8;--ink3:#6C7B8A;--amber:#F2A20C;--A:#1B9CCE;--B:#EE4A63;
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
.sim{background:var(--surface);border:1px solid var(--edge);border-radius:5px;padding:20px;text-align:center}
.sim .note{margin:12px auto 0;max-width:46ch}
.simframe{display:block;width:100%;height:545px;border:0;border-radius:4px;background:var(--bg);transition:height .18s ease}
.sim:has(.simframe){padding:0;border-color:var(--edge2)}
.alt{margin:12px 2px 0;font-size:13px}
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

<h2>Run it</h2>
<div class="bleed"><div class="sim" id="sim">
  <button class="cta" type="button" id="simgo">&#9654;&nbsp; Run this race</button>
  <p class="note">Loads the simulator with both cars on the line. Change the surface, the weather
  or the distance and run it again.</p>
</div></div>
<p class="alt"><a href="${site}/?a=${encodeURIComponent(a.id)}&amp;b=${encodeURIComponent(b.id)}">Or open the full simulator &rarr;</a></p>
<script>
/* The app is a ~950KB single file. Loading it in an iframe on page load would
   cost this page the speed scores it needs to rank, so it arrives on click. */
document.getElementById("simgo").addEventListener("click",function(){
  var f=document.createElement("iframe");
  f.src=${JSON.stringify(`/?a=${encodeURIComponent(a.id)}&b=${encodeURIComponent(b.id)}&embed=1`)};
  f.title=${JSON.stringify(`${name(a)} versus ${name(b)}, simulated`)};
  f.loading="lazy"; f.className="simframe";
  var s=document.getElementById("sim"); s.textContent=""; s.appendChild(f);
});
/* The frame reports its own height, so the race is never behind a scrollbar. */
addEventListener("message",function(ev){
  if(ev.origin!==location.origin) return;
  var d=ev.data; if(!d||d.trapspeed!=="height") return;
  var f=document.querySelector(".simframe");
  if(f) f.style.height=Math.max(300,Math.min(900,d.h))+"px";
});
</script>

<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile &mdash; dry asphalt, 20&nbsp;&deg;C, sea level,
1&nbsp;ft rollout. They are not timing-slip records. Acceleration figures from
<a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

function build(appSrc,outDir,site){
  const pairs=JSON.parse(fs.readFileSync(path.join(ROOT,"data/pages.json"),"utf8"));
  const A=physics(appSrc);
  const car=id=>A.CARS.find(c=>c.id===id);
  const urls=[];
  for(const p of pairs){
    const a=car(p.a), b=car(p.b);
    if(!a||!b){ console.warn("  vs: skipping unknown car",p.a,p.b); continue; }
    const dir=`vs/${slug(name(a))}-vs-${slug(name(b))}`;
    fs.mkdirSync(path.join(outDir,dir),{recursive:true});
    fs.writeFileSync(path.join(outDir,dir,"index.html"),
      page({a,b,fa:figures(A,a),fb:figures(A,b),site}));
    urls.push(`/${dir}/`);
  }
  return urls;
}
module.exports={build};
