/* The race panel, shared by every page type.
 *
 * Comparison pages, make pages and the fastest-lists all end in the same place:
 * two cars on a line and a button. Keeping it here means the loading veil, the
 * height handshake and the start-line placeholder behave identically wherever
 * it appears, rather than drifting apart in three copies.
 */
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* Tokens, type and tables: everything a page needs before it says anything. */
const BASE=`:root{--bg:#0B0F14;--surface:#12181F;--sunk:#0E141A;--edge:#1E2833;--edge2:#2A3644;
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
.crumbs{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 22px}
.home{font:600 11px var(--cond);letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);
  text-decoration:none}
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
tr:last-child th,tr:last-child td{border-bottom:0}
.note{color:var(--ink3);font-size:12.5px;margin:9px 2px 0}
.cta{display:inline-block;margin:0;background:var(--amber);color:#12181F;border:0;cursor:pointer;
  font:700 13px var(--cond);letter-spacing:.14em;text-transform:uppercase;
  padding:12px 22px;border-radius:5px;text-decoration:none}
footer{margin-top:44px;padding-top:18px;border-top:1px solid var(--edge);
  color:var(--ink3);font-size:12px}
@media(max-width:560px){h1{font-size:26px}th,td{padding:8px 9px;font-size:12px}}`;

const CSS=`.sim{background:linear-gradient(180deg,#141B23,#10161D);border:1px solid var(--edge2);
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
/* The opponent chips. They have to read as "pick one", not as three buttons
   that each do something different, so only the chosen one is lit. */
.foes{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin:0 0 16px}
.foe{cursor:pointer;background:var(--sunk);color:var(--ink2);border:1px solid var(--edge2);
  border-radius:4px;padding:7px 12px;font:600 11px var(--cond);letter-spacing:.1em;
  text-transform:uppercase;transition:color .15s,border-color .15s,background .15s}
.foe:hover{color:var(--ink);border-color:var(--ink3)}
.foe.on{color:var(--B);border-color:var(--B);background:rgba(238,74,99,.09)}
/* "Put this race on your own page." A copy-paste iframe is the only link
   acquisition available to a site nobody has heard of yet: the embed carries a
   visible credit link back, so anyone who uses it links to us by using it. */
.embedbox{margin:18px 0 0;border:1px solid var(--edge);border-radius:5px;background:var(--sunk)}
.embedbox summary{cursor:pointer;padding:10px 13px;color:var(--ink2);
  font:600 11px var(--cond);letter-spacing:.14em;text-transform:uppercase;list-style:none}
.embedbox summary::-webkit-details-marker{display:none}
.embedbox summary::before{content:"</> ";color:var(--ink3)}
.embedbox summary:hover{color:var(--amber)}
.embedbox[open] summary{border-bottom:1px solid var(--edge)}
.embedwrap{padding:12px 13px;display:flex;gap:9px;align-items:flex-start;flex-wrap:wrap}
.embedwrap textarea{flex:1 1 300px;min-height:74px;resize:vertical;background:var(--bg);
  color:var(--ink2);border:1px solid var(--edge2);border-radius:4px;padding:9px 10px;
  font:12px/1.5 var(--mono)}
.embedwrap button{flex:0 0 auto;cursor:pointer;background:var(--surface);color:var(--ink2);
  border:1px solid var(--edge2);border-radius:4px;padding:9px 14px;
  font:600 11px var(--cond);letter-spacing:.1em;text-transform:uppercase}
.embedwrap button:hover{border-color:var(--amber);color:var(--amber)}
.embedbox p{margin:0 13px 12px;color:var(--ink3);font-size:11.5px}
.alt{margin:22px 2px 0;font-size:13px}
.alt a{color:var(--ink2)}
@media(max-width:560px){.simframe{height:470px}}`;

/* nameA/nameB are already-escaped display names; note is the line under the button. */
function panel(nameA,nameB,note){
  return `<div class="bleed"><div class="sim" id="sim">
  <div class="stage">
    <span class="tag ta">${esc(nameA)}</span>
    <span class="lights"><i></i><i></i><i></i></span>
    <span class="tag tb">${esc(nameB)}</span>
  </div>
  <button class="cta" type="button" id="simgo">&#9654;&nbsp; Run this race</button>
  <p class="note">${note}</p>
</div></div>`;
}

/* Shared by both panels below: the loading veil, the reveal, the height
   handshake and the analytics hand-off. Written once because a second copy that
   drifts is how one panel ends up untracked or stuck behind a running bar. */
const COMMON=`
var T0=Date.now();
var sim=document.getElementById("sim");
/* analytics.js is deferred and a click can beat it, so hand the event to the
   buffer it drains on load rather than dropping it. */
function mar(n,p){
  if(window.MAR&&window.MAR.track) window.MAR.track(n,p||{});
  else (window.MAR_QUEUE=window.MAR_QUEUE||[]).push([n,p||{}]);
}
function reveal(){ sim.classList.add("ready");
  setTimeout(function(){ var v=sim.querySelector(".veil"); if(v) v.remove(); },400); }
function stage(src,title){
  var f=document.createElement("iframe");
  f.src=src; f.title=title;
  f.loading="lazy"; f.className="simframe";
  /* Keep the two names on screen through the wait -- the panel should look
     like it is staging the race, not like it blanked. */
  var st=sim.querySelector(".stage");
  var veil=document.createElement("div"); veil.className="veil";
  if(st) veil.appendChild(st);
  veil.insertAdjacentHTML("beforeend",'<div class="bar"><i></i></div><p>Staging</p>');
  sim.textContent=""; sim.className="sim busy";
  sim.appendChild(f); sim.appendChild(veil);
  /* If the app never reports in -- a script error, a blocked frame -- show it
     anyway rather than leaving a bar running forever. */
  f.addEventListener("load",function(){ setTimeout(reveal,1800); });
  setTimeout(reveal,9000);
}
addEventListener("message",function(ev){
  if(ev.origin!==location.origin) return;
  var d=ev.data; if(!d) return;
  if(d.trapspeed==="ready") reveal();
  /* The frame reports its own height, so the race is never behind a scrollbar. */
  if(d.trapspeed==="height"){
    var f=document.querySelector(".simframe");
    if(f) f.style.height=Math.max(300,Math.min(900,d.h))+"px";
  }
});`;

function script(idA,idB,title){
  const src=`/?a=${encodeURIComponent(idA)}&b=${encodeURIComponent(idB)}&embed=1`;
  return `<script>
/* The app is a ~950KB single file. Loading it in an iframe on page load would
   cost this page the speed scores it needs to rank, so it arrives on click. */
${COMMON}
document.getElementById("simgo").addEventListener("click",function(){
  /* The conversion these pages exist for. A visit that reads the table and
     leaves and a visit that stages the race are different outcomes, and only
     this tells them apart. */
  mar("Sim opened",{car_a:${JSON.stringify(idA)},car_b:${JSON.stringify(idB)},
    seconds:Math.round((Date.now()-T0)/1000)});
  stage(${JSON.stringify(src)},${JSON.stringify(title)});
});
<\/script>`;
}

/* --- the car-page panel ------------------------------------------------
   One car, several possible opponents. Which rival somebody picks is worth
   knowing on its own: it says what they came to compare, which is the question
   the next batch of comparison pages should be built from. */
function pickPanel(nameA,rivals,note){
  return `<div class="bleed"><div class="sim" id="sim">
  <div class="stage">
    <span class="tag ta">${esc(nameA)}</span>
    <span class="lights"><i></i><i></i><i></i></span>
    <span class="tag tb" id="foeName">${esc(rivals[0].name)}</span>
  </div>
  <div class="foes" role="group" aria-label="Choose who to race">
${rivals.map((r,i)=>`    <button type="button" class="foe${i?"":" on"}" data-i="${i}"`
  +` aria-pressed="${i?"false":"true"}">${esc(r.name)}</button>`).join("\n")}
  </div>
  <button class="cta" type="button" id="simgo">&#9654;&nbsp; Run this race</button>
  <p class="note">${note}</p>
</div></div>`;
}

function pickScript(idA,nameA,rivals){
  const list=rivals.map(r=>({id:r.id,name:r.name}));
  return `<script>
/* The app is a ~950KB single file. Loading it in an iframe on page load would
   cost this page the speed scores it needs to rank, so it arrives on click. */
${COMMON}
var FOES=${JSON.stringify(list)}, pick=0;
var btns=[].slice.call(document.querySelectorAll(".foe"));
btns.forEach(function(b){
  b.addEventListener("click",function(){
    pick=+b.dataset.i;
    btns.forEach(function(o){ o.classList.toggle("on",o===b);
      o.setAttribute("aria-pressed",o===b?"true":"false"); });
    document.getElementById("foeName").textContent=FOES[pick].name;
    /* Fired before the race, and separately from it: changing your mind about
       the opponent is a signal even when you never press Run. */
    mar("Rival chosen",{car_a:${JSON.stringify(idA)},car_b:FOES[pick].id,position:pick+1});
  });
});
document.getElementById("simgo").addEventListener("click",function(){
  var f=FOES[pick];
  mar("Sim opened",{car_a:${JSON.stringify(idA)},car_b:f.id,rival_position:pick+1,
    seconds:Math.round((Date.now()-T0)/1000)});
  stage("/?a="+encodeURIComponent(${JSON.stringify(idA)})+"&b="+encodeURIComponent(f.id)+"&embed=1",
    ${JSON.stringify(nameA)}+" versus "+f.name+", simulated");
});
<\/script>`;
}

/* The snippet itself. Built as a string in the page rather than assembled in
   script, so it is visible and copyable with JavaScript off, and so a reader
   can see exactly what they would be pasting before they paste it. */
function embedBox(site,idA,idB,title){
  const src=`${site}/?a=${encodeURIComponent(idA)}&amp;b=${encodeURIComponent(idB)}&amp;embed=1`;
  const snippet=`<iframe src="${src}" width="100%" height="560" style="border:0;border-radius:6px"`
    + ` loading="lazy" title="${esc(title)}"></iframe>\n`
    + `<p><a href="${site}/">Race simulator by My Auto Racer</a></p>`;
  return `<details class="embedbox">
  <summary>Put this race on your own page</summary>
  <div class="embedwrap">
    <textarea readonly id="embedCode" aria-label="Embed code" spellcheck="false">${esc(snippet)}</textarea>
    <button type="button" id="embedCopy">Copy</button>
  </div>
  <p>Free to use anywhere, no attribution required beyond the credit line included above.</p>
</details>
<script>
(function(){
  var t=document.getElementById("embedCode"), b=document.getElementById("embedCopy");
  if(!t||!b) return;
  b.addEventListener("click",function(){
    t.select();
    var done=function(){ b.textContent="Copied"; setTimeout(function(){ b.textContent="Copy"; },1600); };
    /* execCommand is deprecated and still the only thing that works without a
       secure context or a permissions prompt, so it is the fallback rather than
       the first choice. */
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(t.value).then(done,function(){ try{document.execCommand("copy");done();}catch(e){} });
    else { try{ document.execCommand("copy"); done(); }catch(e){} }
    if(window.MAR&&window.MAR.track) window.MAR.track("Embed copied",{car_a:${JSON.stringify(idA)},car_b:${JSON.stringify(idB)}});
    else (window.MAR_QUEUE=window.MAR_QUEUE||[]).push(["Embed copied",{car_a:${JSON.stringify(idA)},car_b:${JSON.stringify(idB)}}]);
  });
})();
<\/script>`;
}

module.exports={BASE,CSS,panel,script,pickPanel,pickScript,embedBox,esc};
