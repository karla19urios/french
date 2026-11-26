// Cloudflare Worker: lets the site's ateliers use Claude without a claude.ai account.
// The page sends { prompt, tier }; the Worker calls the Claude API with the secret key
// (set as the Worker secret ANTHROPIC_API_KEY) and returns the JSON object Claude wrote.
import Anthropic from "@anthropic-ai/sdk";

// Model used for every generation. Claude Haiku 5.5 ("claude-haiku-5-5") costs ~40x less per call.
const MODEL = "claude-opus-5-5";
const ALLOWED_ORIGINS = ["https://karla19urios.github.io", "http://localhost:8000"];
const MAX_PROMPT_CHARS = 12000;

const SYSTEM =
  "Tu es l'assistant d'un site d'apprentissage du français (exercices, sujets d'entraînement TCF/TEF). " +
  "Tu ne réponds qu'à des demandes de génération de contenu pédagogique en français. " +
  "Réponds UNIQUEMENT avec l'objet JSON demandé, sans texte autour et sans balises markdown. " +
  "Si la demande n'a rien à voir avec l'apprentissage du français, réponds {\"error\":\"hors_sujet\"}.";

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) },
  });
}

function extractJson(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return reply(origin, 405, { code: "method_not_allowed" });
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(origin, 403, { code: "forbidden_origin" });

    // per-visitor limit (Cloudflare rate-limiting binding, see wrangler.toml)
    if (env.LIMITER) {
      try {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.LIMITER.limit({ key: ip });
        if (!success) return reply(origin, 429, { code: "rate_limited" });
      } catch (e) { console.log("rate limiter unavailable:", String(e)); }
    }
    if (!env.ANTHROPIC_API_KEY) return reply(origin, 500, { code: "server_key", detail: "ANTHROPIC_API_KEY secret is not set" });

    let body;
    try { body = await request.json(); } catch (e) { return reply(origin, 400, { code: "bad_request" }); }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) return reply(origin, 400, { code: "bad_request" });
    const effort = body.tier === "quick" ? "low" : "medium";

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal") return reply(origin, 200, { code: "refused" });
      let text = "";
      for (const block of response.content) if (block.type === "text") text += block.text;
      if (!text.trim()) return reply(origin, 200, { code: "empty_completion" });
      const data = extractJson(text);
      if (!data || typeof data !== "object") return reply(origin, 200, { code: "invalid_json" });
      if (data.error === "hors_sujet") return reply(origin, 200, { code: "refused" });
      return reply(origin, 200, { data });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return reply(origin, 429, { code: "rate_limited" });
      if (error instanceof Anthropic.AuthenticationError) return reply(origin, 500, { code: "server_key" });
      if (error instanceof Anthropic.APIConnectionError) return reply(origin, 502, { code: "upstream" });
      if (error instanceof Anthropic.APIError) return reply(origin, 502, { code: "upstream", status: error.status });
      console.log("unexpected error:", error);
      return reply(origin, 500, { code: "server_error", detail: String((error && error.name) || "") + ": " + String((error && error.message) || error).slice(0, 300) });
    }
  },
};
