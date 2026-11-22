// ─── RELAIS DISCORD 327TH (Cloudflare Worker) ────────────────────
//
// Le site est 100 % statique : tout ce qu'il contient est lisible par
// n'importe qui. Les liens des webhooks Discord ne doivent donc PAS y
// figurer. Ce petit serveur gratuit (Cloudflare Workers) garde les
// liens en secret et poste à leur place dans les salons Discord.
//
// Le site appelle :   POST https://<relais>/<salon>   (+ ?wait=true)
// avec exactement le même contenu qu'il enverrait au webhook (JSON, ou
// formulaire avec fichier pour le recrutement).
//
// Protections :
//  - les liens ne sont que dans les « Secrets » Cloudflare (jamais dans le code) ;
//  - seuls les sites listés dans ALLOWED_ORIGINS peuvent l'appeler depuis un navigateur ;
//  - @everyone / @here / mentions de membres toujours bloqués, et seuls les
//    rôles listés dans ALLOWED_ROLE_IDS peuvent être pingés ;
//  - taille limitée et nombre d'envois limité par adresse IP.
//
// Installation : voir README.md dans ce dossier.

// Salon demandé par le site → nom du Secret Cloudflare qui contient le lien
const CHANNELS = {
  recrutement: 'WEBHOOK_RECRUTEMENT', // fiches du formulaire de recrutement (forum)
  resultats:   'WEBHOOK_RESULTATS',   // résultats de recrutement + « À Remettre »
  vote:        'WEBHOOK_VOTE',        // votes
  freeze:      'WEBHOOK_FREEZE',      // freeze promote
  entrainement: 'WEBHOOK_ENTRAINEMENT' // planning entraînement
};

// Rôles Discord que le site a le droit de pinger
const ALLOWED_ROLE_IDS = ['734436392612134952', '1284668325938335754'];

// Sites autorisés (remplaçable par la variable ALLOWED_ORIGINS, séparée par des virgules)
const DEFAULT_ALLOWED_ORIGINS = 'https://lucasmasure.github.io';

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT = 20;              // envois max…
const RATE_WINDOW_MS = 60 * 1000;   // …par minute et par IP
const hits = new Map();

// ── Annonce automatique des entraînements (tâche planifiée) ──────
// Toutes les 5 min (Cron Trigger « */5 * * * * »), lit le planning dans
// Firebase et poste l'annonce dans WEBHOOK_ENTRAINEMENT environ 1 h avant
// chaque entraînement. L'envoi est noté sur l'entraînement
// (champ annonceEnvoyee) pour ne jamais l'annoncer deux fois ; s'il est
// déplacé à une autre heure, il est ré-annoncé à la nouvelle heure.
const FIREBASE_DB_URL = 'https://th-site-f3656-default-rtdb.europe-west1.firebasedatabase.app';
const TRAINING_PATH = 'planningEntrainement';
const PLANNING_PAGE_URL = 'https://lucasmasure.github.io/site327th/planningentrainement.html';
const TIME_ZONE = 'Europe/Paris';
// Rôle pingé par l'annonce (remplaçable par la variable TRAINING_ROLE_ID ; « aucun » = pas de ping)
const DEFAULT_TRAINING_ROLE_ID = '734436392612134952';
const ANNOUNCE_BEFORE_MS = 60 * 60 * 1000;
const EMBED_COLOR = 0xF0B429;

// Décalage (ms) de l'heure de Paris par rapport à UTC à un instant donné
function parisOffset(utcMs) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs)).forEach(function (p) { parts[p.type] = p.value; });
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// « 2026-11-20 » + « 23:00 » (heure de Paris) → timestamp UTC (ms)
function parisToUtc(dateKey, heure) {
  const d = String(dateKey).split('-').map(Number);
  const t = String(heure || '').split(':').map(Number);
  if (d.length !== 3 || t.length < 2 || d.concat(t).some(isNaN)) return NaN;
  const guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
  let utc = guess - parisOffset(guess);
  utc = guess - parisOffset(utc);
  return utc;
}

function parisDateKey(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function buildTrainingAnnounce(dateKey, id, ev, startMs, nowMs, roleId) {
  const unix = Math.floor(startMs / 1000);
  const hhmm = String(ev.heure).replace(':', 'h');
  const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(startMs));
  const minutesLeft = Math.round((startMs - nowMs) / 60000);
  const when = minutesLeft >= 50 ? 'dans 1 heure' : 'dans ' + Math.max(minutesLeft, 1) + ' minute' + (minutesLeft > 1 ? 's' : '');
  const link = PLANNING_PAGE_URL + '?date=' + encodeURIComponent(dateKey) + '&entrainement=' + encodeURIComponent(id);
  const clip = function (s, n) { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  const embed = {
    title: clip('🎯 ' + (ev.titre || 'Entraînement'), 256),
    url: link,
    color: EMBED_COLOR,
    fields: [
      { name: '🕘 Horaire', value: dayLabel + ' à **' + hhmm + '** · <t:' + unix + ':t> chez vous', inline: false },
      { name: '🎖️ Encadré par', value: clip(ev.createur || '—', 1024), inline: true },
      { name: '📆 Planning', value: '[Voir l\'entraînement](' + link + ')', inline: true }
    ],
    footer: { text: '327th Corps Stellaire · Planning entraînement' },
    timestamp: new Date(startMs).toISOString()
  };
  if (ev.details) embed.description = clip(ev.details, 4000);

  const text = '📢 **Entraînement ' + when + ' !** Rendez-vous à **' + hhmm + '** (<t:' + unix + ':R>).';
  return {
    content: roleId ? '<@&' + roleId + '> ' + text : text,
    allowed_mentions: { parse: [], roles: roleId ? [roleId] : [] },
    embeds: [embed]
  };
}

async function announceTrainings(env) {
  const webhook = env.WEBHOOK_ENTRAINEMENT;
  if (!webhook) return;
  const roleSetting = env.TRAINING_ROLE_ID === undefined ? DEFAULT_TRAINING_ROLE_ID : String(env.TRAINING_ROLE_ID).trim();
  const roleId = /^\d+$/.test(roleSetting) ? roleSetting : '';
  const now = Date.now();
  // Seulement aujourd'hui et demain (heure de Paris)
  const from = parisDateKey(now);
  const to = parisDateKey(now + 36 * 60 * 60 * 1000);
  const query = '?orderBy=' + encodeURIComponent('"$key"') + '&startAt=' + encodeURIComponent('"' + from + '"') + '&endAt=' + encodeURIComponent('"' + to + '"');
  const res = await fetch(FIREBASE_DB_URL + '/' + TRAINING_PATH + '.json' + query);
  if (!res.ok) return;
  const planning = (await res.json()) || {};

  for (const dateKey of Object.keys(planning)) {
    const day = planning[dateKey];
    if (!day || typeof day !== 'object') continue;
    for (const id of Object.keys(day)) {
      const ev = day[id];
      if (!ev || typeof ev !== 'object' || !ev.heure) continue;
      const start = parisToUtc(dateKey, ev.heure);
      if (isNaN(start)) continue;
      const left = start - now;
      if (left <= 0 || left > ANNOUNCE_BEFORE_MS) continue;
      if (ev.annonceEnvoyee === start) continue; // déjà annoncé à cette heure-là

      const sent = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTrainingAnnounce(dateKey, id, ev, start, now, roleId))
      });
      if (!sent.ok) continue; // réessayé au prochain passage
      await fetch(FIREBASE_DB_URL + '/' + TRAINING_PATH + '/' + encodeURIComponent(dateKey) + '/' + encodeURIComponent(id) + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annonceEnvoyee: start })
      });
    }
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(status, body, origin) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, origin ? corsHeaders(origin) : {})
  });
}

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(function (t) { return now - t < RATE_WINDOW_MS; });
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
}

// Empêche @everyone, @here, les mentions de membres et les rôles non autorisés
function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const am = payload.allowed_mentions && typeof payload.allowed_mentions === 'object' ? payload.allowed_mentions : {};
  const roles = Array.isArray(am.roles) ? am.roles.filter(function (r) { return ALLOWED_ROLE_IDS.indexOf(String(r)) !== -1; }) : [];
  payload.allowed_mentions = { parse: [], roles: roles };
  return payload;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(announceTrainings(env));
  },

  async fetch(request, env) {
    const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
      .split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const okOrigin = allowed.indexOf(origin) !== -1 ? origin : '';

    if (request.method === 'OPTIONS') {
      return okOrigin ? new Response(null, { status: 204, headers: corsHeaders(okOrigin) }) : new Response(null, { status: 403 });
    }
    if (!okOrigin) return reply(403, { error: 'Origine non autorisée' });
    if (request.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' }, okOrigin);

    const url = new URL(request.url);
    const channel = url.pathname.replace(/^\/+|\/+$/g, '');
    const secretName = CHANNELS[channel];
    const webhook = secretName && env[secretName];
    if (!webhook) return reply(404, { error: 'Salon inconnu' }, okOrigin);

    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    if (rateLimited(ip)) return reply(429, { error: 'Trop d\'envois, réessayez dans une minute' }, okOrigin);

    const length = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (length > MAX_BODY_BYTES) return reply(413, { error: 'Envoi trop volumineux' }, okOrigin);

    const contentType = request.headers.get('Content-Type') || '';
    let body;
    let headers = {};
    try {
      if (contentType.indexOf('multipart/form-data') === 0) {
        const form = await request.formData();
        const out = new FormData();
        for (const [key, value] of form.entries()) {
          if (key === 'payload_json') out.append(key, JSON.stringify(sanitizePayload(JSON.parse(value))));
          else out.append(key, value);
        }
        body = out; // le Content-Type (avec boundary) est recalculé automatiquement
      } else {
        body = JSON.stringify(sanitizePayload(await request.json()));
        headers['Content-Type'] = 'application/json';
      }
    } catch (e) {
      return reply(400, { error: 'Contenu invalide' }, okOrigin);
    }

    const target = new URL(webhook);
    if (url.searchParams.get('wait') === 'true') target.searchParams.set('wait', 'true');

    const res = await fetch(target.toString(), { method: 'POST', headers: headers, body: body });
    const text = await res.text();
    // On ne renvoie jamais le lien du webhook, seulement la réponse de Discord
    return new Response(text || null, {
      status: res.status,
      headers: Object.assign({ 'Content-Type': res.headers.get('Content-Type') || 'application/json' }, corsHeaders(okOrigin))
    });
  }
};
