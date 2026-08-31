/* Search Console, end to end: prove we own the site, register it, hand over the
   sitemap. Needs application-default credentials carrying the webmasters and
   siteverification scopes -- see the README note below.
 *
 *   node tools/gsc.js token      -> the verification token, to be deployed
 *   node tools/gsc.js verify     -> claim ownership (the token must be live)
 *   node tools/gsc.js submit     -> add the property and submit the sitemap
 *   node tools/gsc.js status     -> what Google currently knows
 */
const fs=require("fs"), path=require("path"), cp=require("child_process");
const SITE="https://myautoracer.com/";
const ROOT=path.join(__dirname,"..");

function token(){
  /* gcloud mints and refreshes the access token; borrowing it beats
     reimplementing the OAuth dance. */
  return cp.execSync("gcloud auth application-default print-access-token",
    {encoding:"utf8"}).trim();
}
/* A client library would read quota_project_id out of the credentials file and
   send it for us; raw fetch has to say it out loud, and these APIs refuse
   user credentials without it. */
const QUOTA=(()=>{ try{
  return require(require("os").homedir()+"/.config/gcloud/application_default_credentials.json").quota_project_id;
}catch(e){ return null; } })();

async function api(url,opt={}){
  const r=await fetch(url,{...opt,headers:{Authorization:"Bearer "+token(),
    "Content-Type":"application/json",
    ...(QUOTA?{"x-goog-user-project":QUOTA}:{}),...(opt.headers||{})}});
  const t=await r.text();
  let j=null; try{ j=t?JSON.parse(t):null; }catch(e){}
  if(!r.ok) throw new Error(`${r.status} ${url}\n${t.slice(0,500)}`);
  return j;
}

const SV="https://www.googleapis.com/siteVerification/v1";
const WM="https://www.googleapis.com/webmasters/v3";

async function getToken(){
  const j=await api(`${SV}/token`,{method:"POST",body:JSON.stringify({
    site:{type:"SITE",identifier:SITE}, verificationMethod:"FILE"})});
  return j.token;                       /* e.g. google<hash>.html */
}
async function main(){
  const cmd=process.argv[2]||"status";

  if(cmd==="token"){
    const t=await getToken();
    /* The file Google looks for is named by the token and contains one line
       naming itself. Written into src/ so the build carries it forward. */
    fs.writeFileSync(path.join(ROOT,"src",t),`google-site-verification: ${t}\n`);
    console.log("wrote src/"+t+"  -- add it to build.js's copy list, build, deploy");
    return;
  }
  if(cmd==="verify"){
    const t=await getToken();
    /* A courtesy check only. This machine can be behind a stale resolver while
       the file is live everywhere else, and Google does its own fetch -- so a
       failure here is worth saying out loud but not worth stopping for. */
    const live=await fetch(SITE+t).then(r=>r.status).catch(()=>0);
    if(live!==200) console.warn(`  note: ${SITE}${t} reads ${live} from here; letting Google decide`);
    const j=await api(`${SV}/webResource?verificationMethod=FILE`,{method:"POST",
      body:JSON.stringify({site:{type:"SITE",identifier:SITE}})});
    console.log("verified:",JSON.stringify(j.owners||j));
    return;
  }
  if(cmd==="submit"){
    await api(`${WM}/sites/${encodeURIComponent(SITE)}`,{method:"PUT"});
    console.log("property added:",SITE);
    const sm=encodeURIComponent(SITE+"sitemap.xml");
    await api(`${WM}/sites/${encodeURIComponent(SITE)}/sitemaps/${sm}`,{method:"PUT"});
    console.log("sitemap submitted:",SITE+"sitemap.xml");
    return;
  }
  /* status */
  const sites=await api(`${WM}/sites`).catch(e=>({error:e.message}));
  console.log("properties:",JSON.stringify(sites,null,1).slice(0,900));
  try{
    const sm=await api(`${WM}/sites/${encodeURIComponent(SITE)}/sitemaps`);
    for(const s of sm.sitemap||[])
      console.log(`sitemap ${s.path}: ${s.isPending?"pending":"processed"}`,
        `submitted=${s.lastSubmitted||"?"} downloaded=${s.lastDownloaded||"never"}`,
        `urls=${(s.contents||[]).map(c=>c.submitted).join(",")||"?"}`,
        `warnings=${s.warnings||0} errors=${s.errors||0}`);
  }catch(e){ console.log("sitemaps:",e.message.split("\n")[0]); }
}
main().catch(e=>{ console.error(e.message); process.exit(1); });
