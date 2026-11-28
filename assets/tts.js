/* Natural voices for the whole site.
   The lessons speak through window.speechSynthesis. This file intercepts speak(): when the text has a
   pre-generated MP3 (Azure neural voices, Quebec French, see tts-build/), the MP3 plays instead, with the
   same events (start, boundary, end) so pause buttons and progress bars keep working.
   Texts without an MP3 still use the device voice. */
(function(){
  var ss = window.speechSynthesis;
  if(!ss || ss.__ttsPatched) return;
  ss.__ttsPatched = true;
  var me = document.currentScript;
  var BASE = (me && me.src ? me.src : location.href).replace(/[^\/]*$/, "") + "tts/";
  var manifest = null;
  fetch(BASE + "manifest.json").then(function(r){ return r.ok ? r.json() : null; }).then(function(m){ manifest = m; }).catch(function(){});

  // same steps as norm() in tts-build/generate.py: decode HTML entities (some lessons double-escape them),
  // drop leftover tags and circled numbers, collapse whitespace
  var deco = document.createElement("textarea");
  function norm(t){
    t = String(t == null ? "" : t);
    for(var i = 0; i < 2 && /&[#a-zA-Z0-9]+;/.test(t); i++){ deco.innerHTML = t; t = deco.value; }
    return t.replace(/<\/?[a-zA-Z][^>]*>/g, "").replace(/[\u2460-\u24ff]/g, "").replace(/\s+/g, " ").trim();
  }
  function cyrb53(str, seed){
    seed = seed || 0;
    var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(var i = 0, ch; i < str.length; i++){
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  window.__ttsKey = function(t){ return cyrb53(norm(t)); };

  var proto = Object.getPrototypeOf(ss);
  function nativeGet(name){ var d = Object.getOwnPropertyDescriptor(proto, name); return d && d.get ? d.get.call(ss) : false; }
  var nativeSpeak = proto.speak.bind(ss), nativeCancel = proto.cancel.bind(ss),
      nativePause = proto.pause.bind(ss), nativeResume = proto.resume.bind(ss);

  var cur = null;          // {audio, u, len, offset}
  var recent = [];         // long texts recently played from an MP3 (for "play from here" in the players)

  function fire(u, type, extra){
    try{
      var ev = new Event(type);
      if(extra) for(var k in extra) Object.defineProperty(ev, k, {value: extra[k]});
      u.dispatchEvent(ev);
    }catch(e){
      try{ var h = u["on" + type]; if(h) h.call(u, extra || {}); }catch(e2){}
    }
  }
  function finish(type){
    if(!cur) return;
    var c = cur; cur = null;
    try{ c.audio.pause(); }catch(e){}
    fire(c.u, type || "end", {charIndex: c.len, elapsedTime: 0});
  }

  function play(u, key, fullLen, startFrac){
    var a = new Audio(BASE + key + ".mp3");
    a.preload = "auto";
    var rate = u.rate || 1;
    a.playbackRate = Math.max(0.5, Math.min(2, rate / 0.9));
    a.volume = (u.volume == null ? 1 : u.volume);
    var c = {audio: a, u: u, key: key, len: norm(u.text).length, paused: false};
    cur = c;
    var started = false;
    a.addEventListener("loadedmetadata", function(){
      if(startFrac > 0 && isFinite(a.duration)) a.currentTime = a.duration * startFrac;
    });
    a.addEventListener("playing", function(){ if(!started && cur === c){ started = true; fire(u, "start", {charIndex: 0}); } });
    a.addEventListener("timeupdate", function(){
      if(cur !== c || !isFinite(a.duration) || !a.duration) return;
      var frac = a.currentTime / a.duration;
      var within = startFrac > 0 ? (frac - startFrac) / (1 - startFrac) : frac;
      fire(u, "boundary", {charIndex: Math.max(0, Math.round(within * c.len)), name: "word"});
    });
    a.addEventListener("ended", function(){ if(cur === c) finish("end"); });
    a.addEventListener("error", function(){
      if(cur !== c) return;
      cur = null; nativeSpeak(u);             // missing file: fall back to the device voice
    });
    var p = a.play();
    if(p && p.catch) p.catch(function(){ if(cur === c){ cur = null; nativeSpeak(u); } });
  }

  // the talking portrait (assets/persona.js) analyses this element to move the mouth
  window.__ttsAudio = function(){ return cur ? cur.audio : null; };

  // real progress of the MP3 being played, for the lesson players (progress bar and duration)
  window.__ttsNow = function(){
    if(!cur || !isFinite(cur.audio.duration) || !cur.audio.duration) return null;
    return {key: cur.key, frac: cur.audio.currentTime / cur.audio.duration, dur: cur.audio.duration / (cur.audio.playbackRate || 1)};
  };

  ss.speak = function(u){
    var t = norm(u && u.text);
    if(u && t && /&[#a-zA-Z0-9]+;|[\u2460-\u24ff]|<\/?[a-zA-Z][^>]*>/.test(u.text)){ try{ u.text = t; }catch(e){} }   // the device voice should not read "&nbsp;" either
    if(!t || !manifest){ return nativeSpeak(u); }
    if(cur) finish("end");
    var key = cyrb53(t);
    if(manifest[key]){
      if(t.length > 120){ recent = recent.filter(function(x){ return x.t !== t; }); recent.unshift({t: t, k: key}); recent.length = Math.min(recent.length, 8); }
      return play(u, key, t.length, 0);
    }
    // a player started "from here": the text is the end of a long text that has an MP3
    for(var i = 0; i < recent.length; i++){
      var full = recent[i].t;
      if(full.length > t.length && full.slice(-t.length) === t){
        return play(u, recent[i].k, full.length, (full.length - t.length) / full.length);
      }
    }
    return nativeSpeak(u);
  };
  ss.cancel = function(){ if(cur) finish("end"); nativeCancel(); };
  ss.pause = function(){ if(cur){ cur.paused = true; try{ cur.audio.pause(); }catch(e){} fire(cur.u, "pause"); } else nativePause(); };
  ss.resume = function(){ if(cur){ cur.paused = false; try{ cur.audio.play(); }catch(e){} fire(cur.u, "resume"); } else nativeResume(); };
  try{
    Object.defineProperty(ss, "speaking", {configurable: true, get: function(){ return cur ? true : nativeGet("speaking"); }});
    Object.defineProperty(ss, "paused", {configurable: true, get: function(){ return cur ? !!cur.paused : nativeGet("paused"); }});
    Object.defineProperty(ss, "pending", {configurable: true, get: function(){ return cur ? false : nativeGet("pending"); }});
  }catch(e){}
})();
