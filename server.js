require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const app = express();
const PORT           = process.env.PORT || 3000;
const DB_FILE        = path.join(__dirname, 'hints.json');
const UPLOAD_DIR     = path.join(__dirname, 'public/uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const validTokens = new Set();
const sseClients  = new Set();

function pushAdmins(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => res.write(msg));
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('이미지 파일만 업로드 가능합니다.'));
  }
});

const ALL_HINT_TYPES = ['day', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7', 'invite', 'quote'];

function emptyHint() {
  const h = { updated_at: '' };
  ALL_HINT_TYPES.forEach(t => { h[t] = ''; h[`${t}_image`] = null; });
  return h;
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      published: {},
      pending: [],
      inquiries: [],
      settings: { visibleColumns: ['day', 'day2', 'invite', 'quote'] }
    };
    for (let i = 1; i <= 50; i++) initial.published[i] = emptyHint();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  if (!db.settings) db.settings = { visibleColumns: ['day', 'day2', 'invite', 'quote'] };
  if (!db.inquiries) db.inquiries = [];
  // 새 필드 마이그레이션
  Object.values(db.published).forEach(h => {
    ALL_HINT_TYPES.forEach(t => {
      if (h[t] === undefined) h[t] = '';
      if (h[`${t}_image`] === undefined) h[`${t}_image`] = null;
    });
  });
  return db;
}

let writeLock = Promise.resolve();
function saveDB(data) {
  writeLock = writeLock.then(() =>
    fs.promises.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8')
  );
  return writeLock;
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && validTokens.has(token)) return next();
  res.status(401).json({ error: '인증 필요' });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 공개 API ──────────────────────────────────────────

app.get('/api/hints', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const db = loadDB();
  const visible = db.settings.visibleColumns;
  const hints = Object.entries(db.published).map(([id, val]) => {
    const h = { id: Number(id), updated_at: val.updated_at || '' };
    visible.forEach(k => {
      h[k] = val[k] || '';
      h[`${k}_image`] = val[`${k}_image`] || null;
    });
    return h;
  });
  res.json({ hints, visibleColumns: visible });
});

// 힌트 제출 (사용자) — 보이는 컬럼만 허용
app.post('/api/hints', upload.single('image'), (req, res) => {
  const { number, type, content } = req.body;
  const db = loadDB();
  const visible = db.settings.visibleColumns;

  if (!number || number < 1 || number > 50) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '번호(1~50)를 입력해주세요.' });
  }
  if (!visible.includes(type)) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '허용되지 않은 힌트 종류입니다.' });
  }
  if (!content?.trim() && !req.file) {
    return res.status(400).json({ error: '힌트 내용 또는 이미지 중 하나는 입력해주세요.' });
  }

  const item = {
    uid: Date.now(),
    number: Number(number),
    type,
    image: req.file ? `/uploads/${req.file.filename}` : null,
    submitted_at: new Date().toLocaleString('ko-KR')
  };
  ALL_HINT_TYPES.forEach(t => { item[t] = ''; });
  item[type] = String(content ?? '').trim();

  db.pending.push(item);
  saveDB(db);
  pushAdmins('new-hint', { count: db.pending.length });
  res.json({ ok: true });
});

// ── 관리자 로그인 ─────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.add(token);
  res.json({ ok: true, token });
});

app.post('/api/admin/logout', (req, res) => {
  validTokens.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// ── 관리자 SSE ────────────────────────────────────────

app.get('/api/admin/events', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || !validTokens.has(token)) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});

// ── 관리자 API (인증 필요) ────────────────────────────

app.get('/api/admin/pending', requireAdmin, (_req, res) => {
  res.json(loadDB().pending);
});

// 게시된 힌트 전체 조회 (관리자 전용 — 모든 컬럼 포함)
app.get('/api/admin/published', requireAdmin, (_req, res) => {
  const db = loadDB();
  const result = Object.entries(db.published).map(([id, val]) => ({ id: Number(id), ...val }));
  res.json(result);
});

// 컬럼 표시 설정 조회/수정
app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  res.json(loadDB().settings);
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { visibleColumns } = req.body;
  if (!Array.isArray(visibleColumns) || !visibleColumns.every(c => ALL_HINT_TYPES.includes(c)))
    return res.status(400).json({ error: '잘못된 설정값' });
  const db = loadDB();
  db.settings.visibleColumns = visibleColumns;
  saveDB(db);
  res.json({ ok: true });
});

function mergeField(existing, incoming) {
  const e = (existing || '').trim();
  const n = (incoming || '').trim();
  if (!n) return e;
  if (!e) return n;
  return `${e}, ${n}`;
}

app.post('/api/admin/approve', requireAdmin, (req, res) => {
  const body = req.body;
  const { uid } = body;
  const db  = loadDB();
  const idx = db.pending.findIndex(p => p.uid === uid);
  if (idx === -1) return res.status(404).json({ error: '항목 없음' });

  const item     = db.pending[idx];
  const existing = db.published[item.number] || emptyHint();
  const updated  = { updated_at: new Date().toLocaleString('ko-KR') };

  ALL_HINT_TYPES.forEach(t => {
    updated[t] = mergeField(existing[t], String(body[t] ?? item[t] ?? ''));
    updated[`${t}_image`] = existing[`${t}_image`] || null;
  });

  // 제출 이미지를 해당 힌트 종류 필드에 연결 (텍스트 없이 이미지만 제출한 경우 item.type 사용)
  if (item.image) {
    const origType = ALL_HINT_TYPES.find(t => (item[t] || '').trim()) || item.type;
    if (origType) updated[`${origType}_image`] = item.image;
  }

  db.published[item.number] = updated;
  db.pending.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/reject/:uid', requireAdmin, (req, res) => {
  const uid = Number(req.params.uid);
  const db  = loadDB();
  const idx = db.pending.findIndex(p => p.uid === uid);
  if (idx === -1) return res.status(404).json({ error: '항목 없음' });
  const item = db.pending[idx];
  if (item.image) {
    const p = path.join(__dirname, 'public', item.image);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.pending.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

// 게시된 힌트 직접 수정
app.put('/api/admin/published/:id', requireAdmin, (req, res) => {
  const id   = Number(req.params.id);
  const { type, content } = req.body;
  if (id < 1 || id > 50) return res.status(400).json({ error: '잘못된 번호' });
  if (!ALL_HINT_TYPES.includes(type)) return res.status(400).json({ error: '잘못된 종류' });
  const db = loadDB();
  if (!db.published[id]) db.published[id] = emptyHint();
  db.published[id][type]      = String(content ?? '').trim();
  db.published[id].updated_at = new Date().toLocaleString('ko-KR');
  saveDB(db);
  res.json({ ok: true });
});

// ── 문의 ─────────────────────────────────────────────

app.post('/api/inquiry', (req, res) => {
  const { title, content } = req.body;
  if (!title?.trim() || !content?.trim())
    return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
  const item = {
    uid: Date.now(),
    title:   String(title).trim(),
    content: String(content).trim(),
    submitted_at: new Date().toLocaleString('ko-KR'),
    read: false
  };
  const db = loadDB();
  if (!db.inquiries) db.inquiries = [];
  db.inquiries.push(item);
  saveDB(db);
  pushAdmins('new-inquiry', { count: db.inquiries.filter(i => !i.read).length });
  res.json({ ok: true });
});

app.get('/api/admin/inquiries', requireAdmin, (_req, res) => {
  const db = loadDB();
  res.json(db.inquiries || []);
});

app.patch('/api/admin/inquiries/:uid/read', requireAdmin, (req, res) => {
  const uid = Number(req.params.uid);
  const db  = loadDB();
  if (!db.inquiries) db.inquiries = [];
  const item = db.inquiries.find(i => i.uid === uid);
  if (!item) return res.status(404).json({ error: '항목 없음' });
  item.read = true;
  saveDB(db);
  res.json({ ok: true });
});

app.delete('/api/admin/inquiries/:uid', requireAdmin, (req, res) => {
  const uid = Number(req.params.uid);
  const db  = loadDB();
  if (!db.inquiries) db.inquiries = [];
  const idx = db.inquiries.findIndex(i => i.uid === uid);
  if (idx === -1) return res.status(404).json({ error: '항목 없음' });
  db.inquiries.splice(idx, 1);
  saveDB(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중  → http://localhost:${PORT}`);
  console.log(`관리자 페이지 → http://localhost:${PORT}/admin-login.html`);
});
