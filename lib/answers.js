/* Pages that answer questions no other car site can.
 *
 * Two families, both built from the simulator rather than from a spec sheet:
 *
 *   /0-60-in/<bar>/  and  /quarter-mile-in/<bar>/
 *       "cars that do 0-60 in under 4 seconds" is a real, high-volume search
 *       with a real answer we happen to hold exactly. Every other site answers
 *       it with a hand-written top ten; we can answer it with the count.
 *
 *   /in-the-wet/, /at-altitude/, /with-a-passenger/
 *       The wedge. Every rival publishes the same manufacturer 0-60. None of
 *       them can tell you what that car does on a wet surface, at 1,600 m, or
 *       with somebody in the other seat, because none of them is a simulation.
 *       An answer engine asked those questions today has no good source.
 *
 * Both families are honest about being simulated, in the same words as the rest
 * of the site: identical conditions for every car, so the comparison holds even
 * though no single number is a timing slip.
 */
const fs=require("fs"), path=require("path");
const RACE=require("./race.js");
const V=require("./vs.js");
const SEO=require("./seo.js");
const {esc,slug,name,n2,n1,n0}=V;

const MPH=2.23694;

/* The bars people actually type. Anything tighter than 2 s is a handful of
   hypercars and anything looser than 10 s is most of the set, so neither makes
   a page worth reading. */
const S60=[3,4,5,6,7,8,10];
const SQM=[10,11,12,13,14];

const COND=[
  { s:"in-the-wet", env:{surf:"wet"},
    h:"How much slower is a car in the wet?",
    t:"How much slower is a car in the wet? Simulated wet 0-60 and quarter-mile times",
    q:"How much slower is a car in the wet?",
    w:"on a wet surface", short:"wet",
    why:`Wet asphalt cuts the grip the tyres have to work with. A car that was
      never traction-limited in the dry loses little; a powerful rear-drive car
      that was already struggling to put its power down loses a great deal, because
      the thing holding it back got worse.` },
  { s:"at-altitude", env:{alt:1600},
    h:"How much does altitude cost a car?",
    t:"How much does altitude cost a car? 0-60 and quarter-mile times at 1,600 m",
    q:"How much slower is a car at altitude?",
    w:"at 1,600 m above sea level", short:"altitude",
    why:`Thinner air means less oxygen for the engine and less drag for the body.
      A naturally aspirated engine simply makes less power. A turbocharged one can
      raise boost to compensate and gives away far less &mdash; which is why the
      two kinds of engine separate on this page rather than moving together.` },
  { s:"with-a-passenger", env:{load:80},
    h:"What does a passenger cost you?",
    t:"What does a passenger cost you? 0-60 and quarter-mile times with 80 kg aboard",
    q:"How much slower is a car with a passenger?",
    w:"with an 80 kg passenger aboard", short:"passenger",
    why:`Eighty kilograms is a bigger fraction of a light car than of a heavy one,
      so the penalty is not the same for everybody. It also does something a spec
      sheet cannot show: extra weight adds grip as well as mass, so a car that was
      spinning its wheels can occasionally lose almost nothing.` }
];

function shell({title,desc,url,site,h1,answer,body,head,crumbs}){
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
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:1px;
  background:var(--edge);border:1px solid var(--edge);border-radius:5px;overflow:hidden}
.grid a{display:block;padding:11px 13px;background:var(--surface);color:var(--ink);
  text-decoration:none;font-size:14px}
.grid a:hover{background:#161E27;color:var(--amber)}
.grid a span{display:block;font:600 10px var(--cond);letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink3);margin-top:2px}
.why{color:var(--ink2);font-size:14.5px;line-height:1.7;max-width:66ch}
</style></head><body><div class="wrap">
<p class="crumbs">${crumbs}</p>
<h1>${h1}</h1>
${answer}
${body}
<footer>Times are simulated from published kerb mass, rated power and drivetrain data, then fitted
to each car&rsquo;s full published acceleration profile. They are not timing-slip records.
Acceleration figures from <a href="https://accelerationtimes.com">accelerationtimes.com</a> and
<a href="https://cardata.wiki">cardata.wiki</a> (CC&nbsp;BY&nbsp;4.0).</footer>
</div></body></html>`;
}

const crumbs=site=>`<a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/answers/">Answers</a>
<a class="home" href="${site}/cars/">All cars</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/fastest/">Fastest lists</a>`;

const CAP=60;

function table(rows,site,carUrl,cols){
  return `<div class="tablewrap"><table><thead><tr>
<th class="rank">#</th><th style="text-align:left">Car</th><th>Year</th>
${cols.map(c=>`<th>${c.h}</th>`).join("")}</tr></thead><tbody>
${rows.map((r,i)=>{
  const u=carUrl(r.c.id);
  return `<tr><td class="rank">${i+1}</td>`
    + `<th scope="row">${u?`<a href="${site}${u}">${esc(name(r.c))}</a>`:esc(name(r.c))}</th>`
    + `<td>${r.c.yr}</td>`
    + cols.map(c=>`<td class="${i===0&&c.lead?"win":""}">${c.v(r)}</td>`).join("")
    + `</tr>`;
}).join("")}
</tbody></table></div>`;
}

/* ---- "cars that do 0-60 in under N seconds" ---------------------------- */
function thresholdPages({all,site,out,carUrl,urls}){
  const mk=(kind,bars)=>{
    const dir = kind==="s60" ? "0-60-in" : "quarter-mile-in";
    const what= kind==="s60" ? "0-60 mph" : "the standing quarter mile";
    const val = r => kind==="s60" ? r.f.s60 : r.f.qm;
    const made=[];
    for(const bar of bars){
      const rows=all.filter(r=>val(r)!=null&&val(r)<bar).sort((x,y)=>val(x)-val(y));
      if(rows.length<8) continue;
      made.push({bar,n:rows.length,rows});
    }
    for(let i=0;i<made.length;i++){
      const {bar,n,rows}=made[i];
      const shown=rows.slice(0,CAP);
      const slowest=rows[rows.length-1];
      const label=`${kind==="s60"?"0-60":"the quarter mile"} in under ${bar} seconds`;
      const h1=`Cars that do ${kind==="s60"?"0-60":"the quarter mile"} in under ${bar} seconds`;
      const t=`${h1}: the full list, simulated`;
      const url=`${site}/${dir}/under-${bar}-seconds/`;
      const d=`${n} cars in the set cover ${what} in under ${bar} seconds, from the `
        +`${name(rows[0].c)} at ${n2(val(rows[0]))}s. Full ranked list with quarter-mile times and trap speeds.`;
      const answer=SEO.answerBlock(
        `<b>${n}</b> of the ${all.length.toLocaleString("en-GB")} cars in the set cover ${what} in
         under <b>${bar} seconds</b>. The quickest is the <b>${esc(name(rows[0].c))}</b> at
         <span class="num">${n2(val(rows[0]))} s</span>; the last car to make the cut is the
         ${esc(name(slowest.c))} at <span class="num">${n2(val(slowest))} s</span>.`,
        `Simulated, not measured &mdash; every car computed from its published kerb mass, rated power
         and drivetrain, then fitted to its own published acceleration figures.
         Dry asphalt, 20&nbsp;&deg;C, sea level, 1&nbsp;ft rollout.`);
      const faqs=[
        {q:`How many cars do ${label}?`,
         a:`${n} of the ${all.length.toLocaleString("en-GB")} cars simulated here. The quickest is the `
          +`${name(rows[0].c)} at ${n2(val(rows[0]))} s and the last to qualify is the `
          +`${name(slowest.c)} at ${n2(val(slowest))} s.`},
        {q:`What is the quickest car here?`,
         a:`The ${name(rows[0].c)} (${rows[0].c.yr}): ${n2(rows[0].f.s60)} s to 60 mph and `
          +`${n2(rows[0].f.qm)} s over the standing quarter mile at ${n1(rows[0].f.trap)} mph.`},
        {q:`What is the slowest car that still does ${label}?`,
         a:`The ${name(slowest.c)} (${slowest.c.yr}) at ${n2(val(slowest))} s &mdash; ${n0(slowest.f.bhp)} bhp `
          +`and ${n0(slowest.c.kg)} kg, which is ${n0(slowest.f.pwt)} bhp per tonne.`},
        {q:`Are these real measured times?`,
         a:`No. Every figure is produced by a physics simulation, not by a stopwatch at a drag strip. `
          +`Each car is modelled from its published kerb mass, rated power, drivetrain and gearing, then `
          +`trimmed until it reproduces its own published acceleration figures. Every car runs in `
          +`identical conditions, so the ranking is a fair comparison even though no individual time is `
          +`a timing slip.`}
      ];
      const near=made.filter((_,j)=>j!==i).map(m=>
        `<a href="${site}/${dir}/under-${m.bar}-seconds/">Under ${m.bar} seconds<span>${m.n} cars</span></a>`).join("");
      const a=shown[0].c, b=shown[1].c;
      const graph=SEO.jsonld({"@context":"https://schema.org","@graph":[
        SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Answers",url:"/answers/"},{name:h1}]),
        {"@type":"WebPage","@id":url,url,name:t,description:d,inLanguage:"en",dateModified:SEO.BUILT,
         isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
         mainEntity:{"@type":"ItemList",name:h1,numberOfItems:n,itemListOrder:"Ascending",
           itemListElement:shown.slice(0,20).map((r,j)=>({"@type":"ListItem",position:j+1,
             item:SEO.vehicle(r.c,r.f,name(r.c))}))}},
        SEO.faqPage(faqs)]});
      const body=`${RACE.panel(name(a),name(b),
        `The two quickest on this list, on the line together. Change the surface, the weather
         or the distance and run it again.`)}
<h2>The list, quickest first</h2>
${table(shown,site,carUrl,[
  {h:"0&ndash;60",v:r=>n2(r.f.s60)+" s",lead:kind==="s60"},
  {h:"1/4 mile",v:r=>n2(r.f.qm)+" s",lead:kind!=="s60"},
  {h:"Trap",v:r=>n1(r.f.trap)+" mph"},
  {h:"Power",v:r=>n0(r.f.bhp)+" bhp"}])}
<p class="note">${rows.length>CAP?`Showing the ${CAP} quickest of ${n}. `:""}Tap any car for its own figures.</p>
${near?`<h2>Other thresholds</h2><div class="grid">${near}</div>`:""}
${SEO.faqHTML(faqs)}
${SEO.updatedLine()}
${RACE.script(a.id,b.id,`${name(a)} versus ${name(b)}, simulated`)}`;
      fs.mkdirSync(path.join(out,dir,`under-${bar}-seconds`),{recursive:true});
      fs.writeFileSync(path.join(out,dir,`under-${bar}-seconds`,"index.html"),
        shell({title:t,desc:d,url,site,h1:esc(h1),answer,body,head:graph,crumbs:crumbs(site)}));
      urls.push({url:`/${dir}/under-${bar}-seconds/`,label:h1,n});
    }
    return made;
  };
  return { s60:mk("s60",S60), qm:mk("qm",SQM) };
}

/* ---- "how much slower in the wet / at altitude / with a passenger" ------ */
function conditionPages({A,all,site,out,carUrl,urls}){
  const made=[];
  for(const cond of COND){
    const env=Object.assign({},V.ENV,cond.env);
    /* Every car, run again under the new conditions. Ranking "the car that loses
       most" is only true if every car was asked. */
    const rows=[];
    for(const r of all){
      const g=V.figures(A,r.c,env);
      if(g.s60==null||r.f.s60==null) continue;
      rows.push({c:r.c,f:r.f,g,d60:g.s60-r.f.s60,pct:(g.s60-r.f.s60)/r.f.s60});
    }
    if(rows.length<20) continue;
    rows.sort((x,y)=>y.pct-x.pct);
    const worst=rows[0], best=rows[rows.length-1];
    /* The MEDIAN car, not the mean loss. The distribution has a long tail --
       a Can-Am car on slicks loses 159% in the wet -- and a mean dragged up by
       cars nobody drives on the road would be a true statistic making a false
       impression. The middle car is the one a reader is asking about. */
    const med=rows[Math.floor(rows.length/2)];
    const avg=med.pct;
    /* Some cars come out QUICKER, and that is the most interesting thing on the
       page rather than an error to hide: a car that was traction-limited makes
       less power at altitude, spins its wheels less, and leaves better for it. */
    const gained=rows.filter(r=>r.d60<-0.01);
    /* Turbocharged against naturally aspirated, because on the altitude page
       that IS the answer and on the others it is a fair thing to check. */
    const grp=k=>{ const g=rows.filter(k); return g.length?g.reduce((s,r)=>s+r.pct,0)/g.length:null; };
    const turbo=grp(r=>r.c.asp==="turbo"||r.c.asp==="sc"), na=grp(r=>r.c.asp==="na"),
          ev=grp(r=>r.c.asp==="ev");
    const pc=x=>x==null?"—":(x*100).toFixed(1)+"%";

    const url=`${site}/${cond.s}/`;
    const t=cond.t;
    const d=`Simulated ${cond.w}: the middle car is ${pc(avg)} slower to 60 mph. `
      +`The worst affected is the ${name(worst.c)} at +${n2(worst.d60)}s. Full ranked list.`;
    const answer=SEO.answerBlock(
      `Run ${cond.w}, the middle car of ${rows.length.toLocaleString("en-GB")} is
       <b>${pc(avg)} slower to 60&nbsp;mph</b> &mdash; for that car, the ${esc(name(med.c))},
       <span class="num">${n2(med.f.s60)} s</span> becomes <span class="num">${n2(med.g.s60)} s</span>.
       The worst affected is the <b>${esc(name(worst.c))}</b>, which loses
       <span class="num">${n2(worst.d60)} s</span> (${pc(worst.pct)}).
       ${gained.length
         ? `<b>${gained.length}</b> ${gained.length===1?"car is":"cars are"} actually <b>quicker</b>,
            led by the ${esc(name(gained[gained.length-1].c))} at
            <span class="num">${n2(-gained[gained.length-1].d60)} s</span> better &mdash; a car that was
            traction-limited gains more from spinning its wheels less than it loses elsewhere.`
         : `The least affected is the ${esc(name(best.c))}, which gives away
            <span class="num">${n2(best.d60)} s</span> (${pc(best.pct)}).`}`,
      `Simulated, not measured. Every car is run twice under identical rules &mdash; once at
       20&nbsp;&deg;C on dry asphalt at sea level, once ${cond.w} &mdash; and the difference is
       what is reported here.`);
    const faqs=[
      {q:cond.q,
       a:`The middle car of ${rows.length.toLocaleString("en-GB")} is ${pc(avg)} slower to 60 mph, `
        +`simulated ${cond.w} — for that car, the ${name(med.c)}, ${n2(med.f.s60)} s becomes `
        +`${n2(med.g.s60)} s. That is the middle of the losses, not the middle of the field: the spread is very `
        +`wide and the median is the honest number here: the ${name(worst.c)} loses ${n2(worst.d60)} s `
        +`while the ${name(best.c)} loses ${n2(best.d60)} s, so an average would be pulled a long way `
        +`from anything a reader is likely to be driving.`},
      {q:`Which car is worst affected?`,
       a:`The ${name(worst.c)} (${worst.c.yr}): ${n2(worst.f.s60)} s to 60 mph normally, `
        +`${n2(worst.g.s60)} s ${cond.w} — ${n2(worst.d60)} s worse, or ${pc(worst.pct)}.`},
      gained.length ? {q:`Is any car quicker ${cond.w}?`,
       a:`Yes — ${gained.length} of them. The biggest gain is the ${name(gained[gained.length-1].c)}, `
        +`${n2(-gained[gained.length-1].d60)} s BETTER. It is not a mistake: those cars are `
        +`traction-limited, so anything that reduces the power reaching the road also reduces wheelspin, `
        +`and they leave the line more cleanly than they do at full power.`}
      : {q:`Which car is least affected?`,
       a:`The ${name(best.c)} (${best.c.yr}), which loses only ${n2(best.d60)} s (${pc(best.pct)}), going `
        +`from ${n2(best.f.s60)} s to ${n2(best.g.s60)} s.`},
      {q:`Does it hit turbocharged and naturally aspirated cars differently?`,
       a:`Yes. Simulated ${cond.w}, forced-induction cars lose ${pc(turbo)} on average against `
        +`${pc(na)} for naturally aspirated ones${ev!=null?` and ${pc(ev)} for electric cars`:``}. `
        +`That gap is the point: a spec sheet quotes one number per car and cannot show it.`},
      {q:`Are these real measured times?`,
       a:`No. Both the normal and the ${cond.short} figure are produced by the same physics simulation, `
        +`each car modelled from its published mass, power, drivetrain and gearing and trimmed to its own `
        +`published acceleration figures. What is meaningful here is the difference between two runs of `
        +`the same car under rules that differ in exactly one respect.`}
    ];
    const graph=SEO.jsonld({"@context":"https://schema.org","@graph":[
      SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Answers",url:"/answers/"},{name:cond.h}]),
      {"@type":"WebPage","@id":url,url,name:t,description:d,inLanguage:"en",dateModified:SEO.BUILT,
       isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"},
       mainEntity:{"@type":"ItemList",name:cond.h,numberOfItems:Math.min(CAP,rows.length),
         itemListElement:rows.slice(0,20).map((r,j)=>({"@type":"ListItem",position:j+1,
           item:SEO.vehicle(r.c,r.f,name(r.c))}))}},
      SEO.faqPage(faqs)]});

    const cols=[
      {h:"Normal",v:r=>n2(r.f.s60)+" s"},
      {h:esc(cond.short.replace(/^./,m=>m.toUpperCase())),v:r=>n2(r.g.s60)+" s"},
      {h:"Lost",v:r=>"+"+n2(r.d60)+" s",lead:true},
      {h:"Worse by",v:r=>pc(r.pct)}];
    const a=rows[0].c, b=rows[1].c;
    const body=`<h2>Why it happens</h2>
<p class="why">${cond.why}</p>
<h2>Worst affected</h2>
${table(rows.slice(0,CAP),site,carUrl,cols)}
<p class="note">Ranked by how much of its own 0-60 each car gives away, not by seconds &mdash;
otherwise the list would simply be the slowest cars in the set.</p>
<h2>${gained.length?"Least affected &mdash; and the ones that gain":"Least affected"}</h2>
${table(rows.slice(-20).reverse(),site,carUrl,cols)}
${gained.length?`<p class="note">A negative figure is a car that is <em>quicker</em> ${cond.w}. Those
cars are traction-limited: less power reaching the road means less wheelspin, and they leave the line
more cleanly for it.</p>`:``}
${RACE.panel(name(a),name(b),
  `The two that suffer most, on the line together. Set the surface and the weather yourself
   and watch what it does.`)}
${SEO.faqHTML(faqs)}
${SEO.updatedLine()}
${RACE.script(a.id,b.id,`${name(a)} versus ${name(b)}, simulated`)}`;
    fs.mkdirSync(path.join(out,cond.s),{recursive:true});
    fs.writeFileSync(path.join(out,cond.s,"index.html"),
      shell({title:t,desc:d,url,site,h1:esc(cond.h),answer,body,head:graph,crumbs:crumbs(site)}));
    urls.push({url:`/${cond.s}/`,label:cond.h});
    made.push({cond,rows,avg,worst,best});
  }
  return made;
}

function indexPage({site,thresholds,conditions,all}){
  const url=`${site}/answers/`;
  const t="Questions a spec sheet cannot answer";
  const d=`How many cars do 0-60 in under 4 seconds, how much slower a car is in the wet, what `
    +`altitude costs, what a passenger costs — answered from a simulation of ${all.length.toLocaleString("en-GB")} cars.`;
  const pc=x=>(x*100).toFixed(1)+"%";
  const cards=[
    ...thresholds.s60.map(m=>`<a href="${site}/0-60-in/under-${m.bar}-seconds/">0-60 in under ${m.bar} seconds<span>${m.n} cars</span></a>`),
    ...thresholds.qm.map(m=>`<a href="${site}/quarter-mile-in/under-${m.bar}-seconds/">Quarter mile in under ${m.bar} seconds<span>${m.n} cars</span></a>`),
    ...conditions.map(m=>`<a href="${site}/${m.cond.s}/">${esc(m.cond.h)}<span>${pc(m.avg)} slower, middle car</span></a>`)
  ].join("");
  return shell({title:t,desc:d,url,site,crumbs:`<a class="home" href="${site}/">&larr; My Auto Racer</a>
<a class="home" href="${site}/cars/">All cars</a>
<a class="home" href="${site}/vs/">Comparisons</a>
<a class="home" href="${site}/fastest/">Fastest lists</a>`,
    h1:"Questions a spec sheet cannot answer",
    answer:SEO.answerBlock(
      `Every car site publishes the same manufacturer 0-60. None of them can tell you what that car
       does on a wet surface, at altitude, or with somebody in the passenger seat, because none of
       them is running the car &mdash; they are quoting it. These pages are what
       <b>${all.length.toLocaleString("en-GB")}</b> cars do when the conditions change.`,
      `Simulated, not measured. Every car is run under identical rules, so what is being compared is
       the cars and not the days they were tested on.`),
    head:SEO.jsonld({"@context":"https://schema.org","@graph":[
      SEO.breadcrumb(site,[{name:"My Auto Racer",url:"/"},{name:"Answers"}]),
      {"@type":"CollectionPage","@id":url,url,name:t,description:d,inLanguage:"en",
       dateModified:SEO.BUILT,isPartOf:{"@type":"WebSite",name:"My Auto Racer",url:site+"/"}}]}),
    body:`<div class="grid">${cards}</div>`});
}

function build(A,all,outDir,site,carUrl){
  const urls=[];
  const thresholds=thresholdPages({all,site,out:outDir,carUrl,urls});
  const conditions=conditionPages({A,all,site,out:outDir,carUrl,urls});
  fs.mkdirSync(path.join(outDir,"answers"),{recursive:true});
  fs.writeFileSync(path.join(outDir,"answers","index.html"),
    indexPage({site,thresholds,conditions,all}));
  urls.unshift({url:"/answers/",label:"Questions a spec sheet cannot answer"});
  return urls;
}
module.exports={build};
