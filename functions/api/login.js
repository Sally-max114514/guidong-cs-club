import {
  ApiError,
  assertSameOrigin,
  constantTimePasswordMatch,
  createSession,
  errorResponse,
  jsonResponse,
  readJson,
  sessionCookie,
} from '../_lib.js';

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) {
      throw new ApiError(503, '请在 Cloudflare Pages Secrets 中设置至少 12 位的 ADMIN_PASSWORD');
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      throw new ApiError(503, '请在 Cloudflare Pages Secrets 中设置至少 32 位的 SESSION_SECRET');
    }

    const data = await readJson(request);
    if (!constantTimePasswordMatch(data.password || '', env.ADMIN_PASSWORD)) {
      throw new ApiError(401, '密码不正确');
    }

    const session = await createSession(env);
    return jsonResponse(
      { ok: true },
      200,
      { 'Set-Cookie': sessionCookie(session.token, session.expiresAt, request) },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
