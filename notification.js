/**
 * PaulFolio — Notification System
 * Handles: Browser Push Notification + WhatsApp (CallMeBot API)
 *
 * SETUP WHATSAPP (CallMeBot) — Lakukan SEKALI:
 * 1. Buka WhatsApp dan kirim pesan ke: +34 644 60 49 16
 *    Isi pesan: "I allow callmebot to send me messages"
 * 2. Tunggu balasan API key dari CallMeBot (biasanya < 1 menit)
 * 3. Isi CALLMEBOT_API_KEY di bawah dengan API key yang diterima
 */

// ============================================================
// KONFIGURASI — ISI SESUAI DATA ANDA
// ============================================================
const NOTIF_CONFIG = {
  // WhatsApp (CallMeBot)
  whatsapp: {
    enabled: true,
    phone: '6285162744708',          // Nomor WA tanpa + (format internasional)
    apiKey: 'YOUR_CALLMEBOT_APIKEY', // Ganti dengan API key dari CallMeBot
  },

  // Browser Push Notification
  browser: {
    enabled: true,
    icon: './assets/images/favicon.jpg',
  }
};
// ============================================================


/**
 * Kirim notifikasi WhatsApp via CallMeBot API
 */
async function sendWhatsAppNotification(name, email, subject, message) {
  if (!NOTIF_CONFIG.whatsapp.enabled) return;
  if (NOTIF_CONFIG.whatsapp.apiKey === 'YOUR_CALLMEBOT_APIKEY') {
    console.warn('[PaulFolio] WhatsApp: API key CallMeBot belum diset. Lihat instruksi di notification.js');
    return;
  }

  const text = [
    '🔔 *Pesan Baru di PaulFolio!*',
    '',
    '👤 *Nama:* ' + name,
    '📧 *Email:* ' + email,
    '📌 *Subjek:* ' + subject,
    '💬 *Pesan:*',
    message,
    '',
    '⏰ ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB'
  ].join('\n');

  var url = 'https://api.callmebot.com/whatsapp.php?phone=' + NOTIF_CONFIG.whatsapp.phone + '&text=' + encodeURIComponent(text) + '&apikey=' + NOTIF_CONFIG.whatsapp.apiKey;

  try {
    await fetch(url, { method: 'GET', mode: 'no-cors' });
    console.log('[PaulFolio] WhatsApp notification sent.');
  } catch (err) {
    console.error('[PaulFolio] WhatsApp notification error:', err);
  }
}


/**
 * Tampilkan Browser Push Notification (lonceng)
 */
async function sendBrowserNotification(name, subject) {
  if (!NOTIF_CONFIG.browser.enabled) return;
  if (!('Notification' in window)) {
    console.warn('[PaulFolio] Browser tidak mendukung Web Notification API.');
    return;
  }

  var permission = Notification.permission;

  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission === 'granted') {
    var notif = new Notification('📬 Pesan Baru — PaulFolio', {
      body: name + ' mengirim pesan: "' + subject + '"',
      icon: NOTIF_CONFIG.browser.icon,
      badge: NOTIF_CONFIG.browser.icon,
      tag: 'paulfolio-contact',
      requireInteraction: false,
    });

    setTimeout(function() { notif.close(); }, 6000);

    notif.onclick = function() {
      window.focus();
      notif.close();
    };
  }
}


/**
 * Fungsi utama — dipanggil setelah form berhasil dikirim
 */
async function sendContactNotifications(formData) {
  var name = formData.name;
  var email = formData.email;
  var subject = formData.subject;
  var message = formData.message;

  await Promise.allSettled([
    sendBrowserNotification(name, subject),
    sendWhatsAppNotification(name, email, subject, message),
  ]);
}


// Ekspos ke window
window.sendContactNotifications = sendContactNotifications;
window.requestBrowserNotificationPermission = async function() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};
