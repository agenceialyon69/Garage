export default async function handler(req, res) {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "Content-Type");

if (req.method === "OPTIONS") return res.status(200).end();

if (req.method !== "POST") {
return res.status(405).json({ ok: false, error: "Method not allowed" });
}

try {
const webhookUrl = process.env.MAKE_WEBHOOK_URL;
if (!webhookUrl) {
console.error("MAKE_WEBHOOK_URL is not configured");
return res.status(500).json({ ok: false, error: "Configuration serveur" });
}

const body = req.body || {};

const garage = String(body.garage || "").trim().slice(0, 200);
const name = String(body.name || "").trim().slice(0, 100);
const phone = String(body.phone || "").trim().slice(0, 30);
const email = String(body.email || "").trim().slice(0, 200);
const message = String(body.message || "").trim().slice(0, 2000);
const source = String(body.source || "unknown").trim().slice(0, 50);

// Champs obligatoires : garage, name, phone
if (!garage || !name || !phone) {
return res.status(400).json({
ok: false,
error: "Champs obligatoires manquants",
missing: { garage: !garage, name: !name, phone: !phone }
});
}

// Validation téléphone (8 à 15 chiffres)
const phoneDigits = phone.replace(/\D/g, "");
if (phoneDigits.length < 8 || phoneDigits.length > 15) {
return res.status(400).json({ ok: false, error: "Téléphone invalide" });
}

// Validation email si fourni (optionnel)
if (email) {
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
return res.status(400).json({ ok: false, error: "Email invalide" });
}
}

const xff = req.headers["x-forwarded-for"];
const ip = typeof xff === "string" && xff.length > 0
? xff.split(",")[0].trim()
: (req.socket?.remoteAddress || "unknown");

const payload = {
garage,
name,
phone,
email: email || "non fourni",
message: message || "non précisé",
source,
page: "sitesgarages-lyon",
timestamp: new Date().toISOString(),
ip
};

const webhookResponse = await fetch(webhookUrl, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify(payload)
});

if (!webhookResponse.ok) {
console.error("Webhook failed:", webhookResponse.status);
return res.status(502).json({
ok: false,
error: "Service temporairement indisponible. Contactez le 06 05 80 05 94."
});
}

return res.status(200).json({
ok: true,
message: "Demande reçue. Réponse dans la journée."
});

} catch (error) {
console.error("lead-garage error:", error);
return res.status(500).json({
ok: false,
error: "Erreur. Contactez le 06 05 80 05 94."
});
}
}

