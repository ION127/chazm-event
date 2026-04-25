require('dotenv').config();

const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const test = "test";
const app = express();
const PORT         = process.env.PORT || 3000;
const DB_FILE      = path.join(__dirname, 'hints.json');
const UPLOAD_DIR   = path.join(__dirname, 'public/uploads');
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

function emptyHint() {
  return { day: '', day2: '', invite: '', quote: '', updated_at: '' };
}

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { published: {}, pending: [] };
    for (let i = 1; i <= 50; i++) initial.published[i] = emptyHint();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
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
  const db = loadDB();
  const result = Object.entries(db.published).map(([id, val]) => ({
    id:         Number(id),
    day:        val.day    || '',
    day2:       val.day2   || '',
    invite:     val.invite || '',
    quote:      val.quote  || '',
    updated_at: val.updated_at || ''
  }));
  res.json(result);
});

// 힌트 제출
app.post('/api/hints', upload.single('image'), (req, res) => {
  const { number, type, content } = req.body;
  const validTypes = ['day', 'day2', 'invite', 'quote'];

  if (!number || number < 1 || number > 50) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '번호(1~50)를 입력해주세요.' });
  }
  if (!validTypes.includes(type) || !content?.trim()) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: '힌트 종류와 내용을 입력해주세요.' });
  }

  const item = { uid: Date.now(), number: Number(number), day: '', day2: '', invite: '', quote: '',
                 image: req.file ? `/uploads/${req.file.filename}` : null,
                 submitted_at: new Date().toLocaleString('ko-KR') };
  item[type] = String(content).trim();

  const db = loadDB();
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

function mergeField(existing, incoming) {
  const e = (existing || '').trim();
  const n = (incoming || '').trim();
  if (!n) return e;
  if (!e) return n;
  return `${e}, ${n}`;
}

app.post('/api/admin/approve', requireAdmin, (req, res) => {
  const { uid, day, day2, invite, quote } = req.body;
  const db  = loadDB();
  const idx = db.pending.findIndex(p => p.uid === uid);
  if (idx === -1) return res.status(404).json({ error: '항목 없음' });

  const item     = db.pending[idx];
  const existing = db.published[item.number] || emptyHint();

  db.published[item.number] = {
    day:        mergeField(existing.day,    String(day    ?? item.day    ?? '')),
    day2:       mergeField(existing.day2,   String(day2   ?? item.day2   ?? '')),
    invite:     mergeField(existing.invite, String(invite ?? item.invite ?? '')),
    quote:      mergeField(existing.quote,  String(quote  ?? item.quote  ?? '')),
    updated_at: new Date().toLocaleString('ko-KR')
  };
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

// 게시된 힌트 직접 수정 (특정 종류만)
app.put('/api/admin/published/:id', requireAdmin, (req, res) => {
  const id   = Number(req.params.id);
  const { type, content } = req.body;
  if (id < 1 || id > 50) return res.status(400).json({ error: '잘못된 번호' });
  if (!['day','day2','invite','quote'].includes(type)) return res.status(400).json({ error: '잘못된 종류' });
  const db = loadDB();
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
