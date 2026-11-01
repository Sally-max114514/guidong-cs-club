import { ApiError, errorResponse, requireAdmin, requireDatabase } from '../_lib.js';

const REVIEW_STATUSES = new Set(['pending', 'admitted', 'rejected']);

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const status = new URL(request.url).searchParams.get('status') || 'all';
    if (status !== 'all' && !REVIEW_STATUSES.has(status)) {
      throw new ApiError(400, '报名审核状态筛选条件不正确');
    }

    const database = requireDatabase(env);
    const query = status === 'all'
      ? 'SELECT id, name, class_name, contact, direction, note, review_status, created_at FROM signups ORDER BY id ASC'
      : 'SELECT id, name, class_name, contact, direction, note, review_status, created_at FROM signups WHERE review_status = ? ORDER BY id ASC';
    const statement = database.prepare(query);
    const { results = [] } = status === 'all'
      ? await statement.all()
      : await statement.bind(status).all();
    const header = ['序号', '姓名', '班级', '联系方式', '意向方向', '备注', '审核状态', '报名时间'];
    const rows = results.map((item) => [
      item.id,
      item.name,
      item.class_name,
      item.contact,
      item.direction,
      item.note,
      ({ pending: '待审核', admitted: '已录取', rejected: '未录取' })[item.review_status] || '待审核',
      item.created_at,
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="signups_${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
