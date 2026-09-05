/* Push changed URLs to IndexNow.
 *
 * Why this and not a sitemap ping: Google retired its /ping endpoint in 2023
 * and Bing retired its own soon after, both pointing at IndexNow instead. A
 * sitemap that is already submitted does not need resubmitting -- Search Console
 * re-downloads it on its own schedule, and the lastmod in it is what tells a
 * crawler which pages moved. IndexNow is the one mechanism left that says "these
 * specific URLs changed, now" rather than waiting to be asked.
 *
 * It reaches Bing, Yandex, Seznam and Naver. It does NOT reach Google, which has
 * never joined; for Google the sitemap plus lastmod is the whole story.
 *
 *   node tools/indexnow.js            -> submit every URL in public/sitemap.xml
 *   node tools/indexnow.js --dry      -> print what would be sent
 *
 * The key is a file at the site root proving we control the host; build.js
 * copies it out of src/ on every build, so it cannot go missing.
 */
const fs=require("fs"), path=require("path");

const HOST="myautoracer.com";
const KEY="4c5a35b261552b253134c84f789dbac4";
const ROOT=path.join(__dirname,"..");
const dry=process.argv.includes("--dry");

/* /sitemap.xml is a sitemap index, so its <loc>s are other sitemaps, not pages.
   Follow them one level -- and only one: a sitemap index may not nest, so an
   index inside an index means the build is wrong and should say so. */
const read=f=>fs.readFileSync(path.join(ROOT,"public",f),"utf8");
const locs=x=>[...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const root=read("sitemap.xml");
let urls;
if(/<sitemapindex/.test(root)){
  urls=locs(root).flatMap(u=>{
    const child=read(new URL(u).pathname.replace(/^\//,""));
    if(/<sitemapindex/.test(child)) throw new Error("indexnow: nested sitemap index at "+u);
    return locs(child);
  });
}else urls=locs(root);
if(!urls.length) throw new Error("indexnow: no URLs in public/sitemap.xml -- run the build first");
if(new Set(urls).size!==urls.length) throw new Error("indexnow: duplicate URLs across sitemaps");
/* The documented ceiling is 10,000 per REQUEST, not per site, so a site larger
   than that is submitted in batches rather than refused: 2,500 car pages of
   14,999 is a tranche that is meant to grow, and the submission must not be
   what stops it. */
const BATCH=10000;
const wrong=urls.filter(u=>{ try{ return new URL(u).host!==HOST; }catch(e){ return true; } });
if(wrong.length) throw new Error("indexnow: URLs outside the host: "+wrong.slice(0,3).join(", "));

const keyLocation=`https://${HOST}/${KEY}.txt`;
const batches=[];
for(let i=0;i<urls.length;i+=BATCH) batches.push(urls.slice(i,i+BATCH));
console.log(`${urls.length} URLs in ${batches.length} request${batches.length>1?"s":""}, key at ${keyLocation}`);
if(dry){ console.log(urls.slice(0,5).join("\n")+"\n..."); process.exit(0); }

(async()=>{
  let bad=0;
  for(const [i,urlList] of batches.entries()){
    try{
      const r=await fetch("https://api.indexnow.org/indexnow",{
        method:"POST",
        headers:{"Content-Type":"application/json; charset=utf-8"},
        body:JSON.stringify({host:HOST,key:KEY,keyLocation,urlList})
      });
      const t=await r.text();
      /* 200 accepted, 202 accepted but the key is still being verified.
         Anything else is a real failure and worth the non-zero exit. */
      console.log(`  batch ${i+1}/${batches.length} (${urlList.length}): `
        +`HTTP ${r.status} ${r.statusText}${t?" "+t.slice(0,200):""}`);
      if(r.status!==200 && r.status!==202) bad++;
    }catch(e){ console.error(`  batch ${i+1}: ${e.message}`); bad++; }
  }
  if(bad) process.exit(1);
})();
