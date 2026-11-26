/* Outside claude.ai the artifact's AI assistant (claude.use) does not exist.
   This script shows a button that opens the original artifact on Claude, where the assistant works.
   Usage: <script src="…/ia-fallback.js" data-ia-url="https://claude.ai/artifact/…"
                  data-ia-anchor="#css-selector" data-ia-where="before|after|inside"></script> */
(function(){
  var me = document.currentScript;
  if(!me) return;
  var url = me.getAttribute("data-ia-url");
  var sel = me.getAttribute("data-ia-anchor");
  var where = me.getAttribute("data-ia-where") || "after";
  function hasClaude(){
    try{ return typeof claude !== "undefined" && claude && typeof claude.use === "function"; }catch(e){ return false; }
  }
  function run(){
    if(hasClaude() || !url || !sel) return;
    var anchor = document.querySelector(sel);
    if(!anchor) return;
    var box = document.createElement("div");
    box.className = "ia-fallback";
    box.innerHTML =
      '<div class="ia-fb-txt"><b>✨ Assistant IA</b>' +
      '<span>L\'assistant IA fonctionne uniquement dans la version Claude de cet atelier. ' +
      'Ouvre-la pour générer de nouveaux sujets (il faut être connecté à un compte Claude).</span></div>' +
      '<a class="ia-fb-btn" href="' + url + '" target="_blank" rel="noopener">Ouvrir avec l\'assistant IA ↗</a>';
    if(where === "inside"){ anchor.innerHTML = ""; anchor.appendChild(box); anchor.hidden = false; anchor.style.display = ""; }
    else if(where === "before"){ anchor.parentNode.insertBefore(box, anchor); }
    else { anchor.parentNode.insertBefore(box, anchor.nextSibling); }
    if(!document.getElementById("ia-fb-css")){
      var st = document.createElement("style");
      st.id = "ia-fb-css";
      st.textContent =
        ".ia-fallback{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;" +
        "margin:12px 0;padding:14px 16px;border-radius:14px;border:1px dashed #378EF6;background:rgba(55,142,246,.08)}" +
        ".ia-fallback .ia-fb-txt{flex:1 1 260px;min-width:0;font-size:.93rem;line-height:1.55}" +
        ".ia-fallback .ia-fb-txt b{display:block;margin-bottom:2px}" +
        ".ia-fallback .ia-fb-btn{flex:none;display:inline-block;padding:9px 16px;border-radius:999px;background:#378EF6;" +
        "color:#fff!important;font-weight:600;font-size:.9rem;text-decoration:none;white-space:nowrap}" +
        ".ia-fallback .ia-fb-btn:hover{filter:brightness(1.08)}" +
        "@media(max-width:480px){.ia-fallback .ia-fb-btn{white-space:normal;text-align:center;width:100%}}";
      document.head.appendChild(st);
    }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
