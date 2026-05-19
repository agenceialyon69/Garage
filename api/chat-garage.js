export const config = {
runtime: "edge",
};

export default async function handler(req) {
if (req.method !== "POST") {
return new Response(JSON.stringify({
ok: false,
reply: "Method not allowed"
}), {
status: 405,
headers: { "Content-Type": "application/json" }
});
}

try {
const body = await req.json();
const message = String(body?.message || "").trim();
const sessionId = String(body?.sessionId || "");
const lower = message.toLowerCase();

if (!message) {
return new Response(JSON.stringify({
ok: false,
sessionId,
mode: "fallback",
reply: "Merci. Pouvez-vous préciser votre besoin ?"
}), {
status: 400,
headers: { "Content-Type": "application/json" }
});
}

if (!process.env.ANTHROPIC_API_KEY) {
let reply = "Merci. Pouvez-vous préciser votre besoin pour que je vous aide au mieux ?";
let intent = "generic";

if (lower.includes("rendez") || lower.includes("rdv")) {
intent = "appointment";
reply = "Bien sûr. Quel véhicule avez-vous et quel créneau vous arrange ?";
} else if (
lower.includes("urgent") ||
lower.includes("voyant") ||
lower.includes("panne") ||
lower.includes("ne démarre") ||
lower.includes("demarre")
) {
intent = "urgent";
reply = "D’accord. Quel est le modèle du véhicule et depuis quand le souci est-il présent ?";
} else if (
lower.includes("horaire") ||
lower.includes("horaires") ||
lower.includes("ouvert")
) {
intent = "hours";
reply = "Nos horaires sont disponibles sur la page contact. Souhaitez-vous prendre un rendez-vous ?";
} else if (
lower.includes("vidange") ||
lower.includes("pneu") ||
lower.includes("ct") ||
lower.includes("contrôle") ||
lower.includes("controle")
) {
intent = "garage_service";
reply = "Bien sûr. Quel véhicule avez-vous et pour quand souhaitez-vous passer ?";
}

return new Response(JSON.stringify({
ok: true,
sessionId,
mode: "fallback",
intent,
reply
}), {
status: 200,
headers: { "Content-Type": "application/json" }
});
}

const systemPrompt = `
Tu es RéceptionZen, l'assistant de réception d'un garage automobile.
Tu aides les clients à prendre rendez-vous, à poser des questions sur une panne, ou à demander un devis.
Tu réponds en français.
Tu restes bref, clair et professionnel.
Tu ne donnes jamais de diagnostic définitif.
Tu cherches à qualifier la demande avec des questions simples.
Règles:
- Si le client veut un rendez-vous, demande le véhicule et le créneau souhaité.
- Si la demande semble urgente, demande le modèle du véhicule et depuis quand le problème existe.
- Si la demande concerne un service comme une vidange, un pneu, un CT ou un voyant moteur, demande le véhicule et la disponibilité.
- Une seule question à la fois.
`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
method: "POST",
headers: {
"content-type": "application/json",
"x-api-key": process.env.ANTHROPIC_API_KEY,
"anthropic-version": "2023-06-01"
},
body: JSON.stringify({
model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
max_tokens: 220,
system: systemPrompt,
messages: [
{ role: "user", content: message }
]
})
});

if (!response.ok) {
const errText = await response.text();
return new Response(JSON.stringify({
ok: true,
sessionId,
mode: "fallback",
reply: "Merci. Pouvez-vous préciser votre besoin pour que je vous aide au mieux ?",
debug: errText
}), {
status: 200,
headers: { "Content-Type": "application/json" }
});
}

const data = await response.json();
const reply =
data?.content?.[0]?.text?.trim() ||
"Merci. Pouvez-vous préciser votre besoin pour que je vous aide au mieux ?";

return new Response(JSON.stringify({
ok: true,
sessionId,
mode: "ai",
reply
}), {
status: 200,
headers: {
"Content-Type": "application/json",
"Cache-Control": "no-store"
}
});
} catch (error) {
return new Response(JSON.stringify({
ok: true,
mode: "fallback",
reply: "Une erreur est survenue. Pouvez-vous reformuler votre demande ?"
}), {
status: 200,
headers: { "Content-Type": "application/json" }
});
}
}

