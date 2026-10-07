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

const JWT_ANYWHERE = /eyJ[\w-]+\.[\w-]+\.[\w-]*/g;
export function redactObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.trim().startsWith('{')) { // JSON inteiro chegou como NOME de parâmetro (visto no cliente 20230414)
      try { out['<json-in-key>'] = redactObject(JSON.parse(k)); continue; } catch { /* segue como chave comum */ }
    }
    const key = k.replace(JWT_ANYWHERE, (m) => mask(m));
    if (SENSITIVE.test(k)) out[key] = mask(v);
    else if (typeof v === 'string' && /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/.test(v)) out[key] = mask(v); // JWT em qualquer campo
    else out[key] = typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + `…<${v.length} chars>` : v;
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
    if (/json/i.test(ct) || text.trim().startsWith('{')) return redactObject(JSON.parse(text));
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
// Photon Custom Authentication — POST|GET /auth/photon
//
// Formato observado no cliente 20230414: JSON { accountId, accessToken } com o JWT de
// acesso do jogo (o mesmo de /auth/connect/token, amr=cached_login). O corpo pode vir
// rotulado como formulário; por isso o JSON é tentado ANTES de qualquer parser de form.
// A identidade é SEMPRE o `sub` do JWT validado. Esta rota nunca cria conta, nunca emite
// outro token e nunca altera presença/instância.
//
// Formato da resposta (ResultCode/UserId/Message) é o documentado pelo Photon para
// Custom Authentication.
// UNKNOWN / REQUIRES CLIENT TRACE: se o Photon do jogo exige Nickname/AuthCookie.
// ---------------------------------------------------------------------------
const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;

function parseBody(text, ct) {
  const t = text.trim();
  if (!t) return {};
  if (t.startsWith('{') || /json/i.test(ct)) {
    try { const j = JSON.parse(t); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /* tenta como form */ }
  }
  return Object.fromEntries(new URLSearchParams(text));
}

export async function photonAuth(request, { db, secret }) {
  const url = new URL(request.url);
  const ct = request.headers.get('content-type') || '';
  const queryObj = Object.fromEntries(url.searchParams);
  let bodyObj = {};
  if (request.method !== 'GET' && request.method !== 'HEAD') bodyObj = parseBody((await request.text().catch(() => '')).slice(0, 16384), ct);

  // Procura um campo (sem diferenciar maiúsculas) no corpo e depois na query.
  const field = (name) => {
    for (const [label, o] of [['body', bodyObj], ['query', queryObj]])
      for (const k of Object.keys(o)) if (k.toLowerCase() === name.toLowerCase() && o[k] != null && o[k] !== '' && typeof o[k] !== 'object') return { value: String(o[k]), source: `${label}:${k}` };
    return null;
  };

  let accessToken = null, tokenSource = null, claimedAccountId = null;
  const direct = field('accessToken');
  if (direct) { accessToken = direct.value; tokenSource = direct.source; }
  const claimed = field('accountId');
  if (claimed) claimedAccountId = claimed.value;

  const authorization = request.headers.get('authorization') || '';
  if (!accessToken && /^bearer /i.test(authorization)) { accessToken = authorization.slice(7).trim(); tokenSource = 'authorization'; }

  // Formato C: JSON inteiro como NOME de parâmetro, valor vazio.
  if (!accessToken || claimedAccountId == null) {
    for (const o of [bodyObj, queryObj]) for (const key of Object.keys(o)) {
      if (!key || !key.trim().startsWith('{')) continue;
      try {
        const parsed = JSON.parse(key);
        if (parsed && typeof parsed === 'object') {
          if (!accessToken && parsed.accessToken) { accessToken = String(parsed.accessToken); tokenSource = 'photon_json_key'; }
          if (claimedAccountId == null && parsed.accountId != null) claimedAccountId = String(parsed.accountId);
        }
      } catch { /* não interrompe o restante */ }
    }
  }

  // Último recurso (comportamento anterior): qualquer valor com formato de JWT.
  if (!accessToken) for (const o of [bodyObj, queryObj]) for (const [k, v] of Object.entries(o))
    if (!accessToken && typeof v === 'string' && JWT_SHAPE.test(v)) { accessToken = v; tokenSource = `param:${k}`; }

  const clientRegion = field('region') || field('photonRegion');
  const region = clientRegion ? clientRegion.value : (process.env.PHOTON_REGION || 'us');
  const appIds = ['PHOTON_REALTIME_APP_ID', 'PHOTON_VOICE_APP_ID', 'PHOTON_CHAT_APP_ID'].map((n) => process.env[n]).filter(Boolean);
  const log = {
    method: request.method, query: queryOf(url), params: redactObject({ ...queryObj, ...bodyObj }),
    account: '<unknown>', tokenSource: tokenSource || 'NOT FOUND', tokenValid: false, sub: '<none>',
    accountIdClaimed: claimedAccountId ?? '<none>',
    region, regionSource: clientRegion ? `client(${clientRegion.source})` : 'server-config',
  };
  if (enabled('debug')) { log.headers = relevantHeaders(request.headers); log.contentType = ct || '<none>'; }

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

  if (!accessToken) return finish(3, 'no accessToken/JWT found in body, query, Authorization header or JSON-in-key');

  let claims;
  try { claims = await verify(accessToken, secret); } catch (e) { return finish(2, `token rejected: ${e.message}`); }
  log.tokenValid = true; // assinatura e expiração conferem
  log.sub = claims.sub ?? '<missing>';
  const accountId = Number(claims.sub);
  if (claims.sub == null || !Number.isSafeInteger(accountId) || accountId < 1) { log.tokenValid = false; return finish(2, 'token has no valid sub'); }
  log.account = accountId;
  if (claimedAccountId != null && String(claimedAccountId) !== String(accountId)) return finish(2, 'accountId does not match token sub', { UserId: accountId });

  const aud = typeof claims.aud === 'string' ? claims.aud : '';
  const audKind = aud && appIds.includes(aud) ? 'photon-appid' : (claims.client_id === 'recroom' ? 'game-access-token' : 'other');
  const base = { UserId: accountId, AudKind: audKind, AppId: audKind === 'photon-appid' ? mask(aud) : (appIds[0] ? mask(appIds[0]) : '<none configured>'), TokenVer: claims['rn.ver'], TokenAmr: claims.amr, Token: '<redacted>' };

  // Mesma consulta de /accounts/account/me: somente leitura, nunca cria conta.
  const account = await getAccount(db, accountId);
  if (!account) return finish(2, 'account not found (no account is created by this route)', base);
  const presence = await getPresence(db, accountId).catch(() => null);
  return finish(1, '', {
    ...base, Username: account.username,
    Room: presence?.roomInstance?.photonRoomId ?? '<not in a room>', RoomInstanceId: presence?.roomInstance?.roomInstanceId,
  });
}
