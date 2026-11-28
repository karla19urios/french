/* El personaje: Karla, recortada y viva.

   Tres capas superpuestas que siempre están alineadas, porque las fotos se tomaron con
   el mismo encuadre al píxel: el cuerpo entero, los ojos y la boca. Cambiar sólo los ojos
   deja parpadear sin tocar la boca, y cambiar sólo la boca deja hablar sin congelar la cara.

   Respira y se balancea siempre. Parpadea sola. Mueve los labios con el nivel real del
   audio que esté sonando. Las reacciones (pensar, reír, saludar, bravo) cambian el cuerpo
   entero y por eso tapan los ojos y la boca mientras duran.

   Los archivos van en dos resoluciones: las "_s" para el personaje pequeño, que son las
   únicas que se cargan al entrar, y las grandes sólo cuando el estudiante lo agranda.

   window.Persona.mount(caja, opts) -> { el, state(nombre, ms), attach(audio), big(bool), destroy() }
*/
(function () {
  "use strict";
  var me = document.currentScript;
  var BASE = (me && me.src ? me.src : location.href).replace(/[?#].*$/, "").replace(/[^\/]*$/, "") + "persona/";

  var W = 402, H = 528;                       // el recorte del cuerpo, en píxeles del original
  // las cajas de boca y ojos, en fracción del cuerpo: medidas diferenciando los fotogramas
  var MOUTH = { l: 142 / W, t: 123 / H, w: 170 / W, h: 107 / H };
  var EYES  = { l: 127 / W, t:  56 / H, w: 200 / W, h: 104 / H };
  var BOUCHES = ["m_repos", "m_mmm", "m_ou", "m_sourire", "m_ah"];   // de cerrada a abierta
  // en reposo sonríe: es la cara con la que la ve el estudiante casi todo el tiempo
  var CORPS = { repos: "sourire", neutre: "neutre", pense: "reflexion", rire: "rire",
                surprise: "surprise", salut: "salut", bravo: "bravo",
                ecoute: "ecoute", doute: "doute" };
  var MASQUE_BOUCHE = "radial-gradient(ellipse 58% 54% at 50% 52%, #000 52%, rgba(0,0,0,.6) 78%, transparent 100%)";
  var MASQUE_YEUX = "radial-gradient(ellipse 64% 50% at 50% 50%, #000 48%, rgba(0,0,0,.6) 76%, transparent 100%)";

  var css = false;
  function style() {
    if (css) return; css = true;
    var s = document.createElement("style");
    s.id = "persona-css";
    s.textContent =
      ".pna{position:relative;display:block;pointer-events:none;" +
        "aspect-ratio:" + W + "/" + H + ";transform-origin:50% 92%;will-change:transform}" +
      ".pna img{position:absolute;display:block;image-rendering:auto}" +
      ".pna .pna-c{inset:0;width:100%;height:100%;opacity:0;transition:opacity .16s ease}" +
      ".pna .pna-c.on{opacity:1}" +
      ".pna .pna-m," + ".pna .pna-y{opacity:0;transition:opacity .07s linear}" +
      ".pna .pna-m.on,.pna .pna-y.on{opacity:1}" +
      ".pna .pna-m{left:" + (MOUTH.l * 100) + "%;top:" + (MOUTH.t * 100) + "%;" +
        "width:" + (MOUTH.w * 100) + "%;height:" + (MOUTH.h * 100) + "%;" +
        "-webkit-mask-image:" + MASQUE_BOUCHE + ";mask-image:" + MASQUE_BOUCHE + "}" +
      ".pna .pna-y{left:" + (EYES.l * 100) + "%;top:" + (EYES.t * 100) + "%;" +
        "width:" + (EYES.w * 100) + "%;height:" + (EYES.h * 100) + "%;" +
        "-webkit-mask-image:" + MASQUE_YEUX + ";mask-image:" + MASQUE_YEUX + "}" +
      "@media (prefers-reduced-motion:reduce){.pna{transform:none!important}}";
    document.head.appendChild(s);
  }

  // ---------- nivel del audio que esté sonando ----------
  var ctx = null, taps = new WeakMap();
  function analyser(audio) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !audio) return null;
    if (taps.has(audio)) return taps.get(audio);
    try {
      ctx = ctx || new AC();
      if (ctx.state === "suspended") ctx.resume();
      var src = ctx.createMediaElementSource(audio);
      var an = ctx.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = .2;
      src.connect(an); an.connect(ctx.destination);
      var buf = new Uint8Array(an.fftSize);
      var tap = { an: an, buf: buf };
      taps.set(audio, tap);
      return tap;
    } catch (e) { return null; }
  }
  function level(audio) {
    var t = analyser(audio);
    if (!t) return -1;                        // sin análisis posible: el llamador finge
    t.an.getByteTimeDomainData(t.buf);
    var s = 0;
    for (var i = 0; i < t.buf.length; i += 2) { var v = (t.buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / (t.buf.length / 2));
  }

  function mount(caja, opts) {
    style();
    opts = opts || {};
    var box = document.createElement("div");
    box.className = "pna" + (opts.className ? " " + opts.className : "");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", opts.alt || "");

    var grand = false, chargees = {}, epoca = 0;
    function src(nom) { return BASE + nom + (grand ? "" : "_s") + ".png"; }

    function img(cls, nom) {
      var i = new Image();
      i.className = cls; i.alt = ""; i.decoding = "async";
      if (nom) i.src = src(nom);
      box.appendChild(i);
      return i;
    }

    // cuerpo: el de reposo siempre cargado, los demás la primera vez que hacen falta
    var corps = {}, corpsActif = null;
    function corpsImg(cle) {
      if (corps[cle]) return corps[cle];
      var i = img("pna-c", CORPS[cle]);
      corps[cle] = i;
      return i;
    }
    function montreCorps(cle) {
      var i = corpsImg(cle);
      if (corpsActif === i) return;
      if (corpsActif) corpsActif.classList.remove("on");
      corpsActif = i;
      // el "on" espera un cuadro para que la imagen recién creada pueda hacer su fundido.
      // Si entretanto cambió el gesto otra vez, este ya no toca: dos gestos en el mismo
      // cuadro dejaban las dos caras encendidas y una se quedaba pegada para siempre.
      requestAnimationFrame(function () { if (corpsActif === i) i.classList.add("on"); });
    }
    corpsImg("repos").classList.add("on");
    corpsActif = corps.repos;

    // ojos y boca: se montan cuando se usan
    var yeux = {}, bouches = {}, yeuxActif = null, boucheActive = null;
    function yeuxImg(nom) { return yeux[nom] || (yeux[nom] = img("pna-y", nom)); }
    function boucheImg(nom) { return bouches[nom] || (bouches[nom] = img("pna-m", nom)); }
    function montreYeux(nom) {
      if (yeuxActif && yeuxActif !== (nom && yeux[nom])) yeuxActif.classList.remove("on");
      yeuxActif = nom ? yeuxImg(nom) : null;
      if (yeuxActif) yeuxActif.classList.add("on");
    }
    function montreBouche(n) {
      var nom = n < 0 ? null : BOUCHES[n];
      if (boucheActive && boucheActive !== (nom && bouches[nom])) boucheActive.classList.remove("on");
      boucheActive = nom ? boucheImg(nom) : null;
      if (boucheActive) boucheActive.classList.add("on");
    }
    function precharge() {                     // bocas: al primer intento de hablar
      if (chargees.bouches) return;
      chargees.bouches = 1;
      BOUCHES.forEach(boucheImg);
    }

    // ---------- bucle ----------
    var audio = null, geste = null, minuteur = 0, raf = 0;
    var lisse = 0, pic = 0, courant = -1, alterne = 0, faux0 = 0;
    var prochainClin = performance.now() + 1200 + Math.random() * 3000, clinJusqua = 0, clinPhase = 0;

    function choisir(n) {
      var r = pic > .012 ? n / pic : 0;
      if (r >= .78) return 4;                  // ah
      if (r >= .46) return (alterne++ % 3 === 2) ? 2 : 3;   // sourire, y un « ou » de vez en cuando
      if (r >= .17) return 1;                  // mmm
      return 0;                                // boca cerrada
    }

    function boucle(t) {
      raf = requestAnimationFrame(boucle);
      var parle = !!(audio && !audio.paused && !audio.ended);

      // --- respiración y balanceo: siempre, aunque esté callada ---
      var resp = Math.sin(t / 2000) * .9 + Math.sin(t / 3100) * .4;      // %
      var bal = Math.sin(t / 3600) * .45 + Math.sin(t / 5300) * .25;     // grados
      var souffle = 1 + Math.sin(t / 2000) * .004;
      var saut = parle ? Math.sin(t / 150) * .25 * Math.min(1, lisse * 14) : 0;
      box.style.transform = "translateY(" + (resp + saut).toFixed(2) + "%) " +
                            "rotate(" + bal.toFixed(2) + "deg) scale(" + souffle.toFixed(4) + ")";

      // --- parpadeo: sólo cuando no hay un gesto de cuerpo entero puesto ---
      if (!geste) {
        if (!clinJusqua && t > prochainClin) {
          clinJusqua = t + 150; clinPhase = 0;
          prochainClin = t + 2600 + Math.random() * 4200;
          if (Math.random() < .18) prochainClin = t + 420;     // de vez en cuando, doble
        }
        if (clinJusqua) {
          var k = (clinJusqua - t) / 150;
          var veut = k > .78 || k < .2 ? "y_bas" : "y_fermes";
          if (veut !== clinPhase) { montreYeux(veut); clinPhase = veut; }
          if (t > clinJusqua) { clinJusqua = 0; clinPhase = 0; montreYeux(null); }
        }
      }

      // --- boca ---
      if (geste) { montreBouche(-1); return; }
      if (!parle) {
        if (courant !== -1) { courant = -1; montreBouche(-1); }
        lisse = pic = 0;
        return;
      }
      precharge();
      var n = level(audio);
      if (n < 0) {                             // sin AudioContext: dos ritmos que no cuadran
        n = Math.max(0, Math.sin(t / 118) * .5 + Math.sin(t / 193) * .5) * .09;
        pic = .09;
      } else {
        pic = Math.max(n, pic * .985);
      }
      lisse = n > lisse ? n * .65 + lisse * .35 : n * .22 + lisse * .78;
      var veutB = choisir(lisse);
      if (veutB !== courant) { courant = veutB; montreBouche(veutB); }
    }

    function state(nom, ms) {
      clearTimeout(minuteur);
      if (!nom || !CORPS[nom] || nom === "repos") {
        geste = null;
        montreCorps("repos");
        return inst;
      }
      geste = nom;
      montreYeux(null); montreBouche(-1);
      montreCorps(nom);
      if (ms) minuteur = setTimeout(function () { if (geste === nom) state(null); }, ms);
      return inst;
    }

    var inst = {
      el: box,
      state: state,
      attach: function (a) { audio = a || null; if (a) precharge(); return inst; },
      // cambia a los archivos de resolución completa (sólo cuando el personaje se agranda)
      big: function (on) {
        on = !!on;
        if (on === grand) return inst;
        grand = on;
        // El archivo grande tarda en bajar y un <img> no pinta nada mientras llega:
        // si se cambiara el src de golpe, ella desaparecería un momento al agrandarla.
        // Se queda la pequeña estirada hasta que la grande está lista, y entonces cambia.
        var mia = ++epoca;
        var cambia = function (el, nom) {
          var url = src(nom);
          if (el.getAttribute("src") === url) return;
          var pre = new Image();
          var pon = function () { if (mia === epoca) el.src = url; };
          pre.onload = pon; pre.onerror = pon; pre.src = url;
        };
        Object.keys(corps).forEach(function (k) { cambia(corps[k], CORPS[k]); });
        Object.keys(yeux).forEach(function (k) { cambia(yeux[k], k); });
        Object.keys(bouches).forEach(function (k) { cambia(bouches[k], k); });
        return inst;
      },
      destroy: function () { cancelAnimationFrame(raf); clearTimeout(minuteur); box.remove(); }
    };

    (caja || document.body).appendChild(box);
    raf = requestAnimationFrame(boucle);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(boucle);
    });
    return inst;
  }

  window.Persona = { mount: mount, base: BASE };
})();
