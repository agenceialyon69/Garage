const RATE_WINDOW_MS = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 12;
const MAX_MESSAGE_LENGTH = 500;

const memory = globalThis.__chatRateLimitStore || new Map();
globalThis.__chatRateLimitStore = memory;

function getIp(req) {
const xf = req.headers["x-forwarded-for"];
if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
const now = Date.now();
const entry = memory.get(ip);

if (!entry || now > entry.resetAt) {
memory.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
return false;
}

entry.count += 1;
memory.set(ip, entry);
return entry.count > MAX_CALLS_PER_WINDOW;
}

function clampText(value, max) {
return String(value || "").trim().slice(0, max);
}

function buildStructuredReply(text) {
const cleaned = clampText(text, 300);
return {
reply: cleaned || "Bonjour, comment puis-je vous aider ?",
intent: cleaned.toLowerCase().includes("rendez") || cleaned.toLowerCase().includes("rdv") ? "appointment" : "general",
needsContact: /nom|téléphone|telephone|vehicule|véhicule|rendez|rdv/i.test(cleaned),
};
}

export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ ok: false, error: "Method not allowed" });
}

try {
const ip = getIp(req);
if (isRateLimited(ip)) {
return res.status(429).json({
ok: false,
error: "Too many requests",
retryAfter: 60
});
}

const body = req.body || {};
const message = clampText(body.message, MAX_MESSAGE_LENGTH);

if (!message) {
return res.status(400).json({
ok: false,
error: "Missing message"
});
}

if (!process.env.CLAUDE_API_KEY) {
return res.status(500).json({
ok: false,
error: "Server configuration error"
});
}

const systemPrompt = `
Tu es réceptionniste d’un garage automobile à Lyon.

Ton rôle :
- Accueillir le client.
- Comprendre son problème.
- Poser une question à la fois.
- Proposer une solution ou un rendez-vous.

Style :
- Français naturel, humain, professionnel.
- 1 à 3 phrases max.
- Jamais mentionner l’IA ou la technique.
- Toujours terminer par une action ou une question utile.

Si panne ou bruit :
- Réponse simple.
- Demande une précision sur le véhicule.

Si rendez-vous :
- Demander nom, téléphone, véhicule, problème.
`.trim();

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"x-api-key": process.env.CLAUDE_API_KEY,
"anthropic-version": "2023-06-01",
"content-type": "application/json"
},
body: JSON.stringify({
model: "claude-opus-4-7",
max_tokens: 180,
system: systemPrompt,
messages: [
{
role: "user",
content: `Message client: ${message}`
}
]
})
});

if (!response.ok) {
console.error("Claude API error:", response.status);
return res.status(502).json({
ok: false,
error: "Model unavailable"
});
}

const data = await response.json();
const rawReply = data?.content?.[0]?.text || "";
const structured = buildStructuredReply(rawReply);

return res.status(200).json({
ok: true,
...structured
});
} catch (error) {
console.error("chat-garage error:", error);
return res.status(500).json({
ok: false,
error: "Server error"
});
}
}

