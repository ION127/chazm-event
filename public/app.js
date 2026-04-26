const COL_DEFS = [
  { key: 'day',    label: '1일차 힌트', short: '1일차' },
  { key: 'day2',   label: '2일차 힌트', short: '2일차' },
  { key: 'day3',   label: '3일차 힌트', short: '3일차' },
  { key: 'day4',   label: '4일차 힌트', short: '4일차' },
  { key: 'day5',   label: '5일차 힌트', short: '5일차' },
  { key: 'day6',   label: '6일차 힌트', short: '6일차' },
  { key: 'day7',   label: '7일차 힌트', short: '7일차' },
  { key: 'invite', label: '친구 초대 힌트', short: '초대' },
  { key: 'quote',  label: '견적 분석 힌트', short: '견적' },
];

const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');
const searchResult = document.getElementById('searchResult');
const numberInput  = document.getElementById('hintNumber');
const typeSelect   = document.getElementById('hintType');
const contentInput = document.getElementById('hintContent');
const sendBtn      = document.getElementById('sendBtn');
const statusMsg    = document.getElementById('statusMsg');
const tbody        = document.getElementById('hintTable');
const thead        = document.getElementById('hintThead');
const uploadZone   = document.getElementById('uploadZone');
const imageInput   = document.getElementById('hintImage');
const placeholder  = document.getElementById('uploadPlaceholder');
const preview      = document.getElementById('uploadPreview');
const previewImg   = document.getElementById('previewImg');
const previewName  = document.getElementById('previewName');
const clearBtn     = document.getElementById('clearImage');

let allHints       = [];
let visibleColumns = [];

// ── 이미지 업로드 ─────────────────────────────────────

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  previewImg.src = URL.createObjectURL(file);
  previewName.textContent = file.name;
  placeholder.style.display = 'none';
  preview.style.display = 'flex';
});

uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    imageInput.files = dt.files;
    imageInput.dispatchEvent(new Event('change'));
  }
});

clearBtn.addEventListener('click', e => { e.stopPropagation(); clearImage(); });
function clearImage() {
  imageInput.value = '';
  previewImg.src = '';
  previewName.textContent = '';
  preview.style.display = 'none';
  placeholder.style.display = 'flex';
}

// ── 테이블 헤더 빌드 ─────────────────────────────────

function buildTableHeader() {
  if (!thead) return;
  thead.innerHTML = `<tr>
    <th>번호</th>
    ${visibleColumns.map(key => {
      const def = COL_DEFS.find(d => d.key === key);
      if (!def) return '';
      return `<th><span class="th-full">${def.label}</span><span class="th-short">${def.short}</span></th>`;
    }).join('')}
    <th class="col-date">마지막 수정</th>
  </tr>`;
}

// ── 힌트 타입 선택 업데이트 ──────────────────────────

function updateTypeSelect() {
  const prev = typeSelect.value;
  typeSelect.innerHTML = visibleColumns.map(key => {
    const def = COL_DEFS.find(d => d.key === key);
    if (!def) return '';
    return `<option value="${key}">${def.label}</option>`;
  }).join('');
  if (visibleColumns.includes(prev)) typeSelect.value = prev;
}

// ── 테이블 렌더 ───────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cell(text, imgSrc, type, kw) {
  const isEmpty = !text && !imgSrc;
  const re = (text && kw) ? new RegExp(`(${escapeRegex(kw)})`, 'gi') : null;
  const content = !text ? (imgSrc ? '' : '—') : (re ? escHtml(text).replace(re, '<mark class="highlight">$1</mark>') : escHtml(text));
  const imgHtml = imgSrc ? `<img class="hint-thumb" src="${escHtml(imgSrc)}" alt="이미지">` : '';
  return `<td class="type-${type}${isEmpty ? ' empty' : ''}">${content}${imgHtml}</td>`;
}

function renderTable(hints, keyword = '') {
  const colspan = visibleColumns.length + 2;
  if (hints.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;color:#aaa;">검색 결과가 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = hints.map(h => `
    <tr>
      <td>${h.id}</td>
      ${visibleColumns.map(key => cell(h[key] || '', h[`${key}_image`] || null, key, keyword)).join('')}
      <td class="col-date">${h.updated_at || ''}</td>
    </tr>
  `).join('');
}

function applySearch() {
  const kw = searchInput.value.trim();
  searchClear.style.display = kw ? 'block' : 'none';
  if (!kw) {
    searchResult.textContent = '';
    renderTable(allHints);
    return;
  }
  const lower = kw.toLowerCase();
  const filtered = allHints.filter(h =>
    visibleColumns.some(key => (h[key] || '').toLowerCase().includes(lower))
  );
  searchResult.textContent = `${filtered.length}건 일치`;
  renderTable(filtered, kw);
}

searchInput.addEventListener('input', applySearch);
searchClear.addEventListener('click', () => { searchInput.value = ''; applySearch(); searchInput.focus(); });

async function loadHints() {
  try {
    const res  = await fetch('/api/hints');
    const data = await res.json();
    allHints       = data.hints;
    visibleColumns = data.visibleColumns;
    updateTypeSelect();
    buildTableHeader();
    applySearch();
  } catch {
    tbody.innerHTML = `<tr><td colspan="6">불러오기 실패</td></tr>`;
  }
}

// ── 힌트 보내기 ───────────────────────────────────────

sendBtn.addEventListener('click', async () => {
  const number  = parseInt(numberInput.value);
  const type    = typeSelect.value;
  const content = contentInput.value.trim();

  if (!number || number < 1 || number > 50 || !Number.isInteger(number)) {
    showMsg('힌트 번호를 1~50 사이의 정수로 입력해주세요.', false); return;
  }
  if (!content && !imageInput.files[0]) {
    showMsg('힌트 내용 또는 이미지 중 하나는 입력해주세요.', false); return;
  }

  const formData = new FormData();
  formData.append('number', number);
  formData.append('type',   type);
  formData.append('content', content);
  if (imageInput.files[0]) formData.append('image', imageInput.files[0]);

  sendBtn.disabled = true;
  try {
    const res  = await fetch('/api/hints', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      showMsg('제출 완료! 검토 후 게시됩니다.', true);
      numberInput.value  = '';
      contentInput.value = '';
      clearImage();
      loadHints();
    } else {
      showMsg(data.error || '오류 발생', false);
    }
  } catch {
    showMsg('서버 연결 실패', false);
  } finally {
    sendBtn.disabled = false;
  }
});

function showMsg(text, ok) {
  statusMsg.textContent = text;
  statusMsg.className = ok ? 'ok' : 'err';
  setTimeout(() => { statusMsg.textContent = ''; statusMsg.className = ''; }, 3000);
}

// ── 이미지 오버레이 (모바일 back 버튼 지원) ──────────

const overlay    = document.getElementById('imgOverlay');
const overlayImg = document.getElementById('overlayImg');

function openOverlay(src, alt) {
  overlayImg.src = src;
  overlayImg.alt = alt || '';
  overlay.classList.add('show');
  history.pushState({ overlay: true }, '');
}
function closeOverlay() { overlay.classList.remove('show'); }

// 가이드 이미지 클릭
document.getElementById('guideImg')?.addEventListener('click', () =>
  openOverlay('hint-guide.png', '힌트 번호 확인 방법')
);

// 오버레이 클릭으로 닫기 (pushState 정리)
overlay?.addEventListener('click', () => { closeOverlay(); history.back(); });

// 힌트 테이블 썸네일 클릭 (이벤트 위임)
document.querySelector('.table-wrap')?.addEventListener('click', e => {
  const thumb = e.target.closest('.hint-thumb');
  if (thumb) openOverlay(thumb.src, '힌트 이미지');
});

// 뒤로가기 버튼 처리 (모바일 포함)
window.addEventListener('popstate', () => {
  if (overlay.classList.contains('show')) closeOverlay();
  if (inquiryModal.classList.contains('show')) closeInquiry();
});

// ── 문의 모달 ─────────────────────────────────────────

const inquiryModal   = document.getElementById('inquiryModal');
const inquiryBtn     = document.getElementById('inquiryBtn');
const inquiryClose   = document.getElementById('inquiryClose');
const inquiryTitle   = document.getElementById('inquiryTitle');
const inquiryContent = document.getElementById('inquiryContent');
const inquirySubmit  = document.getElementById('inquirySubmit');
const inquiryMsg     = document.getElementById('inquiryMsg');

function openInquiry()  { inquiryModal.classList.add('show');    history.pushState({ inquiry: true }, ''); }
function closeInquiry() { inquiryModal.classList.remove('show'); }

inquiryBtn.addEventListener('click', openInquiry);
inquiryClose.addEventListener('click', () => { closeInquiry(); history.back(); });
inquiryModal.addEventListener('click', e => { if (e.target === inquiryModal) { closeInquiry(); history.back(); } });

inquirySubmit.addEventListener('click', async () => {
  const title   = inquiryTitle.value.trim();
  const content = inquiryContent.value.trim();
  if (!title)   { showInquiryMsg('제목을 입력해주세요.', false); return; }
  if (!content) { showInquiryMsg('내용을 입력해주세요.', false); return; }

  inquirySubmit.disabled = true;
  try {
    const res  = await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (data.ok) {
      showInquiryMsg('문의가 접수되었습니다.', true);
      inquiryTitle.value   = '';
      inquiryContent.value = '';
      setTimeout(() => { closeInquiry(); }, 1500);
    } else {
      showInquiryMsg(data.error || '오류 발생', false);
    }
  } catch {
    showInquiryMsg('서버 연결 실패', false);
  } finally {
    inquirySubmit.disabled = false;
  }
});

function showInquiryMsg(text, ok) {
  inquiryMsg.textContent = text;
  inquiryMsg.className   = ok ? 'ok' : 'err';
  if (ok) return;
  setTimeout(() => { inquiryMsg.textContent = ''; inquiryMsg.className = ''; }, 3000);
}

loadHints();
