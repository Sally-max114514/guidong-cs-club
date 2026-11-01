import { ApiError, assertSameOrigin, errorResponse, jsonResponse, readJson, requireAdmin, requireDatabase } from '../../_lib.js';

const REVIEW_STATUSES = new Set(['pending', 'admitted', 'rejected']);

export async function onRequestPatch({ request, env, params }) {
  try {
    assertSameOrigin(request);
    await requireAdmin(request, env);
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, '参数错误');

    const data = await readJson(request);
    const status = String(data.review_status || '');
    if (!REVIEW_STATUSES.has(status)) throw new ApiError(400, '报名审核状态不正确');

    const database = requireDatabase(env);
    const existing = await database.prepare('SELECT id FROM signups WHERE id = ?').bind(id).first();
    if (!existing) throw new ApiError(404, '报名记录不存在');

    await database
      .prepare('UPDATE signups SET review_status = ? WHERE id = ?')
      .bind(status, id)
      .run();
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete({ request, env, params }) {
  try {
    assertSameOrigin(request);
    await requireAdmin(request, env);
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, '参数错误');

    const database = requireDatabase(env);
    const result = await database.prepare('DELETE FROM signups WHERE id = ?').bind(id).run();
    if (!result.meta.changes) throw new ApiError(404, '报名记录不存在');
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
