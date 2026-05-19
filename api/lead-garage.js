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

const name = String(body?.name || "").trim();
const phone = String(body?.phone || "").trim();
const message = String(body?.message || "").trim();
const sessionId = String(body?.sessionId || "");

if (!name || !phone || !message) {
return new Response(JSON.stringify({
ok: false,
sessionId,
reply: "Merci de remplir le nom du garage, le téléphone et le besoin."
}), {
status: 400,
headers: { "Content-Type": "application/json" }
});
}

const payload = {
name,
phone,
message,
sessionId,
source: body?.source || "landing-page",
product: body?.product || "ReceptionZen Garage",
createdAt: new Date().toISOString()
};

// Optionnel : branche ici un webhook externe si tu veux envoyer le lead ailleurs.
// Exemple:
// if (process.env.LEAD_WEBHOOK_URL) {
// await fetch(process.env.LEAD_WEBHOOK_URL, {
// method: "POST",
// headers: { "Content-Type": "application/json" },
// body: JSON.stringify(payload)
// });
// }

console.log("Lead garage reçu:", payload);

return new Response(JSON.stringify({
ok: true,
sessionId,
reply: "Merci, votre demande a bien été envoyée. On revient vers vous rapidement."
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
reply: "Votre demande a bien été prise en compte. Vous pouvez aussi nous contacter par email."
}), {
status: 200,
headers: { "Content-Type": "application/json" }
});
}
}

