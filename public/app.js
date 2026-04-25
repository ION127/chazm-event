const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');
const searchResult = document.getElementById('searchResult');
let allHints = [];

const numberInput  = document.getElementById('hintNumber');
const typeSelect   = document.getElementById('hintType');
const contentInput = document.getElementById('hintContent');
const sendBtn      = document.getElementById('sendBtn');
const statusMsg    = document.getElementById('statusMsg');
const tbody        = document.getElementById('hintTable');
const uploadZone   = document.getElementById('uploadZone');
const imageInput   = document.getElementById('hintImage');
const placeholder  = document.getElementById('uploadPlaceholder');
const preview      = document.getElementById('uploadPreview');
const previewImg   = document.getElementById('previewImg');
const previewName  = document.getElementById('previewName');
const clearBtn     = document.getElementById('clearImage');

// 이미지 선택
imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;
  previewImg.src = URL.createObjectURL(file);
  previewName.textContent = file.name;
  placeholder.style.display = 'none';
  preview.style.display = 'flex';
});

// 드래그 앤 드롭
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

// ── 테이블 렌더 ───────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cell(text, type, kw) {
  const re = kw ? new RegExp(`(${escapeRegex(kw)})`, 'gi') : null;
  if (!text) return `<td class="type-${type} empty">—</td>`;
  const html = re ? text.replace(re, '<mark class="highlight">$1</mark>') : text;
  return `<td class="type-${type}">${html}</td>`;
}

function renderTable(hints, keyword = '') {
  if (hints.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;">검색 결과가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = hints.map(h => `
    <tr>
      <td>${h.id}</td>
      ${cell(h.day,    'day',    keyword)}
      ${cell(h.invite, 'invite', keyword)}
      ${cell(h.quote,  'quote',  keyword)}
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
    h.day?.toLowerCase().includes(lower) ||
    h.invite?.toLowerCase().includes(lower) ||
    h.quote?.toLowerCase().includes(lower)
  );
  searchResult.textContent = `${filtered.length}건 일치`;
  renderTable(filtered, kw);
}

searchInput.addEventListener('input', applySearch);
searchClear.addEventListener('click', () => { searchInput.value = ''; applySearch(); searchInput.focus(); });

async function loadHints() {
  try {
    const res = await fetch('/api/hints');
    allHints  = await res.json();
    applySearch();
  } catch {
    tbody.innerHTML = '<tr><td colspan="5">불러오기 실패</td></tr>';
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
  if (!content) { showMsg('힌트 내용을 입력해주세요.', false); return; }

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

// 가이드 이미지 클릭 확대
const overlay = document.getElementById('imgOverlay');
function openOverlay() { overlay.classList.add('show'); history.pushState({ overlay: true }, ''); }
function closeOverlay() { overlay.classList.remove('show'); }
document.getElementById('guideImg')?.addEventListener('click', openOverlay);
overlay?.addEventListener('click', closeOverlay);

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

window.addEventListener('popstate', e => {
  if (inquiryModal.classList.contains('show')) closeInquiry();
  if (overlay.classList.contains('show')) closeOverlay();
});

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
