const token = localStorage.getItem('adminToken');
if (!token) location.href = '/admin-login.html';

const pendingList  = document.getElementById('pendingList');
const pendingCount = document.getElementById('pendingCount');
const publishedTbl = document.getElementById('publishedTable');
const editNumber   = document.getElementById('editNumber');
const editType     = document.getElementById('editType');
const editContent  = document.getElementById('editContent');
const editBtn      = document.getElementById('editBtn');
const editMsg      = document.getElementById('editMsg');

const COL_DEFS = [
  { key: 'day',    label: '1일차 힌트' },
  { key: 'day2',   label: '2일차 힌트' },
  { key: 'day3',   label: '3일차 힌트' },
  { key: 'day4',   label: '4일차 힌트' },
  { key: 'day5',   label: '5일차 힌트' },
  { key: 'day6',   label: '6일차 힌트' },
  { key: 'day7',   label: '7일차 힌트' },
  { key: 'invite', label: '친구 초대 힌트' },
  { key: 'quote',  label: '견적 분석 힌트' },
];

for (let i = 1; i <= 50; i++) {
  const opt = document.createElement('option');
  opt.value = i; opt.textContent = i;
  editNumber.appendChild(opt);
}

function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), 'x-admin-token': token }
  }).then(res => {
    if (res.status === 401) { location.href = '/admin-login.html'; }
    return res;
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 컬럼 표시 설정 ────────────────────────────────────

async function loadSettings() {
  const res  = await authFetch('/api/admin/settings');
  const data = await res.json();
  renderToggles(data.visibleColumns || []);
}

function renderToggles(visibleColumns) {
  const container = document.getElementById('columnToggles');
  if (!container) return;
  container.innerHTML = COL_DEFS.map(({ key, label }) => `
    <label class="col-toggle-label">
      <input type="checkbox" value="${key}" ${visibleColumns.includes(key) ? 'checked' : ''}>
      ${label}
    </label>
  `).join('');
}

document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('#columnToggles input[type="checkbox"]');
  const visibleColumns = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
  const res  = await authFetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visibleColumns })
  });
  const data = await res.json();
  showSettingsMsg(data.ok ? '저장되었습니다.' : (data.error || '오류'), data.ok);
});

function showSettingsMsg(text, ok) {
  const el = document.getElementById('settingsMsg');
  if (!el) return;
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

// ── 대기 목록 ─────────────────────────────────────────

async function loadPending() {
  const res  = await authFetch('/api/admin/pending');
  const list = await res.json();
  list.sort((a, b) => a.number - b.number);
  pendingCount.textContent = list.length;

  if (list.length === 0) {
    pendingList.innerHTML = '<p class="empty-msg">대기 중인 힌트가 없습니다.</p>';
    return;
  }

  pendingList.innerHTML = list.map(p => {
    const typeDef = p.type ? COL_DEFS.find(d => d.key === p.type) : null;
    return `
    <div class="pending-card" data-uid="${p.uid}" data-has-image="${p.image ? '1' : ''}">
      <div class="num-badge">
        ${p.number}번
        ${typeDef ? `<span class="submitted-type-badge">${typeDef.label}</span>` : ''}
      </div>
      <div class="edit-area">
        <div class="hint-fields">
          ${COL_DEFS.map(({ key, label }) => `
            <label class="hint-field-label">${label}
              <input type="text" name="${key}" value="${escHtml(p[key] || '')}" placeholder="—" maxlength="300">
            </label>
          `).join('')}
        </div>
        <div class="pending-meta">제출: ${p.submitted_at}</div>
      </div>
      ${p.image ? `<img class="pending-img" src="${p.image}" alt="첨부 이미지">` : '<span class="no-img">이미지 없음</span>'}
      <div class="actions">
        <button class="approve-btn">승인</button>
        <button class="reject-btn">거절</button>
      </div>
    </div>
  `;
  }).join('');

  pendingList.querySelectorAll('.pending-card').forEach(card => {
    const uid      = Number(card.dataset.uid);
    const hasImage = !!card.dataset.hasImage;
    card.querySelector('.approve-btn').addEventListener('click', () => {
      const fields = {};
      COL_DEFS.forEach(({ key }) => {
        fields[key] = card.querySelector(`input[name="${key}"]`).value;
      });
      approve(uid, fields, hasImage);
    });
    card.querySelector('.reject-btn').addEventListener('click', () => reject(uid));
  });
}

async function approve(uid, fields, hasImage) {
  const anyFilled = Object.values(fields).some(v => v.trim());
  if (!anyFilled && !hasImage) { alert('힌트 내용을 입력하거나 이미지가 있어야 합니다.'); return; }
  await authFetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, ...fields })
  });
  loadPending();
  loadPublished();
}

async function reject(uid) {
  if (!confirm('이 제출을 거절하시겠습니까?')) return;
  await authFetch(`/api/admin/reject/${uid}`, { method: 'DELETE' });
  loadPending();
}

// ── 게시된 힌트 ───────────────────────────────────────

function adminCell(text, imgSrc, type) {
  const isEmpty = !text && !imgSrc;
  const content = text ? escHtml(text) : (imgSrc ? '' : '—');
  const imgHtml = imgSrc ? `<img class="hint-thumb" src="${escHtml(imgSrc)}" alt="이미지">` : '';
  return `<td class="type-${type}${isEmpty ? ' empty' : ''}">${content}${imgHtml}</td>`;
}

async function loadPublished() {
  const res  = await authFetch('/api/admin/published');
  const list = await res.json();
  publishedTbl.innerHTML = list.map(h => `
    <tr>
      <td>${h.id}</td>
      ${COL_DEFS.map(({ key }) => adminCell(h[key] || '', h[`${key}_image`] || null, key)).join('')}
      <td class="col-date">${h.updated_at || ''}</td>
    </tr>
  `).join('');
}

editBtn.addEventListener('click', async () => {
  const id      = parseInt(editNumber.value);
  const type    = editType.value;
  const content = editContent.value.trim();
  editBtn.disabled = true;
  try {
    const res  = await authFetch(`/api/admin/published/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content })
    });
    const data = await res.json();
    if (data.ok) {
      showEditMsg(`${id}번 힌트가 수정되었습니다.`, true);
      editContent.value = '';
      loadPublished();
    } else {
      showEditMsg(data.error || '오류', false);
    }
  } finally {
    editBtn.disabled = false;
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await authFetch('/api/admin/logout', { method: 'POST' });
  localStorage.removeItem('adminToken');
  location.href = '/admin-login.html';
});

function showEditMsg(text, ok) {
  editMsg.textContent = text;
  editMsg.className = ok ? 'ok' : 'err';
  setTimeout(() => { editMsg.textContent = ''; editMsg.className = ''; }, 3000);
}

// ── 이미지 오버레이 ───────────────────────────────────

const overlay    = document.getElementById('imgOverlay');
const overlayImg = document.getElementById('overlayImg');

function openOverlay(src) {
  overlayImg.src = src;
  overlay.classList.add('show');
  history.pushState({ overlay: true }, '');
}

document.addEventListener('click', e => {
  const thumb = e.target.closest('.hint-thumb');
  if (thumb) { openOverlay(thumb.src); return; }
  if (e.target.classList.contains('pending-img')) { openOverlay(e.target.src); return; }
});

overlay.addEventListener('click', () => {
  overlay.classList.remove('show');
  history.back();
});

window.addEventListener('popstate', () => {
  if (overlay.classList.contains('show')) overlay.classList.remove('show');
});

// SSE 실시간 연결
function connectSSE() {
  const es = new EventSource(`/api/admin/events?token=${token}`);
  es.addEventListener('connected', () => setStatus('실시간 연결됨', 'ok'));
  es.addEventListener('new-hint', e => {
    const { count } = JSON.parse(e.data);
    setStatus(`새 힌트 제출! (대기 ${count}건)`, 'new');
    loadPending();
  });
  es.addEventListener('new-inquiry', e => {
    const { count } = JSON.parse(e.data);
    setStatus(`새 문의 도착! (미읽음 ${count}건)`, 'new');
    loadInquiries();
  });
  es.onerror = () => setStatus('연결 끊김 — 재연결 중...', 'err');
}

function setStatus(text, type) {
  const el = document.getElementById('sseStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'sse-status ' + type;
  if (type === 'new') setTimeout(() => setStatus('실시간 연결됨', 'ok'), 4000);
}

// ── 문의 목록 ─────────────────────────────────────────

async function loadInquiries() {
  const res  = await authFetch('/api/admin/inquiries');
  const list = await res.json();
  const countEl = document.getElementById('inquiryCount');
  const listEl  = document.getElementById('inquiryList');
  countEl.textContent = list.length;

  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-msg">문의가 없습니다.</p>';
    return;
  }

  listEl.innerHTML = list.slice().reverse().map(q => `
    <div class="inquiry-card ${q.read ? 'read' : 'unread'}" data-uid="${q.uid}">
      <div class="inquiry-top">
        <span class="inquiry-title">${escHtml(q.title)}</span>
        ${!q.read ? '<span class="new-dot">NEW</span>' : ''}
        <span class="inquiry-date">${q.submitted_at}</span>
      </div>
      <div class="inquiry-body">${escHtml(q.content).replace(/\n/g, '<br>')}</div>
      <div class="inquiry-actions">
        ${!q.read ? `<button class="read-btn" data-uid="${q.uid}">읽음 처리</button>` : ''}
        <button class="del-btn" data-uid="${q.uid}">삭제</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.read-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await authFetch(`/api/admin/inquiries/${btn.dataset.uid}/read`, { method: 'PATCH' });
      loadInquiries();
    });
  });
  listEl.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 문의를 삭제하시겠습니까?')) return;
      await authFetch(`/api/admin/inquiries/${btn.dataset.uid}`, { method: 'DELETE' });
      loadInquiries();
    });
  });
}

loadSettings();
loadPending();
loadPublished();
loadInquiries();
connectSSE();
