import { ApiError, assertSameOrigin, errorResponse, jsonResponse, readJson, requireDatabase } from '../_lib.js';

const DIRECTIONS = new Set(['程序开发', '硬件装配', '人工智能', '平面设计', '还没想好', '']);

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    const data = await readJson(request);
    if (String(data.website || '').trim()) {
      throw new ApiError(400, '表单校验未通过');
    }

    const name = String(data.name || '').trim();
    const className = String(data.class_name || '').trim();
    const contact = String(data.contact || '').trim();
    const direction = String(data.direction || '').trim();
    const note = String(data.note || '').trim();

    const database = requireDatabase(env);
    const setting = await database
      .prepare("SELECT value FROM settings WHERE key = 'invite_code'")
      .first();
    if (!setting) throw new ApiError(503, '社团暗号尚未初始化，请先应用数据库迁移');
    const inviteCode = String(data.invite_code || '').trim();
    if (inviteCode.toLowerCase() !== String(setting.value || '').trim().toLowerCase()) {
      throw new ApiError(403, '社团暗号不正确');
    }

    if (!name || name.length > 10) throw new ApiError(400, '请填写姓名（不超过 10 字）');
    if (!className || className.length > 15) throw new ApiError(400, '请填写班级（不超过 15 字）');
    if (contact && !/^\d{5,15}$/.test(contact)) {
      throw new ApiError(400, '请输入5-15位数字作为联系方式');
    }
    if (!DIRECTIONS.has(direction)) throw new ApiError(400, '意向方向不正确');
    if (note.length > 300) throw new ApiError(400, '备注请控制在 300 字以内');

    const result = await database
      .prepare(
        `INSERT INTO signups (name, class_name, contact, direction, note, created_at)
         SELECT ?, ?, ?, ?, ?, datetime('now', '+8 hours')
         WHERE NOT EXISTS (
           SELECT 1 FROM signups
           WHERE name = ? AND class_name = ?
             AND created_at > datetime('now', '+8 hours', '-1 minute')
         )`,
      )
      .bind(name, className, contact, direction, note, name, className)
      .run();

    if (!result.meta.changes) {
      throw new ApiError(409, '你刚刚已经提交过了，请勿重复报名');
    }
    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
