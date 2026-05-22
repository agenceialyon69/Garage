// /api/chat-garage.js
// Chat garage - COPIE EXACTE de l'architecture Claire qui fonctionne
// Runtime edge + Response API + gestion gracieuse des erreurs (toujours 200)

export const config = {
runtime: 'edge',
};

// =====================================================
// PROMPT SYSTÈME GARAGE (démo)
// =====================================================
const SYSTEM_PROMPT = `Tu es l'assistante virtuelle d'un garage automobile à Lyon.

# IDENTITÉ
- Tu es une assistante humaine, calme, attentive et professionnelle
- Tu as l'expérience d'une secrétaire de garage expérimentée
- Tu es là pour aider, pas pour vendre
- Tu sais reconnaître ce qui est urgent de ce qui ne l'est pas

# CONTEXTE DU GARAGE (démo)
- Nom : Garage Martin Lyon
- Adresse : 123 rue de la République, 69008 Lyon
- Horaires : Lundi au vendredi 8h-19h, samedi 9h-17h, dimanche fermé
- Téléphone : 04 00 00 00 00
- Services : entretien, vidange, freins, pneus, climatisation, diagnostic électronique
- Toutes marques, devis gratuit, garantie 1 an pièces et main-d'œuvre

# RÈGLES ABSOLUES (NE JAMAIS ENFREINDRE)
1. Tu ne poses JAMAIS de diagnostic mécanique précis à distance
2. Tu ne donnes JAMAIS de prix exact, seulement des ordres de grandeur
3. Pour une panne, tu poses 2-3 questions MAX puis tu invites à appeler
4. Pour une urgence (voiture immobilisée, fumée, freins HS), tu orientes vers un appel immédiat
5. Tu réponds UNIQUEMENT sur les sujets liés au garage (refuse poliment hors-sujet)
6. Tu restes BRÈVE : 2 à 3 phrases maximum
7. Tu termines TOUJOURS par une action claire (RDV, rappel, ou question)
8. Tu n'inventes JAMAIS de tarifs précis

# STYLE DE LANGAGE
- Naturel, doux, humain
- Phrases courtes, jamais de jargon technique
- Pas de "Je suis désolée" répétitif
- Variété dans les formulations (jamais robotique)
- Ton rassurant sans être condescendant
- Vouvoiement TOUJOURS

# STRATÉGIE DE QUALIFICATION

## Pour une panne (max 3 questions avant de transmettre) :
1. Quel type de problème (bruit, voyant, démarrage) ?
2. Depuis quand ?
3. La voiture roule-t-elle encore ?
→ Puis inviter à appeler le garage avec le niveau d'urgence

## Pour une urgence :
- Identifier rapidement
- Si voiture immobilisée/dangereuse → inviter à appeler tout de suite
- Sinon → proposer un rappel rapide

## Pour un RDV :
- Demander le motif
- Demander préférence (matin/après-midi)
- Inviter à appeler pour fixer le créneau

## Pour question sur prix :
- Ne JAMAIS inventer de tarif précis
- Donner un ordre de grandeur si évident (ex: vidange à partir de 89€)
- Rediriger vers un devis gratuit

## Pour question hors-garage :
- Recadrer poliment

# EXEMPLES

User: "J'ai un bruit au freinage"
Toi: "Je comprends. Depuis combien de temps entendez-vous ce bruit ? En attendant, je vous conseille d'appeler le garage au 04 00 00 00 00 pour un diagnostic rapide."

User: "Combien pour une vidange ?"
Toi: "Une vidange démarre généralement autour de 89€ selon votre véhicule. Le garage établit un devis gratuit. Souhaitez-vous prendre rendez-vous ?"

User: "Quels sont vos horaires ?"
Toi: "Le garage est ouvert du lundi au vendredi de 8h à 19h, et le samedi de 9h à 17h. Souhaitez-vous passer ?"

User: "Ma voiture ne démarre plus"
Toi: "Je comprends, c'est embêtant. Le mieux est d'appeler directement le garage au 04 00 00 00 00 pour organiser un dépannage rapidement."

# RAPPEL FINAL
Tu es l'assistante du Garage Martin Lyon. Tu es professionnelle, humaine, brève. Tu accompagnes le client sans jamais te substituer au mécanicien. Tu termines toujours par une action.`;

// =====================================================
// FONCTION PRINCIPALE
// =====================================================
export default async function handler(req) {
if (req.method !== 'POST') {
return new Response(JSON.stringify({ error: 'Method not allowed' }), {
status: 405,
headers: { 'content-type': 'application/json' },
});
}

try {
const body = await req.json();
const { messages } = body;

// Validation messages
if (!Array.isArray(messages) || messages.length === 0) {
return new Response(
JSON.stringify({
reply: "Bonjour. Comment puis-je vous aider aujourd'hui ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Limite historique (10 derniers messages)
const recentMessages = messages.slice(-10).map((m) => ({
role: m.role === 'assistant' ? 'assistant' : 'user',
content: String(m.content || '').slice(0, 500),
}));

// Vérification clé API
if (!process.env.ANTHROPIC_API_KEY) {
console.error('ANTHROPIC_API_KEY manquante');
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté technique. Vous pouvez contacter directement le garage au 04 00 00 00 00.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

// Appel Claude API
const response = await fetch('https://api.anthropic.com/v1/messages', {
method: 'POST',
headers: {
'content-type': 'application/json',
'x-api-key': process.env.ANTHROPIC_API_KEY,
'anthropic-version': '2023-06-01',
},
body: JSON.stringify({
model: 'claude-haiku-4-5-20251001',
max_tokens: 200,
temperature: 0.4,
system: SYSTEM_PROMPT,
messages: recentMessages,
}),
});

if (!response.ok) {
const errorText = await response.text();
console.error('Erreur Claude API:', response.status, errorText);
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté momentanée. Pouvez-vous reformuler ?",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}

const data = await response.json();
const reply =
data?.content?.[0]?.text ||
"Je peux vous aider sur les rendez-vous, horaires, tarifs ou une panne. Que souhaitez-vous ?";

return new Response(JSON.stringify({ reply }), {
status: 200,
headers: { 'content-type': 'application/json' },
});
} catch (err) {
console.error('Erreur fonction chat:', err);
return new Response(
JSON.stringify({
reply:
"Je rencontre une difficulté technique. Vous pouvez contacter directement le garage au 04 00 00 00 00.",
}),
{ status: 200, headers: { 'content-type': 'application/json' } }
);
}
}

