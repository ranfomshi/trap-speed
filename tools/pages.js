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
/* not the first <script> -- that one is the embed probe -- but the last one
   opened before the DOM code starts */
const _dom=src.indexOf("const $=s=>document.querySelector");
const body=src.slice(src.lastIndexOf("<script>",_dom)+8);
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
/* The dataset spells a car out in full -- "GR Supra Mk V 340 PS" -- and every
   one of those trailing words counted against it, which let a 1994 Supra RZ
   beat the current car. Generation words and power figures are not trim. */
const NOISE=/^(?:mk|[ivx]{1,4}|\d{1,4}|ps|hp|bhp|kw|facelift|pre|post)$/i;

/* A trim nobody asked for is not equally surprising in every direction. Asking
   for a 911 and being handed a GT3 is wrong in a way that being handed a
   Carrera S is not, and a body style is barely a surprise at all. */
const HALO=/^(gt2|gt3|gt4|turbo|r|rs|cs|csl|pista|speciale|performante|sv|svj|svr|demon|hellcat|plaid|trophy|nismo|black|clubsport|competition|lt|z06|z07|zl1|zr1|shelby|gt350|gt500|nurburgring|ring|final|edition|scuderia|stradale|superleggera|aperta|gto)$/i;
const BODY=/^(avant|sportback|saloon|sedan|coupe|coupé|touring|estate|gran|turismo|hatch|sportbrake|shooting|brake|4matic|xdrive|quattro|awd|rwd)$/i;
/* An open top is not a body style the way a Sportback is -- it is a heavier,
   slower car, so it should never stand in for a model nobody qualified. */
/* Asking for a Mustang and being handed the four-cylinder is the same kind of
   wrong as being handed a Shelby: an engine badge nobody typed. */
const ECON=/^(ecoboost|tsi|tdi|tfsi|cdi|dci|hybrid|diesel|efficiency|ultra|bluemotion|etec)$/i;
const OPEN=/^(spyder|spider|cabrio|cabriolet|convertible|roadster|targa|volante)$/i;

function lookup(q,near){
  const toks=q.split(" ").filter(Boolean);
  if(!toks.length) return null;
  const qt=new Set(toks);
  /* Whole words, not substrings: "f8" used to match the F80, a different car.
     Fall back to substrings only if nothing matches cleanly, so recall for the
     odd spelling is not lost. */
  const words=c=>norm(`${c.mk} ${c.md}`).split(" ");
  const whole=CARS.filter(c=>{ const w=words(c); return toks.every(t=>w.includes(t)); });
  /* The fallback is for odd spellings, not for two-letter fragments: "se"
     matched the "se" inside "PHASE" and returned a 1971 Falcon. */
  const pool=whole.length ? whole
    : toks.some(t=>t.length<3) ? []
    : CARS.filter(c=>{ const h=norm(`${c.mk} ${c.md}`); return toks.every(t=>h.includes(t)); });
  let best=null, bestScore=-1e9;
  for(const c of pool){
    /* the fewest words the search did not ask for wins: "bmw m3" should be an
       M3, not an M3 CS. Then newest, then cars with published rather than
       inferred specs. */
    const extra=words(c).filter(t=>!qt.has(t)&&!GEN.test(t)&&!NOISE.test(t))
      .reduce((n,t)=>n+(HALO.test(t)||ECON.test(t)?2.6:OPEN.test(t)?1.3:BODY.test(t)?0.25:1),0);
    /* When the other side of the matchup is known, a car from the same era is
       almost always the one being asked about. */
    const era = near==null ? c.yr*0.05 : -Math.abs(c.yr-near)*12;
    const score=-extra*100 + era + (c.est?0:2);
    if(score>bestScore){ bestScore=score; best=c; }
  }
  return best;
}
function clean(phrase){
  let q=norm(phrase);
  for(const [a,b] of Object.entries(ALIAS)) q=q.replace(new RegExp("\\b"+a+"\\b","g"),norm(b));
  return q;
}
function resolve(phrase, ctxCar, near){
  const q=clean(phrase);
  if(PREFER[q]){ const c=CARS.find(x=>x.id===PREFER[q]); if(c) return c; }
  const hasMake=MAKES.some(m=>q.startsWith(norm(m).split(" ")[0]));
  if(hasMake || !ctxCar) return lookup(q,near);
  /* A bare trim inherits its context. "turbo s" after "porsche 911 turbo" is a
     911, not a Taycan -- so try the seed's model family before the bare make. */
  const family=norm(ctxCar.md).split(" ")[0];
  const tries=[norm(ctxCar.mk)+" "+family+" "+q, norm(ctxCar.mk)+" "+q];
  for(const t of tries){ const hit=lookup(t,near); if(hit) return hit; }
  return null;
}

/* A heuristic cannot know that "mustang vs challenger" means the V8 against a
   Hellcat rather than a four-cylinder against a Demon 170. Ten pages is few
   enough to have an opinion about; these are the ones worth overruling. */
const OVERRIDE={
  "ford mustang vs dodge challenger":["mustang","dodge-challenger-srt-8-hellcat"],
  "audi rs6 vs rs7":                 ["audi-rs6-performance","audi-rs7-performance"],
  "porsche cayman vs 911":           ["porsche-718-cayman-gts","porsche-911-carrera-4s-992"],
  /* "f8" resolved to the F80 hypercar, which is a different car entirely */
  "ferrari f8 vs 488":               ["ferrari-f8-tributo","488"],
  /* a generic "vantage" is the modern one, not a 1999 DB7 */
  "aston martin vantage vs vanquish":["aston-martin-v12-vantage","aston-martin-vanquish"],
  /* these three paired cars from different decades */
  "bmw 330i vs 340i":                ["bmw-330i-2006","bmw-340i"],
  "corvette c8 vs z06":              ["c8","chevrolet-corvette-z06-z07-pkg"],
  "audi rs4 vs rs6":                 ["audi-rs4-avant-b9","audi-rs6-performance"],
  /* a base Macan against the hottest Cayenne is not the question people ask */
  "porsche macan vs cayenne":        ["porsche-macan-gts-n-a","porsche-cayenne-s-coupe"],
  "toyota supra vs gr86":            ["toyota-supra-a90","gr86"],
  /* "vs tt" inherited the seed and came back with a second R8 */
  "audi r8 vs tt":                   ["audi-r8-lmx","audi-tt-rs-coupe-2016"],
  /* the JCW question is about the hatch, not the two-seat Roadster */
  "mini jcw vs s":                   ["mini-cooper-jcw","mini-cooper-s-184-ps"]
};
/* Autocomplete throws up the occasional non-question. */
const DROP=new Set(["toyota gr yaris vs lamborghini","golf gti vs tsi"]);

/* Where a make sells a dozen cars under one name, scoring cannot know which one
   the bare name means. These are the ones it gets wrong, and only when nothing
   else was typed. */
const PREFER={
  "ford mustang":       "mustang",                  /* the GT, not a four-cylinder or a tuner car */
  "lamborghini huracan":"perf",                     /* no closed base car exists in the data */
  "aston martin vantage":"aston-martin-vantage-amr",/* not the 1999 DB7 that carries the word */
  "porsche 911":        "porsche-911-carrera-991",
  "toyota supra":       "toyota-supra-a90",
  "tesla":              "plaid"
};

const rows=JSON.parse(fs.readFileSync(path.join(ROOT,"data/pairs.json"),"utf8"));
const seen=new Map();
for(const r of rows){
  if(DROP.has(r.phrase)) continue;
  /* Autocomplete answers "jaguar f-type vs" with "jaguar f pace vs bmw x3".
     The phrase is a real question; it is just not a question about the seed,
     and pairing an F-Type with an X3 is nobody's question at all. */
  if(!clean(r.phrase).startsWith(clean(r.seed))) continue;
  const ov=OVERRIDE[r.phrase];
  let A=ov?CARS.find(c=>c.id===ov[0]):resolve(r.seed);
  if(!A) continue;
  let B=ov?CARS.find(c=>c.id===ov[1]):resolve(r.other, A);
  if(!B || B.id===A.id) continue;
  /* Nobody searching "audi rs6 vs bmw m5" means a 2012 estate against a 2024
     saloon. Where the two land more than a generation apart, pull the older
     one back toward the newer and take that reading instead. */
  if(!ov && Math.abs(A.yr-B.yr)>8){
    if(A.yr<B.yr){ const a2=resolve(r.seed,null,B.yr); if(a2) A=a2; }
    else         { const b2=resolve(r.other,A,A.yr);   if(b2) B=b2; }
    if(B.id===A.id) continue;
  }
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
