/* Outside claude.ai the ateliers' AI calls (claude.use("sample").json(prompt, opts)) have nothing to talk to.
   This file provides the same interface, backed by the site's own Cloudflare Worker (folder ia-proxy/).
   While ENDPOINT is empty it does nothing, and ia-fallback.js shows the "open on Claude" button instead. */
(function(){
  var ENDPOINT = "https://french-ia.karlauriostegui-ua.workers.dev";
  if(!ENDPOINT) return;
  try{ if(typeof claude !== "undefined" && claude && typeof claude.use === "function") return; }catch(e){}

  function fail(code){ var e = new Error(code); e.code = code; return e; }

  var sample = {
    json: function(prompt, opts){
      opts = opts || {};
      return fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: String(prompt || ""), tier: opts.modelTier || "default", kb: opts.kb === true, query: opts.query ? String(opts.query) : undefined }),
        signal: opts.signal
      }).then(function(r){
        return r.json().catch(function(){ throw fail("invalid_json"); }).then(function(d){
          if(d && d.data) return d.data;
          throw fail((d && d.code) || (r.status === 429 ? "rate_limited" : "server_error"));
        });
      }, function(err){
        if(err && err.name === "AbortError") throw err;
        throw fail("network");
      });
    }
  };

  window.claude = { use: function(name){ return Promise.resolve(name === "sample" ? sample : null); } };
})();
