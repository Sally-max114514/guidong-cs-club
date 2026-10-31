import { errorResponse, requireAdmin, requireDatabase } from '../_lib.js';

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function onRequestGet({ request, env }) {
  try {
    await requireAdmin(request, env);
    const database = requireDatabase(env);
    const { results = [] } = await database
      .prepare(
        'SELECT id, name, class_name, contact, direction, note, created_at FROM signups ORDER BY id ASC',
      )
      .all();
    const header = ['序号', '姓名', '班级', '联系方式', '意向方向', '备注', '报名时间'];
    const rows = results.map((item) => [
      item.id,
      item.name,
      item.class_name,
      item.contact,
      item.direction,
      item.note,
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
