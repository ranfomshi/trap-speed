/* Per-page share images, generated at build time.
 *
 * Every link this site produces -- a challenge sent to a friend, a /vs/ URL
 * pasted into Discord, a car page on a forum -- previewed as the same generic
 * card. This gives each one a picture of the two cars that are actually in it.
 *
 * Three constraints shaped how:
 *
 *   No dependencies. The repo has none and this is not worth losing that for,
 *   so Chrome is driven over the DevTools protocol directly. Node 22 ships a
 *   WebSocket client, which is the only piece that used to require a library.
 *
 *   One browser, one page load. A card per browser launch -- what tools/make-og.js
 *   does for the single site card -- is fine for one image and hopeless for a
 *   thousand. The app is loaded once and then re-rendered per pair in-page,
 *   which is milliseconds rather than seconds each.
 *
 *   Never break the build. No browser on the machine, a crash, a timeout: the
 *   step reports what it managed and the pages keep the static card. A missing
 *   share image is a worse preview; a failed build is a site that does not
 *   deploy at all.
 */
const fs=require("fs"), path=require("path"), http=require("http"), cp=require("child_process");

function findBrowser(){
  if(process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for(const n of ["google-chrome-stable","google-chrome","chromium","chromium-browser"]){
    try{ const p=cp.execFileSync("command",["-v",n],{shell:"/bin/bash",encoding:"utf8"}).trim();
      if(p) return p; }catch(e){}
  }
  return null;
}

/* The app asks for /logos/*.png and /analytics.js by absolute path, so file://
   loses every maker badge on the card. A five-line static server costs less than
   rewriting the app's URLs would. */
const MIME={".html":"text/html",".js":"text/javascript",".png":"image/png",".jpg":"image/jpeg",
  ".svg":"image/svg+xml",".txt":"text/plain",".xml":"application/xml"};
function serve(dir){
  const srv=http.createServer((req,res)=>{
    let p=decodeURIComponent(req.url.split("?")[0]);
    if(p.endsWith("/")) p+="index.html";
    const f=path.join(dir,p);
    if(!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.statusCode=404; return res.end(); }
    res.setHeader("Content-Type",MIME[path.extname(f)]||"application/octet-stream");
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r=>srv.listen(0,"127.0.0.1",()=>r({port:srv.address().port,close:()=>srv.close()})));
}

/* The smallest DevTools client that can do this job. */
class CDP{
  constructor(ws){ this.ws=ws; this.id=0; this.waiting=new Map(); this.session=null;
    ws.addEventListener("message",e=>{
      const m=JSON.parse(e.data);
      if(m.id && this.waiting.has(m.id)){
        const {ok,fail}=this.waiting.get(m.id); this.waiting.delete(m.id);
        m.error ? fail(new Error(m.error.message)) : ok(m.result);
      }
    });
  }
  send(method,params,useSession=true){
    const id=++this.id;
    const msg={id,method,params:params||{}};
    if(useSession&&this.session) msg.sessionId=this.session;
    this.ws.send(JSON.stringify(msg));
    return new Promise((ok,fail)=>{
      this.waiting.set(id,{ok,fail});
      setTimeout(()=>{ if(this.waiting.has(id)){ this.waiting.delete(id); fail(new Error(method+" timed out")); } },120000);
    });
  }
  async eval(expression){
    const r=await this.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description||"eval failed");
    return r.result.value;
  }
}

function launch(bin,port){
  const proc=cp.spawn(bin,["--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
    "--disable-dev-shm-usage","--window-size=1200,700","--remote-debugging-port=0",
    "--no-first-run","--no-default-browser-check","about:blank"],{stdio:["ignore","ignore","pipe"]});
  return new Promise((ok,fail)=>{
    let buf="";
    const to=setTimeout(()=>fail(new Error("browser did not report a debugging port")),25000);
    proc.stderr.on("data",d=>{
      buf+=d;
      const m=buf.match(/ws:\/\/[^\s]+/);
      if(m){ clearTimeout(to); ok({proc,url:m[0]}); }
    });
    proc.on("error",e=>{ clearTimeout(to); fail(e); });
    proc.on("exit",c=>{ clearTimeout(to); fail(new Error("browser exited "+c)); });
  });
}

/* Drawn in the page, where the car art and the physics already live. */
const RENDER=`(function(){
  const W=1200,H=630;
  window.__og=function(idA,idB){
    if(!car(idA)||!car(idB)) return null;
    S.a=idA; S.b=idB; S.mode="dist"; S.dist=D.Q; S.rs=0; S.surf="dry";
    computeTraces();
    const ta=tAtD(TR.a,D.Q), tb=tAtD(TR.b,D.Q);
    if(ta==null||tb==null) return null;
    /* Part-way down the strip, not at the line: at the finish the loser is
       usually out of frame, and a share image with one car in it says nothing
       about a race between two. */
    const t=Math.min(ta,tb)*0.62, pos={}, spd={}, acc={};
    ["a","b"].forEach(k=>{ const tr=TRX[k];
      pos[k]=at(tr,"t",t,"d")??0; spd[k]=at(tr,"t",t,"v")??0;
      acc[k]=((at(tr,"t",t+0.05,"v")??spd[k])-(at(tr,"t",Math.max(0,t-0.05),"v")??spd[k]))/0.1; });
    running=true; treeLit=new Set();
    resetCam(); drawStrip(pos,spd,t,D.Q,acc); drawStrip(pos,spd,t,D.Q,acc);
    running=false;

    const c=document.createElement("canvas"); c.width=W; c.height=H;
    const g=c.getContext("2d");
    g.fillStyle="#0B0F14"; g.fillRect(0,0,W,H);

    /* the strip, cropped to its middle band and stretched to the card width */
    const sc=document.getElementById("strip");
    const bandY=196, bandH=286;
    g.drawImage(sc,0,0,sc.width,sc.height,0,bandY,W,bandH);
    g.fillStyle="#0B0F14";
    g.globalAlpha=0.55; g.fillRect(0,bandY,W,26); g.fillRect(0,bandY+bandH-26,W,26); g.globalAlpha=1;

    const A=car(idA), B=car(idB), nm=x=>x.mk+" "+x.md;
    g.textBaseline="alphabetic";
    g.fillStyle="#F2A20C";
    g.font='700 26px "Saira Condensed", system-ui, sans-serif';
    g.fillText("MY AUTO RACER",54,64);
    g.fillStyle="#6C7B8A"; g.font='400 21px system-ui, sans-serif';
    g.fillText("Simulated drag race \\u00b7 quarter mile",54,96);

    /* the two names, each in its own lane colour, with a fitted size so a long
       pair does not run off the card */
    let size=54;
    const fit=()=>{ g.font='700 '+size+'px "Saira Condensed", system-ui, sans-serif';
      return g.measureText(nm(A)).width+g.measureText(" vs ").width+g.measureText(nm(B)).width; };
    while(fit()>W-108 && size>26) size-=2;
    const wA=g.measureText(nm(A)).width, wV=g.measureText(" vs ").width;
    let x=54, y=168;
    g.fillStyle="#1B9CCE"; g.fillText(nm(A),x,y); x+=wA;
    g.fillStyle="#6C7B8A"; g.fillText(" vs ",x,y); x+=wV;
    g.fillStyle="#EE4A63"; g.fillText(nm(B),x,y);

    /* the result, which is the reason to click */
    const win=ta<tb?A:B, wt=Math.min(ta,tb), gap=Math.abs(ta-tb);
    g.font='700 34px ui-monospace, "SF Mono", Menlo, monospace';
    g.fillStyle="#E9EDF2";
    g.fillText(wt.toFixed(2)+" s",54,H-52);
    const w1=g.measureText(wt.toFixed(2)+" s").width;
    g.font='400 25px system-ui, sans-serif'; g.fillStyle="#9BA9B8";
    g.fillText("  "+win.md+" wins by "+gap.toFixed(2)+" s",54+w1,H-52);
    return c.toDataURL("image/jpeg",0.86).slice("data:image/jpeg;base64,".length);
  };
  return true;
})()`;

async function build({outDir,site,pairs,onCard}){
  const bin=findBrowser();
  if(!bin){ console.log("  og: no browser found, keeping the static card"); return 0; }
  let srv,proc,ws;
  try{
    srv=await serve(outDir);
    const L=await launch(bin,srv.port); proc=L.proc;
    ws=new WebSocket(L.url);
    await new Promise((ok,fail)=>{ ws.addEventListener("open",ok); ws.addEventListener("error",()=>fail(new Error("cdp connect failed"))); });
    const cdp=new CDP(ws);
    const {targetId}=await cdp.send("Target.createTarget",{url:"about:blank"},false);
    const {sessionId}=await cdp.send("Target.attachToTarget",{targetId,flatten:true},false);
    cdp.session=sessionId;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate",{url:`http://127.0.0.1:${srv.port}/`});
    /* The app builds its own DOM on load; poll for the hook rather than racing it. */
    for(let i=0;i<80;i++){
      const ready=await cdp.eval(`typeof drawStrip==="function"&&typeof computeTraces==="function"&&!!document.getElementById("strip")`).catch(()=>false);
      if(ready) break;
      await new Promise(r=>setTimeout(r,250));
    }
    await cdp.eval(RENDER);
    /* fonts, or the card is drawn in whatever loaded first */
    await cdp.eval(`document.fonts?document.fonts.ready.then(()=>true):true`).catch(()=>{});

    const dir=path.join(outDir,"card"); fs.mkdirSync(dir,{recursive:true});
    let n=0;
    for(const p of pairs){
      let b64=null;
      try{ b64=await cdp.eval(`window.__og(${JSON.stringify(p.a)},${JSON.stringify(p.b)})`); }catch(e){}
      if(!b64) continue;
      fs.writeFileSync(path.join(dir,p.slug+".jpg"),Buffer.from(b64,"base64"));
      onCard&&onCard(p,`${site}/card/${p.slug}.jpg`);
      n++;
    }
    return n;
  }catch(e){
    console.log("  og: "+e.message+" -- keeping the static card");
    return 0;
  }finally{
    try{ ws&&ws.close(); }catch(e){}
    try{ proc&&proc.kill(); }catch(e){}
    try{ srv&&srv.close(); }catch(e){}
  }
}
module.exports={build,findBrowser};
