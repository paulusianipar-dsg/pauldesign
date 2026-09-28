/**
 * PaulFolio — Admin Dashboard Logic
 *
 * Menangani CRUD untuk:
 * - Projects   (data.json → projects)
 * - Messages   (data.json → messages)
 *
 * Fitur pendukung: pencarian, filter, pagination, bulk action,
 * tandai pesan dibaca, export CSV, dan upload gambar ke folder uploads/.
 *
 * Semua data lewat API lokal (server/api.js) via window.api
 * dari api-client.js. Guard sesi dilakukan di initAdmin().
 */

// ============================================================
// KONSTANTA
// ============================================================
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 10;

// ============================================================
// STATE & UTIL
// ============================================================
const state = {
  projects: [],
  messages: [],
  editingProjectId: null,
  viewingMessageId: null,
  pendingImageFile: null,
  selection: {
    projects: new Set(),
    messages: new Set(),
  },
  filters: {
    projects: { search: '', category: '', page: 1 },
    messages: { search: '', read: '', page: 1 },
  },
};

/**
 * Tampilkan toast sederhana (memanfaatkan #toast bila ada).
 */
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.style.background = isError ? '#f43f5e' : '#10b981';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  } else {
    console.log('[Admin]', message);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return iso;
  }
}

/**
 * Sesi habis di tengah jalan → kembali ke halaman login.
 */
function handleApiError(prefix, err) {
  if (err && err.status === 401) {
    window.location.href = 'auth.html';
    return;
  }
  showToast(prefix + (err && err.message ? err.message : 'Terjadi kesalahan.'), true);
}

/**
 * Samakan huruf besar/kecil untuk pencarian.
 */
function normalize(value) {
  return String(value == null ? '' : value).toLowerCase();
}

// ============================================================
// PAGINATION
// ============================================================
function paginate(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    slice: items.slice(start, start + PAGE_SIZE),
    page: safePage,
    totalPages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + PAGE_SIZE, items.length),
  };
}

function renderPagination(containerId, info, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (info.total === 0) {
    container.innerHTML = '';
    return;
  }

  const buttons = [];
  for (let i = 1; i <= info.totalPages; i++) {
    buttons.push(
      `<button class="admin-page-btn ${i === info.page ? 'active' : ''}" data-page="${i}">${i}</button>`
    );
  }

  container.innerHTML = `
    <span class="admin-pagination-info">
      Menampilkan ${info.from}-${info.to} dari ${info.total} ${label}
    </span>
    <div class="admin-pagination-controls">
      <button class="admin-page-btn" data-page="${info.page - 1}" ${info.page === 1 ? 'disabled' : ''}
        aria-label="Halaman sebelumnya">
        <i class="fa-solid fa-chevron-left"></i>
      </button>
      ${buttons.join('')}
      <button class="admin-page-btn" data-page="${info.page + 1}" ${info.page === info.totalPages ? 'disabled' : ''}
        aria-label="Halaman berikutnya">
        <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  `;

  container.querySelectorAll('.admin-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.getAttribute('data-page'));
      if (Number.isNaN(next) || next < 1) return;
      const target = btn.closest('.admin-tab-content').id.replace('tab-', '');
      state.filters[target].page = next;
      renderActiveTab();
    });
  });
}

// ============================================================
// BULK SELECTION
// ============================================================
function updateBulkBar(key, barId, countId) {
  const selected = state.selection[key];
  const bar = document.getElementById(barId);
  const countEl = document.getElementById(countId);
  const selectAll = document.getElementById(key + 'SelectAll');

  if (countEl) countEl.textContent = String(selected.size);
  if (bar) bar.style.display = selected.size > 0 ? 'flex' : 'none';

  if (selectAll) {
    const visible = getVisibleIds(key);
    const allSelected = visible.length > 0 && visible.every(id => selected.has(id));
    selectAll.checked = allSelected;
    selectAll.indeterminate = !allSelected && visible.some(id => selected.has(id));
  }
}

/**
 * Id yang sedang tampil di halaman ini (bukan seluruh dataset),
 * supaya "pilih semua" tidak sneakily menyentuh baris tersembunyi.
 */
function getVisibleIds(key) {
  const info = getPaginated(key);
  return info.slice.map(row => row.id);
}

function getPaginated(key) {
  const items = filterRows(key);
  return paginate(items, state.filters[key].page);
}

function clearSelection(key) {
  state.selection[key].clear();
  const selectAll = document.getElementById(key + 'SelectAll');
  if (selectAll) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  }
  updateBulkBar(key, key + 'BulkBar', key + 'SelectedCount');
}

// ============================================================
// FILTERING
// ============================================================
function filterRows(key) {
  const f = state.filters[key];
  const q = normalize(f.search);

  if (key === 'projects') {
    return state.projects.filter(p => {
      if (f.category && p.category !== f.category) return false;
      if (!q) return true;
      const tech = Array.isArray(p.tech_stack) ? p.tech_stack.join(' ') : '';
      return (
        normalize(p.title).includes(q) ||
        normalize(p.client).includes(q) ||
        normalize(p.description).includes(q) ||
        normalize(tech).includes(q)
      );
    });
  }

  return state.messages.filter(m => {
    if (f.read === 'unread' && m.is_read) return false;
    if (f.read === 'read' && !m.is_read) return false;
    if (!q) return true;
    return (
      normalize(m.name).includes(q) ||
      normalize(m.email).includes(q) ||
      normalize(m.subject).includes(q) ||
      normalize(m.message).includes(q)
    );
  });
}

function refreshCategoryFilter() {
  const select = document.getElementById('projectCategoryFilter');
  if (!select) return;

  const current = state.filters.projects.category;
  const categories = [...new Set(state.projects.map(p => p.category).filter(Boolean))].sort();

  select.innerHTML =
    '<option value="">Semua kategori</option>' +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = categories.includes(current) ? current : '';
}

function renderActiveTab() {
  const active = document.querySelector('.admin-tab-content.active');
  if (!active) return;
  const key = active.id.replace('tab-', '');
  if (key === 'projects') renderProjects();
  else if (key === 'messages') renderMessages();
}

// ============================================================
// STATS
// ============================================================
function updateStats() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  const unread = state.messages.filter(m => !m.is_read).length;
  const categories = new Set(state.projects.map(p => p.category).filter(Boolean));

  set('statProjects', state.projects.length);
  set('statMessages', state.messages.length);
  set('statCategories', categories.size);
  set('statUnread', unread);

  const pill = document.getElementById('messagesUnreadPill');
  if (pill) {
    pill.textContent = String(unread);
    pill.style.display = unread > 0 ? 'inline-flex' : 'none';
  }

  // Badge di tab button supaya jumlah unread terlihat tanpa pindah tab.
  const tabBtn = document.querySelector('.admin-tab[data-tab="messages"]');
  if (tabBtn) {
    let badge = tabBtn.querySelector('.admin-tab-badge');
    if (unread > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'admin-tab-badge';
        tabBtn.appendChild(badge);
      }
      badge.textContent = String(unread);
    } else if (badge) {
      badge.remove();
    }
  }
}

// ============================================================
// EXPORT CSV
// ============================================================
function toCsv(headers, rows) {
  const escapeCell = value => {
    const str = value == null ? '' : String(value);
    if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach(row => lines.push(row.map(escapeCell).join(',')));
  return lines.join('\r\n');
}

function downloadCsv(filename, content) {
  // BOM supaya Excel membaca UTF-8 dengan benar.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function exportProjects() {
  const rows = filterRows('projects').map(p => [
    p.title,
    p.category,
    p.description,
    p.image,
    Array.isArray(p.tech_stack) ? p.tech_stack.join('; ') : '',
    p.client,
    p.period,
    p.created_at,
  ]);
  downloadCsv(
    `proyek-${stamp()}.csv`,
    toCsv(['Judul', 'Kategori', 'Deskripsi', 'Gambar', 'Tech Stack', 'Klien', 'Periode', 'Dibuat'], rows)
  );
  showToast(`Diekspor ${rows.length} proyek ke CSV.`);
}

function exportMessages() {
  const rows = filterRows('messages').map(m => [
    m.is_read ? 'Sudah dibaca' : 'Belum dibaca',
    m.name,
    m.email,
    m.subject,
    m.message,
    m.created_at,
  ]);
  downloadCsv(
    `pesan-${stamp()}.csv`,
    toCsv(['Status', 'Nama', 'Email', 'Subjek', 'Pesan', 'Tanggal'], rows)
  );
  showToast(`Diekspor ${rows.length} pesan ke CSV.`);
}

// ============================================================
// PROJECTS CRUD
// ============================================================
async function loadProjects() {
  try {
    state.projects = await window.api.getProjects();
  } catch (e) {
    handleApiError('Gagal memuat proyek: ', e);
    state.projects = [];
  }
  refreshCategoryFilter();
  renderProjects();
}

function renderProjects() {
  const tbody = document.getElementById('projectsTableBody');
  if (!tbody) return;

  const info = getPaginated('projects');
  updateBulkBar('projects', 'projectBulkBar', 'projectSelectedCount');
  renderPagination('projectPagination', info, 'proyek');

  if (info.total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="admin-table-empty">
          <i class="fa-solid fa-folder-open"></i>
          ${state.projects.length === 0
            ? 'Belum ada proyek. Tambahkan proyek pertama Anda.'
            : 'Tidak ada proyek yang cocok dengan filter.'}
        </td>
      </tr>`;
    return;
  }

  const selected = state.selection.projects;

  tbody.innerHTML = info.slice.map(p => `
    <tr class="${selected.has(p.id) ? 'admin-row-selected' : ''}">
      <td class="admin-col-check">
        <input type="checkbox" data-project-check="${escapeHtml(p.id)}"
          ${selected.has(p.id) ? 'checked' : ''} aria-label="Pilih ${escapeHtml(p.title)}">
      </td>
      <td data-label="Proyek">
        <div class="admin-project-cell">
          ${p.image
            ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" class="admin-thumb">`
            : `<div class="admin-thumb admin-thumb-empty"><i class="fa-solid fa-image"></i></div>`}
          <strong>${escapeHtml(p.title)}</strong>
        </div>
      </td>
      <td data-label="Kategori"><span class="tag">${escapeHtml(p.category)}</span></td>
      <td data-label="Deskripsi" class="admin-cell-truncate"><span>${escapeHtml(p.description || '-')}</span></td>
      <td data-label="Klien">${escapeHtml(p.client || '-')}</td>
      <td data-label="Periode" class="admin-col-optional">${escapeHtml(p.period || '-')}</td>
      <td data-label="Dibuat" class="admin-col-optional">${formatDate(p.created_at)}</td>
      <td data-label="Aksi" class="admin-cell-actions">
        <button class="btn btn-outline btn-sm" data-edit-project="${escapeHtml(p.id)}" title="Edit">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-outline btn-sm btn-danger-outline" data-delete-project="${escapeHtml(p.id)}" title="Hapus">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-project-check]').forEach(box => {
    box.addEventListener('change', () => {
      const id = box.getAttribute('data-project-check');
      if (box.checked) state.selection.projects.add(id);
      else state.selection.projects.delete(id);
      renderProjects();
    });
  });
  tbody.querySelectorAll('[data-edit-project]').forEach(btn => {
    btn.addEventListener('click', () => editProject(btn.getAttribute('data-edit-project')));
  });
  tbody.querySelectorAll('[data-delete-project]').forEach(btn => {
    btn.addEventListener('click', () => deleteProject(btn.getAttribute('data-delete-project')));
  });
}

function updateImagePreview(url) {
  const preview = document.getElementById('projectImagePreview');
  if (!preview) return;
  if (url) {
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview gambar proyek">`;
  } else {
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
  }
}

function updateImageClearButton() {
  const btn = document.getElementById('projectImageClearBtn');
  if (!btn) return;
  const hasImage = state.pendingImageFile || document.getElementById('projectImage').value.trim();
  btn.style.display = hasImage ? 'inline-flex' : 'none';
}

function resetProjectForm() {
  state.editingProjectId = null;
  state.pendingImageFile = null;

  const form = document.getElementById('projectForm');
  if (form) form.reset();

  const fileInput = document.getElementById('projectImageFile');
  if (fileInput) fileInput.value = '';

  const btn = document.getElementById('projectSubmitBtn');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambah Proyek';

  const cancelBtn = document.getElementById('projectCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';

  const title = document.getElementById('projectFormTitle');
  if (title) title.textContent = 'Tambah Proyek Baru';

  updateImagePreview('');
  updateImageClearButton();
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('projectSubmitBtn');
  const originalText = btn ? btn.innerHTML : '';

  const title = document.getElementById('projectTitle').value.trim();
  const category = document.getElementById('projectCategory').value.trim();

  if (!title || !category) {
    showToast('Judul dan kategori proyek wajib diisi.', true);
    return;
  }

  if (state.pendingImageFile && state.pendingImageFile.size > MAX_IMAGE_BYTES) {
    showToast('Ukuran gambar melebihi 5 MB.', true);
    return;
  }

  const payload = {
    title,
    category,
    description: document.getElementById('projectDescription').value.trim(),
    challenges: document.getElementById('projectChallenges').value.trim(),
    solutions: document.getElementById('projectSolutions').value.trim(),
    image: document.getElementById('projectImage').value.trim(),
    tech_stack: document.getElementById('projectTechStack').value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    client: document.getElementById('projectClient').value.trim(),
    period: document.getElementById('projectPeriod').value.trim(),
  };

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
  }

  const isEdit = Boolean(state.editingProjectId);
  try {
    // Gambar lama di uploads/ dihapus otomatis oleh server saat diganti.
    if (state.pendingImageFile) {
      payload.image = await window.api.uploadImage(state.pendingImageFile);
    }

    if (isEdit) await window.api.updateProject(state.editingProjectId, payload);
    else await window.api.createProject(payload);

    showToast(isEdit ? 'Proyek berhasil diperbarui.' : 'Proyek berhasil ditambahkan.');
    resetProjectForm();
    await loadProjects();
    updateStats();
  } catch (e) {
    handleApiError('Gagal menyimpan proyek: ', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      if (btn.innerHTML.includes('fa-spinner')) btn.innerHTML = originalText;
    }
  }
}

function editProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;

  state.editingProjectId = id;
  state.pendingImageFile = null;

  const fileInput = document.getElementById('projectImageFile');
  if (fileInput) fileInput.value = '';

  document.getElementById('projectImage').value = p.image || '';
  document.getElementById('projectTitle').value = p.title || '';
  document.getElementById('projectCategory').value = p.category || '';
  document.getElementById('projectDescription').value = p.description || '';
  document.getElementById('projectChallenges').value = p.challenges || '';
  document.getElementById('projectSolutions').value = p.solutions || '';
  document.getElementById('projectTechStack').value = Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : '';
  document.getElementById('projectClient').value = p.client || '';
  document.getElementById('projectPeriod').value = p.period || '';

  // Kategori lama di luar daftar opsi tetap bisa diedit.
  const categorySelect = document.getElementById('projectCategory');
  if (p.category && categorySelect.value !== p.category) {
    categorySelect.add(new Option(p.category, p.category));
    categorySelect.value = p.category;
  }

  const btn = document.getElementById('projectSubmitBtn');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan Perubahan';
  const cancelBtn = document.getElementById('projectCancelBtn');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  const title = document.getElementById('projectFormTitle');
  if (title) title.textContent = 'Edit Proyek';

  updateImagePreview(p.image || '');
  updateImageClearButton();
  document.getElementById('projectFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Hapus proyek "${p.title}"? Tindakan ini tidak bisa dibatalkan.`)) return;

  try {
    await window.api.deleteProjects([id]);
    showToast('Proyek berhasil dihapus.');
    if (state.editingProjectId === id) resetProjectForm();
    state.selection.projects.delete(id);
    await loadProjects();
    updateStats();
  } catch (e) {
    handleApiError('Gagal menghapus proyek: ', e);
  }
}

async function bulkDeleteProjects() {
  const ids = [...state.selection.projects];
  if (ids.length === 0) return;
  if (!confirm(`Hapus ${ids.length} proyek sekaligus? Tindakan ini tidak bisa dibatalkan.`)) return;

  try {
    await window.api.deleteProjects(ids);
    if (ids.includes(state.editingProjectId)) resetProjectForm();
    clearSelection('projects');
    showToast(`${ids.length} proyek berhasil dihapus.`);
    await loadProjects();
    updateStats();
  } catch (e) {
    handleApiError('Gagal menghapus proyek: ', e);
  }
}

// ============================================================
// MESSAGES CRUD
// ============================================================
async function loadMessages() {
  try {
    state.messages = await window.api.getMessages();
  } catch (e) {
    handleApiError('Gagal memuat pesan: ', e);
    state.messages = [];
  }
  renderMessages();
}

function renderMessages() {
  const tbody = document.getElementById('messagesTableBody');
  if (!tbody) return;

  const info = getPaginated('messages');
  updateBulkBar('messages', 'messageBulkBar', 'messageSelectedCount');
  renderPagination('messagePagination', info, 'pesan');

  if (info.total === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="admin-table-empty">
          <i class="fa-solid fa-inbox"></i>
          ${state.messages.length === 0
            ? 'Belum ada pesan masuk.'
            : 'Tidak ada pesan yang cocok dengan filter.'}
        </td>
      </tr>`;
    return;
  }

  const selected = state.selection.messages;

  tbody.innerHTML = info.slice.map(m => `
    <tr class="${selected.has(m.id) ? 'admin-row-selected' : ''}">
      <td class="admin-col-check">
        <input type="checkbox" data-message-check="${escapeHtml(m.id)}"
          ${selected.has(m.id) ? 'checked' : ''} aria-label="Pilih pesan dari ${escapeHtml(m.name)}">
      </td>
      <td data-label="Status">
        ${m.is_read
          ? '<span class="admin-read-badge read"><i class="fa-solid fa-envelope-open"></i> Dibaca</span>'
          : '<span class="admin-read-badge unread"><i class="fa-solid fa-envelope"></i> Baru</span>'}
      </td>
      <td data-label="Nama"><strong>${escapeHtml(m.name)}</strong></td>
      <td data-label="Email">${escapeHtml(m.email)}</td>
      <td data-label="Subjek">${escapeHtml(m.subject || '-')}</td>
      <td data-label="Pesan" class="admin-cell-truncate"><span>${escapeHtml(m.message)}</span></td>
      <td data-label="Tanggal" class="admin-col-optional">${formatDate(m.created_at)}</td>
      <td data-label="Aksi" class="admin-cell-actions">
        <button class="btn btn-outline btn-sm" data-view-message="${escapeHtml(m.id)}" title="Lihat Detail">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button class="btn btn-outline btn-sm" data-toggle-message="${escapeHtml(m.id)}"
          title="${m.is_read ? 'Tandai belum dibaca' : 'Tandai sudah dibaca'}">
          <i class="fa-solid ${m.is_read ? 'fa-envelope' : 'fa-envelope-open'}"></i>
        </button>
        <button class="btn btn-outline btn-sm btn-danger-outline" data-delete-message="${escapeHtml(m.id)}" title="Hapus">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-message-check]').forEach(box => {
    box.addEventListener('change', () => {
      const id = box.getAttribute('data-message-check');
      if (box.checked) state.selection.messages.add(id);
      else state.selection.messages.delete(id);
      renderMessages();
    });
  });
  tbody.querySelectorAll('[data-view-message]').forEach(btn => {
    btn.addEventListener('click', () => viewMessage(btn.getAttribute('data-view-message')));
  });
  tbody.querySelectorAll('[data-toggle-message]').forEach(btn => {
    btn.addEventListener('click', () => toggleMessageRead(btn.getAttribute('data-toggle-message')));
  });
  tbody.querySelectorAll('[data-delete-message]').forEach(btn => {
    btn.addEventListener('click', () => deleteMessage(btn.getAttribute('data-delete-message')));
  });
}

function closeMessageModal() {
  const modal = document.getElementById('messageModal');
  if (modal) modal.classList.remove('active');
  state.viewingMessageId = null;
}

function viewMessage(id) {
  const m = state.messages.find(x => x.id === id);
  if (!m) return;

  state.viewingMessageId = id;

  const modal = document.getElementById('messageModal');
  const body = document.getElementById('messageModalBody');
  if (!modal || !body) return;

  body.innerHTML = `
    <div class="admin-detail-row">
      <strong>Dari:</strong>
      <div class="admin-detail-value admin-detail-strong">${escapeHtml(m.name)} &lt;${escapeHtml(m.email)}&gt;</div>
    </div>
    <div class="admin-detail-row">
      <strong>Subjek:</strong>
      <div class="admin-detail-value">${escapeHtml(m.subject || '-')}</div>
    </div>
    <div class="admin-detail-row">
      <strong>Tanggal:</strong>
      <div class="admin-detail-value">${formatDate(m.created_at)}</div>
    </div>
    <div class="admin-detail-row">
      <strong>Status:</strong>
      <div class="admin-detail-value">
        ${m.is_read
          ? '<span class="admin-read-badge read"><i class="fa-solid fa-envelope-open"></i> Sudah dibaca</span>'
          : '<span class="admin-read-badge unread"><i class="fa-solid fa-envelope"></i> Belum dibaca</span>'}
      </div>
    </div>
    <div>
      <strong>Pesan:</strong>
      <div class="admin-message-body">${escapeHtml(m.message)}</div>
    </div>
  `;

  const toggleBtn = document.getElementById('toggleReadModalBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = m.is_read
      ? '<i class="fa-solid fa-envelope"></i> Tandai Belum Dibaca'
      : '<i class="fa-solid fa-envelope-open"></i> Tandai Sudah Dibaca';
  }

  modal.classList.add('active');
}

async function bulkSetMessageRead(ids, isRead, silent = false) {
  if (ids.length === 0) return;
  try {
    await window.api.markMessages(ids, isRead);
  } catch (e) {
    handleApiError('Gagal memperbarui status pesan: ', e);
    return;
  }

  ids.forEach(id => {
    const local = state.messages.find(m => m.id === id);
    if (local) local.is_read = isRead;
  });

  updateStats();
  renderMessages();
  if (state.viewingMessageId && ids.includes(state.viewingMessageId)) viewMessage(state.viewingMessageId);
  if (!silent) showToast(`${ids.length} pesan ditandai ${isRead ? 'sudah dibaca' : 'belum dibaca'}.`);
}

async function toggleMessageRead(id) {
  const m = state.messages.find(x => x.id === id);
  if (!m) return;
  const next = !m.is_read;
  await bulkSetMessageRead([id], next, true);
  showToast(next ? 'Pesan ditandai sudah dibaca.' : 'Pesan ditandai belum dibaca.');
}

async function deleteMessage(id) {
  const m = state.messages.find(x => x.id === id);
  if (!m) return;
  if (!confirm(`Hapus pesan dari "${m.name}"?`)) return;

  try {
    await window.api.deleteMessages([id]);
    showToast('Pesan berhasil dihapus.');
    if (state.viewingMessageId === id) closeMessageModal();
    state.selection.messages.delete(id);
    await loadMessages();
    updateStats();
  } catch (e) {
    handleApiError('Gagal menghapus pesan: ', e);
  }
}

async function bulkDeleteMessages() {
  const ids = [...state.selection.messages];
  if (ids.length === 0) return;
  if (!confirm(`Hapus ${ids.length} pesan sekaligus?`)) return;

  try {
    await window.api.deleteMessages(ids);
    clearSelection('messages');
    showToast(`${ids.length} pesan berhasil dihapus.`);
    await loadMessages();
    updateStats();
  } catch (e) {
    handleApiError('Gagal menghapus pesan: ', e);
  }
}

function replyToMessage() {
  const m = state.messages.find(x => x.id === state.viewingMessageId);
  if (!m) return;
  const subject = m.subject ? `Re: ${m.subject}` : 'Re: Pesan Anda di PaulFolio';
  window.location.href = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}`;
}

// ============================================================
// SELECT ALL HANDLER (umum untuk semua tabel)
// ============================================================
function bindSelectAll(key, renderFn) {
  const selectAll = document.getElementById(key + 'SelectAll');
  if (!selectAll) return;

  selectAll.addEventListener('change', () => {
    const visible = getVisibleIds(key);
    if (selectAll.checked) visible.forEach(id => state.selection[key].add(id));
    else visible.forEach(id => state.selection[key].delete(id));
    renderFn();
  });
}

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

  const tabBtn = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(`tab-${tabName}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');

  renderActiveTab();
}

// ============================================================
// BIND SEMUA EVENT
// ============================================================
function bindSearch(inputId, key, renderFn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.filters[key].search = input.value;
      state.filters[key].page = 1;
      renderFn();
    }, 200);
  });
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', handler);
}

function bindEvents() {
  // Logout (desktop + mobile)
  const doLogout = async () => {
    try {
      await window.api.logout();
    } finally {
      window.location.href = 'auth.html';
    }
  };
  bindClick('adminLogoutBtn', doLogout);
  bindClick('adminLogoutBtnMobile', doLogout);

  // Tab
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
  });

  // Stat card "belum dibaca" bisa diklik untuk lompat ke tab pesan
  bindClick('statUnreadCard', () => {
    state.filters.messages.read = 'unread';
    state.filters.messages.page = 1;
    const filterSelect = document.getElementById('messageReadFilter');
    if (filterSelect) filterSelect.value = 'unread';
    switchTab('messages');
  });

  // --- Project form ---
  const projectForm = document.getElementById('projectForm');
  if (projectForm) projectForm.addEventListener('submit', handleProjectSubmit);

  bindClick('projectCancelBtn', resetProjectForm);

  const imageFileInput = document.getElementById('projectImageFile');
  const imageUrlInput = document.getElementById('projectImage');

  if (imageFileInput) {
    imageFileInput.addEventListener('change', () => {
      const file = imageFileInput.files && imageFileInput.files[0];
      state.pendingImageFile = file || null;
      if (file) {
        if (file.size > MAX_IMAGE_BYTES) {
          showToast('Ukuran gambar melebihi 5 MB.', true);
          imageFileInput.value = '';
          state.pendingImageFile = null;
          updateImagePreview(imageUrlInput.value.trim());
          updateImageClearButton();
          return;
        }
        updateImagePreview(URL.createObjectURL(file));
      }
      updateImageClearButton();
    });
  }

  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', () => {
      // URL manual menimpa preview file yang dipilih.
      if (imageUrlInput.value.trim()) {
        state.pendingImageFile = null;
        if (imageFileInput) imageFileInput.value = '';
      }
      updateImagePreview(imageUrlInput.value.trim());
      updateImageClearButton();
    });
  }

  bindClick('projectImageClearBtn', () => {
    state.pendingImageFile = null;
    if (imageUrlInput) imageUrlInput.value = '';
    if (imageFileInput) imageFileInput.value = '';
    updateImagePreview('');
    updateImageClearButton();
  });

  // --- Projects toolbar ---
  bindSearch('projectSearch', 'projects', renderProjects);

  const projectCategoryFilter = document.getElementById('projectCategoryFilter');
  if (projectCategoryFilter) {
    projectCategoryFilter.addEventListener('change', () => {
      state.filters.projects.category = projectCategoryFilter.value;
      state.filters.projects.page = 1;
      renderProjects();
    });
  }

  bindClick('projectExportBtn', exportProjects);
  bindClick('projectBulkDeleteBtn', bulkDeleteProjects);
  bindClick('projectBulkClearBtn', () => clearSelection('projects'));
  bindSelectAll('projects', renderProjects);

  // --- Messages toolbar ---
  bindSearch('messageSearch', 'messages', renderMessages);

  const messageReadFilter = document.getElementById('messageReadFilter');
  if (messageReadFilter) {
    messageReadFilter.addEventListener('change', () => {
      state.filters.messages.read = messageReadFilter.value;
      state.filters.messages.page = 1;
      renderMessages();
    });
  }

  bindClick('messageExportBtn', exportMessages);
  bindClick('messageBulkReadBtn', () => bulkSetMessageRead([...state.selection.messages], true));
  bindClick('messageBulkUnreadBtn', () => bulkSetMessageRead([...state.selection.messages], false));
  bindClick('messageBulkDeleteBtn', bulkDeleteMessages);
  bindClick('messageBulkClearBtn', () => clearSelection('messages'));
  bindSelectAll('messages', renderMessages);

  // --- Message modal ---
  bindClick('closeMessageModalBtn', closeMessageModal);
  bindClick('closeMessageModalFooterBtn', closeMessageModal);
  bindClick('replyMessageModalBtn', replyToMessage);
  bindClick('toggleReadModalBtn', () => {
    if (state.viewingMessageId) toggleMessageRead(state.viewingMessageId);
  });

  const messageModal = document.getElementById('messageModal');
  if (messageModal) {
    messageModal.addEventListener('click', event => {
      if (event.target === messageModal) closeMessageModal();
    });
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMessageModal();
  });
}

// ============================================================
// INIT
// ============================================================
async function initAdmin() {
  let authenticated = false;
  try {
    authenticated = await window.api.getSession();
  } catch (_) { /* dianggap belum login */ }

  // Belum login → langsung ke halaman login, tidak perlu layar "akses ditolak".
  if (!authenticated) {
    window.location.replace('auth.html');
    return;
  }

  const loadingEl = document.getElementById('adminLoading');
  const contentEl = document.getElementById('adminContent');
  if (loadingEl) loadingEl.style.display = 'none';
  if (contentEl) contentEl.style.display = 'block';

  bindEvents();
  updateImageClearButton();

  await Promise.all([loadProjects(), loadMessages()]);
  updateStats();
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
