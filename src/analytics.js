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
 * Storage: three localStorage keys, `mar:consent`, `mar:did` and `mar:first`,
 * and NONE is written before the visitor has agreed. Decline and the only thing
 * kept is the word "denied", so we can stop asking.
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
  /* The commit the pages were generated from. Every event carries it, which is
     what makes an SEO change measurable: you can cut any metric by the build
     that introduced it instead of guessing at a date. */
  var BUILD = "__MP_BUILD__";
  var CKEY  = "mar:consent", DKEY = "mar:did", FKEY = "mar:first";

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

  /* --- where the visit came from ---------------------------------------
     The whole point of the SEO and GEO work is that somebody arrives who did
     not before, so every event has to be able to say who sent them. Three
     buckets matter and the rest is noise:

       ai      -- an answer engine cited us and a human followed the citation
       search  -- a classic results page
       social  -- a link somebody posted

     Note what this CANNOT see: the crawlers themselves. GPTBot, ClaudeBot and
     PerplexityBot do not run JavaScript, so a page they fetch produces no event
     here at all. Being read by a model and being clicked through from one are
     different things, and only the second is visible from the browser. Server
     logs are the only place the first shows up. */
  /* Anchored the same way as the two below -- "(^|\.)" rather than "^" -- because
     the referrer that actually arrives is www.perplexity.ai, not perplexity.ai,
     and an exact-host match quietly files it under "referral". No entry here may
     contain a slash: this is matched against a hostname, and a path in the list
     can never match anything. */
  var AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|poe\.com|mistral\.ai|grok\.com|x\.ai|felo\.ai|iask\.ai|andisearch\.com|kagi\.com|arc\.net|komo\.ai|exa\.ai)$/;
  var SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|ecosia\.org|search\.brave\.com|startpage\.com|qwant\.com|yandex\.[a-z.]+|baidu\.com|search\.marginalia\.nu)$/;
  var SOCIAL = /(^|\.)(t\.co|twitter\.com|x\.com|reddit\.com|facebook\.com|instagram\.com|linkedin\.com|news\.ycombinator\.com|pinterest\.[a-z.]+|youtube\.com|tiktok\.com|threads\.net|bsky\.app|mastodon\.[a-z.]+|substack\.com|discord\.com|pistonheads\.com)$/;

  function qp(k){
    try { return new URLSearchParams(location.search).get(k) || ""; }
    catch (e) { return ""; }
  }

  var refHost = (function(){
    try { return document.referrer ? new URL(document.referrer).host.toLowerCase() : ""; }
    catch (e) { return ""; }
  })();

  var utm = { source: qp("utm_source").toLowerCase(), medium: qp("utm_medium").toLowerCase(),
              campaign: qp("utm_campaign").toLowerCase() };

  /* ChatGPT stamps its outbound citations with utm_source=chatgpt.com, and it
     is the more reliable of the two signals: a referrer can be stripped by the
     referrer policy at the other end, a query parameter survives. Check the tag
     first, the host second. */
  var channel = (function(){
    var s = utm.source;
    if (s) {
      if (AI.test(s) || s === "chatgpt" || s === "perplexity" || s === "copilot") return "ai";
      if (SEARCH.test(s)) return "search";
      if (SOCIAL.test(s)) return "social";
      return utm.medium === "cpc" || utm.medium === "paid" ? "paid" : "campaign";
    }
    if (!refHost) return "direct";
    if (refHost === location.host) return "internal";
    if (AI.test(refHost)) return "ai";
    if (SEARCH.test(refHost)) return "search";
    if (SOCIAL.test(refHost)) return "social";
    return "referral";
  })();

  /* --- which page ------------------------------------------------------
     page_type groups the four templates so an experiment can be scoped to one
     of them; page_id is the individual slug, for the long tail. */
  var pageType, pageId = "";
  (function(){
    var p = location.pathname.replace(/\/+$/, "/");
    var m;
    if (p === "/" || p === "") { pageType = framed ? "simulator-embed" : "simulator"; return; }
    if ((m = p.match(/^\/vs\/([^/]+)\/$/)))          { pageType = "comparison"; pageId = m[1]; return; }
    if (p === "/vs/")                                { pageType = "comparison-index"; return; }
    if ((m = p.match(/^\/0-60-times\/([^/]+)\/$/)))  { pageType = "make"; pageId = m[1]; return; }
    if (p === "/0-60-times/")                        { pageType = "make-index"; return; }
    if ((m = p.match(/^\/fastest\/([^/]+)\/$/)))     { pageType = "fastest"; pageId = m[1]; return; }
    if (p === "/fastest/")                           { pageType = "fastest-index"; return; }
    if ((m = p.match(/^\/cars\/([^/]+)\/$/)))        { pageType = "car"; pageId = m[1]; return; }
    pageType = "other";
  })();

  /* First touch, kept only once consent exists. Somebody who arrives from
     ChatGPT, leaves, and comes back direct a week later was still won by the
     citation, and a last-touch-only report hands that credit to "direct". */
  var first = null;
  function readFirst(){
    var raw = get(FKEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function saveFirst(){
    if (first) return;
    first = { c: channel, p: location.pathname, t: Date.now() };
    set(FKEY, JSON.stringify(first));
  }
  first = readFirst();
  /* A visitor who consented on an earlier visit reaches here with state already
     "granted", so grant() never runs and the first touch was never written.
     Record it now: for anyone who consents from this build onwards it is the
     genuine first touch, and for the handful who consented before it is the
     earliest one we are able to know. */
  if (state === "granted" && !first) saveFirst();

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
      page_type: pageType,
      page_id: pageId,
      channel: channel,
      referrer_host: refHost,
      build: BUILD
    };
    if (utm.source)   p.utm_source   = utm.source;
    if (utm.medium)   p.utm_medium   = utm.medium;
    if (utm.campaign) p.utm_campaign = utm.campaign;
    if (first) { p.first_channel = first.c; p.first_landing = first.p; }
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
    saveFirst();
    hideBanner();
    flush();
  }
  function deny(){
    state = "denied"; queue = [];
    set(CKEY, "denied");
    del(DKEY); del(FKEY); did = ""; first = null;
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
                 state: function(){ return state; }, configured: !!TOKEN,
                 channel: channel, pageType: pageType, build: BUILD };

  /* The simulator runs before this file arrives and buffers its events here.
     Drain the buffer, then replace it with something that forwards straight
     through, so a late event is not silently dropped into an array nobody
     reads again. */
  var pending = window.MAR_QUEUE || [];
  for (var j = 0; j < pending.length; j++) track(pending[j][0], pending[j][1]);
  window.MAR_QUEUE = { push: function(e){ track(e[0], e[1]); return 0; }, length: 0 };

  /* --- did the visit actually work? ------------------------------------
     A pageview from an answer-engine citation is worth nothing on its own; the
     question is whether the person who followed it stayed. One event, fired at
     most once, on the first of: ten seconds with any scroll, or a quarter of
     the page. Bounce rate we can compute from its absence. */
  function engagement(){
    var done = false, t0 = Date.now(), scrolled = 0;
    function depth(){
      var h = document.documentElement;
      var max = Math.max(h.scrollHeight, document.body ? document.body.scrollHeight : 0) - innerHeight;
      return max <= 0 ? 1 : Math.min(1, (scrollY || h.scrollTop || 0) / max);
    }
    function check(){
      if (done) return;
      var d = depth();
      if (d > scrolled) scrolled = d;
      var secs = (Date.now() - t0) / 1000;
      if (scrolled >= 0.25 || (secs >= 10 && scrolled > 0.02)) {
        done = true;
        removeEventListener("scroll", check);
        clearInterval(iv);
        track("Page engaged", { seconds: Math.round(secs), scroll_depth: Math.round(scrolled*100) });
      }
    }
    addEventListener("scroll", check, { passive: true });
    var iv = setInterval(check, 2000);
  }

  /* An embedded simulator sits inside a page that has already counted itself;
     counting again would double every comparison view. */
  if (!framed) {
    track("Page viewed", {});
    engagement();
    /* Which internal link the visitor took is how you tell a page that answered
       the question from a page that merely started one. Delegated, so it covers
       links the templates add later without another edit here. */
    document.addEventListener("click", function(ev){
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var u;
      try { u = new URL(a.href, location.href); } catch (e) { return; }
      if (u.host !== location.host) return;
      if (u.pathname === location.pathname) return;
      track("Internal link clicked", { to: u.pathname });
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showBanner);
  else showBanner();
})();
