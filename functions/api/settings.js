import { ApiError, assertSameOrigin, errorResponse, jsonResponse, readJson, requireAdmin, requireDatabase } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const database = requireDatabase(env);
    const setting = await database
      .prepare("SELECT value FROM settings WHERE key = 'invite_code'")
      .first();
    if (!setting) throw new ApiError(503, '社团暗号尚未初始化，请先应用数据库迁移');
    return jsonResponse({ invite_code: setting.value });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    await requireAdmin(request, env);
    const data = await readJson(request);
    const inviteCode = String(data.invite_code || '').trim();
    if (!inviteCode || inviteCode.length > 32) {
      throw new ApiError(400, '社团暗号不能为空，且不超过 32 个字符');
    }

    const database = requireDatabase(env);
    await database
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES ('invite_code', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(inviteCode)
      .run();

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
