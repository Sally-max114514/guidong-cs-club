#!/usr/bin/env node
'use strict';

/**
 * 桂东一中计算机社团官网服务端（Node.js，零依赖）。
 * 提供静态页面，以及社团动态、招新报名、管理后台接口。
 * 数据保存在 data/db.json，管理员密码保存在 data/admin.json。
 *
 * 用法：
 *   node server.js
 *   node server.js --port 8080 --host 0.0.0.0
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const SESSION_TTL = 12 * 3600 * 1000;
const MAX_BODY = 64 * 1024;
const DIRECTIONS = ['程序开发', '硬件装配', '人工智能', '平面设计', '还没想好', ''];
const BLOCKED_DIRS = new Set(['data', 'scripts', 'node_modules']);
const BLOCKED_FILES = new Set(['server.js', 'package.json', 'package-lock.json']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const sessions = new Map();
const loginFails = new Map();

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const options = { host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT) || 8000 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) options.port = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) options.host = argv[++i];
  }
  return options;
}

// ---------------------------------------------------------------- 存储

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_FILE)) return { news: [], signups: [] };
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { news: Array.isArray(data.news) ? data.news : [], signups: Array.isArray(data.signups) ? data.signups : [] };
  } catch (err) {
    console.error('data/db.json 读取失败，已使用空数据：', err.message);
    return { news: [], signups: [] };
  }
}

const db = loadDb();

function saveDb() {
  ensureDataDir();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function nextId(list) {
  return list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}

function nowText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function hashPassword(password, saltHex) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 200000, 32, 'sha256').toString('hex');
}

function saveAdmin(password) {
  ensureDataDir();
  const salt = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(
    ADMIN_FILE,
    JSON.stringify({ salt, hash: hashPassword(password, salt) }, null, 2),
    'utf8'
  );
}

function loadAdmin() {
  if (fs.existsSync(ADMIN_FILE)) {
    return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
  }
  const password = crypto.randomBytes(9).toString('base64url');
  saveAdmin(password);
  console.log('\n' + '='.repeat(46));
  console.log('  已生成管理员密码（请记下，可登录后台修改）：');
  console.log(`    ${password}`);
  console.log('='.repeat(46) + '\n');
  return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
}

function checkPassword(password) {
  const admin = loadAdmin();
  const hash = hashPassword(password, admin.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(admin.hash, 'hex'));
}

// ---------------------------------------------------------------- 工具

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, '请求内容为空或过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!size) {
        reject(new ApiError(413, '请求内容为空或过大'));
        return;
      }
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('bad');
        resolve(data);
      } catch (err) {
        reject(new ApiError(400, '请求格式错误'));
      }
    });
    req.on('error', () => reject(new ApiError(400, '请求读取失败')));
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

function sessionToken(req) {
  return parseCookies(req).club_session || null;
}

function isAdmin(req) {
  const token = sessionToken(req);
  if (!token) return false;
  const expires = sessions.get(token);
  if (!expires || expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req) {
  if (!isAdmin(req)) throw new ApiError(401, '请先登录');
}

function sessionCookie(token) {
  return `club_session=${token}; Path=/; Max-Age=${SESSION_TTL / 1000}; HttpOnly; SameSite=Lax`;
}

const CLEAR_COOKIE = 'club_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ---------------------------------------------------------------- 静态文件

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (err) {
    throw new ApiError(404, '页面不存在');
  }

  let target = path.resolve(ROOT, '.' + rel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    throw new ApiError(404, '页面不存在');
  }

  let stat;
  try {
    stat = fs.statSync(target);
  } catch (err) {
    throw new ApiError(404, '页面不存在');
  }
  if (stat.isDirectory()) {
    target = path.join(target, 'index.html');
    try {
      stat = fs.statSync(target);
    } catch (err) {
      throw new ApiError(404, '页面不存在');
    }
  }

  const relative = path.relative(ROOT, target);
  const first = relative.split(path.sep)[0];
  if (BLOCKED_DIRS.has(first)) throw new ApiError(404, '页面不存在');
  if (BLOCKED_FILES.has(path.basename(target).toLowerCase())) throw new ApiError(404, '页面不存在');

  const ext = path.extname(target).toLowerCase();
  const type = MIME[ext];
  if (!stat.isFile() || !type) throw new ApiError(404, '页面不存在');

  const textAsset = ['.html', '.css', '.js', '.json'].includes(ext);
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': textAsset ? 'no-cache' : 'public, max-age=86400',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(target).pipe(res);
}

// ---------------------------------------------------------------- API

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'GET' && pathname === '/api/news') {
    const items = [...db.news].sort((a, b) => (b.pinned - a.pinned) || (b.id - a.id)).slice(0, 100);
    sendJson(res, 200, { items });
    return;
  }

  if (method === 'GET' && pathname === '/api/me') {
    sendJson(res, 200, { admin: isAdmin(req) });
    return;
  }

  if (method === 'GET' && pathname === '/api/signups') {
    requireAdmin(req);
    const items = [...db.signups].sort((a, b) => b.id - a.id);
    sendJson(res, 200, { count: items.length, items });
    return;
  }

  if (method === 'GET' && pathname === '/api/export.csv') {
    requireAdmin(req);
    const header = ['序号', '姓名', '班级', '联系方式', '意向方向', '备注', '报名时间'];
    const rows = [...db.signups].sort((a, b) => a.id - b.id).map((item) => [
      item.id, item.name, item.class_name, item.contact, item.direction, item.note, item.created_at,
    ]);
    const csv = '\ufeff' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
    const body = Buffer.from(csv, 'utf8');
    const stamp = nowText().slice(0, 16).replace(/[-: ]/g, '');
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="signups_${stamp}.csv"`,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
    return;
  }

  if (method === 'POST' && pathname === '/api/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (loginFails.get(ip) || []).filter((t) => now - t < 60000);
    if (recent.length >= 5) throw new ApiError(429, '尝试过于频繁，请稍后再试');

    const data = await readJson(req);
    if (!checkPassword(String(data.password || ''))) {
      loginFails.set(ip, [...recent, now]);
      throw new ApiError(401, '密码不正确');
    }
    loginFails.delete(ip);

    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_TTL);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(token) });
    return;
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const token = sessionToken(req);
    if (token) sessions.delete(token);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': CLEAR_COOKIE });
    return;
  }

  if (method === 'POST' && pathname === '/api/news') {
    requireAdmin(req);
    const data = await readJson(req);
    const title = String(data.title || '').trim();
    const body = String(data.body || '').trim();
    if (!title || title.length > 80) throw new ApiError(400, '标题不能为空，且不超过 80 字');
    if (!body || body.length > 5000) throw new ApiError(400, '内容不能为空，且不超过 5000 字');

    const item = {
      id: nextId(db.news),
      title,
      body,
      pinned: data.pinned ? 1 : 0,
      created_at: nowText(),
    };
    db.news.push(item);
    saveDb();
    sendJson(res, 201, { ok: true, id: item.id });
    return;
  }

  if (method === 'DELETE' && pathname.startsWith('/api/news/')) {
    requireAdmin(req);
    const id = Number(pathname.slice('/api/news/'.length));
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, '参数错误');
    const index = db.news.findIndex((item) => item.id === id);
    if (index === -1) throw new ApiError(404, '公告不存在');
    db.news.splice(index, 1);
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/signup') {
    const data = await readJson(req);
    const name = String(data.name || '').trim();
    const className = String(data.class_name || '').trim();
    const contact = String(data.contact || '').trim();
    const direction = String(data.direction || '').trim();
    const note = String(data.note || '').trim();

    if (!name || name.length > 30) throw new ApiError(400, '请填写姓名（不超过 30 字）');
    if (!className || className.length > 30) throw new ApiError(400, '请填写班级');
    if (contact.length > 60) throw new ApiError(400, '联系方式过长');
    if (!DIRECTIONS.includes(direction)) throw new ApiError(400, '意向方向不正确');
    if (note.length > 300) throw new ApiError(400, '备注请控制在 300 字以内');

    const cutoff = Date.now() - 60000;
    const duplicated = db.signups.some(
      (item) => item.name === name && item.class_name === className &&
        Date.parse(item.created_at.replace(' ', 'T')) > cutoff
    );
    if (duplicated) throw new ApiError(409, '你刚刚已经提交过了，请勿重复报名');

    db.signups.push({
      id: nextId(db.signups),
      name,
      class_name: className,
      contact,
      direction,
      note,
      created_at: nowText(),
    });
    saveDb();
    sendJson(res, 201, { ok: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/password') {
    requireAdmin(req);
    const data = await readJson(req);
    if (!checkPassword(String(data.old || ''))) throw new ApiError(400, '原密码不正确');
    const next = String(data.new || '');
    if (next.length < 8) throw new ApiError(400, '新密码至少 8 位');
    saveAdmin(next);
    sessions.clear();
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': CLEAR_COOKIE });
    return;
  }

  throw new ApiError(404, '接口不存在');
}

// ---------------------------------------------------------------- 入口

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      throw new ApiError(404, '页面不存在');
    }
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { error: '服务器内部错误' });
    }
  }
});

const options = parseArgs(process.argv);
ensureDataDir();
loadAdmin();
server.listen(options.port, options.host, () => {
  console.log(`社团官网已启动：http://${options.host}:${options.port}/`);
  console.log(`管理后台：http://${options.host}:${options.port}/admin/   （Ctrl+C 停止）`);
});
