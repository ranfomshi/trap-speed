/* The rules for the fields no maker publishes, read off the table rather than
 * invented. Every one of these was measured against the 2,941 cars already in
 * src/app.html, and the comment says what the measurement was.
 */

/* Front overhang as a fraction of the total overhang (length minus wheelbase).
   Across every body type in the table the median is 0.520 to three decimals --
   0.46 for the mid-engined shapes, whose cabins sit forward, and 0.65 for a
   Seven, which is mostly bonnet. This is not a rule of thumb; it is what the
   table already does. */
const FO = bd => (bd==="super"||bd==="wedge") ? 0.46 : bd==="seven" ? 0.65 : 0.52;

/* Static weight on the front axle. The table's medians per drivetrain, with the
   engine's position taking precedence where it has one. */
const WD = (dr,en) => en==="r" ? 0.58 : en==="m" ? (dr==="awd"?0.55:0.48)
                    : dr==="fwd" ? 0.62 : dr==="awd" ? 0.55 : 0.48;

/* Centre-of-gravity height as a fraction of wheelbase; the table's medians. */
const HL = (bd,dr,en) => en==="r" ? 0.20 : bd==="van" ? 0.34 : bd==="mpv" ? 0.30
                       : (bd==="suv"&&dr==="fwd") ? 0.29 : dr==="rwd" ? 0.24 : 0.23;

/* The class bands. Fitted to the table's own five classes by power-to-weight in
   watts per kilogram: they reproduce 97.2% of the existing labels, and the
   disagreements are hand-edits rather than a different rule. */
const CLS = pw => pw<92 ? "Everyday" : pw<146 ? "Sports"
                : pw<231 ? "Performance" : pw<373 ? "Supercar" : "Hypercar";

/* "185/60 R15" -> rolling radius in metres. */
function wheelRadius(tyres){
  const m=String(tyres).match(/(\d{3})\s*\/\s*(\d{2,3})\s*[ZR]*\s*R?\s*(\d{2}(?:\.\d)?)/);
  if(!m) return null;
  return +((+m[3]*25.4/2 + (+m[1])*(+m[2])/100)/1000).toFixed(3);
}
/* And where no tyre size is published: a plain regression on the car's own box,
   fitted to the 1,102 cars whose dimensions are measured rather than estimated.
   Median error 10 mm, worst 52. Wheel radius is drawing-only -- it never
   reaches the physics -- so an estimate here costs nothing but a millimetre. */
const wheelFromBox = (L,H) => +(0.0317*L + 0.0414*H + 0.1272).toFixed(3);

module.exports={FO,WD,HL,CLS,wheelRadius,wheelFromBox};
