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
/* --add appends ids the app has never seen, which is how a new batch of cars
   enters the set. Without it an unknown id is a typo in the spec file, and
   silently creating a car from a typo is worse than stopping. */
let added=0;
if(missing.length && process.argv.includes("--add")){
  const byId=new Map(rows.map(r=>[r.match(/^\{id:"([^"]+)"/)[1],r]));
  /* Append at the end of the CARS array: the last line that is a car row. The
     source order is what settles slugs and page tranches, so new cars go last
     and cannot renumber anything already published. */
  const lines=app.split("\n");
  let last=-1;
  for(let i=0;i<lines.length;i++) if(/^\{id:"/.test(lines[i])) last=i;
  if(last<0) throw new Error("sync: cannot find the CARS array in app.html");
  if(!/,\s*$/.test(lines[last])) lines[last]+=",";
  /* fit.js --emit already terminates each row with a comma, so join on the
     newline alone -- joining on "," too would leave `},,{` and a hole in the
     array, which reads back as an undefined car. */
  lines.splice(last+1,0,missing.map(id=>byId.get(id).replace(/,\s*$/,"")).join(",\n")+",");
  app=lines.join("\n");
  added=missing.length;
  missing.length=0;
}
if(missing.length) throw new Error("sync: not in app.html: "+missing.join(", ")
  +"  (pass --add to append them)");
fs.writeFileSync(appPath,app);
console.log(`sync: ${rows.length} rows, ${changed} changed, ${added} added`);
