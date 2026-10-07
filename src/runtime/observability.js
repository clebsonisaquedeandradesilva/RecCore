// Observabilidade: log de requisições HTTP, [HTTP_404] e rota de trace do Photon Custom Auth.
// Nenhum segredo/token completo é impresso em nenhum nível (valores mascarados).
import { verify } from './jwt.js';
import { getAccount } from '../modules/packages/domain/src/accounts-db.js';
import { getPresence } from '../modules/packages/domain/src/presence-db.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, off: 99 };
const levelNow = () => LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const enabled = (name) => levelNow() <= LEVELS[name];

const SENSITIVE = /token|password|passwd|secret|authorization|ticket|nonce|cookie|signature|^auth$|apikey|api_key|jwt/i;
const RELEVANT_HEADERS = ['user-agent', 'content-type', 'content-length', 'accept', 'host', 'referer', 'x-unity-version', 'x-forwarded-for', 'x-forwarded-proto'];
const QUIET_PATHS = [/^\/healthz$/, /^\/www(\/|$)/, /^\/cdn(\/|$)/];

export function mask(value) {
  const s = String(value ?? '');
  if (s.length === 0) return '<empty>';
  if (s.length <= 8) return '<redacted>';
  return `${s.slice(0, 4)}…${s.slice(-2)}<${s.length} chars>`;
}

export function redactObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (SENSITIVE.test(k)) out[k] = mask(v);
    else if (typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(v)) out[k] = mask(v); // JWT em qualquer campo
    else out[k] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + `…<${v.length} chars>` : v;
  }
  return out;
}

const queryOf = (url) => redactObject(Object.fromEntries(url.searchParams));
const relevantHeaders = (headers) => {
  const out = {};
  for (const h of RELEVANT_HEADERS) { const v = headers.get(h); if (v) out[h] = v; }
  const auth = headers.get('authorization');
  if (auth) out.authorization = 'Bearer ' + mask(auth.replace(/^bearer\s+/i, ''));
  return out;
};

async function accountFromRequest(request, secret) {
  const auth = request.headers.get('authorization');
  if (!auth || !/^bearer /i.test(auth)) return 'anonymous';
  try { return String((await verify(auth.slice(7), secret)).sub); } catch { return 'invalid-token'; }
}

const textual = (ct) => /json|x-www-form-urlencoded|text\//i.test(ct || '');
function parseBodyText(text, ct) {
  if (!text) return '';
  try {
    if (/json/i.test(ct)) return redactObject(JSON.parse(text));
    if (/x-www-form-urlencoded/i.test(ct)) return redactObject(Object.fromEntries(new URLSearchParams(text)));
  } catch { /* cai para texto cru truncado */ }
  return text.length > 500 ? text.slice(0, 500) + `…<${text.length} chars>` : text;
}

async function captureBody(request) {
  const ct = request.headers.get('content-type') || '';
  const len = Number(request.headers.get('content-length') || 0);
  if (request.method === 'GET' || request.method === 'HEAD' || !textual(ct) || len > 65536) {
    return { clone: null, note: len ? `<not captured: ${ct || 'no content-type'}, ${len} bytes>` : '' };
  }
  return { clone: request.clone(), ct };
}

const block = (tag, first, fields) =>
  `${tag} ${first}\n` + Object.entries(fields).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `      ${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');

export function withRequestLog(inner, { secret }) {
  return async function logged(request) {
    if (!enabled('error')) return inner(request);
    const started = performance.now();
    const url = new URL(request.url);
    const body = await captureBody(request);
    let response, failure;
    try { response = await inner(request); } catch (e) { failure = e; }
    const ms = Math.round(performance.now() - started);
    const status = failure ? 500 : response.status;
    const quiet = QUIET_PATHS.some((re) => re.test(url.pathname));
    const account = await accountFromRequest(request, secret);
    const q = queryOf(url);
    const hasQ = Object.keys(q).length > 0;

    if (status === 404) {
      if (enabled('warn')) {
        let reqBody = body.note || '';
        if (body.clone) reqBody = parseBodyText((await body.clone.text().catch(() => '')).slice(0, 4000), body.ct);
        console.log(block('[HTTP_404]', `${request.method} ${url.pathname}`, {
          query: hasQ ? q : undefined, account, status, headers: relevantHeaders(request.headers), body: reqBody, ms: ms + 'ms',
        }));
      }
    } else if (status >= 500) {
      console.error(block('[HTTP_5XX]', `${request.method} ${url.pathname}`, { query: hasQ ? q : undefined, account, status, error: failure?.message, ms: ms + 'ms' }));
    } else if (enabled(quiet ? 'debug' : 'info')) {
      const fields = { query: hasQ ? q : undefined, account, status };
      let line = block('[HTTP]', `${request.method} ${url.pathname}`, fields) + `\n      ${ms}ms`;
      if (enabled('debug')) {
        let reqBody = body.note || '';
        if (body.clone) reqBody = parseBodyText((await body.clone.text().catch(() => '')).slice(0, 2000), body.ct);
        if (reqBody !== '') line += `\n      body=${JSON.stringify(reqBody)}`;
        line += `\n      headers=${JSON.stringify(relevantHeaders(request.headers))}`;
      }
      console.log(line);
    }
    if (failure) throw failure;
    return response;
  };
}

// ---------------------------------------------------------------------------
// Photon Custom Authentication — rota de TRACE.
//
// Quem chama esta URL é o Photon Cloud (configurada no painel do Photon), não o
// cliente. A FORMA DA RESPOSTA abaixo (ResultCode/UserId/Message) é o formato
// documentado pelo Photon para webhooks de Custom Authentication.
//
// UNKNOWN / REQUIRES CLIENT TRACE:
//   - Em qual parâmetro (query, form, JSON ou header) o build 20230414 envia o token.
//     Por isso o código procura QUALQUER valor com formato de JWT e registra a origem.
//   - Se o cliente envia região/sala como parâmetros de autenticação.
//   - Se o Photon do jogo exige Nickname/AuthCookie na resposta.
// ---------------------------------------------------------------------------
const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;

export async function photonAuth(request, { db, secret }) {
  const url = new URL(request.url);
  const ct = request.headers.get('content-type') || '';
  const params = { ...Object.fromEntries(url.searchParams) };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const text = (await request.text().catch(() => '')).slice(0, 16384);
    try {
      if (/json/i.test(ct)) Object.assign(params, JSON.parse(text));
      else if (text) Object.assign(params, Object.fromEntries(new URLSearchParams(text)));
    } catch { /* corpo ilegível: segue só com a query */ }
  }

  let token = null; let tokenSource = null;
  const bearer = request.headers.get('authorization');
  if (bearer && /^bearer /i.test(bearer) && JWT_SHAPE.test(bearer.slice(7))) { token = bearer.slice(7); tokenSource = 'header:authorization'; }
  if (!token) for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && JWT_SHAPE.test(v)) { token = v; tokenSource = `param:${k}`; break; }

  const region = process.env.PHOTON_REGION || 'us';
  const appIds = ['PHOTON_REALTIME_APP_ID', 'PHOTON_VOICE_APP_ID', 'PHOTON_CHAT_APP_ID'].map((n) => process.env[n]).filter(Boolean);
  const log = { method: request.method, query: queryOf(url), params: redactObject(params), tokenSource: tokenSource || 'NOT FOUND', region };
  if (enabled('debug')) log.headers = relevantHeaders(request.headers);

  const finish = (resultCode, message, extra = {}) => {
    if (enabled('info')) {
      console.log(block('[PHOTON_AUTH]', `result=${resultCode === 1 ? 'success' : 'failure'}`, {
        ...log, ...extra, ...(message ? { reason: message } : {}),
        note: resultCode === 1 ? undefined : 'UNKNOWN / REQUIRES CLIENT TRACE: confira tokenSource e params acima',
      }));
    }
    // Sempre HTTP 200: o Photon lê o ResultCode do JSON.
    const payload = resultCode === 1 ? { ResultCode: 1, Message: '', UserId: String(extra.UserId) } : { ResultCode: resultCode, Message: message };
    return Response.json(payload);
  };

  if (!token) return finish(3, 'no JWT-shaped credential found in query, body or Authorization header');

  let claims;
  try { claims = await verify(token, secret); } catch (e) { return finish(2, `token rejected: ${e.message}`); }
  const accountId = Number(claims.sub);
  if (!Number.isSafeInteger(accountId) || accountId < 1) return finish(2, 'token has no valid sub');
  const aud = typeof claims.aud === 'string' ? claims.aud : '';
  if (appIds.length > 0 && !appIds.includes(aud)) return finish(2, 'token audience is not a configured Photon AppId', { AppId: mask(aud) });
  const account = await getAccount(db, accountId);
  if (!account) return finish(2, 'account not found', { UserId: accountId });
  const presence = await getPresence(db, accountId).catch(() => null);
  return finish(1, '', {
    AppId: aud ? mask(aud) : '<none configured>', UserId: accountId, Username: account.username, Token: '<redacted>',
    Room: presence?.roomInstance?.photonRoomId ?? '<not in a room>', RoomInstanceId: presence?.roomInstance?.roomInstanceId,
  });
}
