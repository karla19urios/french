/* Sélecteur de langue partagé — Español / English / Français
   Traduit les textes de la page sans toucher au HTML : chaque page déclare
   son dictionnaire avec I18N.add({ "texte original": {es:"…", fr:"…"} }).
   Le contenu généré en JavaScript est traduit lui aussi (MutationObserver). */
(function () {
  "use strict";

  var STORE = 'fr-course-lang';
  var LANGS = [
    { code: 'es', label: 'ES', name: 'Español' },
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'fr', label: 'FR', name: 'Français' }
  ];

  var DICT = Object.create(null);   // texte original -> {es, en, fr}

  /* Textes communs à toutes les activités : portail d'accès, boutons, en-têtes.
     Chaque page n'a plus qu'à déclarer ce qui lui est propre. */
  var BASE = {
    /* portail d'accès */
    "🇫🇷 Welcome to your French learning journey": { es: "🇫🇷 Te damos la bienvenida a tu aprendizaje del francés", fr: "🇫🇷 Bienvenue dans votre apprentissage du français" },
    "Accès réservé": { es: "Acceso reservado", en: "Restricted access" },
    "Entre ton code et ton PIN pour accéder au site.": { es: "Escribe tu código y tu PIN para entrar al sitio.", en: "Enter your code and PIN to access the site." },
    "Entrer": { es: "Entrar", en: "Enter" },
    "Code ou PIN incorrect.": { es: "Código o PIN incorrecto.", en: "Wrong code or PIN." },
    "Code (ex. A1B2C3)": { es: "Código (ej. A1B2C3)", en: "Code (e.g. A1B2C3)" },
    "PIN (4 chiffres)": { es: "PIN (4 dígitos)", en: "PIN (4 digits)" },

    /* en-têtes récurrents */
    "How this lesson works": { es: "Cómo funciona esta lección", fr: "Comment fonctionne cette leçon" },
    "Language": { es: "Idioma", fr: "Langue" },
    "Focus": { es: "Enfoque", fr: "Objectif" },
    "Time": { es: "Duración", fr: "Durée" },
    "Source": { es: "Fuente", fr: "Source" },
    "Level": { es: "Nivel", fr: "Niveau" },

    /* boutons et retours */
    "Check my answers": { es: "Comprobar mis respuestas", fr: "Vérifier mes réponses" },
    "Check": { es: "Comprobar", fr: "Vérifier" },
    "Check the verbs": { es: "Comprobar los verbos", fr: "Vérifier les verbes" },
    "Show answers": { es: "Ver las respuestas", fr: "Voir les réponses" },
    "Show model answer": { es: "Ver respuesta modelo", fr: "Voir la réponse modèle" },
    "Show a model answer": { es: "Ver una respuesta modelo", fr: "Voir une réponse modèle" },
    "Show model answers": { es: "Ver las respuestas modelo", fr: "Voir les réponses modèles" },
    "Model answer": { es: "Respuesta modelo", fr: "Réponse modèle" },
    "Model answers": { es: "Respuestas modelo", fr: "Réponses modèles" },
    "Model:": { es: "Modelo:", fr: "Modèle :" },
    "Given": { es: "Ejemplo dado", fr: "Donné" },
    "correct": { es: "correctas", fr: "bonnes réponses" },
    "Continue →": { es: "Continuar →", fr: "Continuer →" },
    "Restart practice": { es: "Reiniciar la práctica", fr: "Recommencer la pratique" },
    "🔊 Listen": { es: "🔊 Escuchar", fr: "🔊 Écouter" },
    "🔊 Read it aloud": { es: "🔊 Leer en voz alta", fr: "🔊 Lire à voix haute" },
    "Vérifier": { es: "Comprobar", en: "Check" },
    "Voir les réponses": { es: "Ver las respuestas", en: "Show answers" },
    "Recommencer": { es: "Empezar de nuevo", en: "Start over" }
  };
  var originals = new WeakMap();    // nœud -> texte original
  var attrOriginals = new WeakMap();// élément -> {attr: texte original}
  var lang = 'es';
  var busy = false;
  var observer = null;

  try {
    var saved = localStorage.getItem(STORE);
    if (saved && LANGS.some(function (l) { return l.code === saved; })) lang = saved;
  } catch (e) { /* localStorage bloqué : on garde l'espagnol */ }

  function entryFor(key) {
    var e = DICT[key];
    if (!e) return null;
    var v = e[lang];
    return (typeof v === 'string' && v.length) ? v : null;
  }

  /* ---------- nœuds de texte ---------- */
  function translateTextNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'OPTION') {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest && p.closest('[data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.trim()
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = originals.has(node) ? originals.get(node) : raw.trim();
      var target = entryFor(key);
      if (target === null) {
        if (originals.has(node) && raw.trim() !== key) {
          // retour à la langue d'origine
          node.nodeValue = raw.replace(raw.trim(), key);
        }
        continue;
      }
      if (raw.trim() === target) continue;
      if (!originals.has(node)) originals.set(node, raw.trim());
      node.nodeValue = raw.replace(raw.trim(), target);
    }
  }

  /* ---------- attributs (placeholder, title, aria-label) ---------- */
  var ATTRS = ['placeholder', 'title', 'aria-label'];
  function translateAttributes(root) {
    var els = root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label]') : [];
    Array.prototype.forEach.call(els, function (el) {
      var store = attrOriginals.get(el) || {};
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var cur = el.getAttribute(a);
        var key = Object.prototype.hasOwnProperty.call(store, a) ? store[a] : cur;
        var target = entryFor(key);
        if (target === null) {
          if (Object.prototype.hasOwnProperty.call(store, a) && cur !== key) el.setAttribute(a, key);
          return;
        }
        if (cur === target) return;
        store[a] = key;
        el.setAttribute(a, target);
      });
      attrOriginals.set(el, store);
    });
  }

  function apply() {
    if (!document.body) return;
    busy = true;
    try {
      translateTextNodes(document.body);
      translateAttributes(document.body);
      document.documentElement.setAttribute('lang', lang);
      updateSwitch();
    } finally {
      busy = false;
    }
  }

  var pending = null;
  function scheduleApply() {
    if (pending) return;
    pending = setTimeout(function () { pending = null; apply(); }, 40);
  }

  function startObserver() {
    if (observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (records) {
      if (busy) return;
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes && records[i].addedNodes.length) { scheduleApply(); return; }
        if (records[i].type === 'characterData') { scheduleApply(); return; }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ---------- le bouton en haut à droite ---------- */
  var box = null;
  function buildSwitch() {
    if (box || !document.body) return;

    var css = document.createElement('style');
    css.textContent =
      '.i18n-switch{position:fixed;top:12px;right:12px;z-index:2147483000;display:flex;gap:2px;' +
      'padding:3px;border-radius:999px;background:rgba(255,255,255,.92);' +
      'border:1px solid rgba(0,0,0,.12);box-shadow:0 2px 10px rgba(16,24,40,.16);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'backdrop-filter:saturate(160%) blur(6px);-webkit-backdrop-filter:saturate(160%) blur(6px)}' +
      '.i18n-switch .i18n-globe{display:grid;place-items:center;width:26px;height:26px;' +
      'font-size:14px;line-height:1;opacity:.75;user-select:none}' +
      '.i18n-switch button{border:none;background:transparent;color:#1a1a2e;cursor:pointer;' +
      'font:700 11.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'letter-spacing:.04em;padding:7px 9px;border-radius:999px;transition:background .15s ease,color .15s ease}' +
      '.i18n-switch button:hover{background:rgba(0,35,149,.10);color:#002395}' +
      '.i18n-switch button[aria-pressed="true"]{background:#002395;color:#fff}' +
      '.i18n-switch button:focus-visible{outline:2px solid #ED2939;outline-offset:2px}' +
      '@media (prefers-color-scheme:dark){' +
      '.i18n-switch{background:rgba(27,30,43,.92);border-color:rgba(255,255,255,.16);' +
      'box-shadow:0 2px 10px rgba(0,0,0,.5)}' +
      '.i18n-switch button{color:#f1f2f6}' +
      '.i18n-switch button:hover{background:rgba(157,178,255,.18);color:#9db2ff}' +
      '.i18n-switch button[aria-pressed="true"]{background:#5b7cff;color:#fff}}' +
      '@media (max-width:560px){.i18n-switch{top:8px;right:8px}' +
      '.i18n-switch button{padding:6px 7px;font-size:11px}' +
      '.i18n-switch .i18n-globe{width:22px;height:22px;font-size:13px}}' +
      '@media print{.i18n-switch{display:none}}' +
      /* reste visible au-dessus du portail d'accès des activités */
      'html:not(.site-gate-unlocked) body > #i18n-switch#i18n-switch{display:flex!important}';
    document.head.appendChild(css);

    box = document.createElement('div');
    box.className = 'i18n-switch';
    box.id = 'i18n-switch';
    box.setAttribute('data-i18n-skip', '');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Idioma / Language / Langue');

    var globe = document.createElement('span');
    globe.className = 'i18n-globe';
    globe.textContent = '🌐';
    globe.setAttribute('aria-hidden', 'true');
    box.appendChild(globe);

    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = l.label;
      b.title = l.name;
      b.setAttribute('data-lang', l.code);
      b.addEventListener('click', function () { setLang(l.code); });
      box.appendChild(b);
    });

    document.body.appendChild(box);
    updateSwitch();
  }

  function updateSwitch() {
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
  }

  function setLang(code) {
    if (!LANGS.some(function (l) { return l.code === code; })) return;
    lang = code;
    try { localStorage.setItem(STORE, code); } catch (e) { /* ignore */ }
    apply();
  }

  /* ---------- API ---------- */
  var I18N = {
    add: function (entries) {
      if (!entries) return I18N;
      Object.keys(entries).forEach(function (k) {
        var v = entries[k];
        if (!v) return;
        DICT[k] = { es: v.es, fr: v.fr, en: (typeof v.en === 'string' ? v.en : k) };
      });
      if (document.body) scheduleApply();
      return I18N;
    },
    set: setLang,
    get: function () { return lang; },
    refresh: apply
  };
  window.I18N = I18N;

  I18N.add(BASE);

  function boot() {
    buildSwitch();
    apply();
    startObserver();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
