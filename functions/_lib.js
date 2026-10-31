const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MAX_BODY_BYTES = 64 * 1024;
const encoder = new TextEncoder();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new ApiError(413, '请求内容过大');
  }

  const text = await request.text();
  if (!text || encoder.encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(413, '请求内容为空或过大');
  }

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Expected an object');
    }
    return data;
  } catch {
    throw new ApiError(400, '请求格式错误');
  }
}

export function requireDatabase(env) {
  if (!env.CLUB_DB) {
    throw new ApiError(503, '数据库未配置，请检查 Cloudflare D1 绑定 CLUB_DB');
  }
  return env.CLUB_DB;
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    throw new ApiError(403, '请求来源不正确');
  }
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function constantTimeEqual(left, right) {
  let mismatch = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);
  for (let i = 0; i < maxLength; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function getCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  for (const part of cookies.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return '';
}

function requireSecrets(env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
    throw new ApiError(503, '管理员密码未配置或少于 12 位，请在 Pages Secrets 中设置 ADMIN_PASSWORD');
  }
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new ApiError(503, '会话密钥未配置或少于 32 位，请在 Pages Secrets 中设置 SESSION_SECRET');
  }
}

export async function verifyAdmin(request, env) {
  requireSecrets(env);
  const token = getCookie(request, 'club_session');
  if (!token) return false;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return false;

  try {
    const expiresAt = Number(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = base64UrlEncode(await sign(payload, env.SESSION_SECRET));
    return constantTimeEqual(signature, expected);
  } catch {
    return false;
  }
}

export async function requireAdmin(request, env) {
  if (!(await verifyAdmin(request, env))) {
    throw new ApiError(401, '请先登录');
  }
}

export async function createSession(env) {
  requireSecrets(env);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = base64UrlEncode(encoder.encode(String(expiresAt)));
  const signature = base64UrlEncode(await sign(payload, env.SESSION_SECRET));
  return { token: `${payload}.${signature}`, expiresAt: SESSION_TTL_SECONDS };
}

export function sessionCookie(token, maxAge, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `club_session=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `club_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

export function constantTimePasswordMatch(provided, expected) {
  return constantTimeEqual(String(provided), String(expected));
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse({ error: error.message }, error.status);
  }
  console.error(error);
  return jsonResponse({ error: '服务器内部错误' }, 500);
}
