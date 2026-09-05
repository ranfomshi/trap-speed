/* cardata.wiki's CSV -> spec rows for tools/fit.js.
 *
 * The CSV publishes what a maker publishes: power, kerb mass, top speed,
 * 0-100, gearbox, drivetrain, length, height, wheelbase, tyre size. It does not
 * publish body type, engine aspiration or engine position -- those columns
 * exist and are empty -- so those three are DERIVED, and each is derived from
 * something real rather than assumed:
 *
 *   body        from the body word in the model name (Estate, Coupe, Cabriolet,
 *               "5 Doors"), else from the archetype the table already gives
 *               this make and model family, else from the car's own dimensions.
 *   aspiration  from the maker's own engine badge (TDI, TDCi, TSI, EcoBoost,
 *               dCi ...), else from specific output in kW per litre, which
 *               separates a blown engine from a naturally aspirated one almost
 *               everywhere except a narrow band of high-revving petrols.
 *   engine pos. inherited from the same family in the table, front otherwise --
 *               so a 911 stays rear-engined and an Elise stays mid.
 *
 * Everything else the simulator needs -- front overhang, CoG height, weight
 * distribution, class -- comes from tools/ingest.js, which reads those rules
 * off the 2,941 cars already fitted.
 *
 *   node tools/cw-ingest.js                 -> data/cw-specs.json, all makes
 *   node tools/cw-ingest.js ford vauxhall   -> just those makes
 */
const fs=require("fs"), path=require("path");
const cw=require("./cw.js"), ing=require("./derive.js");
const ROOT=path.join(__dirname,"..");

const num=v=>v==null?null:(isFinite(+v)?+v:null);
/* Some names arrive with the site's HTML still on them -- "TFSI&nbsp;quattro",
   "Start&amp;Stop" -- and a name goes into a page title, a share card and a
   slug, so it is decoded once here and stripped of anything that would have to
   be escaped three times over. */
const clean=s=>String(s)
  .replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,"").replace(/&#0?39;|&apos;/g,"'")
  .replace(/[<>\\"]/g,"")
  .replace(/\s*&\s*/g," and ")      /* "Town & Country" -> "Town and Country": a
                                        name is a page title, a slug and a share
                                        card, and an ampersand has to survive all
                                        three unescaped */
  .replace(/\s+/g," ").trim();
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

/* ---- body ------------------------------------------------------------ */
/* Nameplates that only mean a people carrier under one make. "C8" is a Citroen
   MPV and a Spyker supercar; "806" is a Peugeot MPV and a number that turns up
   anywhere. Qualified by make they are safe, and they are worth keeping because
   the fallback for a 1.75 m people carrier whose published height is wrong is
   to draw it as a saloon. */
const MPV_BY_MAKE=[
  [/^citroen$/i,       /\b(c8|evasion|synergie|xsara picasso|c4 picasso|grand c4)\b/i],
  [/^peugeot$/i,       /\b(806|807)\b/i],
  [/^fiat$/i,          /\b(ulysse|multipla)\b/i],
  [/^lancia$/i,        /\b(phedra|zeta|voyager)\b/i],
  [/^chrysler$/i,      /\b(voyager|grand voyager|town and country)\b/i],
  [/^ssangyong$/i,     /\brodius\b/i],
];
/* Crossovers, by make. A modern small crossover is only 1.55-1.60 m tall, so
   the box rule at the bottom of this file cannot see it: measured over the
   5,860 rows whose name carries a body word, dropping the SUV line to 1.55 m
   catches none of them and mislabels 169 hatches and estates. Height is simply
   the wrong signal, and the nameplate is the right one -- which is how the
   people carriers are already handled above.

   It was leaving 607 rows drawn as something they are not, a BMW X5 filed as a
   saloon and a T-Roc as a hatchback among them. Qualified by make throughout,
   because "2008" is a Peugeot crossover and also a year. Pickups are NOT in
   here (a Gladiator is a pickup) and neither are raised estates -- an XC70 and
   a C4 Cactus are closer to what the box rule already says. */
const SUV_BY_MAKE=[
  [/^(vw|volkswagen)$/i,  /\b(t-roc|t-cross|taigo|tayron|atlas|teramont|tharu|nivus)\b/i],
  [/^audi$/i,             /\bq[2-8]\b/i],
  [/^skoda$/i,            /\b(kamiq|karoq|kodiaq|yeti|enyaq|elroq)\b/i],
  [/^seat$/i,             /\b(arona|ateca|tarraco)\b/i],
  [/^cupra$/i,            /\b(formentor|ateca|terramar)\b/i],
  [/^ford$/i,             /\b(kuga|ecosport|edge|explorer|bronco|territory)\b/i],
  [/^renault$/i,          /\b(captur|kadjar|arkana|koleos|austral|symbioz)\b/i],
  [/^dacia$/i,            /\b(duster|jogger|bigster)\b/i],
  [/^peugeot$/i,          /\b(2008|3008|4008|5008)\b/i],
  [/^citroen$/i,          /\b(c3 aircross|c4 aircross|c5 aircross)\b/i],
  [/^nissan$/i,           /\b(juke|qashqai|x-trail|ariya|murano|kicks|rogue)\b/i],
  [/^toyota$/i,           /\b(c-hr|rav4|yaris cross|corolla cross|urban cruiser|highlander)\b/i],
  [/^honda$/i,            /\b(hr-v|cr-v|zr-v|pilot|passport)\b/i],
  [/^hyundai$/i,          /\b(kona|tucson|santa fe|bayon|venue|palisade|creta)\b/i],
  [/^kia$/i,              /\b(stonic|sportage|sorento|niro|seltos|telluride)\b/i],
  [/^mazda$/i,            /\bcx-?\d+\b/i],
  [/^bmw$/i,              /\bx[1-7]\b/i],
  [/^mercedes-benz$/i,    /\b(gla|glb|glc|gle|gls|glk|gl|eqa|eqb|eqc)\b/i],
  [/^volvo$/i,            /\bxc(40|60|90)\b/i],
  [/^mini$/i,             /\b(countryman|paceman|aceman)\b/i],
  [/^(opel|vauxhall)$/i,  /\b(mokka|crossland|grandland|antara|frontera)\b/i],
  [/^fiat$/i,             /\b(500x|panda cross)\b/i],
  [/^suzuki$/i,           /\b(vitara|s-cross|sx4|ignis|jimny)\b/i],
  [/^subaru$/i,           /\b(forester|xv|crosstrek|outback|ascent)\b/i],
  [/^jeep$/i,             /\b(renegade|compass|avenger|cherokee|wrangler)\b/i],
  [/^lexus$/i,            /\b(nx|rx|ux|lx|gx)\b/i],
  [/^land rover$/i,       /\b(evoque|velar|discovery|defender|freelander|range rover)\b/i],
];
const BODYWORD=[
  [/\b(estate|wagon|avant|touring|variant|t-modell|sportbrake|tourer|combi|kombi|break|caravan|sw)\b/i,"estate"],
  /* Pickup is asked before roadster because the roadster list holds a bare
     "cab" -- and "Amarok Double Cab" is not a convertible. */
  [/\b(pick-?up|pickup|(?:single|regular|super|crew|king|double|extra|quad|access|club|mega)\s?cab|amarok|hilux|ranger(?! rover)|navara|l200|d-?max|bt-?50|tacoma|tundra|f-1[05]0|silverado|frontier|ridgeline|gladiator|musso|alaskan|x-class)\b/i,"pickup"],
  [/\b(cabriolet|cabrio|convertible|roadster|spider|spyder|speedster|targa|cab|open)\b/i,"roadster"],
  [/\b(van|transporter|sprinter|ducato|boxer|relay|jumper|jumpy|scudo|expert|proace|dispatch|transit|tourneo connect|crafter|movano|master|daily|vito|trafic|vivaro|primastar|hiace|nv\d{3}|talento|doblo|combo cargo|kastenwagen)\b/i,"van"],
  [/\b(suv|crossover|allroad|cross country)\b/i,"suv"],
  /* Nameplates only, and only ones that cannot collide: "c8" was in this list
     for the Citroen C8 and it filed the Spyker C8 Preliator as a people carrier;
     "prima" caught the FSO Prima, which is a saloon. A Peugeot 806 with no
     nameplate match falls through to the box rule and is drawn as the tall
     thing it is, which is close enough at this resolution. */
  [/\b(mpv|minivan|multivan|people carrier|tourneo|zafira|sharan|galaxy|scenic|picasso|verso|touran|espace|alhambra|meriva|carens|sedona|previa|odyssey|voyager|caravan|vaneo|berlingo|partner|kangoo|caddy life|ulysse|evasion|synergie|phedra|ipsum|trajet|stream|fr-v|s-max|orlando|rodius|carnival|serena|noah)\b/i,"mpv"],
  [/\b(liftback|fastback|gran coupe|grand coupe|coupe-?suv)\b/i,"fastback"],
  [/\b(coupe|coupé)\b/i,"coupe"],
  [/\b(sedan|saloon|berline|limousine|notchback)\b/i,"saloon"],
  [/\b(hatchback|hatch|\d\s*doors?)\b/i,"hatch"],
];
/* Last resort. A shape read off the car's own box: how tall it is, how long,
   and how much of the length is cabin. Only ever reached when the name says
   nothing and the table holds no car from the same family. */
function bodyFromBox(L,H){
  if(H>=1.60) return "suv";   /* a van is a shape the name tells you about; a
                                  tall unnamed box is an SUV, which is what most
                                  of them are */     /* an MPV and a crossover are the same tall box
                                   at this resolution; only the name separates
                                   them, and that is tried before this is */
  if(H<=1.30) return "coupe";
  if(L>=4.45) return "saloon";
  return "hatch";
}
/* ---- aspiration ------------------------------------------------------ */
/* The maker's own badge, which is the only place this is ever stated. */
const BLOWN=/\b(tdi|tdci|cdti|hdi|bluehdi|dci|crdi|jtd|jtdm|multijet|cdi|tdd?|td|dtec|d-4d|ecoblue|duratorq|bluetec|skyactiv-?d|ecoboost|tsi|tfsi|tce|thp|t-jet|tjet|twinair|t-gdi|turbo|biturbo|twinturbo|kompressor|supercharged|blueefficiency|gdi-?t|vtec turbo|mhev-?t)\b/i;
const NATASP=/\b(mpi|sohc|dohc 16v|vvt-?i|i-?vtec|valvematic|skyactiv-?g|fsi|mpfi|multiair na)\b/i;

/* ---- variant-name tokens --------------------------------------------- */
const AWDWORD=/\b(quattro|4matic|xdrive|4motion|4x4|4wd|awd|sh-awd|allrad|4-?matic|syncro|4drive|torsen|symmetrical|all4)\b/i;
const RWDWORD=/\b(rwd|hinterradantrieb)\b/i;

const GEARBOX={MANUAL:"man",AUTOMATIC:"auto",DCT:"dct",CVT:"cvt",SEMI_AUTOMATIC:"auto"};
const DRIVE={FWD:"fwd",RWD:"rwd",AWD:"awd",FOUR_WD:"awd"};

/* "1.6L 16V 5MT FWD (100 HP)" -> "1.6 16V 100". The gearbox and the drivetrain
   are already their own fields and repeating them in the name reads as noise,
   but the POWER has to stay: two Alfa 145 1.8 TS of the same year differ only
   by 103 and 106 kW, and without it they are one name twice -- which loses one
   of them a page and shows the other twice in the picker. Bare, because that is
   how the table already writes it: "Fiesta 1.0 EcoBoost 100". */
function tidyVariant(v,hp){
  let s=" "+clean(v)+" ";
  const badged=(s.match(/\(\s*(\d+)(?:\.\d+)?\s*(?:HP|PS|BHP)\s*\)/i)||[])[1];
  s=s.replace(/\(\s*\d+(\.\d+)?\s*(HP|PS|BHP|KW)\s*\)/ig," ");
  s=s.replace(/\b\d{1,2}\s*(MT|AT|DCT|CVT|AMT|DSG)\b/ig," ");
  s=s.replace(/\b(FWD|RWD|AWD|4WD|4X4)\b/ig," ");
  s=s.replace(/(\d)\s*L\b/g,"$1");
  s=s.replace(/\s+/g," ").trim();
  /* only if the name does not already end in that very number */
  if(badged && !new RegExp("(^|\\s)"+badged+"$").test(s)) s=(s+" "+badged).trim();
  return s;
}
/* "BMW 3 Series Cabriolet (E93)" under make BMW -> "3 Series Cabriolet (E93)" */
function tidyModel(model,mk,...alsoMk){
  /* The model column sometimes repeats the make and sometimes spells it its own
     way -- "Mercedes-Benz A-Class" under make "MERCEDES BENZ" -- so the prefix
     is matched with the punctuation ignored rather than character by character.
     It has to be matched against the SOURCE's spelling as well as the table's:
     the table calls the make VW and the CSV writes "Volkswagen Golf", so
     matching on "VW" alone left 273 VW cards reading "VW - Volkswagen Golf". */
  let s=clean(model);
  const flat=x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,"");
  const want=new Set([mk,...alsoMk].filter(Boolean).map(flat));
  const words=s.split(/\s+/);
  for(let n=Math.min(3,words.length);n>0;n--)
    if(want.has(flat(words.slice(0,n).join("")))){ s=words.slice(n).join(" "); break; }
  /* One family, one spelling. The source carries the German name for some
     markets and the English one for others -- "A-Klasse" beside "A-Class",
     "5-Series" beside "5 Series" -- and they are not duplicate cars but they
     do split one family into two on a make page and in the picker. The maker's
     own English form wins: Mercedes hyphenates a Class, BMW spaces a Series. */
  s = s.replace(/\b([A-Za-z0-9]+)-Klasse\b/g,"$1-Class")
       .replace(/\b(\d)-Series\b/g,"$1 Series");
  return s.replace(/\b(\d)\s*doors?\b/ig,"$1dr").replace(/\s+/g," ").trim();
}
/* The family a car belongs to, for looking it up in the existing table. */
function family(model,mk){
  return tidyModel(model,mk)
    .replace(/\(.*?\)/g,"")
    .replace(/\b(\d?dr|estate|wagon|avant|touring|variant|t-modell|sportbrake|tourer|combi|kombi|break|sw|cabriolet|cabrio|convertible|roadster|spider|spyder|targa|cab|coupe|coupé|sedan|saloon|berline|hatchback|hatch|sportback|liftback|fastback|van|pickup)\b/ig,"")
    .replace(/\s+/g," ").trim().toLowerCase();
}

/* What the table already knows about this make and family: the archetype it is
   drawn as, and where its engine sits. Both are worth more than any guess. */
function familyIndex(CARS){
  const ix=new Map();
  for(const c of CARS){
    const key=c.mk.toLowerCase();
    if(!ix.has(key)) ix.set(key,[]);
    ix.get(key).push(c);
  }
  const flat=x=>String(x).toLowerCase().replace(/[^a-z0-9]/g,"");
  return (mk,fam)=>{
    const list=ix.get(mk.toLowerCase()); if(!list||!fam) return null;
    /* "Gallardo LP 560-4" should still find the table's "Gallardo LP560-4", and
       failing that its "Gallardo": punctuation is dropped, then the name is
       shortened a word at a time until something in the table answers. */
    let hits=[];
    const words=fam.split(/\s+/).filter(Boolean);
    for(let n=words.length;n>0&&!hits.length;n--){
      const key=flat(words.slice(0,n).join(""));
      if(key.length<3) break;
      hits=list.filter(c=>flat(c.md).startsWith(key));
    }
    if(!hits.length) return null;
    const mode=k=>{const n={};hits.forEach(c=>{if(c[k]!=null)n[c[k]]=(n[c[k]]||0)+1});
      const e=Object.entries(n).sort((a,b)=>b[1]-a[1])[0]; return e?e[0]:null;};
    return {bd:mode("bd"), en:mode("en"), n:hits.length};
  };
}

/* cardata writes makes in capitals ("MERCEDES BENZ"). The table has its own
   spellings, and a new car must land under the SAME make as the cars it belongs
   with or it gets its own filter entry and loses its badge. So the table's own
   spelling wins, by slug, with the handful the table itself spells two ways
   pinned to whichever spelling most of its cars already use. */
const MKPIN={volkswagen:"VW", mclaren:"Mclaren", seat:"SEAT", mini:"MINI",
             "mercedes-benz":"Mercedes-Benz", bmw:"BMW", mg:"MG", ds:"DS",
             gmc:"GMC", ac:"AC", byd:"BYD", ktm:"KTM", ram:"RAM", tvr:"TVR",
             ssc:"SSC", hsv:"HSV", nsu:"NSU", fso:"FSO", uaz:"UAZ", zaz:"ZAZ",
             srt:"SRT", bac:"BAC", "land-rover":"Land Rover"};
let MKNAME={};
function makeNames(CARS){
  const n={};
  for(const c of CARS){ const k=slug(c.mk); (n[k]=n[k]||{})[c.mk]=(n[k][c.mk]||0)+1; }
  const out={};
  for(const [k,v] of Object.entries(n))
    out[k]=Object.entries(v).sort((a,b)=>b[1]-a[1])[0][0];
  return Object.assign(out,MKPIN);
}

function toSpec(r,lookup){
  const mk   = MKNAME[r._make] || MKNAME[slug(r.make)] || titleMake(r.make);
  const kW   = Math.round(num(r.enginePowerKw));
  const kg   = Math.round(num(r.weightKg));
  const vmx  = Math.round(num(r.topSpeedKph));
  const t100 = num(r.acceleration0100);
  const L    = num(r.lengthMm), H=num(r.heightMm), wb=num(r.wheelbaseMm);
  const yr   = num(r.yearFrom);
  let   wr   = ing.wheelRadius(r.tyreFront||"");
  const bxK  = GEARBOX[r.gearboxType];
  const fuel = r.engineFuelType||"";
  const ev   = fuel==="ELECTRIC";
  const name = (r.model+" "+r.variant);

  const miss=[["power",kW],["mass",kg],["top speed",vmx],["0-100",t100],["length",L],
              ["height",H],["wheelbase",wb],["year",yr],["gearbox",bxK]]
             .filter(([,v])=>!v).map(([k])=>k);
  if(miss.length) return {err:"no "+miss.join("/")};

  /* the sanity band: outside it the row is a data error, not a car */
  if(wb>=L||wb<1500||L<2000||L>7000) return {err:"impossible box"};
  if(H<1000||H>2800)                 return {err:"impossible height"};
  if(kg<400||kg>4000)                return {err:"impossible mass"};
  if(vmx<80||vmx>500)                return {err:"impossible top speed"};
  if(t100<1.5||t100>40)              return {err:"impossible sprint"};
  if(kW<15||kW>1500)                 return {err:"impossible power"};

  /* Six thousand rows publish no tyre size. Wheel radius is drawing-only -- it
     never reaches the physics -- and across the 1,102 cars in the table whose
     dimensions are measured rather than estimated it is a plain function of the
     car's box, good to 10 mm at the median. Losing a car over it would be
     absurd, so it is regressed instead. */
  if(!wr) wr=ing.wheelFromBox(L/1000,H/1000);

  const fam=family(r.model,mk), known=lookup(mk,fam);
  const pw=kW*1000/kg, cls=ing.CLS(pw);

  /* Engine position is a property of the family, not of the trim, so it is the
     one thing worth inheriting from the table: a 911 stays rear-engined and an
     Elise stays mid whichever engine is in it. Body archetype is NOT inherited.
     The table holds mostly hot versions, and its own labels carry their history
     -- the 156 GTA is filed as an estate, the Giulia QV as a hatch -- so
     inheriting would spread those onto every standard car underneath them. */
  const en = mk==="Porsche"&&/^911\b/.test(fam) ? "r" : ((known&&known.en)||null);

  let bd=null;
  if(mk==="Porsche"&&/^911\b/.test(fam)) bd="p911";
  /* Asked before Sportback, so a Q3 Sportback is a crossover and not a
     fastback -- the only Sportbacks in the crossover list are the Q cars. An
     open top outranks the nameplate, though: a T-Roc Cabriolet and an Evoque
     Convertible are roofless, and that is the more visible half of the shape. */
  if(!bd && !/\b(cabriolet|cabrio|convertible|roadster|spider|spyder|speedster|targa)\b/i.test(name))
    for(const [mkRe,npRe] of SUV_BY_MAKE) if(mkRe.test(mk)&&npRe.test(name)){ bd="suv"; break; }
  if(!bd && /\bsportback\b/i.test(name))                 /* an A1 Sportback is a
        five-door hatch; an A7 Sportback is a fastback. Length is what separates
        the two, and it is published. */
    bd = L>=4500 ? "fastback" : "hatch";
  if(!bd) for(const [mkRe,npRe] of MPV_BY_MAKE) if(mkRe.test(mk)&&npRe.test(name)){ bd="mpv"; break; }
  if(!bd) for(const [re,b] of BODYWORD) if(re.test(name)){ bd=b; break; }
  if(!bd && (cls==="Supercar"||cls==="Hypercar") && (en==="m"||en==="r") && H<=1330) bd="super";
  if(!bd) bd=bodyFromBox(L/1000,H/1000);

  let dr=DRIVE[r.drivetrain]||null;
  if(!dr && AWDWORD.test(name)) dr="awd";
  if(!dr && RWDWORD.test(name)) dr="rwd";
  if(!dr) return {err:"no drivetrain"};
  if(dr!=="awd" && AWDWORD.test(name)) dr="awd";      /* the badge outranks a blank */

  const bx=ev?"ev":bxK;
  const g=ev?1:(num(r.gears)|| (bx==="cvt"?1:bx==="man"?5:6));

  /* Nobody publishes aspiration, so it is read off the engine three ways, in
     order of how reliable each one is.

     The maker's own badge first -- a TDI is a turbo, a Kompressor a blower --
     because that is the only place it is ever actually stated.

     Then TORQUE PER LITRE, which is what separates the two far better than
     power does. Measured over the 8,300 petrol rows whose badge settles the
     question: a badged turbo runs 118 Nm/l at the 5th percentile and 155 at the
     median, a naturally aspirated engine 78 and 95. At a threshold of 110 it
     misses 3% of the turbos. Power per litre cannot do that -- a 1980s turbo
     and a modern high-revving atmospheric engine make similar power per litre
     and nothing like the same torque.

     Power per litre only where no torque figure is published at all. */
  const litres=num(r.engineDisplacement)/1000, nm=num(r.engineTorqueNm);
  let asp;
  if(ev) asp="ev";
  else if(/kompressor|supercharg/i.test(name)) asp="sc";
  else if(BLOWN.test(name)) asp="turbo";
  /* Diesel gets its own threshold, and gets asked first. A diesel badge is
     often welded to the model number -- 325td, 525tds, 220d -- where no word
     boundary exists for the badge list to find, and a turbodiesel makes less
     torque per litre than a turbo petrol, so the petrol threshold was calling
     them atmospheric. Over the 4,452 diesels whose badge settles it, 80 Nm/l
     misses 0.4% of the turbos, and the genuinely atmospheric ones -- an Audi
     100 2.4 D at 69, a Mercedes 200 D -- sit below it. */
  else if(/DIESEL/.test(fuel))
    asp = (nm && litres) ? (nm/litres>80 ? "turbo" : "na") : (yr>=1990 ? "turbo" : "na");
  else if(nm && litres) asp = nm/litres>110 ? "turbo" : "na";
  else asp = (litres && kW/litres>75) ? "turbo" : "na";

  const ty = cls==="Hypercar"||cls==="Supercar" ? "cup" : cls==="Performance" ? "perf" : "all";

  const md0=tidyModel(r.model,mk,r.make,r._make);
  const spec={
    /* The year is part of the id because the same badge is reused across
       generations: three different Focus 1.6s are all "1.6 16V (100 HP)". */
    id: slug(mk+" "+md0+" "+tidyVariant(r.variant)+" "+kW+" "+yr),
    mk, md: (md0+" "+tidyVariant(r.variant)).replace(/\s+/g," ").trim(),
    yr, cls, kW, kg, dr, g, bx, vmx, ty, asp,
    hL: ing.HL(bd,dr,en), wd: ing.WD(dr,en), bd,
    sh: [ +(L/1000).toFixed(3), +(H/1000).toFixed(3), +(wb/1000).toFixed(3),
          +((L-wb)*ing.FO(bd)/1000).toFixed(3), wr ],
    t100, src:"cw"
  };
  /* dm marks a car drawn from measured dimensions rather than estimated ones.
     Length, height and wheelbase are always published here; the wheel is only
     real when the tyre size was, so the claim is only made when it was. */
  if(r.tyreFront) spec.dm=1;
  if(/DIESEL/.test(fuel)) spec.fu="d";
  if(en) spec.en=en;
  if(bd==="roadster") spec.op=1;
  return {spec};
}
function titleMake(s){
  return String(s).toLowerCase().split(/([\s-])/).map(w=>w.length>2?w[0].toUpperCase()+w.slice(1):w.toUpperCase()).join("");
}
/* A handful of rows carry a height that belongs to another vehicle -- a DB11 at
 * 1920 mm, an Agila at 2360. Left alone they are drawn as vans. Two cheap
 * checks catch nearly all of them, and neither invents a number:
 *
 *   - within a nameplate, a height more than a fifth away from what its
 *     siblings agree on is replaced by the siblings' median;
 *   - a car whose height is under 0.22 or over 0.55 of its length is not a
 *     shape any car has, so it is dropped rather than guessed at.
 */
function repairBoxes(rows){
  const g={};
  for(const r of rows){
    const k=r.make+"|"+String(r.model).split(/\s+/)[0];
    if(+r.heightMm) (g[k]=g[k]||[]).push(r);
  }
  let fixed=0;
  for(const list of Object.values(g)){
    if(list.length<3) continue;
    const hs=list.map(r=>+r.heightMm).sort((a,b)=>a-b);
    const med=hs[hs.length>>1];
    for(const r of list) if(Math.abs(+r.heightMm-med)/med>0.20){ r.heightMm=String(med); fixed++; }
  }
  const before=rows.length;
  const out=rows.filter(r=>{
    const H=+r.heightMm, L=+r.lengthMm;
    if(!H||!L) return true;                       /* the missing-field gate handles these */
    const k=H/L; return k>=0.22&&k<=0.55;
  });
  return {rows:out, fixed, dropped:before-out.length};
}
/* cardata lists the manual and the automatic of the same variant as two rows,
   and they are two different cars: a Bora 1.9 TDI 130 does 10.1 s with the
   six-speed manual and 10.9 s with the five-speed automatic, on 46 kg more.
   They collide only because the gearbox is a FIELD and not part of the name,
   so where a name lands twice the gearbox goes into the name. Dropping the
   second one instead cost 275 rows of VW alone, and the ones it dropped were
   whichever the CSV happened to list second.

   The manual keeps the bare name, because that is the car the badge describes
   and it is how the table already writes it; the others carry their box. Two
   rows sharing a box are separated by their gear count, and anything still
   identical after that really is the same car listed twice. */
const BXNAME={auto:"Auto",dct:"DCT",cvt:"CVT",man:"Man"};
function disambiguate(specs){
  const by=new Map();
  for(const s of specs){ if(!by.has(s.id)) by.set(s.id,[]); by.get(s.id).push(s); }
  let tagged=0;
  for(const [,group] of by){
    if(group.length<2) continue;
    const boxes=new Set(group.map(s=>s.bx));
    const bare=(boxes.size>1 && group.filter(s=>s.bx==="man").length===1) ? "man" : null;
    for(const s of group){
      const bits=[];
      if(s.bx!==bare) bits.push(BXNAME[s.bx]||s.bx);
      /* Gears only separate cars that have countable gears: a CVT is always
         listed as one, so "CVT 1sp" is noise on a name that already says CVT. */
      if(s.g>1 && new Set(group.filter(t=>t.bx===s.bx).map(t=>t.g)).size>1) bits.push(s.g+"sp");
      /* "Koleos 2.0 dCi CVT" does not need a second CVT. */
      const said=w=>new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(s.md);
      const use=bits.filter(b=>!said(b));
      if(!use.length) continue;
      bits.length=0; bits.push(...use);
      s.md=(s.md+" "+bits.join(" ")).replace(/\s+/g," ").trim();
      s.id=slug(s.id+" "+bits.join(" "));
      tagged++;
    }
  }
  /* Original order is kept deliberately: source order settles slugs and which
     tranche of car pages a car lands in. */
  const out=[], seen=new Set(); let dropped=0;
  for(const s of specs){
    if(seen.has(s.id)){ dropped++; continue; }
    seen.add(s.id); out.push(s);
  }
  return {rows:out, tagged, dropped};
}

module.exports={toSpec,familyIndex,makeNames,family,tidyModel,tidyVariant,bodyFromBox,repairBoxes,disambiguate};

if(require.main===module) (async()=>{
  const only=process.argv.slice(2).filter(a=>!a.startsWith("--"));
  const A=require("./fit.js").physics();
  const lookup=familyIndex(A.CARS);
  MKNAME=makeNames(A.CARS);
  let rows=await cw.all();
  if(only.length) rows=rows.filter(r=>only.includes(r._make));
  const rep=repairBoxes(rows); rows=rep.rows;
  console.log(`box check: ${rep.fixed} heights replaced by the nameplate median, ${rep.dropped} rows dropped as impossible`);
  let out=[]; const bad={};
  for(const r of rows){
    const x=toSpec(r,lookup);
    if(x.err){ bad[x.err.replace(/\d+/g,"n")]=(bad[x.err.replace(/\d+/g,"n")]||0)+1; continue; }
    out.push(x.spec);
  }
  const dis=disambiguate(out); out=dis.rows;
  bad["same car listed twice"]=dis.dropped;
  console.log(`${dis.tagged} names given their gearbox to tell them from a twin`);
  fs.writeFileSync(path.join(ROOT,"data","cw-specs.json"),JSON.stringify(out,null," ")+"\n");
  console.log(out.length+" specs of "+rows.length+" rows -> data/cw-specs.json");
  console.log("dropped: "+Object.entries(bad).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+"="+v).join(", "));
})();
