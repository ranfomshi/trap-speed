/* Resolve harvested comparison phrases to real cars, and pick the pages to build.
 *
 *   node tools/pages.js [n]     -> writes data/pages.json (default 10)
 *
 * The phrases are how people type, not how the dataset is spelled: "m4",
 * "gt3 rs", "long range". The other side of a comparison usually inherits the
 * seed's make, so resolve it in that context.
 */
const fs=require("fs"), path=require("path"), vm=require("vm");
const ROOT=path.join(__dirname,"..");
const N=+(process.argv[2]||10);

const src=fs.readFileSync(path.join(ROOT,"src/app.html"),"utf8");
const body=src.slice(src.indexOf("<script>")+8);
const ctx={console}; vm.createContext(ctx);
vm.runInContext(body.slice(0,body.indexOf("const $=s=>document.querySelector"))
  +";globalThis.__api={CARS};",ctx);
const CARS=ctx.__api.CARS;

const MAKES=[...new Set(CARS.map(c=>c.mk))];
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const ALIAS={vw:"volkswagen", merc:"mercedes", "mercedes benz":"mercedes-benz",
             chevy:"chevrolet", gtr:"gt-r", vette:"corvette"};

/* Generation codes -- G80, 992, Mk8, 8V, C7, S650, ND2 -- are how the dataset
   spells a car and not how anyone searches, so they must not count against a
   match. "gt3" deliberately does not match this: that is a model, not a code. */
const GEN=/^(?:[efgwzu]\d{2,3}|mk\s?[ivx0-9]+|\d{3}|nd\d?|c\d|s\d{3})$/i;

function lookup(q){
  const toks=q.split(" ").filter(Boolean);
  if(!toks.length) return null;
  const qt=new Set(toks);
  let best=null, bestScore=-1e9;
  for(const c of CARS){
    const hay=norm(`${c.mk} ${c.md}`);
    if(!toks.every(t=>hay.includes(t))) continue;
    /* the fewest words the search did not ask for wins: "bmw m3" should be an
       M3, not an M3 CS. Then newest, then cars with published rather than
       inferred specs. */
    const extra=hay.split(" ").filter(t=>!qt.has(t)&&!GEN.test(t)).length;
    const score=-extra*100 + c.yr*0.05 + (c.est?0:2);
    if(score>bestScore){ bestScore=score; best=c; }
  }
  return best;
}
function clean(phrase){
  let q=norm(phrase);
  for(const [a,b] of Object.entries(ALIAS)) q=q.replace(new RegExp("\\b"+a+"\\b","g"),norm(b));
  return q;
}
function resolve(phrase, ctxCar){
  const q=clean(phrase);
  const hasMake=MAKES.some(m=>q.startsWith(norm(m).split(" ")[0]));
  if(hasMake || !ctxCar) return lookup(q);
  /* A bare trim inherits its context. "turbo s" after "porsche 911 turbo" is a
     911, not a Taycan -- so try the seed's model family before the bare make. */
  const family=norm(ctxCar.md).split(" ")[0];
  const tries=[norm(ctxCar.mk)+" "+family+" "+q, norm(ctxCar.mk)+" "+q];
  for(const t of tries){ const hit=lookup(t); if(hit) return hit; }
  return null;
}

/* A heuristic cannot know that "mustang vs challenger" means the V8 against a
   Hellcat rather than a four-cylinder against a Demon 170. Ten pages is few
   enough to have an opinion about; these are the ones worth overruling. */
const OVERRIDE={
  "ford mustang vs dodge challenger":["mustang","dodge-challenger-srt-8-hellcat"],
  "audi rs6 vs rs7":                 ["audi-rs6-performance","audi-rs7-performance"],
  "porsche cayman vs 911":           ["porsche-718-cayman-gts","porsche-911-carrera-4s-992"]
};

const rows=JSON.parse(fs.readFileSync(path.join(ROOT,"data/pairs.json"),"utf8"));
const seen=new Map();
for(const r of rows){
  const ov=OVERRIDE[r.phrase];
  const A=ov?CARS.find(c=>c.id===ov[0]):resolve(r.seed);
  if(!A) continue;
  const B=ov?CARS.find(c=>c.id===ov[1]):resolve(r.other, A);
  if(!B || B.id===A.id) continue;
  const key=[A.id,B.id].sort().join("|");
  const prev=seen.get(key);
  if(!prev || r.weight>prev.weight)
    seen.set(key,{a:A.id,b:B.id,weight:r.weight,rank:r.rank,phrase:r.phrase,
                  label:`${A.mk} ${A.md} vs ${B.mk} ${B.md}`});
}
const picked=[...seen.values()].sort((x,y)=>y.weight-x.weight||x.rank-y.rank).slice(0,N);

console.log(`resolved ${seen.size} distinct pairs; taking top ${picked.length}\n`);
picked.forEach((p,i)=>console.log(` ${String(i+1).padStart(2)}. ${p.label}\n     from "${p.phrase}"`));
fs.mkdirSync(path.join(ROOT,"data"),{recursive:true});
fs.writeFileSync(path.join(ROOT,"data/pages.json"),JSON.stringify(picked,null,1));
console.log("\nwrote data/pages.json");
