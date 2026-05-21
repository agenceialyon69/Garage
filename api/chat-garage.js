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
if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
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

function buildSystemPrompt() {
return `Tu es l'assistante virtuelle d'un garage automobile à Lyon (démo).

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
}

async function callAnthropic(message, model) {
const res = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"x-api-key": process.env.ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01",
"content-type": "application/json"
},
body: JSON.stringify({
model,
max_tokens: 180,
system: buildSystemPrompt(),
messages: [{ role: "user", content: message }]
})
});

const raw = await res.text();
let data = null;
try {
data = JSON.parse(raw);
} catch (_) {}

return { ok: res.ok, status: res.status, raw, data };
}

function extractReply(data) {
const content = data?.content;
if (Array.isArray(content)) {
for (const part of content) {
if (part && typeof part.text === "string" && part.text.trim()) {
return part.text.trim();
}
}
}
return "";
}

function fallbackReply(message) {
const intent = detectIntent(message).intent;

if (intent === "hours") return "Bien sûr. Le garage est ouvert du lundi au vendredi de 8h à 19h, le samedi de 9h à 17h, et fermé le dimanche. Pour confirmer, appelez le garage directement.";
if (intent === "pricing") return "Pour les tarifs, le mieux est de nous appeler pour un devis rapide. Nous pouvons vous donner un ordre de grandeur selon votre besoin.";
if (intent === "appointment") return "Bien sûr. Pour prendre rendez-vous, appelez directement le garage afin de choisir le créneau le plus pratique.";
if (intent === "breakdown") return "Si votre véhicule est en panne, appelez le garage tout de suite pour un rappel rapide et une prise en charge adaptée.";
if (intent === "diagnostic") return "Décrivez brièvement le symptôme au garage par téléphone, afin d'obtenir un premier avis rapide et de convenir d'un passage.";
return "Merci pour votre message. Pour une réponse rapide et précise, appelez directement le garage.";
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

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
console.error("[chat-garage] Missing ANTHROPIC_API_KEY");
return res.status(500).json({
ok: false,
error: "Configuration serveur. Contactez le garage directement.",
reply: "Le service est temporairement indisponible. Contactez le garage directement.",
source: "fallback-no-key"
});
}

const body = req.body || {};
const message = sanitize(body.message, MAX_MESSAGE_LENGTH);
const sessionId = sanitize(body.sessionId, 100);

if (!message) {
return res.status(400).json({ ok: false, error: "Message requis" });
}

const modelsToTry = [
"claude-sonnet-4-6",
"claude-haiku-4-5",
"claude-haiku-4-5-20251001"
];

let lastError = null;

for (const model of modelsToTry) {
try {
const result = await callAnthropic(message, model);

if (!result.ok) {
lastError = {
model,
status: result.status,
raw: result.raw
};
console.error("[chat-garage] Anthropic error", model, result.status, result.raw);
continue;
}

const reply = extractReply(result.data);
if (!reply) {
lastError = { model, status: result.status, raw: result.raw, reason: "empty_reply" };
console.error("[chat-garage] Empty reply", model, result.raw);
continue;
}

const intentData = detectIntent(message);

return res.status(200).json({
ok: true,
reply,
intent: intentData.intent,
urgent: intentData.urgent,
sessionId,
modelUsed: model
});
} catch (err) {
lastError = { model, error: String(err?.message || err) };
console.error("[chat-garage] Fetch exception", model, err);
}
}

const fallback = fallbackReply(message);
console.error("[chat-garage] All models failed", lastError);

const intentData = detectIntent(message);
return res.status(200).json({
ok: true,
reply: fallback,
intent: intentData.intent,
urgent: intentData.urgent,
sessionId,
modelUsed: "fallback",
degraded: true
});

} catch (error) {
console.error("[chat-garage] handler crash:", error);
return res.status(200).json({
ok: true,
reply: "Le service est temporairement indisponible. Contactez le garage directement.",
intent: "general",
urgent: false,
degraded: true,
modelUsed: "fallback-crash"
});
}
}

