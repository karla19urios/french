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
    es: { open: "Pregúntame", title: "Karla · asistente", close: "Cerrar",
          ph: "Escribe tu duda…", send: "Enviar", clear: "Borrar", clearLong: "Borrar la conversación",
          hello: "Pregúntame lo que quieras sobre esta lección o sobre el francés en general.",
          chips: ["Explícame esta lección", "¿Por qué se dice así?", "Dame otro ejemplo"],
          thinking: "Pensando…", listen: "Escuchar", stop: "Parar",
          big: "Agrandar", small: "Reducir", mic: "Hablar", micStop: "Listo",
          micNo: "Tu navegador no deja usar el micrófono.", micOn: "Te escucho…",
          err_rate: "Has preguntado muy rápido. Espera un minuto y vuelve a intentarlo.",
          err_net: "No hay conexión con el asistente. Revisa tu internet.",
          err_ref: "Solo puedo ayudarte con el curso de francés.",
          err_srv: "El asistente no está disponible ahora mismo. Inténtalo más tarde.",
          note: "La IA puede equivocarse. Si algo no cuadra con la lección, hazle caso a la lección." },
    en: { open: "Ask me", title: "Karla · assistant", close: "Close",
          ph: "Type your question…", send: "Send", clear: "Clear", clearLong: "Clear the conversation",
          hello: "Ask me anything about this lesson, or about French in general.",
          chips: ["Explain this lesson", "Why is it said that way?", "Give me another example"],
          thinking: "Thinking…", listen: "Listen", stop: "Stop",
          big: "Enlarge", small: "Shrink", mic: "Speak", micStop: "Done",
          micNo: "Your browser won't let me use the microphone.", micOn: "I'm listening…",
          err_rate: "That was a lot of questions at once. Wait a minute and try again.",
          err_net: "Can't reach the assistant. Check your connection.",
          err_ref: "I can only help with the French course.",
          err_srv: "The assistant is unavailable right now. Try again later.",
          note: "The AI can be wrong. If something clashes with the lesson, trust the lesson." },
    fr: { open: "Demande-moi", title: "Karla · assistante", close: "Fermer",
          ph: "Écris ta question…", send: "Envoyer", clear: "Effacer", clearLong: "Effacer la conversation",
          hello: "Demande-moi ce que tu veux sur cette leçon, ou sur le français en général.",
          chips: ["Explique-moi cette leçon", "Pourquoi on dit comme ça ?", "Donne-moi un autre exemple"],
          thinking: "Je réfléchis…", listen: "Écouter", stop: "Arrêter",
          big: "Agrandir", small: "Réduire", mic: "Parler", micStop: "Fini",
          micNo: "Ton navigateur ne permet pas le micro.", micOn: "Je t'écoute…",
          err_rate: "Trop de questions d'un coup. Attends une minute et réessaie.",
          err_net: "Pas de connexion avec l'assistant. Vérifie ton réseau.",
          err_ref: "Je n'aide que sur le cours de français.",
          err_srv: "L'assistant n'est pas disponible pour le moment. Réessaie plus tard.",
          note: "L'IA peut se tromper. Si quelque chose contredit la leçon, fais confiance à la leçon." },
    de: { open: "Frag mich", title: "Karla · Assistentin", close: "Schließen",
          ph: "Schreib deine Frage…", send: "Senden", clear: "Löschen", clearLong: "Das Gespräch löschen",
          hello: "Frag mich alles zu dieser Lektion oder zum Französischen allgemein.",
          chips: ["Erklär mir diese Lektion", "Warum sagt man das so?", "Gib mir noch ein Beispiel"],
          thinking: "Ich denke nach…", listen: "Anhören", stop: "Stopp",
          big: "Vergrößern", small: "Verkleinern", mic: "Sprechen", micStop: "Fertig",
          micNo: "Dein Browser lässt das Mikrofon nicht zu.", micOn: "Ich höre zu…",
          err_rate: "Das waren viele Fragen auf einmal. Warte eine Minute und versuch es noch einmal.",
          err_net: "Keine Verbindung zur Assistentin. Prüf dein Internet.",
          err_ref: "Ich kann nur beim Französischkurs helfen.",
          err_srv: "Die Assistentin ist gerade nicht erreichbar. Versuch es später noch einmal.",
          note: "Die KI kann sich irren. Wenn etwas der Lektion widerspricht, gilt die Lektion." },
    zh: { open: "问我", title: "Karla · 助手", close: "关闭",
          ph: "输入你的问题…", send: "发送", clear: "清除", clearLong: "清除对话",
          hello: "关于这节课，或者关于法语的任何问题，都可以问我。",
          chips: ["讲解这节课", "为什么这样说？", "再给我一个例子"],
          thinking: "思考中…", listen: "朗读", stop: "停止",
          big: "放大", small: "缩小", mic: "说话", micStop: "完成",
          micNo: "你的浏览器不允许使用麦克风。", micOn: "我在听…",
          err_rate: "一下子问得太多了。请等一分钟再试。",
          err_net: "无法连接助手。请检查网络连接。",
          err_ref: "我只能帮你学法语课程。",
          err_srv: "助手暂时无法使用，请稍后再试。",
          note: "AI 可能会出错。如果和课文有出入，以课文为准。" },
    ko: { open: "물어보세요", title: "Karla · 어시스턴트", close: "닫기",
          ph: "질문을 입력하세요…", send: "보내기", clear: "지우기", clearLong: "대화 지우기",
          hello: "이 수업에 대해서도, 프랑스어 전반에 대해서도 무엇이든 물어보세요.",
          chips: ["이 수업을 설명해 주세요", "왜 그렇게 말하나요?", "예문을 하나 더 주세요"],
          thinking: "생각 중…", listen: "듣기", stop: "정지",
          big: "크게", small: "작게", mic: "말하기", micStop: "완료",
          micNo: "브라우저에서 마이크를 사용할 수 없습니다.", micOn: "듣고 있어요…",
          err_rate: "질문이 너무 빨랐어요. 잠시 기다렸다가 다시 시도해 주세요.",
          err_net: "어시스턴트에 연결할 수 없습니다. 인터넷을 확인해 주세요.",
          err_ref: "프랑스어 수업에 대해서만 도와드릴 수 있어요.",
          err_srv: "지금은 어시스턴트를 사용할 수 없습니다. 나중에 다시 시도해 주세요.",
          note: "AI가 틀릴 수 있습니다. 수업 내용과 다르면 수업을 따르세요." }
  };
  // El sitio está en tres idiomas, pero la asistente habla seis: el estudiante elige el suyo
  // dentro del panel y ahí se queda. Sin elegir, sigue al sitio.
  var IDIOMAS = [["es","Español"],["en","English"],["fr","Français"],
                 ["de","Deutsch"],["zh","中文"],["ko","한국어"]];
  var LANG_KEY = "ia-tutor-lang";
  function langElegida() {
    try { var v = localStorage.getItem(LANG_KEY); return T[v] ? v : ""; } catch (e) { return ""; }
  }

  function lang() {
    var mia = langElegida();
    if (mia) return mia;                         // lo que el estudiante eligió en el panel manda
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

  var root, panel, log, input, btn, sendBtn, stageBtn, stagePanel, zoomBtn, micBtn, langSel;
  var abort = null, busy = false, big = false, reco = null, recoOn = false;
  var TAM_KEY = "ia-tutor-tam";                  // 0 pequeño, 1 normal, 2 grande
  var tam = (function () {
    try { var v = parseInt(localStorage.getItem(TAM_KEY), 10); return (v === 0 || v === 2) ? v : 1; }
    catch (e) { return 1; }
  })();
  var av = null, audio = null, speaking = null, noVoice = false;

  function dropSpeakButtons() {
    [].forEach.call(root.querySelectorAll(".iat-speak"), function (b) { b.remove(); });
  }

  // El personaje vive en assets/persona.js y se carga una sola vez por página.
  // Si la red falla se vuelve a intentar: sin esto el hueco se quedaba vacío para siempre.
  function withPersona(cb) {
    if (window.Persona) return cb();
    if (!ASSETS) return;
    var id = "iat-persona-js", prev = document.getElementById(id);
    if (prev) {
      prev.addEventListener("load", function () { if (window.Persona) cb(); });
      return;
    }
    var intentos = 0;
    (function carga() {
      var sc = document.createElement("script");
      sc.id = id; sc.src = ASSETS + "persona.js?v=10";
      sc.addEventListener("load", function () { if (window.Persona) cb(); });
      sc.addEventListener("error", function () {
        sc.remove();
        if (++intentos < 3) setTimeout(carga, 700 * intentos);
      });
      document.head.appendChild(sc);
    })();
  }

  // Su cara tiene que estar en cuanto se pinta el widget, en todas las páginas del sitio
  // y pase lo que pase: persona.js es una segunda ida y vuelta a la red y puede tardar o
  // no llegar nunca. Mientras tanto va una foto suya quieta, en el botón y en el panel,
  // con el mismo encuadre, así que al llegar la de verdad no se mueve nada.
  function fija() {
    if (!ASSETS) return;
    [stageBtn, stagePanel].forEach(function (d) {
      if (d.firstChild) return;
      var i = new Image();
      i.className = "iat-fija"; i.alt = ""; i.decoding = "async";
      i.src = ASSETS + "persona/sourire_s.png";
      d.appendChild(i);
    });
  }
  function quitaFijas() {
    [].forEach.call(root.querySelectorAll(".iat-fija"), function (i) { i.remove(); });
  }

  // Dónde le toca estar ahora mismo: dentro del panel si está abierto, y si no en el
  // botón flotante. Se llama al abrir, al cerrar y en cuanto el retrato llega, porque
  // puede llegar con el panel ya abierto: entonces hay que meterla en el panel, no en
  // el botón, que queda tapado detrás. Era eso lo que dejaba el hueco vacío.
  function coloca() {
    if (!av) return;
    var donde = (panel && !panel.hidden) ? stagePanel : stageBtn;
    if (av.el.parentNode !== donde) donde.appendChild(av.el);
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
    micOff();
    if (micBtn) micBtn.disabled = true;
    mood("pense");

    abort = new AbortController();
    var answer = "", failed = null, malo = false;

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
      if (failed && !answer) { malo = true; out.innerHTML = '<p class="iat-err">' + esc(errText(failed)) + "</p>"; }
      else if (answer) { turns.push({ role: "assistant", text: answer }); save(); addSpeak(out, answer); }
      else { malo = true; out.innerHTML = '<p class="iat-err">' + esc(errText("server_error")) + "</p>"; }
    }).catch(function (err) {
      if (err && err.name === "AbortError") { out.remove(); return; }
      malo = true;
      out.innerHTML = '<p class="iat-err">' +
        esc(errText(typeof err === "string" ? err : "network")) + "</p>";
    }).then(function () {
      busy = false; sendBtn.disabled = false; abort = null;
      mood(malo ? "doute" : null, malo ? 2600 : 0);   // si algo falló, lo dice la cara
      if (micBtn) micBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    });
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    coloca();
    mood("salut", 1600);
    setTimeout(function () { input.focus(); }, 30);
    log.scrollTop = log.scrollHeight;
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    micOff();
    coloca();
    hush();
    if (abort) { abort.abort(); abort = null; busy = false; sendBtn.disabled = false; }
  }


  // ---------- tres tamaños, porque el panel tapa la lección ----------
  // 0 pequeño, 1 normal, 2 grande. El botón baja un paso cada vez y desde el más pequeño
  // vuelve al grande: con un solo botón en la cabecera se llega a los tres.
  function setTam(n) {
    tam = (n + 3) % 3;
    big = tam === 2;
    root.classList.toggle("mini", tam === 0);
    root.classList.toggle("big", big);
    try { localStorage.setItem(TAM_KEY, String(tam)); } catch (e) {}   // que no haya que repetirlo en cada página
    caraZoom();
    try { if (av) av.big(big); } catch (e) {}      // en grande, los archivos de resolución completa
    log.scrollTop = log.scrollHeight;
  }
  function caraZoom() {
    if (!zoomBtn) return;
    var baja = tam > 0;            // en el más pequeño ya no se puede bajar: el clic agranda
    zoomBtn.textContent = baja ? "\u2922" : "\u2921";
    zoomBtn.setAttribute("aria-label", baja ? t().small : t().big);
    zoomBtn.title = zoomBtn.getAttribute("aria-label");
  }

  // ---------- que el estudiante le hable ----------
  var RECO_LANG = { es: "es-MX", en: "en-US", fr: "fr-FR",
                    de: "de-DE", zh: "zh-CN", ko: "ko-KR" };
  function setupMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !micBtn) return;                    // Firefox no lo tiene: el botón no aparece
    micBtn.hidden = false;
    reco = new SR();
    reco.continuous = false;
    reco.interimResults = true;
    reco.addEventListener("result", function (e) {
      var txt = "";
      for (var i = e.resultIndex; i < e.results.length; i++) txt += e.results[i][0].transcript;
      input.value = txt;
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });
    reco.addEventListener("error", function () { micOff(); });
    reco.addEventListener("end", function () {
      var txt = input.value.trim();
      micOff();
      if (txt) ask(txt);                           // lo dicho se manda solo
    });
  }
  function micOn() {
    if (!reco || busy) return;
    hush();
    try { reco.lang = RECO_LANG[lang()] || RECO_LANG.es; reco.start(); }
    catch (e) { return; }
    recoOn = true;
    mood("ecoute");
    micBtn.classList.add("on");
    micBtn.setAttribute("aria-label", t().micStop);
    input.placeholder = t().micOn;
  }
  function micOff() {
    if (!reco) return;
    if (recoOn) { try { reco.abort(); } catch (e) {} mood(null); }
    recoOn = false;
    micBtn.classList.remove("on");
    micBtn.setAttribute("aria-label", t().mic);
    input.placeholder = t().ph;
  }

  function build() {
    root = document.createElement("div");
    root.className = "iat-root";
    root.innerHTML =
      '<button class="iat-btn" type="button" aria-expanded="false">' +
        '<span class="iat-stage iat-stage-btn"></span>' +
        '<span class="iat-btn-txt"></span>' +
      '</button>' +
      '<section class="iat-panel" hidden>' +
        '<header class="iat-head"><b class="iat-title"></b>' +
          '<select class="iat-lang" aria-label="idioma"></select>' +
          '<button class="iat-zoom" type="button" aria-label=""></button>' +
          '<button class="iat-clear" type="button"></button>' +
          '<button class="iat-x" type="button" aria-label="">✕</button></header>' +
        '<div class="iat-stage iat-stage-panel"></div>' +
        '<div class="iat-log" role="log" aria-live="polite"></div>' +
        '<form class="iat-form">' +
          '<button class="iat-mic" type="button" aria-label="" hidden></button>' +
          '<textarea class="iat-in" rows="1"></textarea>' +
          '<button class="iat-send" type="submit"></button></form>' +
        '<p class="iat-note"></p>' +
      '</section>';

    stageBtn = root.querySelector(".iat-stage-btn");
    stagePanel = root.querySelector(".iat-stage-panel");
    btn = root.querySelector(".iat-btn");
    panel = root.querySelector(".iat-panel");
    log = root.querySelector(".iat-log");
    input = root.querySelector(".iat-in");
    sendBtn = root.querySelector(".iat-send");

    zoomBtn = root.querySelector(".iat-zoom");
    micBtn = root.querySelector(".iat-mic");
    langSel = root.querySelector(".iat-lang");
    langSel.innerHTML = IDIOMAS.map(function (p) {
      return '<option value="' + p[0] + '">' + p[1] + "</option>";
    }).join("");
    langSel.value = lang();
    langSel.addEventListener("change", function () {
      try { localStorage.setItem(LANG_KEY, langSel.value); } catch (e) {}
      hush();
      words();
      if (!turns.length) paint();          // el saludo y los atajos, en el idioma nuevo
    });
    btn.addEventListener("click", function () { panel.hidden ? open() : close(); });
    zoomBtn.addEventListener("click", function () { setTam(tam > 0 ? tam - 1 : 2); });
    micBtn.addEventListener("click", function () { recoOn ? micOff() : micOn(); });
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
    setTam(tam);                   // el tamaño que eligió la última vez
    fija();                        // su cara ya está, antes de que llegue persona.js
    document.body.appendChild(root);
    paint();
    withPersona(function () {
      if (av) return;
      if (window.Persona.ratio) {
        stageBtn.style.aspectRatio = window.Persona.ratio;
        stagePanel.style.aspectRatio = window.Persona.ratio;
      }
      try { av = window.Persona.mount(stageBtn, { alt: "Karla" }); }
      catch (e) { av = null; }
      if (av) quitaFijas();         // ya está la de verdad, que respira y habla
      coloca();                     // puede haber abierto el panel mientras ella llegaba
    });
    setupMic();
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
    caraZoom();
    if (micBtn) micBtn.setAttribute("aria-label", recoOn ? x.micStop : x.mic);
    if (langSel && langSel.value !== lang()) langSel.value = lang();
  }

  var CSS =
  ".iat-root{position:fixed;right:14px;bottom:14px;z-index:2147482000;font:inherit;" +
    "font-size:.9375rem;line-height:1.5;color:#393B66}" +
  ".iat-btn{display:block;position:relative;padding:0;border:none;background:none;cursor:pointer;" +
    "font:inherit;line-height:0}" +
  ".iat-btn:focus-visible{outline:2px solid #378EF6;outline-offset:6px;border-radius:14px}" +
  // La proporción tiene que estar en el hueco, no sólo en el retrato: el retrato saca su
  // altura de su aspect-ratio, y la altura automática de un elemento flexible no resuelve
  // la de un hijo así, de modo que el hueco se quedaba en cero y ella acababa pintada
  // por debajo de la conversación. persona.js manda: abajo se recoge su valor.
  ".iat-stage{display:block;width:112px;aspect-ratio:402/528;margin:0 auto;" +
    "filter:drop-shadow(0 10px 18px rgba(25,28,60,.3))}" +
  ".iat-btn:hover .iat-stage{filter:drop-shadow(0 12px 22px rgba(55,142,246,.45))}" +
  ".iat-btn-txt{display:block;margin-top:-10px;padding:6px 13px;border-radius:999px;" +
    "background:#378EF6;color:#fff;font-size:.82rem;font-weight:600;line-height:1.3;" +
    "box-shadow:0 5px 14px rgba(55,142,246,.4);white-space:nowrap}" +
  ".iat-stage-panel{flex:none;width:92px;margin:4px auto -6px}" +
  // si por lo que sea no hay retrato, que no quede un hueco en blanco en el panel
  ".iat-stage-panel:empty{display:none}" +
  ".iat-fija{display:block;width:100%;height:auto;" +
    "filter:drop-shadow(0 10px 18px rgba(25,28,60,.3))}" +
  ".iat-root.big .iat-stage-panel{width:188px;margin:6px auto -4px}" +
  ".iat-root.big .iat-panel{width:min(452px,calc(100vw - 28px));max-height:min(86vh,680px)}" +
  // al agrandarla se sale del cuadro: se planta fuera del panel, a su izquierda, pisando
  // un poco el borde para que se vea delante de la caja y no metida dentro de ella.
  // Hace falta sitio, así que por debajo de 760px se queda dentro, sólo que más grande.
  "@media (min-width:760px){" +
    ".iat-root.big .iat-panel{overflow:visible}" +
    ".iat-root.big .iat-stage-panel{position:absolute;left:-232px;bottom:4px;width:248px;" +
      "margin:0;filter:drop-shadow(0 18px 34px rgba(25,28,60,.36))}}" +
  // el paso pequeño: el panel se quita de en medio sin dejar de ser usable. El título
  // sobra aquí (ella está justo encima), y el selector de idioma empuja al resto a la derecha.
  ".iat-root.mini .iat-panel{width:min(268px,calc(100vw - 28px));max-height:min(58vh,390px)}" +
  ".iat-root.mini .iat-stage-panel{width:54px;margin:2px auto -4px}" +
  ".iat-root.mini .iat-head{padding:7px 9px;gap:5px}" +
  ".iat-root.mini .iat-head b{display:none}" +
  ".iat-root.mini .iat-lang{margin-right:auto;max-width:92px;font-size:.72rem;padding:2px 3px}" +
  ".iat-root.mini .iat-zoom{font-size:.9rem;padding:3px 5px}" +
  ".iat-root.mini .iat-clear{font-size:.72rem;padding:3px 4px}" +
  ".iat-root.mini .iat-x{font-size:.85rem;padding:3px 5px}" +
  ".iat-root.mini .iat-log{padding:10px;gap:8px}" +
  ".iat-root.mini .iat-msg{max-width:96%;padding:7px 10px;font-size:.85rem}" +
  ".iat-root.mini .iat-chips button{font-size:.76rem;padding:4px 9px}" +
  ".iat-root.mini .iat-speak{font-size:.72rem;padding:3px 9px}" +
  ".iat-root.mini .iat-form{padding:8px 10px 0;gap:6px}" +
  ".iat-root.mini .iat-in{padding:7px 9px;font-size:.85rem;max-height:76px}" +
  ".iat-root.mini .iat-send{height:34px;font-size:.82rem;padding:0 12px}" +
  ".iat-root.mini .iat-mic{width:34px;height:34px;font-size:.92rem}" +
  ".iat-root.mini .iat-note{margin:6px 10px 8px;font-size:.66rem}" +
  ".iat-panel{position:absolute;right:0;bottom:0;width:min(406px,calc(100vw - 28px));" +
    "max-height:min(72vh,560px);display:flex;flex-direction:column;overflow:hidden;" +
    "border-radius:18px;background:#fff;border:1px solid rgba(57,59,102,.14);" +
    "box-shadow:0 18px 50px rgba(30,32,70,.26)}" +
  // display:flex en .iat-panel le gana a la regla [hidden]{display:none} del navegador,
  // que pierde por ser suya y no nuestra. En las lecciones no se notaba porque su propio
  // CSS ya trae un [hidden]{display:none}; en las páginas que no lo traen el panel salía
  // abierto de entrada y para siempre, con el hueco de la cara vacío: ella, según el
  // código, estaba en el botón, tapado por detrás del panel.
  ".iat-root [hidden]{display:none!important}" +
  ".iat-head{display:flex;align-items:center;gap:6px;padding:12px 12px;" +
    "border-bottom:1px solid rgba(57,59,102,.1)}" +
  ".iat-lang{flex:none;max-width:98px;border:1px solid rgba(57,59,102,.18);border-radius:9px;" +
    "background:transparent;color:#6B6E99;font:inherit;font-size:.78rem;padding:3px 4px;" +
    "cursor:pointer}" +
  ".iat-lang:focus-visible{outline:2px solid #378EF6;outline-offset:1px}" +
  ".iat-zoom{flex:none;border:none;background:transparent;cursor:pointer;color:#6B6E99;" +
    "font:inherit;font-size:1rem;line-height:1;padding:4px 6px;border-radius:8px}" +
  ".iat-zoom:hover{background:rgba(55,142,246,.12);color:#378EF6}" +
  ".iat-mic{flex:none;width:40px;height:40px;border:1px solid rgba(55,142,246,.45);border-radius:12px;" +
    "background:transparent;color:#1F6FD0;cursor:pointer;font:inherit;font-size:1.05rem}" +
  ".iat-mic::before{content:\"\\1F3A4\"}" +
  ".iat-mic:hover{background:rgba(55,142,246,.12)}" +
  ".iat-mic.on{background:#E8453C;border-color:#E8453C;color:#fff;animation:iat-pulse 1.1s infinite}" +
  ".iat-mic:disabled{opacity:.45;cursor:default}" +
  "@keyframes iat-pulse{50%{box-shadow:0 0 0 7px rgba(232,69,60,.18)}}" +
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
  ".iat-form{display:flex;align-items:flex-end;gap:8px;padding:10px 12px 0}" +
  // min-height:0 a propósito: las lecciones le ponen min-height:90px a todo <textarea>
  // y esta caja salía de tres renglones de alto dentro del panel.
  ".iat-in{flex:1;resize:none;border:1px solid rgba(57,59,102,.2);border-radius:12px;" +
    "padding:9px 11px;font:inherit;font-size:.93rem;color:inherit;background:#fff;" +
    "min-height:0;max-height:110px;overflow-y:auto}" +
  ".iat-in:focus{outline:none;border-color:#378EF6}" +
  ".iat-send{flex:none;height:40px;border:none;border-radius:12px;background:#378EF6;color:#fff;" +
    "cursor:pointer;font:inherit;font-size:.9rem;font-weight:600;padding:0 15px}" +
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
    ".iat-zoom{color:#A6A9CE}" +
    ".iat-lang{color:#A6A9CE;border-color:rgba(255,255,255,.2)}" +
    ".iat-lang option{background:#1F2140;color:#F4F6FF}" +
    ".iat-zoom:hover{background:rgba(125,182,250,.18);color:#7DB6FA}" +
    ".iat-mic{border-color:rgba(125,182,250,.5);color:#7DB6FA}" +
    ".iat-mic:hover{background:rgba(125,182,250,.16)}" +
    ".iat-speak{border-color:rgba(125,182,250,.5);color:#7DB6FA}" +
    ".iat-speak:hover{background:rgba(125,182,250,.16)}" +
    ".iat-speak.on{background:#378EF6;border-color:#378EF6;color:#fff}" +
    ".iat-in{background:#1F2140;border-color:rgba(255,255,255,.18);color:#F4F6FF}" +
    ".iat-err{color:#FF8E80}}" +
  // en móvil el selector de idioma ocupa la esquina de abajo a la derecha
  "@media (max-width:560px){" +
    ".iat-root{right:auto;left:10px;bottom:10px}" +
    ".iat-stage{width:92px}" +
    ".iat-btn-txt{font-size:.76rem;padding:5px 11px}" +
    ".iat-root.big .iat-stage-panel{width:150px}" +
    ".iat-panel{right:auto;left:0;width:calc(100vw - 20px);max-height:74vh}" +
    ".iat-root.mini .iat-panel{width:min(290px,calc(100vw - 20px));max-height:56vh}" +
    // el selector de idioma flota encima, abajo a la derecha: que la nota no pase por debajo
    ".iat-note{margin-right:100px}}" +
    // con las letras del sitio más grandes, el título no cabía junto a los botones
    "@media (max-width:560px){.iat-head{gap:5px;padding:11px 10px}" +
    ".iat-head b{font-size:.85rem}" +
    ".iat-lang{max-width:82px;font-size:.7rem;padding:3px 2px}}";

  // ---------- que reaccione a los ejercicios ----------
  // La señal honesta es el marcador que la propia lección calcula ("7 / 10"), no las
  // clases ok/bad: en B1 la opción correcta se marca "ok" aunque el estudiante haya
  // fallado, y el botón de ver la respuesta las marca todas. El marcador sólo se
  // escribe cuando el estudiante pulsa Vérifier, que es justo el momento de reaccionar.
  var ESPERA_TRAMPA = 700;        // ms tras pulsar "ver respuesta" o "borrar": no cuenta
  var DESCANSO = 1500;            // ms mínimos entre dos reacciones
  var CALMA_INICIAL = 2000;       // al cargar, la lección escribe "0 / 176" en el marcador:
                                  // eso no es un fallo del estudiante, es la página naciendo
  var trampaHasta = 0, ultima = 0, pendiente = 0, despiertaEn = 0;

  function esMarcador(el) {
    for (var n = 0, e = el; e && e.nodeType === 1 && n < 4; e = e.parentElement, n++) {
      var id = e.id || "", cl = typeof e.className === "string" ? e.className : "";
      if (e.id === "sc" || /score|punt/i.test(id + " " + cl)) return e;
    }
    return null;
  }

  // "ver las respuestas" y "borrar" también escriben en el marcador: eso no es un acierto.
  // Ojo con el texto: el botón de corregir de A1.1 se llama "Comprobar mis respuestas",
  // así que primero se reconoce al que corrige y sólo después se busca la trampa.
  var CORRIGE = /v[eé]rifier|comprobar|corregir|corriger|revisar|valider|check my answers/i;
  var TRAMPA = /voir les r[eé]ponses|show answers|ver las respuestas|voir un mod[eè]le|see the answers|afficher|montrer|effacer|recommencer|borrar|limpiar|r[eé]initialiser|soluci[oó]n|solution/i;
  function vigilaTrampas() {
    document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest("button,a,[role=button]");
      if (!b) return;
      var txt = (b.textContent || "").replace(/\s+/g, " ").trim();
      if (b.hasAttribute("data-check") || CORRIGE.test(txt)) return;      // éste sí corrige
      var cl = typeof b.className === "string" ? b.className : "";
      if (b.hasAttribute("data-reveal") || b.hasAttribute("data-reset") ||
          /reveal|reset|solution/i.test(cl) || TRAMPA.test(txt))
        trampaHasta = Date.now() + ESPERA_TRAMPA;
    }, true);
  }

  function reaccion(bons, total, global) {
    if (global) return "surprise";               // la página entera, perfecta
    if (bons === total) return "bravo";
    if (bons * 2 > total) return "rire";
    return "doute";
  }

  // en cuanto el estudiante toca un ejercicio va a pulsar Vérifier enseguida: es el
  // momento de ir bajando las caras de la reacción, para que salgan sin espera
  var precargado = false;
  function precargaCaras() {
    if (precargado || !window.Persona || !window.Persona.base) return;
    precargado = true;
    ["bravo", "rire", "doute", "surprise"].forEach(function (n) {
      var im = new Image(); im.src = window.Persona.base + n + "_s.png";
    });
  }

  function vigilaEjercicios() {
    if (!window.MutationObserver) return;
    vigilaTrampas();
    document.addEventListener("input", precargaCaras, true);
    document.addEventListener("click", function (e) {
      var t0 = e.target;
      if (t0 && t0.closest && t0.closest(".opt,.opts,[data-check],input,select,textarea")) precargaCaras();
    }, true);
    var obs = new MutationObserver(function (muts) {
      if (Date.now() < despiertaEn || Date.now() < trampaHasta || busy) return;
      var mejor = null;                          // el bloque que acaba de corregirse
      var global = null;                         // el marcador de toda la página
      for (var i = 0; i < muts.length; i++) {
        var t0 = muts[i].target;
        var el = esMarcador(t0.nodeType === 1 ? t0 : t0.parentNode);
        if (!el) continue;
        var m = /(\d+)\s*\/\s*(\d+)/.exec(el.textContent || "");
        if (!m) continue;
        var par = { a: +m[1], b: +m[2] };
        if (!par.b) continue;
        // el de la página tiene el total más grande; el del bloque es el que acaba de tocarse
        if (!mejor || par.b < mejor.b) { if (mejor) global = mejor; mejor = par; }
        else if (!global || par.b > global.b) global = par;
      }
      if (!mejor) return;
      var ahora = Date.now();
      if (ahora - ultima < DESCANSO) return;
      ultima = ahora;
      clearTimeout(pendiente);
      var perfectaLaPagina = !!(global && global.a === global.b && global.b > mejor.b);
      var cara = reaccion(mejor.a, mejor.b, perfectaLaPagina);
      mood(cara, perfectaLaPagina ? 1500 : (cara === "doute" ? 2200 : 2400));
      // la página entera bien: primero el asombro, después el pulgar arriba
      if (perfectaLaPagina) pendiente = setTimeout(function () { mood("bravo", 3200); }, 1500);
    });
    despiertaEn = Date.now() + CALMA_INICIAL;
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function boot() {
    if (document.getElementById("iat-css")) return;
    var st = document.createElement("style");
    st.id = "iat-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    build();
    vigilaEjercicios();
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
