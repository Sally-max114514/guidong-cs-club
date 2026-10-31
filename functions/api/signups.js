import { errorResponse, jsonResponse, requireAdmin, requireDatabase } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const database = requireDatabase(env);
    const { results = [] } = await database
      .prepare(
        'SELECT id, name, class_name, contact, direction, note, created_at FROM signups ORDER BY id DESC',
      )
      .all();
    return jsonResponse({ count: results.length, items: results });
  } catch (error) {
    return errorResponse(error);
  }
}
