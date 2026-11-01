import { ApiError, errorResponse, jsonResponse, requireAdmin, requireDatabase } from '../_lib.js';

const REVIEW_STATUSES = new Set(['pending', 'admitted', 'rejected']);

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const status = new URL(request.url).searchParams.get('status') || 'all';
    if (status !== 'all' && !REVIEW_STATUSES.has(status)) {
      throw new ApiError(400, '报名审核状态筛选条件不正确');
    }

    const database = requireDatabase(env);
    const query = status === 'all'
      ? 'SELECT id, name, class_name, contact, direction, note, review_status, created_at FROM signups ORDER BY id DESC'
      : 'SELECT id, name, class_name, contact, direction, note, review_status, created_at FROM signups WHERE review_status = ? ORDER BY id DESC';
    const statement = database.prepare(query);
    const { results = [] } = status === 'all'
      ? await statement.all()
      : await statement.bind(status).all();
    return jsonResponse({ count: results.length, items: results });
  } catch (error) {
    return errorResponse(error);
  }
}
