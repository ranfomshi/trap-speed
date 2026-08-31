/* Regenerates src/og.png (the social card) from the built site.
   Run: node build.js && node tools/make-og.js   (needs chromium on PATH) */
const fs=require("fs"), cp=require("child_process"), path=require("path");
const pub=path.join(__dirname,"..","public");
const html=fs.readFileSync(path.join(pub,"index.html"),"utf8").replace("</body>",`<script>
S.a="992gt3"; S.b="mustang"; S.dist=D.Q;
setTimeout(()=>{
  document.querySelectorAll(".wrap > *").forEach(e=>{ if(!e.classList.contains("stripwrap")) e.style.display="none"; });
  const w=document.querySelector(".wrap");
  w.style.cssText="max-width:none;padding:0;margin:0;gap:0";
  const p=document.querySelector(".stripwrap");
  p.style.cssText="padding:0;border:0;border-radius:0;margin-top:186px";
  document.getElementById("strip").style.height="330px";
  const h=document.createElement("div");
  h.style.cssText="position:fixed;top:0;left:0;right:0;padding:40px 54px 0;font-family:'Saira Condensed',system-ui;";
  h.innerHTML='<div style="font-size:66px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">My Auto Racer</div>'+
    '<div style="font-size:23px;color:#98A4B2;margin-top:6px;letter-spacing:.02em">Drag race any two real cars &mdash; 2,843 of them, simulated from published figures</div>';
  document.body.appendChild(h);
  treeLit=new Set([5]); computeTraces(); resetCam();
  const t=1.55, pos={},spd={},acc={};
  ["a","b"].forEach(k=>{ const tr=TRX[k];
    pos[k]=at(tr,"t",t,"d")??0; spd[k]=at(tr,"t",t,"v")??0;
    acc[k]=((at(tr,"t",t+0.05,"v")??spd[k])-(at(tr,"t",Math.max(0,t-0.05),"v")??spd[k]))/0.1; });
  running=true;
  const paint=()=>{ resetCam(); drawStrip(pos,spd,t,D.Q,acc); };
  paint(); setTimeout(paint,500); setTimeout(paint,1400);
},900);
</script></body>`);
fs.writeFileSync(path.join(pub,"__og.html"),html);
cp.execSync(`chromium --headless --disable-gpu --hide-scrollbars --window-size=1200,630 `+
  `--screenshot="${path.join(__dirname,"..","src","og.png")}" --virtual-time-budget=9000 `+
  `"http://localhost:8099/__og.html"`,{stdio:"inherit"});
fs.unlinkSync(path.join(pub,"__og.html"));
console.log("wrote src/og.png");
