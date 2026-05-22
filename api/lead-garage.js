// /api/lead-garage.js
// Formulaire garage → Make.com webhook
// Architecture edge identique à Claire (fiable, jamais de 500 brut)

export const config = {
runtime: 'edge',
};

export default async function handler(req) {
if (req.method !== 'POST') {
return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
status: 405,
headers: { 'content-type': 'application/json' },
});
}

try {
const webhookUrl = process.env.MAKE_WEBHOOK_URL;
if (!webhookUrl) {
console.error('MAKE_WEBHOOK_URL manquante');
return new Response(
JSON.stringify({
ok: false,
error: "Le formulaire est momentanément indisponible. Contactez le 06 05 80 05 94.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

const body = await req.json();

const garage = String(body.garage || '').trim().slice(0, 200);
const name = String(body.name || '').trim().slice(0, 100);
const phone = String(body.phone || '').trim().slice(0, 30);
const email = String(body.email || '').trim().slice(0, 200);
const message = String(body.message || '').trim().slice(0, 2000);
const source = String(body.source || 'unknown').trim().slice(0, 50);

// Champs obligatoires
if (!garage || !name || !phone) {
return new Response(
JSON.stringify({
ok: false,
error: 'Merci de remplir le nom du garage, votre prénom et votre téléphone.',
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Validation téléphone
const phoneDigits = phone.replace(/\D/g, '');
if (phoneDigits.length < 8 || phoneDigits.length > 15) {
return new Response(
JSON.stringify({ ok: false, error: 'Numéro de téléphone invalide.' }),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Validation email si fourni
if (email) {
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(email)) {
return new Response(
JSON.stringify({ ok: false, error: 'Adresse email invalide.' }),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}
}

const payload = {
garage,
name,
phone,
email: email || 'non fourni',
message: message || 'non précisé',
source,
page: 'sitesgarages-lyon',
timestamp: new Date().toISOString(),
};

const webhookResponse = await fetch(webhookUrl, {
method: 'POST',
headers: { 'content-type': 'application/json' },
body: JSON.stringify(payload),
});

if (!webhookResponse.ok) {
console.error('Webhook Make échec:', webhookResponse.status);
return new Response(
JSON.stringify({
ok: false,
error: "Une erreur est survenue. Contactez le 06 05 80 05 94.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

return new Response(
JSON.stringify({ ok: true, message: 'Demande reçue. Réponse dans la journée.' }),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
} catch (err) {
console.error('Erreur lead-garage:', err);
return new Response(
JSON.stringify({
ok: false,
error: "Une erreur est survenue. Contactez le 06 05 80 05 94.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}
}

