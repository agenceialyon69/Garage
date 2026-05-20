export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ ok: false, reply: "Method not allowed" });
}

try {
const { message = "", sessionId = "" } = req.body || {};

const lower = String(message).toLowerCase();

let reply =
"Bonjour, je peux vous aider à présenter votre garage de façon simple et claire. Souhaitez-vous un site vitrine, une demande de devis ou une prise de contact rapide ?";

if (lower.includes("prix") || lower.includes("tarif")) {
reply = "L’offre de lancement est de 490 € de mise en place, puis 99 €/mois. C’est pensé pour démarrer simplement et rester clair pour un garage indépendant.";
} else if (lower.includes("contact") || lower.includes("appeler")) {
reply = "Vous pouvez me contacter directement pour un échange simple. L’idée est de rendre votre présence en ligne claire et facile à comprendre.";
} else if (lower.includes("garage") || lower.includes("site")) {
reply = "Je peux vous aider à construire une page simple pour présenter votre garage, rassurer vos clients et faciliter la prise de contact.";
}

return res.status(200).json({
ok: true,
reply,
sessionId,
});
} catch (error) {
return res.status(500).json({ ok: false, reply: "Server error" });
}
}
