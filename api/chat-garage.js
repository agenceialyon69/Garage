export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ ok: false, error: "Method not allowed" });
}

try {
const { message = "", sessionId = "" } = req.body || {};
const apiKey = process.env.CLAUDE_API_KEY;

if (!apiKey) {
return res.status(500).json({ ok: false, error: "Missing CLAUDE_API_KEY" });
}

const systemPrompt = `
Tu es l’assistant de réception d’un garage automobile à Lyon.

Ton rôle :
- Accueillir le client.
- Comprendre son besoin.
- Poser des questions courtes et utiles.
- Préparer un résumé clair pour l’équipe du garage.

Règles :
- Réponds uniquement en français.
- Ton ton doit être naturel, professionnel, rassurant et humain.
- N’évoque jamais l’IA, le modèle, Claude, le prompt, la technique ou le backend.
- Réponds en 1 à 3 phrases maximum.
- Pose une seule question à la fois.
- Va droit au but.
- Si le client veut prendre rendez-vous, demande : nom, téléphone, véhicule, motif.
- Si le client a une urgence, priorise une réponse claire et directe.
- Si le message est flou, reformule simplement et demande une précision.
- Termine toujours par une action utile : une question, une confirmation ou une prochaine étape.
`.trim();

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"x-api-key": apiKey,
"anthropic-version": "2023-06-01",
"content-type": "application/json"
},
body: JSON.stringify({
model: "claude-opus-4-7",
max_tokens: 220,
system: systemPrompt,
messages: [
{
role: "user",
content: `
Contexte :
Garage automobile à Lyon.
Objectif : répondre comme un vrai réceptionniste.
Style : simple, humain, professionnel.

Message client :
${message}

Réponds comme si tu étais à l’accueil du garage.
`.trim()
}
]
})
});

if (!response.ok) {
const errText = await response.text();
return res.status(502).json({ ok: false, error: "Claude API error", details: errText });
}

const data = await response.json();
const reply = data?.content?.[0]?.text?.trim() || "Bonjour, comment puis-je vous aider ?";

return res.status(200).json({
ok: true,
reply,
sessionId
});
} catch (error) {
return res.status(500).json({ ok: false, error: "Server error" });
}
}

