/**
 * PaulFolio — Login admin (password saja).
 *
 * Password diverifikasi di server terhadap hash scrypt di data/data.json.
 * Kalau berhasil, server memasang cookie sesi HttpOnly lalu kita
 * diarahkan ke admin.html.
 */

function showAuthAlert(message, isError) {
  const alertBox = document.getElementById('authAlert');
  const alertMsg = document.getElementById('authAlertMessage');
  const alertIcon = document.getElementById('authAlertIcon');
  if (!alertBox || !alertMsg) return;
  alertMsg.textContent = message;
  alertBox.style.display = 'flex';
  alertBox.className = 'auth-alert ' + (isError ? 'error' : 'success');
  if (alertIcon) {
    alertIcon.className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const submitBtn = document.getElementById('loginSubmitBtn');
  const passwordInput = document.getElementById('loginPassword');
  const password = passwordInput.value;

  if (!password) {
    showAuthAlert('Password wajib diisi.', true);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';

  try {
    await window.api.login(password);
    showAuthAlert('Login berhasil! Mengalihkan ke dashboard...', false);
    window.location.href = 'admin.html';
  } catch (e) {
    showAuthAlert(e.message, true);
    passwordInput.select();
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
  }
}

async function initAuth() {
  document.getElementById('loginForm').addEventListener('submit', handleLoginSubmit);

  // Sudah login? Langsung ke dashboard.
  try {
    if (await window.api.getSession()) window.location.replace('admin.html');
  } catch (_) { /* tetap tampilkan form */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
