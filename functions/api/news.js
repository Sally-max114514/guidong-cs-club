import { ApiError, assertSameOrigin, errorResponse, jsonResponse, readJson, requireAdmin, requireDatabase } from '../_lib.js';

export async function onRequestGet({ env }) {
  try {
    const database = requireDatabase(env);
    const { results = [] } = await database
      .prepare('SELECT id, title, body, pinned, created_at FROM news ORDER BY pinned DESC, id DESC LIMIT 100')
      .all();
    return jsonResponse({ items: results });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    await requireAdmin(request, env);
    const data = await readJson(request);
    const title = String(data.title || '').trim();
    const body = String(data.body || '').trim();
    if (!title || title.length > 80) throw new ApiError(400, '标题不能为空，且不超过 80 字');
    if (!body || body.length > 5000) throw new ApiError(400, '内容不能为空，且不超过 5000 字');

    const database = requireDatabase(env);
    const result = await database
      .prepare(
        `INSERT INTO news (title, body, pinned, created_at)
         VALUES (?, ?, ?, datetime('now', '+8 hours'))`,
      )
      .bind(title, body, data.pinned ? 1 : 0)
      .run();

    return jsonResponse({ ok: true, id: result.meta.last_row_id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
