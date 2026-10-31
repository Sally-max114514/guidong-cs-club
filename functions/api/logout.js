import { assertSameOrigin, clearSessionCookie, errorResponse, jsonResponse } from '../_lib.js';

export async function onRequestPost({ request }) {
  try {
    assertSameOrigin(request);
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  } catch (error) {
    return errorResponse(error);
  }
}
