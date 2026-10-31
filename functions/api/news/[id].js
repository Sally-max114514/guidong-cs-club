import { ApiError, assertSameOrigin, errorResponse, jsonResponse, requireAdmin, requireDatabase } from '../../_lib.js';

export async function onRequestDelete({ request, env, params }) {
  try {
    assertSameOrigin(request);
    await requireAdmin(request, env);
    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(400, '参数错误');

    const database = requireDatabase(env);
    const result = await database.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
    if (!result.meta.changes) throw new ApiError(404, '公告不存在');
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
