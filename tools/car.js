/* Renders one car large for shape work: node tools/car.js <id> [id2 ...] */
const fs=require("fs"),cp=require("child_process"),path=require("path");
const pub=path.join(__dirname,"..","public");
const ids=process.argv.slice(2);
const html=fs.readFileSync(path.join(pub,"index.html"),"utf8").replace("</body>",`<script>
const IDS=${JSON.stringify(ids)};
addEventListener("load",()=>setTimeout(()=>{
  document.querySelectorAll("body > *:not(script)").forEach(e=>e.style.display="none");
  const wrap=document.createElement("div");
  wrap.style.cssText="background:#12181f;padding:0";
  document.body.appendChild(wrap);
  IDS.forEach((id,n)=>{
    const c=CARS.find(x=>x.id===id); if(!c) return;
    const cv=document.createElement("canvas");
    cv.width=1200; cv.height=330; cv.style.cssText="display:block";
    wrap.appendChild(cv);
    const g=cv.getContext("2d"), sh=c.sh, ppm=Math.min(190,1080/sh[0],250/sh[1]), gy=288;
    const nose=60+sh[0]*ppm;
    g.fillStyle="#12181f"; g.fillRect(0,0,1200,330);
    g.strokeStyle="rgba(255,255,255,.05)";                       /* half-metre grid */
    for(let m=0;m<=sh[0]+1;m+=0.5){ g.beginPath(); g.moveTo(nose-m*ppm,0); g.lineTo(nose-m*ppm,gy); g.stroke(); }
    for(let m=0;m<=sh[1]+0.4;m+=0.5){ g.beginPath(); g.moveTo(0,gy-m*ppm); g.lineTo(1200,gy-m*ppm); g.stroke(); }
    drawCar(g,nose,gy,ppm,c,n%2?"#EE4A63":"#1B9CCE",30,6,12);
    g.strokeStyle="rgba(242,162,12,.45)"; g.lineWidth=1;         /* the real box */
    g.strokeRect(nose-sh[0]*ppm,gy-sh[1]*ppm,sh[0]*ppm,sh[1]*ppm);
    g.fillStyle="#E9EDF2"; g.font="13px monospace";
    g.fillText(c.mk+" "+c.md+"   L="+sh[0]+" H="+sh[1]+" wb="+sh[2]+" fo="+sh[3]+" wr="+sh[4]
      +(c._pf?"   [profile]":"   [archetype "+c.bd+"]"),16,22);
  });
},1200));
</script></body>`);
fs.writeFileSync(path.join(pub,"__car.html"),html);
cp.execSync(`chromium --headless --disable-gpu --hide-scrollbars --window-size=1200,${330*ids.length} `+
  `--screenshot="${path.join(__dirname,"..","car.png")}" --virtual-time-budget=8000 `+
  `"http://localhost:8099/__car.html"`,{stdio:"ignore"});
fs.unlinkSync(path.join(pub,"__car.html"));
console.log("car.png");
