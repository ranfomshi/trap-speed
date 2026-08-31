/* Fits a car's two trim scalars against its published figures, using the very
 * physics the site runs -- the DOM-free prefix of src/app.html evaluated in a
 * VM, exactly as lib/vs.js does it. Nothing here re-implements the model.
 *
 *   k = [grip trim, power trim]
 *
 * grip trim scales the tyre's peak mu (launch), power trim scales delivered
 * power (everything after). They separate cleanly because a 0-62 is dominated
 * by power while a 60ft is dominated by grip, so where a car publishes both we
 * solve for both; where it publishes only the 0-62 -- which is every ordinary
 * road car -- grip is held at the class default and only power is solved.
 *
 *   node tools/fit.js data/everyday.json          # fit and report
 *   node tools/fit.js data/everyday.json --emit   # print CARS rows
 */
const fs=require("fs"), path=require("path"), vm=require("vm");
const ROOT=path.join(__dirname,"..");
const MPH=2.23694;

function physics(){
  const src=fs.readFileSync(path.join(ROOT,"src/app.html"),"utf8");
  const dom=src.indexOf("const $=s=>document.querySelector");
  if(dom<0) throw new Error("fit.js: cannot find the DOM boundary in app.html");
  const body=src.slice(src.lastIndexOf("<script>",dom)+8);
  const ctx={console}; vm.createContext(ctx);
  vm.runInContext(body.slice(0,body.indexOf("const $=s=>document.querySelector"))
    +";globalThis.__api={CARS,run,tAtD,tAtV,vAtD,FT,QM};",ctx);
  return ctx.__api;
}
const A=physics();
/* the conditions every published figure is quoted in, and the site's defaults */
const ENV={surf:"dry",tempC:20,alt:0,wind:0,grade:0,load:0};

/* seconds to a speed in km/h, on the maker's convention (no rollout) */
function tTo(c,kmh,kg,kp){
  const tr=A.run(c,ENV,{maxV:kmh/3.6,maxT:90,kg,kp});
  const t=A.tAtV(tr,kmh/3.6);
  return t==null?Infinity:t;
}
function t60ft(c,kg,kp){
  const tr=A.run(c,ENV,{maxD:60*0.3048,maxT:90,kg,kp});
  return A.tAtD(tr,60*0.3048);
}
/* Monotone in the trim, so a bisection is both exact and unable to wander. */
/* More trim always means a quicker time, so the search is a plain bisection on
   a monotone decreasing function -- exact, and unable to wander off. */
function solve(f,target,lo,hi,it=32){
  for(let i=0;i<it;i++){
    const m=(lo+hi)/2;
    if(f(m)>target) lo=m; else hi=m;   /* still too slow -> needs more trim */
  }
  return (lo+hi)/2;
}
/* Grip default for a car that publishes no 60ft. Not guessed: these are the
   MEDIAN grip trims the original full-profile pipeline arrived at for each
   tyre and drivetrain across the 2,843 cars already in the table, so a new car
   starts where its peers landed. Guessing 0.96 for front drive instead of the
   1.19 the population actually shows was forcing power trims of 1.3-1.5 to
   make up the launch the model was throwing away. */
const GRIP0=c=>({
  "cup/rwd":1.340,"cup/awd":1.162,"cup/fwd":1.288,
  "perf/rwd":1.227,"perf/awd":0.960,"perf/fwd":1.288,
  "all/fwd":1.190,"all/rwd":1.073,"all/awd":1.000
}[c.ty+"/"+c.dr] || 1.10);
/* Only for cars whose top speed is a limiter and therefore tells us nothing
   about drag. Frontal area from the drawn height and a typical track width,
   times a Cd for the shape. */
const CD={hatch:0.32,saloon:0.29,estate:0.31,mpv:0.33,suv:0.35,offroad:0.40,
  van:0.34,pickup:0.42,coupe:0.30,fastback:0.29,roadster:0.34,super:0.33,
  muscle:0.35,p911:0.31,wedge:0.33,bubble:0.35,seven:0.55};
function estCda(s){
  const h=s.sh?s.sh[1]:1.45;
  return +( (CD[s.bd]||0.32) * (h*1.82*0.83) ).toFixed(3);
}

/* Terminal speed with a given drag area and power trim. Coarse steps: this is
   an asymptote, not a launch, and 2.5ms resolution buys nothing here. */
function vMax(c,cda,kg,kp){
  const t=Object.assign({},c,{cda});
  const tr=A.run(t,ENV,{maxT:150,maxD:1e9,kg,kp,dt:0.02});
  return tr.vEnd*3.6;
}
/* Fitting only to the 0-62 leaves the high end unconstrained, and it showed:
   against the existing full-profile fits, single-point cars came out 0.2-0.4s
   quick over a quarter every time. A published top speed fixes that, because
   at terminal speed power and drag are the same number -- so where the top
   speed is real (not a limiter) we solve CdA from it rather than guessing. */
/* Drag dominates at terminal speed, where v goes as (P/CdA)^(1/3) -- so each
   pass can jump almost the whole way instead of halving an interval 40 times.
   Six passes land inside 0.1 km/h; bisecting a 150-second integration did not
   finish 50 cars inside two minutes. */
function solveCda(c,kg,kp){
  let cda=c.cda||0.65;
  for(let i=0;i<6;i++){
    const v=vMax(c,cda,kg,kp);
    if(!isFinite(v)||v<=0) break;
    if(Math.abs(v-c.vmx)<0.1) break;
    cda=Math.min(1.9,Math.max(0.30,cda*Math.pow(v/c.vmx,3)));
  }
  return cda;
}

function fit(spec){
  const c=Object.assign({},spec);
  const notes=[];
  let kg=spec.kg0!=null?spec.kg0:GRIP0(c), kp=1;
  let cda=spec.cda, cdaD=0;
  if(cda==null){
    if(spec.vmx&&!spec.lim){ cda=solveCda(c,kg,kp); cdaD=1; notes.push("cda from vmax"); }
    else { cda=estCda(spec); notes.push("cda estimated"); }
  }
  c.cda=cda;

  /* If a 60ft is published, grip is observable; otherwise keep the default. */
  if(spec.ft60){
    kg=solve(g=>t60ft(c,g,kp),spec.ft60,0.55,1.85);
    notes.push("60ft");
  }
  /* Power trim from the headline sprint. 0-100 km/h is what Europe publishes;
     fall back to a 0-60 mph where that is all a car quotes. */
  const sprint=spec.t100!=null?{v:100,t:spec.t100}:{v:60/MPH*3.6,t:spec.t60};
  if(sprint.t==null) throw new Error(spec.id+": no sprint figure to fit against");
  kp=solve(p=>tTo(c,sprint.v,kg,p),sprint.t,0.35,2.2);

  /* Drag area and power trim lean on each other, so settle them together. */
  for(let i=0;i<2;i++){
    if(cdaD){ cda=solveCda(c,kg,kp); c.cda=cda; }
    if(spec.ft60) kg=solve(g=>t60ft(c,g,kp),spec.ft60,0.55,1.85);
    kp=solve(p=>tTo(c,sprint.v,kg,p),sprint.t,0.35,2.2);
  }

  /* A sprint that is traction-limited cannot be reached with power at all: the
     330i saturated at 6.06s whether it was given a 1.5 or a 2.2 power trim,
     because it was already spinning everything it had. Solving power there just
     pins the trim to the search ceiling and calls the spec suspect. When more
     power stops buying time, the car is telling us it has more grip than its
     class default -- so solve that instead and leave power alone. */
  if(!spec.ft60){
    const tHi=tTo(c,sprint.v,kg,2.2), tMid=tTo(c,sprint.v,kg,1.5);
    if(tHi>sprint.t && (tMid-tHi)<0.08){
      kp=1;
      kg=solve(g=>tTo(c,sprint.v,g,kp),sprint.t,0.60,1.95);
      notes.push("traction-limited: solved grip, not power");
      if(cdaD){ cda=solveCda(c,kg,kp); c.cda=cda; }
    }
  }

  /* Residuals against every figure the car publishes, including the ones not
     fitted to -- that is what makes the error number mean anything. */
  const checks=[];
  const add=(label,got,want)=>{ if(want==null||got==null||!isFinite(got)) return;
    checks.push({label,got,want,err:Math.abs(got-want)/want*100}); };
  add("0-100kmh",tTo(c,100,kg,kp),spec.t100);
  add("0-60mph", tTo(c,60/MPH*3.6,kg,kp),spec.t60);
  add("0-120kmh",tTo(c,120,kg,kp),spec.t120);
  add("60ft",    t60ft(c,kg,kp),spec.ft60);
  const rms=checks.length?Math.sqrt(checks.reduce((s,x)=>s+x.err*x.err,0)/checks.length):0;

  add("vmax",vMax(c,cda,kg,kp),spec.lim?null:spec.vmx);
  return {kg:+kg.toFixed(4), kp:+kp.toFixed(4), cda:+cda.toFixed(3), cdaD,
          checks, used:checks.length, rms:+rms.toFixed(2), notes};
}
module.exports={physics:()=>A, fit, ENV, GRIP0};

if(require.main===module){
  const file=process.argv[2];
  if(!file){ console.error("usage: node tools/fit.js <specs.json> [--emit]"); process.exit(1); }
  const specs=JSON.parse(fs.readFileSync(path.join(ROOT,file),"utf8"));
  const emit=process.argv.includes("--emit");
  const rows=[], warn=[];
  for(const spec of specs){
    const r=fit(spec);
    /* The trims are the data-quality alarm. A car whose published mass, power
       and sprint disagree can only be reconciled by an absurd trim, so an
       extreme value means the SPEC is wrong, not the car. */
    const bad=[];
    /* Thresholds taken from the table's own distribution, not invented. Across
       the 2,843 fitted cars the power trim runs p10 0.89, p50 1.00, p99 1.20,
       with a handful of real cars out to 1.35 -- and the manufacturer-sourced
       ones sit higher than the independently-measured ones (median 1.089 vs
       1.002), because a maker's 0-62 claim is a best case. So a new car fitted
       to a maker's figure is allowed that much more before it is suspect. */
    const hi=(spec.src||"mfr")==="mfr"?1.36:1.22;
    if(r.kp<0.78||r.kp>hi) bad.push("power trim "+r.kp);
    if(r.kg<0.72||r.kg>1.55) bad.push("grip trim "+r.kg);
    if(r.rms>6) bad.push("rms "+r.rms+"%");
    if(bad.length) warn.push(spec.id+": "+bad.join(", "));
    rows.push({spec,r});
  }
  if(emit){
    for(const {spec,r} of rows) console.log(row(spec,r)+",");
  } else {
    for(const {spec,r} of rows)
      console.log(String(spec.id).padEnd(34),
        "kg="+r.kg.toFixed(3), "kp="+r.kp.toFixed(3),
        "pts="+r.used, "rms="+r.rms+"%");
    console.log("\n"+rows.length+" cars fitted");
    if(warn.length){ console.log("\nSUSPECT SPECS -- check the published figures:");
      warn.forEach(w=>console.log("  "+w)); }
    else console.log("no suspect specs");
  }
}

/* one CARS row, field order matching the existing table */
function row(s,r){
  const q=v=>typeof v==="string"?JSON.stringify(v):v;
  const p=[["id",s.id],["mk",s.mk],["md",s.md],["yr",s.yr],["cls",s.cls],["kW",s.kW],
    ["kg",s.kg],["dr",s.dr],["g",s.g],["bx",s.bx],["cda",r.cda],["vmx",s.vmx],
    ["ty",s.ty],["asp",s.asp],["hL",s.hL],["wd",s.wd],["src",s.src||"mfr"],
    ["est",1],["cdaD",r.cdaD],["h60",s.t60!=null?s.t60:null],["bd",s.bd]];
  if(s.en) p.push(["en",s.en]);
  if(s.op) p.push(["op",s.op]);
  if(s.wg) p.push(["wg",s.wg]);
  p.push(["sh",s.sh],["k",[r.kg,r.kp]],["f",[r.used,r.used,r.rms]]);
  return "{"+p.filter(([,v])=>v!=null).map(([k,v])=>k+":"+(Array.isArray(v)?JSON.stringify(v):q(v))).join(",")+"}";
}
