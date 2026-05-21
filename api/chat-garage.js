// Rate limiting in-memory
const RATE_WINDOW_MS = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 15;
const MAX_MESSAGE_LENGTH = 500;

const store = globalThis.__chatGarageStore || new Map();
globalThis.__chatGarageStore = store;

function cleanupStore() {
const now = Date.now();
for (const [key, entry] of store.entries()) {
if (now > entry.resetAt) store.delete(key);
}
}

function getIp(req) {
const xf = req.headers["x-forwarded-for"];
if (typeof xf === "string" && xf.length > 0) {
return xf.split(",")[0].trim();
}
return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
cleanupStore();
const now = Date.now();
const entry = store.get(ip);

if (!entry || now > entry.resetAt) {
store.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
return false;
}

entry.count += 1;
store.set(ip, entry);
return entry.count > MAX_CALLS_PER_WINDOW;
}

function sanitize(text, maxLen) {
return String(text || "").trim().slice(0, maxLen);
}

function detectIntent(text) {
const t = text.toLowerCase();

if (/(rdv|rendez-vous|réserver|prendre|planifier)/i.test(t)) {
return { intent: "appointment", urgent: false };
}
if (/(panne|ne démarre|démarre pas|en panne|tombée|tombé)/i.test(t)) {
return { intent: "breakdown", urgent: true };
}
if (/(bruit|frein|voyant|fumée|fuite|vibration)/i.test(t)) {
return { intent: "diagnostic", urgent: true };
}
if (/(prix|tarif|combien|coûte|devis|coût)/i.test(t)) {
return { intent: "pricing", urgent: false };
}
if (/(horaire|ouvert|fermé|fermeture|jour)/i.test(t)) {
return { intent: "hours", urgent: false };
}
return { intent: "general", urgent: false };
}

export default async function handler(req, res) {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") return res.status(200).end();

if (req.method !== "POST") {
return res.status(405).json({ ok: false, error: "Method not allowed" });
}

try {
const ip = getIp(req);
if (isRateLimited(ip)) {
return res.status(429).json({
ok: false,
error: "Trop de messages. Réessayez dans 1 minute.",
retryAfter: 60
});
}

if (!process.env.CLAUDE_API_KEY) {
console.error("CLAUDE_API_KEY is not configured");
return res.status(500).json({
ok: false,
error: "Configuration serveur. Contactez le garage directement."
});
}

const body = req.body || {};
const message = sanitize(body.message, MAX_MESSAGE_LENGTH);
const sessionId = sanitize(body.sessionId, 100);

if (!message) {
return res.status(400).json({ ok: false, error: "Message requis" });
}

const systemPrompt = `Tu es l'assistante virtuelle d'un garage automobile à Lyon (démo).

TON RÔLE :
- Accueillir chaleureusement le client
- Comprendre son besoin (panne, RDV, prix, info)
- Donner une réponse courte et claire
- Toujours inviter à appeler le garage pour les cas concrets

STYLE :
- Français naturel et professionnel
- 1 à 3 phrases maximum
- Vouvoie toujours
- Ne mentionne JAMAIS que tu es une IA
- Pour les pannes, propose un rappel rapide
- Pour les prix, donne un ordre de grandeur si possible

CONTEXTE DU GARAGE (démo) :
- Garage Martin Lyon, 123 rue de la République, 69008 Lyon
- Téléphone : 04 00 00 00 00 (numéro fictif)
- Horaires : Lun-Ven 8h-19h, Sam 9h-17h, Dim fermé
- Spécialités : entretien, réparation, pneus, climatisation, diagnostic
- Toutes marques, devis gratuit, garantie 1 an pièces+main-d'œuvre

RÈGLES IMPORTANTES :
- Tu ne fais JAMAIS de diagnostic technique précis
- Tu invites toujours à appeler pour les cas concrets
- Tu ne promets jamais un prix exact, juste des ordres de grandeur
- Pour les pannes urgentes : suggère un rappel rapide`;

const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"x-api-key": process.env.CLAUDE_API_KEY,
"anthropic-version": "2023-06-01",
"content-type": "application/json"
},
body: JSON.stringify({
model: "claude-haiku-4-5-20251001",
max_tokens: 200,
system: systemPrompt,
messages: [
{ role: "user", content: message }
]
})
});

if (!claudeResponse.ok) {
const errorText = await claudeResponse.text();
console.error("Claude API error:", claudeResponse.status, errorText);
return res.status(502).json({
ok: false,
error: "Le service IA est temporairement indisponible. Contactez le garage au 04 00 00 00 00."
});
}

const data = await claudeResponse.json();
const reply = data?.content?.[0]?.text?.trim() || "Bonjour, comment puis-je vous aider ?";

const intentData = detectIntent(message);

return res.status(200).json({
ok: true,
reply,
intent: intentData.intent,
urgent: intentData.urgent,
sessionId
});

} catch (error) {
console.error("chat-garage error:", error);
return res.status(500).json({
ok: false,
error: "Erreur serveur. Contactez le garage au 04 00 00 00 00."
});
}
}

