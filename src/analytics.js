/* My Auto Racer -- product analytics and the consent that gates it.
 *
 * This is deliberately not the Mixpanel SDK. The site is a physics simulator
 * whose whole selling point is that it loads fast and then runs a canvas at
 * 60fps; pulling in ~60 KB of autocapture and session recording to discover
 * that somebody pressed a button we already instrument by hand is a bad
 * trade. So: a short list of named events, posted to Mixpanel's ingestion
 * endpoint directly.
 *
 * Consequences of that choice, stated plainly because they are real:
 *   - no autocapture, so a new button is invisible until it is instrumented;
 *   - no session replay;
 *   - no third-party script, no third-party cookie, nothing to block.
 *
 * Storage: two localStorage keys, `mar:consent` and `mar:did`, and NEITHER is
 * written before the visitor has agreed. Decline and the only thing kept is
 * the word "denied", so we can stop asking.
 *
 * With no token configured every call here is a no-op and the banner still
 * behaves correctly, so the site works identically before Mixpanel is set up
 * and after.
 */
(function () {
  "use strict";

  var TOKEN = "__MP_TOKEN__";               /* build.js substitutes this */
  /* Residency matters and is not negotiable at runtime: a project created with
     EU data residency must be fed api-eu.mixpanel.com, and a US project the
     plain host. Both endpoints answer status:1 to a write either way, so a
     mismatch does not announce itself -- the events simply are not there when
     you go looking. Hence a build-time constant with the EU default this
     project was set up for, overridable without touching this file. */
  var HOST  = "__MP_HOST__";
  var CKEY  = "mar:consent", DKEY = "mar:did";

  /* localStorage throws outright in some privacy modes, so every touch is
     wrapped: a browser that refuses storage should still get a working site,
     it just gets asked again next visit. */
  function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k,v){ try { localStorage.setItem(k,v); } catch (e) {} }
  function del(k){ try { localStorage.removeItem(k); } catch (e) {} }

  /* Global Privacy Control is a machine-readable objection to tracking. Treat
     it as a decline that was already made, and do not put a banner in front of
     someone who has taken the trouble to answer the question in advance.
     navigator.webdriver catches our own Playwright runs. */
  var refused = navigator.globalPrivacyControl === true || navigator.webdriver === true;
  var framed  = (function(){ try { return window.top !== window.self; } catch (e) { return true; } })();

  var state = refused ? "denied" : get(CKEY);
  var did   = get(DKEY) || "";
  var queue = [];

  function newId(){
    try { return crypto.randomUUID(); }
    catch (e) { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2,10); }
  }

  function send(name, props){
    if (!TOKEN) return;
    var p = {
      token: TOKEN, distinct_id: did, $insert_id: newId(), time: Date.now(),
      /* Mixpanel derives geo from the sending IP; we keep that (ip=1 below) and
         add nothing that identifies a person. No email, no plate, no free text. */
      /* not "surface": on a drag-racing site that word already means the tarmac,
         and Race staged sends surface_grip alongside this */
      context: framed ? "embed" : "site",
      path: location.pathname,
      referrer_host: (function(){ try { return document.referrer ? new URL(document.referrer).host : ""; } catch (e) { return ""; } })()
    };
    for (var k in props) if (Object.prototype.hasOwnProperty.call(props,k)) p[k] = props[k];
    var body = new URLSearchParams({ data: JSON.stringify([{ event: name, properties: p }]), ip: "1" });
    /* Form encoding is CORS-safelisted, so this never needs a preflight -- which
       matters because sendBeacon cannot answer one. */
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(HOST + "/track", body)) return;
      fetch(HOST + "/track", { method:"POST", body:body, keepalive:true, mode:"no-cors" });
    } catch (e) {}
  }

  function flush(){
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) send(q[i][0], q[i][1]);
  }

  function track(name, props){
    if (state === "denied") return;
    if (state === "granted") { send(name, props || {}); return; }
    if (queue.length < 20) queue.push([name, props || {}]);   /* held until answered */
  }

  function grant(){
    state = "granted";
    set(CKEY, "granted");
    if (!did) { did = newId(); set(DKEY, did); }
    hideBanner();
    flush();
  }
  function deny(){
    state = "denied"; queue = [];
    set(CKEY, "denied");
    del(DKEY); did = "";
    hideBanner();
  }
  function revoke(){ deny(); }

  /* --- the banner ------------------------------------------------------
     Only for the generated pages. The simulator itself asks the same question
     inside its own disclaimer dialog and sets MAR_OWN_UI to say so, because two
     consent prompts on one screen is worse than none. */
  var banner = null;
  function hideBanner(){ if (banner) { banner.remove(); banner = null; } }

  /* The banner carries its own styling rather than relying on a class in each
     page's stylesheet: the generated pages are built by three different
     templates and this has to look the same in all of them. */
  var CSS = ".mar-consent{position:fixed;left:12px;right:12px;bottom:12px;z-index:99;"
    + "display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between;"
    + "max-width:940px;margin:0 auto;padding:13px 16px;border:1px solid #2A313A;border-radius:7px;"
    + "background:#12161B;color:#C3CBD6;box-shadow:0 14px 40px rgba(0,0,0,.55);"
    + "font:13px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}"
    + ".mar-consent p{margin:0;flex:1 1 320px}"
    + ".mar-consent strong{color:#E9EDF2}"
    + ".mar-consent a{color:#F2A20C}"
    + ".mar-consent-acts{display:flex;gap:9px;flex:0 0 auto}"
    + ".mar-consent button{cursor:pointer;border-radius:5px;padding:9px 16px;"
    + "font:600 11.5px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}"
    + '.mar-consent button[data-mar="yes"]{background:#F2A20C;color:#100B02;border:0}'
    + '.mar-consent button[data-mar="no"]{background:transparent;color:#98A2B0;border:1px solid #2A313A}'
    + '.mar-consent button[data-mar="no"]:hover{color:#E9EDF2;border-color:#F2A20C}'
    + "@media (max-width:620px){.mar-consent-acts{flex:1 1 100%}.mar-consent button{flex:1}}";
  function injectCSS(){
    if (document.getElementById("mar-consent-css")) return;
    var st = document.createElement("style");
    st.id = "mar-consent-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function showBanner(){
    if (banner || state || framed || window.MAR_OWN_UI) return;
    injectCSS();
    banner = document.createElement("div");
    banner.className = "mar-consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookies and analytics");
    banner.innerHTML =
      '<p>Every time on this site is <strong>simulated</strong>, not measured. ' +
      'We would like to keep anonymous usage stats (one browser-storage key, no ads, ' +
      'no data sold) to see which comparisons people actually use. ' +
      '<a href="/?legal=1">Read the full disclaimer</a>.</p>' +
      '<div class="mar-consent-acts">' +
      '<button type="button" data-mar="yes">Allow</button>' +
      '<button type="button" data-mar="no">No thanks</button>' +
      '</div>';
    banner.querySelector('[data-mar="yes"]').onclick = grant;
    banner.querySelector('[data-mar="no"]').onclick  = deny;
    document.body.appendChild(banner);
  }

  window.MAR = { track: track, grant: grant, deny: deny, revoke: revoke,
                 state: function(){ return state; }, configured: !!TOKEN };

  /* The simulator runs before this file arrives and buffers its events here.
     Drain the buffer, then replace it with something that forwards straight
     through, so a late event is not silently dropped into an array nobody
     reads again. */
  var pending = window.MAR_QUEUE || [];
  for (var j = 0; j < pending.length; j++) track(pending[j][0], pending[j][1]);
  window.MAR_QUEUE = { push: function(e){ track(e[0], e[1]); return 0; }, length: 0 };

  /* An embedded simulator sits inside a page that has already counted itself;
     counting again would double every comparison view. */
  if (!framed) track("Page viewed", {});

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBanner);
  else showBanner();
})();
