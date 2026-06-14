// /api/_utils.js
// Utilitaires partagés par les fonctions edge (préfixe "_" => non routé par Vercel).
// - Contrôle d'origine (anti-abus / anti-proxy ouvert)
// - Rate limiting par IP via Upstash Redis REST (dégradation gracieuse si non configuré)

// =====================================================
// CONTRÔLE D'ORIGINE
// =====================================================
// Domaines autorisés. Surchargé par la variable d'env ALLOWED_ORIGINS
// (liste séparée par des virgules). Localhost autorisé pour le dev.
const DEFAULT_ALLOWED = [
  'https://sitesgarages-lyon.fr',
  'https://www.sitesgarages-lyon.fr',
];

function allowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_ALLOWED;
}

// Renvoie true si la requête provient d'une origine de confiance.
// Vérifie l'en-tête Origin, puis se rabat sur Referer.
export function isAllowedOrigin(req) {
  const list = allowedOrigins();
  const origin = req.headers.get('origin');
  if (origin) {
    return list.includes(origin);
  }
  // Pas d'Origin (ex: certains clients) -> on tolère un Referer correspondant.
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const o = new URL(referer).origin;
      return list.includes(o);
    } catch {
      return false;
    }
  }
  // Ni Origin ni Referer (curl/script) -> refusé.
  // Autorise les appels serveur internes via un secret partagé optionnel.
  if (process.env.INTERNAL_API_SECRET) {
    return req.headers.get('x-internal-secret') === process.env.INTERNAL_API_SECRET;
  }
  return false;
}

// =====================================================
// RATE LIMITING (Upstash Redis REST)
// =====================================================
// Identifie le client par IP. Dégradation gracieuse : si Upstash n'est pas
// configuré, autorise toujours (le site reste fonctionnel) mais le log
// signale l'absence de protection une seule fois.
let warnedNoStore = false;

function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// Limite "limit" requêtes par fenêtre de "windowSec" secondes pour un préfixe donné.
// Renvoie { allowed: boolean, remaining: number }.
export async function rateLimit(req, prefix, limit, windowSec) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedNoStore) {
      console.warn('Rate limiting désactivé : UPSTASH_REDIS_REST_URL/TOKEN manquants.');
      warnedNoStore = true;
    }
    return { allowed: true, remaining: limit };
  }

  const key = `rl:${prefix}:${clientIp(req)}`;

  try {
    // Pipeline atomique : INCR puis EXPIRE (uniquement si aucune expiration).
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSec), 'NX'],
      ]),
    });

    if (!res.ok) {
      // En cas d'erreur du store, on n'enferme pas les utilisateurs légitimes.
      console.error('Upstash erreur:', res.status);
      return { allowed: true, remaining: limit };
    }

    const data = await res.json();
    const count = Number(data?.[0]?.result ?? 0);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    console.error('Rate limit indisponible:', err);
    return { allowed: true, remaining: limit };
  }
}

// Réponse standard "trop de requêtes".
export function tooMany(message) {
  return new Response(
    JSON.stringify({
      ok: false,
      reply: message || 'Trop de demandes. Merci de patienter un instant.',
      error: message || 'Trop de demandes. Merci de patienter un instant.',
    }),
    {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
    }
  );
}

// Réponse standard "origine refusée".
export function forbidden() {
  return new Response(JSON.stringify({ ok: false, error: 'Origine non autorisée.' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}
