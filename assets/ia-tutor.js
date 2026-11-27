/* Asistente de dudas en todas las páginas del sitio.
   Un solo <script> por lección: pinta un botón flotante y un panel de chat, y manda la
   pregunta al Worker del sitio (ia-proxy/), que responde con Claude apoyándose en el texto
   de las lecciones. La clave de la API vive en el Worker, nunca aquí.

   El candado del sitio lo oculta solo: la regla es
   html:not(.site-gate-unlocked) body > *:not(#site-gate-overlay){display:none!important}
   y este widget es un hijo directo de <body>. */
(function () {
  "use strict";
  var ENDPOINT = "https://french-ia.karlauriostegui-ua.workers.dev";
  var ASSETS = (function () {
    var me = document.currentScript;
    return (me && me.src ? me.src : "").replace(/[?#].*$/, "").replace(/[^\/]*$/, "");
  })();
  var STORE = "ia-tutor-chat";
  var MAX_TURNS = 12;          // lo que se recuerda en esta pestaña
  var SEND_TURNS = 6;          // lo que viaja al Worker

  var T = {
    es: { open: "Pregúntale a la IA", title: "Asistente del curso", close: "Cerrar",
          ph: "Escribe tu duda…", send: "Enviar", clear: "Borrar", clearLong: "Borrar la conversación",
          hello: "Pregúntame lo que quieras sobre esta lección o sobre el francés en general.",
          chips: ["Explícame esta lección", "¿Por qué se dice así?", "Dame otro ejemplo"],
          thinking: "Pensando…", listen: "Escuchar", stop: "Parar",
          err_rate: "Has preguntado muy rápido. Espera un minuto y vuelve a intentarlo.",
          err_net: "No hay conexión con el asistente. Revisa tu internet.",
          err_ref: "Solo puedo ayudarte con el curso de francés.",
          err_srv: "El asistente no está disponible ahora mismo. Inténtalo más tarde.",
          note: "La IA puede equivocarse. Si algo no cuadra con la lección, hazle caso a la lección." },
    en: { open: "Ask the AI", title: "Course assistant", close: "Close",
          ph: "Type your question…", send: "Send", clear: "Clear", clearLong: "Clear the conversation",
          hello: "Ask me anything about this lesson, or about French in general.",
          chips: ["Explain this lesson", "Why is it said that way?", "Give me another example"],
          thinking: "Thinking…", listen: "Listen", stop: "Stop",
          err_rate: "That was a lot of questions at once. Wait a minute and try again.",
          err_net: "Can't reach the assistant. Check your connection.",
          err_ref: "I can only help with the French course.",
          err_srv: "The assistant is unavailable right now. Try again later.",
          note: "The AI can be wrong. If something clashes with the lesson, trust the lesson." },
    fr: { open: "Pose ta question", title: "Assistant du cours", close: "Fermer",
          ph: "Écris ta question…", send: "Envoyer", clear: "Effacer", clearLong: "Effacer la conversation",
          hello: "Demande-moi ce que tu veux sur cette leçon, ou sur le français en général.",
          chips: ["Explique-moi cette leçon", "Pourquoi on dit comme ça ?", "Donne-moi un autre exemple"],
          thinking: "Je réfléchis…", listen: "Écouter", stop: "Arrêter",
          err_rate: "Trop de questions d'un coup. Attends une minute et réessaie.",
          err_net: "Pas de connexion avec l'assistant. Vérifie ton réseau.",
          err_ref: "Je n'aide que sur le cours de français.",
          err_srv: "L'assistant n'est pas disponible pour le moment. Réessaie plus tard.",
          note: "L'IA peut se tromper. Si quelque chose contredit la leçon, fais confiance à la leçon." }
  };

  function lang() {
    try { if (window.I18N && window.I18N.get) return T[window.I18N.get()] ? window.I18N.get() : "es"; } catch (e) {}
    try { var s = localStorage.getItem("fr-course-lang"); if (T[s]) return s; } catch (e) {}
    return "es";
  }
  function t() { return T[lang()]; }

  // ---------- texto del modelo -> HTML, sin confiar en nada ----------
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function inline(s) {
    return esc(s)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
               '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
               '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  }
  function render(text) {
    var out = "", list = null;
    String(text).split("\n").forEach(function (line) {
      var li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (li) {
        if (!list) { list = 1; out += "<ul>"; }
        out += "<li>" + inline(li[1]) + "</li>";
      } else {
        if (list) { out += "</ul>"; list = null; }
        if (line.trim()) out += "<p>" + inline(line) + "</p>";
      }
    });
    if (list) out += "</ul>";
    return out || "<p></p>";
  }

  // ---------- estado ----------
  var turns = [];
  try { turns = JSON.parse(sessionStorage.getItem(STORE) || "[]") || []; } catch (e) { turns = []; }
  if (!Array.isArray(turns)) turns = [];
  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-MAX_TURNS))); } catch (e) {}
  }

  var root, panel, log, input, btn, sendBtn, face, abort = null, busy = false;
  var av = null, audio = null, speaking = null, noVoice = false;

  function dropSpeakButtons() {
    [].forEach.call(root.querySelectorAll(".iat-speak"), function (b) { b.remove(); });
  }

  // El retrato parlante vive en assets/avatar.js; si la página ya lo cargó, se reutiliza.
  function withAvatar(cb) {
    if (window.Avatar) return cb();
    if (!ASSETS) return;
    var id = "iat-avatar-js", prev = document.getElementById(id);
    if (prev) { prev.addEventListener("load", cb); return; }
    var sc = document.createElement("script");
    sc.id = id; sc.src = ASSETS + "avatar.js";
    sc.addEventListener("load", function () { if (window.Avatar) cb(); });
    document.head.appendChild(sc);
  }

  function mood(name, ms) { try { if (av) av.state(name || null, ms); } catch (e) {} }

  function hush() {
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    try { if (av) av.attach(null); } catch (e) {}
    if (speaking) { speaking.classList.remove("on"); speaking.textContent = t().listen; speaking = null; }
    mood(null);
  }

  // Habla una respuesta con la voz del sitio (Worker -> Azure). Mientras suena, el retrato
  // mueve los labios con el nivel real del audio.
  function speak(text, button) {
    if (speaking === button) { hush(); return; }
    hush();
    speaking = button;
    button.classList.add("on");
    button.textContent = t().stop;
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "voice", text: text, lang: lang() })
    }).then(function (r) {
      if (r.status === 503) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (d.code === "no_voice") { noVoice = true; dropSpeakButtons(); }
          throw new Error("voice");
        });
      }
      if (!r.ok) throw new Error("voice");
      return r.blob();
    }).then(function (b) {
      if (speaking !== button) return;
      var url = URL.createObjectURL(b);
      audio = new Audio(url);
      audio.addEventListener("ended", hush);
      audio.addEventListener("error", hush);
      audio.addEventListener("ended", function () { URL.revokeObjectURL(url); });
      try { if (av) av.attach(audio); } catch (e) {}
      var p = audio.play();
      if (p && p.catch) p.catch(hush);
    }).catch(function () {
      if (speaking === button) { button.classList.remove("on"); button.textContent = t().listen; speaking = null; }
    });
  }

  function addSpeak(bubbleEl, text) {
    if (noVoice) return null;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "iat-speak";
    b.textContent = t().listen;
    b.addEventListener("click", function () { speak(text, b); });
    bubbleEl.appendChild(b);
    return b;
  }

  function pageTitle() {
    var h = document.querySelector("h1");
    var s = (h && h.textContent || document.title || "").replace(/\s+/g, " ").trim();
    return s.replace(/\s*[—|·-]\s*(Fran[cç]ais|Cours).*$/i, "").slice(0, 180);
  }

  function bubble(role, html, cls) {
    var d = document.createElement("div");
    d.className = "iat-msg iat-" + role + (cls ? " " + cls : "");
    d.innerHTML = html;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }

  function paint() {
    log.innerHTML = "";
    if (!turns.length) {
      var w = bubble("bot", "<p>" + esc(t().hello) + "</p>");
      var chips = document.createElement("div");
      chips.className = "iat-chips";
      t().chips.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = c;
        b.addEventListener("click", function () { ask(c); });
        chips.appendChild(b);
      });
      w.appendChild(chips);
      return;
    }
    turns.forEach(function (m) {
      var el = bubble(m.role === "assistant" ? "bot" : "me",
                      m.role === "assistant" ? render(m.text) : "<p>" + esc(m.text) + "</p>");
      if (m.role === "assistant") addSpeak(el, m.text);
    });
  }

  function errText(code) {
    var x = t();
    if (code === "rate_limited") return x.err_rate;
    if (code === "network") return x.err_net;
    if (code === "refused") return x.err_ref;
    return x.err_srv;
  }

  function ask(question) {
    question = String(question || "").trim();
    if (!question || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    if (!turns.length) log.innerHTML = "";
    turns.push({ role: "user", text: question });
    save();
    bubble("me", "<p>" + esc(question) + "</p>");
    var out = bubble("bot", '<p class="iat-wait">' + esc(t().thinking) + "</p>");
    hush();
    mood("pense");

    abort = new AbortController();
    var answer = "", failed = null;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abort.signal,
      body: JSON.stringify({
        mode: "chat",
        question: question,
        lang: lang(),
        page: { url: location.href, title: pageTitle() },
        history: turns.slice(0, -1).slice(-SEND_TURNS)
      })
    }).then(function (r) {
      if (!r.ok || !r.body) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          throw d.code || (r.status === 429 ? "rate_limited" : "server_error");
        });
      }
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
      return (function pump() {
        return reader.read().then(function (res) {
          buf += dec.decode(res.value || new Uint8Array(), { stream: !res.done });
          var parts = buf.split("\n\n");
          buf = parts.pop();
          parts.forEach(function (chunk) {
            var line = chunk.replace(/^data:\s*/, "");
            if (!line) return;
            var d;
            try { d = JSON.parse(line); } catch (e) { return; }
            if (d.code) { failed = d.code; return; }
            if (typeof d.t === "string") {
              answer += d.t;
              out.innerHTML = render(answer);
              log.scrollTop = log.scrollHeight;
            }
          });
          if (!res.done) return pump();
        });
      })();
    }).then(function () {
      if (failed && !answer) { out.innerHTML = '<p class="iat-err">' + esc(errText(failed)) + "</p>"; }
      else if (answer) { turns.push({ role: "assistant", text: answer }); save(); addSpeak(out, answer); }
      else { out.innerHTML = '<p class="iat-err">' + esc(errText("server_error")) + "</p>"; }
    }).catch(function (err) {
      if (err && err.name === "AbortError") { out.remove(); return; }
      out.innerHTML = '<p class="iat-err">' +
        esc(errText(typeof err === "string" ? err : "network")) + "</p>";
    }).then(function () {
      busy = false; sendBtn.disabled = false; abort = null;
      mood(null);
      log.scrollTop = log.scrollHeight;
    });
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    setTimeout(function () { input.focus(); }, 30);
    log.scrollTop = log.scrollHeight;
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    hush();
    if (abort) { abort.abort(); abort = null; busy = false; sendBtn.disabled = false; }
  }

  function build() {
    root = document.createElement("div");
    root.className = "iat-root";
    root.innerHTML =
      '<button class="iat-btn" type="button" aria-expanded="false">' +
        '<span class="iat-spark" aria-hidden="true">✨</span><span class="iat-btn-txt"></span>' +
      '</button>' +
      '<section class="iat-panel" hidden>' +
        '<header class="iat-head"><span class="iat-face"></span><b class="iat-title"></b>' +
          '<button class="iat-clear" type="button"></button>' +
          '<button class="iat-x" type="button" aria-label="">✕</button></header>' +
        '<div class="iat-log" role="log" aria-live="polite"></div>' +
        '<form class="iat-form"><textarea class="iat-in" rows="1"></textarea>' +
          '<button class="iat-send" type="submit"></button></form>' +
        '<p class="iat-note"></p>' +
      '</section>';

    face = root.querySelector(".iat-face");
    btn = root.querySelector(".iat-btn");
    panel = root.querySelector(".iat-panel");
    log = root.querySelector(".iat-log");
    input = root.querySelector(".iat-in");
    sendBtn = root.querySelector(".iat-send");

    btn.addEventListener("click", function () { panel.hidden ? open() : close(); });
    root.querySelector(".iat-x").addEventListener("click", close);
    root.querySelector(".iat-clear").addEventListener("click", function () {
      turns = []; save(); paint(); input.focus();
    });
    root.querySelector(".iat-form").addEventListener("submit", function (e) {
      e.preventDefault(); ask(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) close();
    });

    words();
    document.body.appendChild(root);
    paint();
    withAvatar(function () {
      if (av || !face) return;
      try { av = window.Avatar.mount(face, { alt: "Karla", className: "iat-av" }); }
      catch (e) { av = null; }
    });
  }

  function words() {
    var x = t();
    root.querySelector(".iat-btn-txt").textContent = x.open;
    btn.setAttribute("aria-label", x.open);
    root.querySelector(".iat-title").textContent = x.title;
    root.querySelector(".iat-x").setAttribute("aria-label", x.close);
    root.querySelector(".iat-clear").textContent = x.clear;
    root.querySelector(".iat-clear").title = x.clearLong;
    root.querySelector(".iat-clear").setAttribute("aria-label", x.clearLong);
    input.placeholder = x.ph;
    sendBtn.textContent = x.send;
    root.querySelector(".iat-note").textContent = x.note;
  }

  var CSS =
  ".iat-root{position:fixed;right:14px;bottom:14px;z-index:2147482000;font:inherit;" +
    "font-size:15px;line-height:1.5;color:#393B66}" +
  ".iat-btn{display:flex;align-items:center;gap:7px;padding:11px 17px;border:none;cursor:pointer;" +
    "border-radius:999px;background:#378EF6;color:#fff;font:inherit;font-size:.95rem;font-weight:600;" +
    "box-shadow:0 6px 20px rgba(55,142,246,.38)}" +
  ".iat-btn:hover{filter:brightness(1.07)}" +
  ".iat-btn:focus-visible{outline:2px solid #393B66;outline-offset:2px}" +
  ".iat-spark{font-size:1.05em}" +
  ".iat-panel{position:absolute;right:0;bottom:0;width:min(380px,calc(100vw - 28px));" +
    "max-height:min(72vh,560px);display:flex;flex-direction:column;overflow:hidden;" +
    "border-radius:18px;background:#fff;border:1px solid rgba(57,59,102,.14);" +
    "box-shadow:0 18px 50px rgba(30,32,70,.26)}" +
  ".iat-head{display:flex;align-items:center;gap:8px;padding:12px 14px;" +
    "border-bottom:1px solid rgba(57,59,102,.1)}" +
  ".iat-face{flex:none;width:42px;height:42px;border-radius:50%;overflow:hidden;background:rgba(55,142,246,.12);position:relative}" +
  ".iat-face .av,.iat-face img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}" +
  ".iat-speak{display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:4px 10px;border:1px solid rgba(55,142,246,.45);border-radius:999px;background:transparent;color:#1F6FD0;cursor:pointer;font:inherit;font-size:.78rem}" +
  ".iat-speak::before{content:\"\\1F509\";font-size:.95em}" +
  ".iat-speak:hover{background:rgba(55,142,246,.12)}" +
  ".iat-speak.on{background:#378EF6;border-color:#378EF6;color:#fff}" +
  ".iat-head b{flex:1;min-width:0;font-size:.97rem;white-space:nowrap;overflow:hidden;" +
    "text-overflow:ellipsis}" +
  ".iat-clear,.iat-x{flex:none;border:none;background:transparent;cursor:pointer;color:#6B6E99;" +
    "font:inherit;font-size:.8rem;padding:4px 6px;border-radius:8px}" +
  ".iat-clear:hover,.iat-x:hover{background:rgba(55,142,246,.12);color:#378EF6}" +
  ".iat-x{font-size:.95rem;line-height:1}" +
  ".iat-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;" +
    "display:flex;flex-direction:column;gap:10px}" +
  ".iat-msg{max-width:92%;padding:9px 12px;border-radius:14px;font-size:.93rem}" +
  ".iat-msg p{margin:0 0 .5em}.iat-msg p:last-child{margin:0}" +
  ".iat-msg ul{margin:.3em 0;padding-left:1.15em}.iat-msg li{margin:.15em 0}" +
  ".iat-msg code{background:rgba(57,59,102,.09);padding:.1em .34em;border-radius:5px;" +
    "font-size:.92em}" +
  ".iat-msg a{color:#1F6FD0}" +
  ".iat-me{align-self:flex-end;background:#378EF6;color:#fff}" +
  ".iat-me a,.iat-me code{color:#fff}" +
  ".iat-bot{align-self:flex-start;background:rgba(55,142,246,.09)}" +
  ".iat-wait{opacity:.6;font-style:italic}" +
  ".iat-err{color:#C0392B;margin:0}" +
  ".iat-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}" +
  ".iat-chips button{border:1px dashed #378EF6;background:transparent;color:#1F6FD0;cursor:pointer;" +
    "font:inherit;font-size:.82rem;padding:5px 10px;border-radius:999px;text-align:left}" +
  ".iat-chips button:hover{background:rgba(55,142,246,.12)}" +
  ".iat-form{display:flex;gap:8px;padding:10px 12px 0}" +
  ".iat-in{flex:1;resize:none;border:1px solid rgba(57,59,102,.2);border-radius:12px;" +
    "padding:9px 11px;font:inherit;font-size:.93rem;color:inherit;background:#fff;" +
    "max-height:110px;overflow-y:auto}" +
  ".iat-in:focus{outline:none;border-color:#378EF6}" +
  ".iat-send{flex:none;border:none;border-radius:12px;background:#378EF6;color:#fff;cursor:pointer;" +
    "font:inherit;font-size:.9rem;font-weight:600;padding:0 15px}" +
  ".iat-send:disabled{opacity:.5;cursor:default}" +
  ".iat-note{margin:8px 12px 11px;font-size:.73rem;line-height:1.45;color:#6B6E99}" +
  "@media (prefers-color-scheme:dark){" +
    ".iat-root{color:#F4F6FF}" +
    ".iat-panel{background:#262845;border-color:rgba(255,255,255,.14)}" +
    ".iat-head{border-color:rgba(255,255,255,.1)}" +
    ".iat-clear,.iat-x,.iat-note{color:#A6A9CE}" +
    ".iat-clear:hover,.iat-x:hover{background:rgba(125,182,250,.18);color:#7DB6FA}" +
    ".iat-bot{background:rgba(125,182,250,.13)}" +
    ".iat-msg code{background:rgba(255,255,255,.12)}" +
    ".iat-msg a{color:#7DB6FA}" +
    ".iat-chips button{border-color:#7DB6FA;color:#7DB6FA}" +
    ".iat-speak{border-color:rgba(125,182,250,.5);color:#7DB6FA}" +
    ".iat-speak:hover{background:rgba(125,182,250,.16)}" +
    ".iat-speak.on{background:#378EF6;border-color:#378EF6;color:#fff}" +
    ".iat-in{background:#1F2140;border-color:rgba(255,255,255,.18);color:#F4F6FF}" +
    ".iat-err{color:#FF8E80}}" +
  // en móvil el selector de idioma ocupa la esquina de abajo a la derecha
  "@media (max-width:560px){" +
    ".iat-root{right:auto;left:10px;bottom:10px}" +
    ".iat-btn{padding:10px 14px;font-size:.88rem}" +
    ".iat-panel{right:auto;left:0;width:calc(100vw - 20px);max-height:74vh}" +
    // el selector de idioma flota encima, abajo a la derecha: que la nota no pase por debajo
    ".iat-note{margin-right:100px}}";

  function boot() {
    if (document.getElementById("iat-css")) return;
    var st = document.createElement("style");
    st.id = "iat-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    build();
    // el selector de idioma cambia la lengua en caliente
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".i18n-switch")) {
        setTimeout(function () { words(); if (!turns.length) paint(); }, 60);
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
