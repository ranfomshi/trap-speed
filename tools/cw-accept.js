/* Decides which ingested specs are fit to ship, and fits them.
 *
 * Three gates, in order:
 *
 *   1. Is it already in the table? Same make, same year, same power and the
 *      same length is the same car; the existing row wins, because it was fitted
 *      against a full acceleration profile rather than a single 0-100.
 *   2. Does the physics reconcile the published figures? A car whose mass,
 *      power and sprint disagree can only be fitted with an absurd trim, so an
 *      extreme trim means the SPEC is wrong. Thresholds are tools/fit.js's own,
 *      taken from the distribution of the 2,941 cars already fitted.
 *
 * Which of the survivors actually ship is a separate question, answered by
 * tools/cw-cut.js, so that it can be re-answered without re-fitting.
 *
 * The fit is the slow part -- about half a second a car -- so it is sharded
 * across the cores.
 *
 *   node tools/cw-accept.js [--jobs 8]
 */
const fs=require("fs"), path=require("path"), os=require("os"), {fork}=require("child_process");
const ROOT=path.join(__dirname,"..");
const arg=(k,d)=>{const i=process.argv.indexOf("--"+k); return i<0?d:+process.argv[i+1];};

/* ---- the worker half ------------------------------------------------- */
if(process.env.CW_SHARD){
  const {fit}=require("./fit.js");
  const specs=JSON.parse(fs.readFileSync(process.env.CW_SHARD,"utf8"));
  const out=[];
  for(const s of specs){
    let r=null,err=null;
    try{ r=fit(s); }catch(e){ err=String(e.message||e).slice(0,90); }
    out.push(err?{id:s.id,err}:{id:s.id,kg:r.kg,kp:r.kp,cda:r.cda,rms:r.rms,used:r.used});
  }
  fs.writeFileSync(process.env.CW_SHARD+".out",JSON.stringify(out));
  process.exit(0);
}

/* ---- the driver half ------------------------------------------------- */
(async()=>{
  const A=require("./fit.js").physics();
  const specs=JSON.parse(fs.readFileSync(path.join(ROOT,"data","cw-specs.json"),"utf8"));
  const jobs=arg("jobs",Math.max(1,os.cpus().length-1));

  /* gate 1: already in the table */
  const byMake={}; A.CARS.forEach(c=>{(byMake[c.mk.toLowerCase()]=byMake[c.mk.toLowerCase()]||[]).push(c)});
  const haveId=new Set(A.CARS.map(c=>c.id));
  const dup=s=>{
    if(haveId.has(s.id)) return true;
    for(const c of byMake[s.mk.toLowerCase()]||[])
      if(Math.abs(c.yr-s.yr)<=1 && Math.abs(c.kW-s.kW)<=2 && Math.abs(c.sh[0]-s.sh[0])<0.08) return true;
    return false;
  };
  const fresh=specs.filter(s=>!dup(s));
  console.log(`${specs.length} ingested, ${specs.length-fresh.length} already in the table, ${fresh.length} new`);

  /* gate 2: the physics has to reconcile them */
  const tmp=path.join(os.tmpdir(),"cw-shard-"+process.pid+"-");
  const shards=[];
  const per=Math.ceil(fresh.length/jobs);
  for(let i=0;i<jobs;i++){
    const part=fresh.slice(i*per,(i+1)*per); if(!part.length) break;
    const f=tmp+i+".json"; fs.writeFileSync(f,JSON.stringify(part)); shards.push(f);
  }
  console.log(`fitting ${fresh.length} cars across ${shards.length} workers...`);
  const t0=Date.now();
  await Promise.all(shards.map(f=>new Promise((res,rej)=>{
    const c=fork(__filename,[],{env:Object.assign({},process.env,{CW_SHARD:f}),stdio:"inherit"});
    c.on("exit",code=>code?rej(new Error("worker "+code)):res());
  })));
  const fits=new Map();
  for(const f of shards){ JSON.parse(fs.readFileSync(f+".out","utf8")).forEach(r=>fits.set(r.id,r));
                          fs.unlinkSync(f); fs.unlinkSync(f+".out"); }
  console.log(`fitted in ${((Date.now()-t0)/1000/60).toFixed(1)} min`);

  const reject=[], pass=[];
  for(const s of fresh){
    const r=fits.get(s.id);
    const why = !r?"no fit"
      : r.err?r.err
      : r.kp<0.78?"power trim "+r.kp+" (too low: the car is quicker than its figures allow)"
      : r.kp>1.22?"power trim "+r.kp+" (too high: mass, power and sprint do not reconcile)"
      : r.kg<0.72||r.kg>1.55?"grip trim "+r.kg
      : r.rms>6?"rms "+r.rms+"%"
      : null;
    if(why) reject.push({id:s.id,mk:s.mk,md:s.md,yr:s.yr,why}); else pass.push(s);
  }
  console.log(`${pass.length} reconcile, ${reject.length} rejected`);
  /* Everything that reconciles is written out whole, because the fit is the
     expensive step and the choice of which to ship is not: tools/cw-cut.js can
     be re-run against this in a second. */
  fs.writeFileSync(path.join(ROOT,"data","cw-pass.json"),JSON.stringify(pass,null," ")+"\n");

  fs.writeFileSync(path.join(ROOT,"data","cw-rejects.json"),JSON.stringify(reject,null," ")+"\n");
  console.log("-> data/cw-pass.json, data/cw-rejects.json  (run tools/cw-cut.js to choose the batch)");
  const why={}; reject.forEach(r=>{const k=r.why.replace(/-?[\d.]+/g,"n");why[k]=(why[k]||0)+1});
  console.log("rejected: "+Object.entries(why).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+" x"+v).join("; "));
})().catch(e=>{console.error(e); process.exit(1);});
