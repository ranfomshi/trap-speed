/* Harvest comparison demand from Google's autocomplete.
 *
 * Autocomplete returns suggestions ordered by how often people search them, so
 * "bmw m3 vs " is a popularity-ranked list of the cars people compare an M3
 * with. That is real demand data, free, and it is about PAIRS -- which is the
 * thing our own dataset cannot tell us.
 *
 *   node tools/pairs.js            -> writes data/pairs.json
 */
const fs=require("fs"), path=require("path");

/* A seed of cars people actually search for. Deliberately UK-weighted: the
   money here is UK affiliate, so ranking for Civic Si traffic is worth little. */
const SEED=[
  "bmw m3","bmw m4","bmw m2","bmw m5","audi rs3","audi rs6","audi r8",
  "mercedes a45","mercedes c63","porsche 911 gt3","porsche 911 turbo","porsche cayman",
  "golf gti","golf r","ford mustang","ford fiesta st","honda civic type r",
  "tesla model 3 performance","tesla model s plaid","toyota gr yaris","toyota supra",
  "nissan gtr","subaru wrx sti","lamborghini huracan","ferrari 488","mclaren 720s",
  "alpine a110","lotus emira","hyundai i30 n","bmw m140i"
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function suggest(q){
  const u="https://suggestqueries.google.com/complete/search?client=firefox&q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!r.ok) throw new Error(q+" -> HTTP "+r.status);
  return (JSON.parse(await r.text())[1]||[]);
}

(async()=>{
  const rows=[];
  for(const car of SEED){
    let out=[];
    try{ out=await suggest(car+" vs "); }
    catch(e){ console.error("  skip",car,e.message); }
    out.forEach((phrase,rank)=>{
      const m=/^(.*?)\s+vs\.?\s+(.+)$/i.exec(phrase);
      if(!m) return;
      const b=m[2].trim();
      if(/\bvs\b/i.test(b)) return;                 /* three-way comparisons */
      /* rank 0 is the most searched; weight accordingly */
      rows.push({seed:car, other:b, rank, weight:1/(rank+1), phrase});
    });
    process.stdout.write(".");
    await sleep(320);                               /* be a good citizen */
  }
  console.log("\nharvested",rows.length,"comparisons from",SEED.length,"seeds");
  const out=path.join(__dirname,"..","data"); fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(rows,null,1));
  console.log("wrote data/pairs.json");
})();
