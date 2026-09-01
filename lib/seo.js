/* Structured data, answer blocks and the crawl directives, in one place.
 *
 * Two audiences, one body of work:
 *
 *   A search engine wants machine-readable entities, a clear breadcrumb trail
 *   and a snippet it is allowed to quote at length.
 *
 *   An answer engine -- ChatGPT, Perplexity, Google's AI Overviews, Claude with
 *   search -- wants something narrower: a short, self-contained, checkable
 *   sentence that carries its own units and its own provenance. It will not
 *   assemble an answer out of a table it has to read across, and it will not
 *   cite a number whose origin the page does not state. So every generated page
 *   gets an answer paragraph that would survive being lifted out of the page
 *   whole, and a note saying where the number came from.
 *
 * What is honest about the second half: nobody outside the labs knows the
 * retrieval weights. What is defensible is that the content is unambiguous,
 * attributed and crawlable, which is a prerequisite under any weighting.
 */
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* Build date, fixed once per build so every page agrees. */
const BUILT = new Date().toISOString().slice(0,10);

/* JSON-LD goes in a script tag, and the one character that can break out of it
   is "<". Escaping it as < keeps the JSON valid and the tag closed. */
function jsonld(obj){
  return `<script type="application/ld+json">`
    + JSON.stringify(obj).replace(/</g,"\\u003C")
    + `</script>`;
}

/* Let search engines quote as much of the page as they like. The default is a
   ~160 character snippet, which is shorter than the answer most of these pages
   exist to give. */
/* Declared on every page: without it a browser asks for /favicon.ico, which
   does not exist, once per page. */
const ICON = `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`;

const ROBOTS = `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">`;

function breadcrumb(site, trail){
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t,i) => ({
      "@type": "ListItem", position: i+1, name: t.name,
      item: t.url ? site + t.url : undefined
    }))
  };
}

function faqPage(qs){
  return {
    "@type": "FAQPage",
    mainEntity: qs.map(q => ({
      "@type": "Question", name: q.q,
      acceptedAnswer: { "@type": "Answer", text: q.a }
    }))
  };
}

const BODY = { saloon:"Sedan", estate:"Station Wagon", suv:"SUV", coupe:"Coupe",
               roadster:"Convertible", mpv:"Minivan", van:"Van", super:"Coupe",
               muscle:"Coupe", pickup:"Pickup Truck" };

const DRIVECONF = { rwd:"RearWheelDriveConfiguration", fwd:"FrontWheelDriveConfiguration",
                    awd:"AllWheelDriveConfiguration" };

/* A Vehicle node per car. The numbers are ours -- simulated -- and the page
   says so in words; the schema says so too by describing the acceleration as
   a value we computed rather than a manufacturer claim. */
function vehicle(c, f, name, url){
  const v = {
    "@type": "Vehicle",
    name: name,
    manufacturer: { "@type": "Organization", name: c.mk },
    model: c.md,
    vehicleModelDate: String(c.yr),
    /* The set's `bd` falls back to "hatch" for anything it cannot place, so it
       holds mid-engined Alpines and Le Mans homologation specials alongside the
       actual hatchbacks. A guess is fine in a filter and wrong in structured
       data, which is read as a claim -- so the fallback value is not emitted. */
    bodyType: (c.bd && c.bd !== "hatch") ? (BODY[c.bd] || c.bd) : undefined,
    fuelType: c.asp === "ev" ? "Electric" : (c.fu === "d" ? "Diesel" : "Petrol"),
    driveWheelConfiguration: DRIVECONF[c.dr] || undefined,
    weight: { "@type": "QuantitativeValue", value: c.kg, unitCode: "KGM", unitText: "kg" },
    vehicleEngine: {
      "@type": "EngineSpecification",
      enginePower: { "@type": "QuantitativeValue", value: Math.round(c.kW),
                     unitCode: "KWT", unitText: "kW" },
      engineType: c.asp === "ev" ? "Electric motor"
                : c.fu === "d" ? "Turbodiesel"
                : c.asp === "turbo" ? "Turbocharged petrol"
                : c.asp === "sc" ? "Supercharged petrol" : "Naturally aspirated petrol"
    }
  };
  if (f && f.s60 != null) {
    v.accelerationTime = { "@type": "QuantitativeValue", value: +f.s60.toFixed(2),
                           unitCode: "SEC", unitText: "seconds, 0-60 mph, simulated" };
  }
  if (c.vmx) v.speed = { "@type": "QuantitativeValue", value: c.vmx, unitCode: "KMH", unitText: "km/h" };
  if (url) v.url = url;
  return v;
}

/* The answer paragraph. One sentence, both numbers, both units, no pronoun
   whose referent is somewhere else on the page -- so it reads correctly with
   nothing around it, which is the state it will be quoted in. */
function answerBlock(text, provenance){
  return `<div class="answer"><p class="answer-t">${text}</p>`
       + (provenance ? `<p class="answer-p">${provenance}</p>` : "")
       + `</div>`;
}

const ANSWER_CSS = `.answer{background:var(--sunk);border:1px solid var(--edge2);
  border-left:3px solid var(--amber);border-radius:5px;padding:15px 17px;margin:0 0 24px}
.answer-t{margin:0;font-size:16.5px;line-height:1.55;color:var(--ink)}
.answer-t b{color:var(--amber);font-weight:600}
.answer-p{margin:9px 0 0;font-size:12.5px;color:var(--ink3)}
.faq{margin:0;padding:0}
.faq dt{font-weight:600;color:var(--ink);margin:16px 0 5px;font-size:15px}
.faq dd{margin:0;color:var(--ink2);font-size:14.5px;line-height:1.6}
.updated{color:var(--ink3);font-size:12px;margin:26px 2px 0}`;

/* The visible half of the FAQ markup. Structured data that describes content
   the page does not actually show is a guidelines violation and, for an answer
   engine, a lie -- so these are always written together. */
function faqHTML(qs){
  return `<h2>Questions</h2>\n<dl class="faq">\n`
    + qs.map(q => `<dt>${esc(q.q)}</dt><dd>${esc(q.a)}</dd>`).join("\n")
    + `\n</dl>`;
}

function updatedLine(){
  return `<p class="updated">Figures regenerated ${BUILT}. Every number on this page is `
       + `computed by the simulator at build time, so the page and the app can never disagree.</p>`;
}

module.exports = { ICON, jsonld, breadcrumb, faqPage, vehicle, answerBlock, faqHTML,
                   updatedLine, ANSWER_CSS, ROBOTS, BUILT, esc };
