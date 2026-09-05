/* Chooses which of the fitted cars actually ship.
 *
 * Every car in the table costs about 48 bytes of the page after compression,
 * and the page is one file that has to parse before anything moves, so the
 * question is not "which cars are good" -- they all reconcile -- but "which
 * cars earn their 48 bytes".
 *
 * Three things earn them, in this order:
 *
 *   1. Completing a nameplate the table already has. The point of this batch is
 *      that the table holds the Focus RS and not the 1.6, so a family already
 *      represented gets twice the quota of one that is not.
 *   2. Spread within the nameplate. Six Golfs should be six DIFFERENT Golfs:
 *      the picks walk the five-year eras in turn and alternate the ends of each
 *      era's power range, so a Mk2 1.3 and a Mk7 GTD both survive and six
 *      trims of the same Mk7 do not.
 *   3. Demand. data/demand.json is what people actually type; a make that
 *      appears in it gets a wider quota than one that does not.
 *
 * Sometimes the answer is "all of them". --make takes one marque and ships
 * every fitted car it has from --from onwards, quotas off: the point of
 *   node tools/cw-cut.js --make VW --from 1986
 * is that the VW range should have no holes in it, not that it should be
 * evenly sampled.
 *
 *   node tools/cw-cut.js [--target 5000]
 *   node tools/cw-cut.js --make VW --from 1986
 */
const fs=require("fs"), path=require("path");
const ROOT=path.join(__dirname,"..");
const arg=(k,d)=>{const i=process.argv.indexOf("--"+k); return i<0?d:+process.argv[i+1];};
const sarg=(k)=>{const i=process.argv.indexOf("--"+k); return i<0?null:process.argv[i+1];};

const A=require("./fit.js").physics();
const pass=JSON.parse(fs.readFileSync(path.join(ROOT,"data","cw-pass.json"),"utf8"));
const target=arg("target",5000);
const onlyMk=sarg("make"), fromYr=arg("from",0);

/* which nameplates the table already holds, and which makes people search for */
const nameplate=s=>s.mk+"|"+s.md.replace(/\(.*?\)/g,"").trim().split(/\s+/).slice(0,1).join(" ").toLowerCase();
const had=new Set(A.CARS.map(c=>c.mk+"|"+c.md.replace(/\(.*?\)/g,"").trim().split(/\s+/)[0].toLowerCase()));
let demand=new Set();
try{
  const d=JSON.parse(fs.readFileSync(path.join(ROOT,"data","demand.json"),"utf8"));
  const makes=new Set(A.CARS.map(c=>c.mk.toLowerCase()));
  for(const row of d) for(const m of makes) if(String(row.phrase).includes(m)) demand.add(m);
}catch(e){ /* demand is a nice-to-have, not a dependency */ }

let pool=pass.filter(s=>s.yr>=fromYr);
if(onlyMk){
  const want=onlyMk.toLowerCase();
  pool=pool.filter(s=>s.mk.toLowerCase()===want);
  if(!pool.length){
    console.error(`no fitted cars for make "${onlyMk}" from ${fromYr} -- makes in cw-pass: `
      +[...new Set(pass.map(s=>s.mk))].sort().join(", "));
    process.exit(1);
  }
}

const fam={};
for(const s of pool) (fam[nameplate(s)]=fam[nameplate(s)]||[]).push(s);

/* An era-then-power walk: take one from each five-year era in turn, and inside
   an era alternate the cheapest and the quickest still unpicked. */
function spread(list,n){
  const era={};
  for(const s of list) (era[Math.floor(s.yr/5)]=era[Math.floor(s.yr/5)]||[]).push(s);
  const keys=Object.keys(era).sort();
  keys.forEach(k=>era[k].sort((a,b)=>a.kW-b.kW));
  const out=[]; let low=true;
  while(out.length<n){
    let took=false;
    for(const k of keys){
      if(out.length>=n) break;
      const q=era[k]; if(!q.length) continue;
      out.push(low?q.shift():q.pop()); took=true;
    }
    if(!took) break;
    low=!low;
  }
  return out;
}

const quota=k=>{
  const [mk]=k.split("|");
  let q = had.has(k) ? 6 : 3;
  if(demand.has(mk.toLowerCase())) q+=2;
  return q;
};
let kept=[];
if(onlyMk){
  /* Whole marque: every car that reconciles, in one go. */
  kept=pool.slice();
}else{
  for(const [k,list] of Object.entries(fam)) kept.push(...spread(list,quota(k)));
}

/* If the quotas land short of the target, widen them evenly rather than
   letting one make take up the slack. */
let round=0;
while(!onlyMk && kept.length<target && round<12){
  round++;
  const have=new Set(kept.map(s=>s.id));
  for(const [k,list] of Object.entries(fam)){
    if(kept.length>=target) break;
    const rest=list.filter(s=>!have.has(s.id));
    if(!rest.length) continue;
    const extra=spread(rest,1);
    extra.forEach(s=>{ kept.push(s); have.add(s.id); });
  }
}
if(!onlyMk) kept=kept.slice(0,target);
kept.sort((a,b)=>a.mk.localeCompare(b.mk)||a.md.localeCompare(b.md)||a.yr-b.yr||a.kW-b.kW);
fs.writeFileSync(path.join(ROOT,"data","cw-batch.json"),JSON.stringify(kept,null," ")+"\n");

const byMk={}; kept.forEach(s=>byMk[s.mk]=(byMk[s.mk]||0)+1);
const byCls={}; kept.forEach(s=>byCls[s.cls]=(byCls[s.cls]||0)+1);
const byBd={};  kept.forEach(s=>byBd[s.bd]=(byBd[s.bd]||0)+1);
const dsl=kept.filter(s=>s.fu==="d").length, ev=kept.filter(s=>s.asp==="ev").length;
console.log(`${kept.length} of ${pool.length} kept, over ${Object.keys(byMk).length} makes `
  +`and ${new Set(kept.map(nameplate)).size} nameplates -> data/cw-batch.json`);
console.log("class:  "+Object.entries(byCls).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v).join(", "));
console.log("body:   "+Object.entries(byBd).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+" "+v).join(", "));
console.log(`fuel:   ${dsl} diesel, ${ev} electric`);
console.log("makes:  "+Object.entries(byMk).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>k+" "+v).join(", "));
