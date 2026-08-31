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
  /* Performance staples people actually cross-shop, UK-weighted. */
  "bmw m3","bmw m4","bmw m2","bmw m5","bmw m135i","bmw m140i","bmw 330i",
  "audi rs3","audi rs4","audi rs5","audi rs6","audi r8","audi s3","audi ttrs",
  "mercedes a45","mercedes c63","mercedes e63","mercedes a35","mercedes cla45",
  "porsche 911 gt3","porsche 911 turbo","porsche cayman","porsche boxster","porsche taycan","porsche macan",
  "golf gti","golf r","ford mustang","ford fiesta st","ford focus rs","ford focus st",
  "honda civic type r","honda integra type r","toyota gr yaris","toyota supra","toyota gr86",
  "tesla model 3 performance","tesla model s plaid","tesla model y performance",
  "nissan gtr","nissan 370z","subaru wrx sti","mitsubishi evo",
  "lamborghini huracan","lamborghini urus","ferrari 488","ferrari f8","mclaren 720s","mclaren 570s",
  "alpine a110","lotus emira","lotus elise","hyundai i30 n","renault megane rs","cupra leon",
  "jaguar f-type","aston martin vantage","corvette c8","dodge charger hellcat",
  "range rover sport svr","alfa romeo giulia quadrifoglio","mini jcw","abarth 595"
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function suggest(q){
  const u="https://suggestqueries.google.com/complete/search?client=firefox&q="+encodeURIComponent(q);
  const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0"}});
  if(!r.ok) throw new Error(q+" -> HTTP "+r.status);
  return (JSON.parse(await r.text())[1]||[]);
}

/* Autocomplete returns ten suggestions per query, so "bmw m3 vs " only ever
   yields the ten most-searched rivals. Asking again for each opening letter --
   "bmw m3 vs a", "... vs b" -- walks the same ranking twenty-six more times and
   reaches the long tail, where the pages nobody else has bothered to build are.
   Rank is kept per query, so a letter's top hit does not outrank the overall
   top hit: a letter-expanded row is discounted for being a narrower question. */
const DEEP=process.argv.includes("--deep");
const TAILS=DEEP?[""].concat("abcdefghijklmnopqrstuvwxyz".split("")):[""];

(async()=>{
  const rows=[];
  for(const car of SEED){
   for(const tail of TAILS){
    let out=[];
    try{ out=await suggest(car+" vs "+tail); }
    catch(e){ console.error("  skip",car,tail,e.message); }
    out.forEach((phrase,rank)=>{
      const m=/^(.*?)\s+vs\.?\s+(.+)$/i.exec(phrase);
      if(!m) return;
      const b=m[2].trim();
      if(/\bvs\b/i.test(b)) return;                 /* three-way comparisons */
      /* rank 0 is the most searched; weight accordingly */
      rows.push({seed:car, other:b, rank, phrase,
                 weight:(tail?0.45:1)/(rank+1)});
    });
    await sleep(DEEP?170:320);                      /* be a good citizen */
   }
   process.stdout.write(".");
  }
  console.log("\nharvested",rows.length,"comparisons from",SEED.length,"seeds");
  const out=path.join(__dirname,"..","data"); fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,"pairs.json"),JSON.stringify(rows,null,1));
  console.log("wrote data/pairs.json");
})();
