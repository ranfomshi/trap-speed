/* What are people actually asking about cars and speed?
 *
 * pairs.js answers "which two cars get compared". This asks the wider question:
 * which cars carry acceleration intent at all, and what shape does the question
 * take -- because a query nobody phrases as a comparison still wants an answer
 * this simulator already has.
 *
 *   node tools/demand.js          -> writes data/demand.json and prints a report
 */
const fs=require("fs"), path=require("path"), vm=require("vm");
const ROOT=path.join(__dirname,"..");

const src=fs.readFileSync(path.join(ROOT,"src/app.html"),"utf8");
const _dom=src.indexOf("const $=s=>document.querySelector");
const ctx={console}; vm.createContext(ctx);
vm.runInContext(src.slice(src.lastIndexOf("<script>",_dom)+8).split("const $=s=>document.querySelector")[0]
  +";globalThis.__c=CARS;",ctx);
const CARS=ctx.__c;
const MAKES=[...new Set(CARS.map(c=>c.mk))];

/* Makes worth probing: the ones our data covers deeply enough to answer for. */
const TOP_MAKES=Object.entries(CARS.reduce((m,c)=>((m[c.mk]=(m[c.mk]||0)+1),m),{}))
  .sort((a,b)=>b[1]-a[1]).slice(0,26).map(x=>x[0]);

/* Four families of probe. The first two find which CARS carry the intent, the
   third finds how the question gets phrased, the fourth finds the list pages
   people want that are about no single car at all. */
const PROBES=[];
for(const mk of TOP_MAKES){
  PROBES.push(["car", `${mk.toLowerCase()} 0-60 `]);
  PROBES.push(["car", `how fast is a ${mk.toLowerCase()} `]);
  PROBES.push(["car", `${mk.toLowerCase()} quarter mile `]);
}
for(const q of ["0-60 ","0 to 60 ","quarter mile ","trap speed ","launch control ","0-60 time for a "])
  PROBES.push(["phrasing", q]);
for(const q of ["fastest car ","fastest suv ","fastest saloon ","fastest estate ",
                "fastest hot hatch ","fastest electric car ","fastest 0-60 ",
                "quickest 0-60 ","fastest accelerating ","fastest 0-60 under "])
  PROBES.push(["list", q]);

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function suggest(q){
  const u="https://suggestqueries.google.com/complete/search?client=firefox&q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!r.ok) throw new Error(q+" -> HTTP "+r.status);
  return (JSON.parse(await r.text())[1]||[]);
}

(async()=>{
  const rows=[];
  for(const [kind,q] of PROBES){
    try{
      const out=await suggest(q);
      out.forEach((phrase,rank)=>rows.push({kind,probe:q,phrase,rank,weight:1/(rank+1)}));
    }catch(e){ console.error("  skip",q,e.message); }
    process.stdout.write(".");
    await sleep(200);
  }
  console.log(`\nharvested ${rows.length} suggestions from ${PROBES.length} probes`);
  fs.mkdirSync(path.join(ROOT,"data"),{recursive:true});
  fs.writeFileSync(path.join(ROOT,"data/demand.json"),JSON.stringify(rows,null,1));
  console.log("wrote data/demand.json");
})();
