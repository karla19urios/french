/* The talking portrait.
   One photo per mouth shape, all shot in the same frame, so the face is never swapped whole:
   each mouth photo is masked down to an ellipse over the lips and faded in on top of the base
   portrait. The eyes, the hair and the light never move — that is what gives away a cut-out face.
   The mouth follows the real loudness of whatever the site is saying, so it stays in sync with the
   Azure MP3s (assets/tts.js) and with the device voice alike.

   window.Avatar.mount(element) → { el, state(name, ms), attach(audio), destroy() }
   Any element carrying data-avatar is mounted on its own. */
(function(){
  var me = document.currentScript;
  var BASE = (me && me.src ? me.src : location.href).replace(/[^\/]*$/, "") + "avatar/";

  var REPOS = "repos.jpg";
  var BOUCHES = ["mmm.jpg", "ou.jpg", "sourire.jpg", "ah.jpg"];   // index 0..3, used by choisir()
  var GESTES = { pense: "reflexion.jpg", bravo: "rire.jpg", surprise: "surprise.jpg" };

  // where the lips sit in those photos — measured on the files, not guessed
  var MASQUE = "radial-gradient(ellipse 20% 18% at 50.5% 55.5%, #000 50%, rgba(0,0,0,.6) 78%, transparent 100%)";

  function style(){
    if(document.getElementById("avatar-style")) return;
    var st = document.createElement("style");
    st.id = "avatar-style";
    st.textContent =
      ".av{position:relative;overflow:hidden;border-radius:50%;background:#0015a8;aspect-ratio:1/1;" +
        "width:260px;max-width:100%;margin:0 auto;box-shadow:0 12px 34px rgba(10,11,26,.45)}" +
      ".av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}" +
      ".av-b{z-index:1}" +
      ".av-m{z-index:2;opacity:0;transition:opacity .045s linear;" +
        "-webkit-mask-image:" + MASQUE + ";mask-image:" + MASQUE + "}" +
      ".av-g{z-index:3;opacity:0;transition:opacity .3s ease}" +
      "@media (prefers-reduced-motion:reduce){.av-m{display:none}}";
    document.head.appendChild(st);
  }

  /* ---- the audio context is built on the first gesture: Safari refuses to start one otherwise,
          and wiring an <audio> into a suspended context silences it ---- */
  var ctx = null, noeuds = new WeakMap();
  function contexte(){
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!ctx && AC){ try{ ctx = new AC(); }catch(e){ ctx = null; } }
    if(ctx && ctx.state === "suspended"){ try{ ctx.resume(); }catch(e){} }
    return ctx && ctx.state === "running" ? ctx : null;
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function(ev){
    document.addEventListener(ev, function once(){ contexte(); }, {capture: true, passive: true});
  });

  function niveau(a){
    var c = contexte();
    if(!c) return null;
    var n = noeuds.get(a);
    if(n === undefined){
      try{
        var an = c.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = .08;
        c.createMediaElementSource(a).connect(an);
        an.connect(c.destination);
        n = {an: an, buf: new Uint8Array(an.fftSize)};
      }catch(e){ n = null; }            // already wired elsewhere, or audio from another origin
      noeuds.set(a, n);
    }
    if(!n) return null;
    n.an.getByteTimeDomainData(n.buf);
    var somme = 0;
    for(var i = 0; i < n.buf.length; i++){ var d = (n.buf[i] - 128) / 128; somme += d * d; }
    return Math.sqrt(somme / n.buf.length);
  }

  // no signal to measure (device voice): two periods that never line up, so the mouth
  // does not fall into the regular flap of a puppet
  function faux(t){
    var o = .5 + .3 * Math.sin(t / 97) + .2 * Math.sin(t / 41 + 1.7);
    return .22 * Math.pow(Math.max(0, o), 2);        // au carré : des crêtes brèves, comme une vraie voix
  }

  function mount(cible, opts){
    style();
    opts = opts || {};
    var box = document.createElement("div");
    box.className = "av";
    if(opts.className) box.className += " " + opts.className;
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", opts.alt || "");

    function img(cls, fichier){
      var i = new Image();
      i.className = cls; i.alt = ""; i.decoding = "async"; i.src = BASE + fichier;
      box.appendChild(i);
      return i;
    }
    img("av-b", REPOS);
    var bouches = BOUCHES.map(function(f){ return img("av-m", f); });
    var charges = {};                                  // the reaction frames load the first time they show

    var externe = null, gesteActif = null, minuteur = 0;
    var lisse = 0, pic = 0, courant = -1, depuis = 0, alterne = 0, raf = 0;

    // The Azure MP3s are compressed hard: in absolute terms the loudness barely dips between
    // syllables, so a fixed threshold leaves the mouth hanging open. Everything is measured
    // against a slowly decaying peak instead, which also absorbs a quieter voice or a lower volume.
    function choisir(n){
      var r = pic > .012 ? n / pic : 0;
      if(r >= .78) return 3;                           // ah
      if(r >= .46) return (alterne % 3 === 2) ? 1 : 2;   // sourire, et un « ou » de temps en temps
      if(r >= .17) return 0;                           // mmm
      return -1;                                       // bouche fermée : le portrait de base
    }

    function boucle(t){
      raf = requestAnimationFrame(boucle);
      var parle = false;
      try{ parle = !!(window.speechSynthesis && window.speechSynthesis.speaking); }catch(e){}

      var a = (externe && !externe.paused && !externe.ended) ? externe : null;
      if(!a && parle && window.__ttsAudio) a = window.__ttsAudio();

      var n = 0;
      if(a && !a.paused){ var v = niveau(a); n = (v == null) ? faux(t) : v; }
      else if(parle){ n = faux(t); }

      pic = n > pic ? n : Math.max(n, pic * .992);     // ~3 s pour oublier un pic
      lisse += (n - lisse) * (n > lisse ? .6 : .42);   // s'ouvre vite, se referme un peu moins vite
      window.__avNiveau = lisse;      // pour calibrer les seuils, comme __ttsNow()  // s'ouvre vite, se referme plus doucement
      var veut = gesteActif ? -1 : choisir(lisse);
      if(veut !== courant && t - depuis > 50){
        courant = veut; depuis = t; alterne++;
        for(var i = 0; i < bouches.length; i++) bouches[i].style.opacity = (i === veut) ? 1 : 0;
      }
    }

    function state(nom, ms){
      clearTimeout(minuteur);
      if(gesteActif){ gesteActif.style.opacity = 0; gesteActif = null; }
      if(nom && GESTES[nom]){
        var g = charges[nom] || (charges[nom] = img("av-g", GESTES[nom]));
        gesteActif = g;
        for(var i = 0; i < bouches.length; i++) bouches[i].style.opacity = 0;
        courant = -1;
        requestAnimationFrame(function(){ if(gesteActif === g) g.style.opacity = 1; });
        if(ms) minuteur = setTimeout(function(){ if(gesteActif === g) state(null); }, ms);
      }
      return inst;
    }

    var inst = {
      el: box,
      state: state,
      attach: function(a){ externe = a || null; return inst; },     // lip-sync any <audio>
      destroy: function(){ cancelAnimationFrame(raf); clearTimeout(minuteur); box.remove(); }
    };

    (cible || document.body).appendChild(box);
    raf = requestAnimationFrame(boucle);
    document.addEventListener("visibilitychange", function(){
      if(document.hidden){ cancelAnimationFrame(raf); raf = 0; }
      else if(!raf) raf = requestAnimationFrame(boucle);
    });
    return inst;
  }

  window.Avatar = {mount: mount, base: BASE};

  function auto(){
    var l = document.querySelectorAll("[data-avatar]");
    for(var i = 0; i < l.length; i++){
      if(!l[i].__av) l[i].__av = mount(l[i], {alt: l[i].getAttribute("data-avatar") || ""});
    }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
})();
