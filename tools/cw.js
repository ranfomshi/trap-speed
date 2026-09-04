/* Downloads cardata.wiki's own CSV distribution, one file per make.
 *
 * cardata.wiki publishes every variant under CC BY 4.0 and declares the CSV as
 * the dataset's distribution in the JSON-LD on each car page
 * (schema.org/DataDownload -> /api/download/make/<slug>). That is the licensed,
 * intended bulk route, so this takes it: 157 requests for 35,000 variants,
 * rather than 35,000 requests for the same thing. The paid REST API at /api/v1
 * is a different product and is not touched.
 *
 * Attribution is a licence condition, not a courtesy -- the site credits
 * cardata.wiki in its notes panel, and must go on doing so.
 *
 *   node tools/cw.js            # refresh every make into ref/cw-cache/
 *   node tools/cw.js --force    # re-download even where a file is cached
 */
const fs=require("fs"), path=require("path");
const ROOT=path.join(__dirname,"..");
const CACHE=path.join(ROOT,"ref","cw-cache");
const UA="MyAutoRacer/1.0 (+https://myautoracer.com; stuart151087@gmail.com)";
const GAP=900;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function makes(){
  const xml=await (await fetch("https://cardata.wiki/sitemap.xml",{headers:{"User-Agent":UA}})).text();
  const out=[];
  for(const m of xml.matchAll(/<loc>https:\/\/cardata\.wiki\/([a-z0-9-]+)<\/loc>/g))
    if(!["makes","api-docs","about","contribute","pricing","privacy","terms"].includes(m[1])) out.push(m[1]);
  return [...new Set(out)];
}
async function grab(make,force){
  fs.mkdirSync(CACHE,{recursive:true});
  const file=path.join(CACHE,make+".csv");
  if(!force&&fs.existsSync(file)) return fs.readFileSync(file,"utf8");
  const res=await fetch("https://cardata.wiki/api/download/make/"+make,{headers:{"User-Agent":UA}});
  if(!res.ok) throw new Error(res.status);
  const csv=await res.text();
  if(!csv.startsWith("make,model,variant")) throw new Error("not the CSV we expected");
  fs.writeFileSync(file,csv);
  await sleep(GAP);
  return csv;
}
/* A CSV reader that respects quotes, because model names contain commas. */
function parse(csv){
  const rows=[]; let row=[], cell="", q=false;
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(q){ if(ch==='"'){ if(csv[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=ch; }
    else if(ch==='"') q=true;
    else if(ch===","){ row.push(cell); cell=""; }
    else if(ch==="\n"){ row.push(cell); cell=""; if(row.length>1) rows.push(row); row=[]; }
    else if(ch!=="\r") cell+=ch;
  }
  if(cell||row.length){ row.push(cell); if(row.length>1) rows.push(row); }
  const head=rows.shift();
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]===""?null:r[i]])));
}
async function all(force){
  const ms=await makes(); const out=[];
  for(const m of ms){
    try{ out.push(...parse(await grab(m,force)).map(r=>(r._make=m,r))); }
    catch(e){ console.error("  "+m+": "+e.message); }
  }
  return out;
}
module.exports={makes,grab,parse,all};

if(require.main===module) (async()=>{
  const force=process.argv.includes("--force");
  const ms=await makes();
  console.log(ms.length+" makes");
  let n=0, rows=0;
  for(const m of ms){
    try{ rows+=parse(await grab(m,force)).length; n++; }
    catch(e){ console.log("  !! "+m+": "+e.message); }
    if(n%20===0) process.stdout.write(n+"... ");
  }
  console.log("\n"+n+" makes, "+rows+" variants cached in ref/cw-cache/");
})();
