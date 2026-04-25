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

  pendingList.innerHTML = list.map(p => `
    <div class="pending-card" data-uid="${p.uid}">
      <div class="num-badge">${p.number}번</div>
      <div class="edit-area">
        <div class="hint-fields">
          <label class="hint-field-label">1일차 힌트
            <input type="text" name="day"    value="${escHtml(p.day    || '')}" placeholder="—" maxlength="300">
          </label>
          <label class="hint-field-label">2일차 힌트
            <input type="text" name="day2"   value="${escHtml(p.day2   || '')}" placeholder="—" maxlength="300">
          </label>
          <label class="hint-field-label">친구 초대 힌트
            <input type="text" name="invite" value="${escHtml(p.invite || '')}" placeholder="—" maxlength="300">
          </label>
          <label class="hint-field-label">견적 분석 힌트
            <input type="text" name="quote"  value="${escHtml(p.quote  || '')}" placeholder="—" maxlength="300">
          </label>
        </div>
        <div class="pending-meta">제출: ${p.submitted_at}</div>
      </div>
      ${p.image ? `<img class="pending-img" src="${p.image}" alt="첨부 이미지">` : '<span class="no-img">이미지 없음</span>'}
      <div class="actions">
        <button class="approve-btn">승인</button>
        <button class="reject-btn">거절</button>
      </div>
    </div>
  `).join('');

  pendingList.querySelectorAll('.pending-card').forEach(card => {
    const uid = Number(card.dataset.uid);
    card.querySelector('.approve-btn').addEventListener('click', () => {
      const day    = card.querySelector('input[name="day"]').value;
      const day2   = card.querySelector('input[name="day2"]').value;
      const invite = card.querySelector('input[name="invite"]').value;
      const quote  = card.querySelector('input[name="quote"]').value;
      approve(uid, day, day2, invite, quote);
    });
    card.querySelector('.reject-btn').addEventListener('click', () => reject(uid));
  });
}

async function approve(uid, day, day2, invite, quote) {
  if (!day.trim() && !day2.trim() && !invite.trim() && !quote.trim()) {
    alert('힌트 내용을 하나 이상 입력해주세요.'); return;
  }
  await authFetch('/api/admin/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, day, day2, invite, quote })
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

async function loadPublished() {
  const res  = await fetch('/api/hints');
  const list = await res.json();
  publishedTbl.innerHTML = list.map(h => `
    <tr>
      <td>${h.id}</td>
      <td class="type-day    ${h.day    ? '' : 'empty'}">${h.day    || '—'}</td>
      <td class="type-day2   ${h.day2   ? '' : 'empty'}">${h.day2   || '—'}</td>
      <td class="type-invite ${h.invite ? '' : 'empty'}">${h.invite || '—'}</td>
      <td class="type-quote  ${h.quote  ? '' : 'empty'}">${h.quote  || '—'}</td>
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

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 이미지 클릭 확대
const overlay    = document.getElementById('imgOverlay');
const overlayImg = document.getElementById('overlayImg');
document.addEventListener('click', e => {
  if (e.target.classList.contains('pending-img')) {
    overlayImg.src = e.target.src;
    overlay.classList.add('show');
  }
});
overlay.addEventListener('click', () => overlay.classList.remove('show'));

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

loadPending();
loadPublished();
loadInquiries();
connectSSE();
