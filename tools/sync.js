/* Writes the fitted rows for a spec file back into the CARS array in
 * src/app.html, matching on id. Nothing else in the file is touched.
 *
 * fit.js --emit already prints rows byte-identical to the ones in the app, so
 * this is a line swap, not a re-serialisation -- a car that has not changed
 * produces no diff at all, which is what makes the change set readable.
 *
 *   node tools/sync.js data/everyday.json
 */
const fs=require("fs"), path=require("path"), {execFileSync}=require("child_process");
const ROOT=path.join(__dirname,"..");
const spec=process.argv[2];
if(!spec){ console.error("usage: node tools/sync.js <specs.json>"); process.exit(1); }

const rows=execFileSync(process.execPath,[path.join(__dirname,"fit.js"),spec,"--emit"],
  {encoding:"utf8",maxBuffer:64<<20}).split("\n").filter(l=>l.startsWith("{id:"));

const appPath=path.join(ROOT,"src/app.html");
let app=fs.readFileSync(appPath,"utf8");
let changed=0, missing=[];
for(const row of rows){
  const id=row.match(/^\{id:"([^"]+)"/)[1];
  /* anchor on the whole line so a row cannot be spliced into the middle of
     another car's, and so an id that is a prefix of another cannot match */
  const re=new RegExp("^\\{id:\""+id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\",.*$","m");
  if(!re.test(app)){ missing.push(id); continue; }
  const before=app;
  app=app.replace(re,()=>row);
  if(app!==before) changed++;
}
if(missing.length) throw new Error("sync: not in app.html: "+missing.join(", "));
fs.writeFileSync(appPath,app);
console.log(`sync: ${rows.length} rows, ${changed} changed`);
