/**
 * PaulFolio — Main JavaScript Logic & Dynamic Interactions
 */
import projects from './data/projects.json';

// Nomor WhatsApp Paulus (format internasional tanpa "+" atau spasi).
const WHATSAPP_NUMBER = '6285162744708';

function initApp() {
  try {

  // ==========================================
  // 1. TYPEWRITER EFFECT IN HERO SECTION
  // ==========================================
  const typewriterElement = document.getElementById('typewriter');
  const roles = [
    "Creative Design",
    "Multimedia",
    "IT Consultant",
    "Web Development",
    "CCTV Specialist"
  ];
  let roleIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  let typingSpeed = 100;

  function typeWriter() {
    const currentRole = roles[roleIndex];

    if (isDeleting) {
      typewriterElement.textContent = currentRole.substring(0, charIndex - 1);
      charIndex--;
      typingSpeed = 40;
    } else {
      typewriterElement.textContent = currentRole.substring(0, charIndex + 1);
      charIndex++;
      typingSpeed = 90;
    }

    if (!isDeleting && charIndex === currentRole.length) {
      isDeleting = true;
      typingSpeed = 2000; // Pause at full word
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      typingSpeed = 500;
    }

    setTimeout(typeWriter, typingSpeed);
  }

  if (typewriterElement) {
    typeWriter();
  }

  // ==========================================
  // 2. STICKY NAVBAR & ACTIVE PAGE HIGHLIGHT
  // ==========================================
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');

  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 40) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }

      const backToTopBtn = document.getElementById('backToTopBtn');
      if (backToTopBtn) {
        if (window.scrollY > 400) {
          backToTopBtn.style.opacity = '1';
          backToTopBtn.style.pointerEvents = 'auto';
        } else {
          backToTopBtn.style.opacity = '0';
          backToTopBtn.style.pointerEvents = 'none';
        }
      }
    });
  }

  // Highlight active menu link based on current page URL
  const currentPath = window.location.pathname;
  let pageName = currentPath.substring(currentPath.lastIndexOf('/') + 1);
  if (!pageName || pageName === '') pageName = 'index.html';

  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href) {
      if (href === pageName || (pageName === 'index.html' && (href === '/' || href === 'index.html'))) {
        link.classList.add('active');
      }
    }
  });

  // ==========================================
  // 3. MOBILE DRAWER NAVIGATION TOGGLE
  // ==========================================
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

  if (mobileMenuBtn && mobileDrawer) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('open');
      const icon = mobileMenuBtn.querySelector('i');
      if (mobileDrawer.classList.contains('open')) {
        icon.className = 'fa-solid fa-xmark';
      } else {
        icon.className = 'fa-solid fa-bars';
      }
    });

    mobileNavLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        const icon = mobileMenuBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-bars';
      });
    });
  }

  // ==========================================
  // 4. ANIMATED STAT COUNTERS
  // ==========================================
  const statNumbers = document.querySelectorAll('.stat-number');
  let hasAnimatedStats = false;

  function animateCounters() {
    if (hasAnimatedStats) return;
    const heroStats = document.querySelector('.hero-stats');
    if (!heroStats) return;

    const rect = heroStats.getBoundingClientRect();
    if (rect.top <= window.innerHeight && rect.bottom >= 0) {
      hasAnimatedStats = true;
      statNumbers.forEach(counter => {
        const target = +counter.getAttribute('data-target');
        const duration = 1500; // ms
        const increment = target / (duration / 16);

        let current = 0;
        const updateCounter = () => {
          current += increment;
          if (current < target) {
            counter.textContent = Math.ceil(current);
            requestAnimationFrame(updateCounter);
          } else {
            counter.textContent = target;
          }
        };
        updateCounter();
      });
    }
  }

  window.addEventListener('scroll', animateCounters);
  animateCounters(); // Trigger on load if in view

  // ==========================================
  // 5. PROJECTS (dimuat dari data.json via API)
  // ==========================================
  const projectsGrid = document.getElementById('projectsGrid');
  const filterControls = document.getElementById('projectFilters');
  const projectModal = document.getElementById('projectModal');
  const modalProjectTitle = document.getElementById('modalProjectTitle');
  const modalProjectBody = document.getElementById('modalProjectBody');
  const FALLBACK_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><rect width="16" height="10" fill="#1e2433"/></svg>'
  );
  let projectsById = {};

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderProjectFilters(projects) {
    if (!filterControls) return;
    const categories = [...new Set(projects.map(p => p.category).filter(Boolean))];
    filterControls.innerHTML =
      `<button class="filter-btn active" data-filter="all">Semua Proyek (${projects.length})</button>` +
      categories.map(c => `<button class="filter-btn" data-filter="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');

    filterControls.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterControls.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filterValue = btn.getAttribute('data-filter');
        projectsGrid.querySelectorAll('.project-card').forEach(card => {
          const show = filterValue === 'all' || card.getAttribute('data-category') === filterValue;
          card.classList.toggle('hide', !show);
        });
      });
    });
  }

  function renderProjects(projects) {
    projectsById = {};
    projects.forEach(p => { projectsById[p.id] = p; });

    if (projects.length === 0) {
      projectsGrid.innerHTML = `
        <div class="projects-empty">
          <i class="fa-solid fa-folder-open"></i>
          <p>Belum ada proyek yang ditampilkan.</p>
        </div>`;
      return;
    }

    projectsGrid.innerHTML = projects.map(p => {
      const techTags = (p.tech_stack || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      return `
        <article class="glass-card project-card" data-category="${escapeHtml(p.category)}" data-project-id="${escapeHtml(p.id)}"
          tabindex="0" role="button" aria-label="Lihat detail ${escapeHtml(p.title)}">
          <div class="project-img-box">
            <img src="${escapeHtml(p.image || FALLBACK_IMAGE)}" alt="${escapeHtml(p.title)}" loading="lazy">
            <span class="project-badge">${escapeHtml(p.category)}</span>
            <div class="project-overlay">
              <span class="btn btn-primary btn-sm">
                <i class="fa-solid fa-expand"></i> Detail Proyek
              </span>
            </div>
          </div>
          <div class="project-body">
            <h3 class="project-title">${escapeHtml(p.title)}</h3>
            <p class="project-snippet">${escapeHtml(p.description || '')}</p>
            <div class="project-tags">${techTags}</div>
          </div>
        </article>`;
    }).join('');

    projectsGrid.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => { img.src = FALLBACK_IMAGE; }, { once: true });
    });
    projectsGrid.querySelectorAll('.project-card').forEach(card => {
      const open = () => openProjectModal(card.getAttribute('data-project-id'));
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  function openProjectModal(id) {
    const data = projectsById[id];
    if (!data || !projectModal) return;

    modalProjectTitle.textContent = data.title;
    const meta = [
      ['Kategori', data.category],
      ['Klien', data.client],
      ['Pengerjaan', data.period],
    ].filter(([, v]) => v);
    const section = (title, color, text) => text
      ? `<h4 style="color: ${color}; margin-bottom: 8px;">${title}</h4>
         <p class="project-modal-text">${escapeHtml(text)}</p>`
      : '';

    modalProjectBody.innerHTML = `
      <div>
        ${data.image ? `<img src="${escapeHtml(data.image)}" alt="${escapeHtml(data.title)}" class="project-modal-img">` : ''}
        <div class="project-modal-meta">
          ${meta.map(([k, v]) => `<div><strong>${k}:</strong> <span class="text-white">${escapeHtml(v)}</span></div>`).join('')}
        </div>
        ${section('Deskripsi Proyek:', 'var(--primary)', data.description)}
        ${section('Tantangan Utama:', 'var(--secondary)', data.challenges)}
        ${section('Solusi Diterapkan:', 'var(--emerald)', data.solutions)}
        ${(data.tech_stack || []).length ? `
          <h4 style="margin-bottom: 10px;">Teknologi Digunakan:</h4>
          <div class="project-tags">${data.tech_stack.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
      </div>
    `;
    const modalImg = modalProjectBody.querySelector('.project-modal-img');
    if (modalImg) modalImg.addEventListener('error', () => modalImg.remove(), { once: true });

    projectModal.classList.add('active');
  }

  if (projectsGrid) {
    const projectList = [...projects].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );
    renderProjectFilters(projectList);
    renderProjects(projectList);

    // Deep-link: projects.html?id=<projectId> langsung membuka detail proyek
    const deepLinkId = new URLSearchParams(window.location.search).get('id');
    if (deepLinkId && projectsById[deepLinkId]) {
      openProjectModal(deepLinkId);
    }
  }

  const closeProjectModal = () => projectModal && projectModal.classList.remove('active');
  const closeProjectModalBtn = document.getElementById('closeProjectModalBtn');
  const closeProjectModalFooterBtn = document.getElementById('closeProjectModalFooterBtn');
  if (closeProjectModalBtn) closeProjectModalBtn.addEventListener('click', closeProjectModal);
  if (closeProjectModalFooterBtn) closeProjectModalFooterBtn.addEventListener('click', closeProjectModal);

  // ==========================================
  // 7. CV MODAL HANDLERS & SIMULATED DOWNLOAD
  // ==========================================
  const cvModal = document.getElementById('cvModal');
  const cvHeaderBtn = document.getElementById('cvHeaderBtn');
  const cvMobileBtn = document.getElementById('cvMobileBtn');
  const openCvModalBtn = document.getElementById('openCvModalBtn');
  const closeCvModalBtn = document.getElementById('closeCvModalBtn');
  const closeCvModalFooterBtn = document.getElementById('closeCvModalFooterBtn');
  const downloadCvPdfBtn = document.getElementById('downloadCvPdfBtn');

  function openCvModal() {
    if (cvModal) cvModal.classList.add('active');
  }

  if (cvHeaderBtn) cvHeaderBtn.addEventListener('click', openCvModal);
  if (cvMobileBtn) cvMobileBtn.addEventListener('click', openCvModal);
  if (openCvModalBtn) openCvModalBtn.addEventListener('click', openCvModal);
  if (cvModal) cvModal.querySelector('.modal-close').addEventListener('click', () => cvModal.classList.remove('active'));
  if (closeCvModalFooterBtn) closeCvModalFooterBtn.addEventListener('click', () => cvModal.classList.remove('active'));

  if (downloadCvPdfBtn) {
    downloadCvPdfBtn.addEventListener('click', () => {
      showToast('⚡ Mengunduh file CV_Paul_FullStack_Engineer.pdf...');
    });
  }

  // Header "Hubungi Saya" button smooth scroll
  const hireHeaderBtn = document.getElementById('hireHeaderBtn');
  if (hireHeaderBtn) {
    hireHeaderBtn.addEventListener('click', () => {
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        contactSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // ==========================================
  // 8. CONTACT FORM SUBMISSION & TOPIC SELECTION
  // ==========================================
  const topicChips = document.querySelectorAll('.topic-chip');
  const subjectInput = document.getElementById('subject');

  if (topicChips.length > 0 && subjectInput) {
    topicChips.forEach(chip => {
      chip.addEventListener('click', () => {
        topicChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const topic = chip.getAttribute('data-topic');
        if (topic) {
          subjectInput.value = topic;
        }
      });
    });
  }

  // ==========================================
  // NOTIFICATION BELL BUTTON IN NAVBAR
  // ==========================================
  const notifBellBtn = document.getElementById('notifBellBtn');
  const notifDot = document.getElementById('notifDot');
  const notifBellIcon = document.getElementById('notifBellIcon');

  function updateBellState() {
    if (!notifBellBtn) return;
    if (!('Notification' in window)) {
      notifBellBtn.title = 'Browser tidak mendukung notifikasi';
      notifBellBtn.classList.remove('active');
      if (notifDot) notifDot.classList.remove('show');
      return;
    }
    if (Notification.permission === 'granted') {
      notifBellBtn.classList.add('active');
      notifBellBtn.title = 'Notifikasi aktif — klik untuk tes';
      if (notifDot) notifDot.classList.remove('show');
      if (notifBellIcon) notifBellIcon.className = 'fa-solid fa-bell';
    } else if (Notification.permission === 'default') {
      notifBellBtn.classList.remove('active');
      if (notifDot) notifDot.classList.add('show');
      notifBellBtn.title = 'Klik untuk aktifkan notifikasi';
      if (notifBellIcon) notifBellIcon.className = 'fa-regular fa-bell';
    } else {
      notifBellBtn.classList.remove('active');
      notifBellBtn.title = 'Notifikasi diblokir — aktifkan di pengaturan browser';
      if (notifDot) notifDot.classList.remove('show');
      if (notifBellIcon) notifBellIcon.className = 'fa-solid fa-bell-slash';
    }
  }

  if (notifBellBtn) {
    updateBellState();
    notifBellBtn.addEventListener('click', async () => {
      // Animasi getar
      notifBellBtn.classList.add('ring');
      setTimeout(() => notifBellBtn.classList.remove('ring'), 600);

      if (!('Notification' in window)) {
        showToast('⚠️ Browser Anda tidak mendukung notifikasi.');
        return;
      }

      if (Notification.permission === 'granted') {
        // Kirim notifikasi tes
        try {
          new Notification('✅ PaulFolio — Notifikasi Aktif', {
            body: 'Notifikasi berfungsi dengan baik!',
            icon: './assets/images/favicon-192.png',
            tag: 'paulfolio-test',
          });
          showToast('🔔 Notifikasi tes berhasil dikirim!');
        } catch (e) {
          showToast('⚠️ Notifikasi sudah aktif.');
        }
        updateBellState();
        return;
      }

      if (Notification.permission === 'denied') {
        showToast('⚠️ Notifikasi diblokir. Aktifkan manual di pengaturan browser.');
        return;
      }

      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          notifBellBtn.classList.add('active');
          if (notifDot) notifDot.classList.remove('show');
          showToast('🔔 Notifikasi browser berhasil diaktifkan!');
          // Tampilkan notifikasi test
          new Notification('✅ PaulFolio — Notifikasi Aktif', {
            body: 'Anda akan menerima pemberitahuan saat ada pesan masuk.',
            icon: './assets/images/favicon-192.png',
            tag: 'paulfolio-activation',
          });
          updateBellState();
        } else {
          showToast('⚠️ Izin notifikasi ditolak.');
        }
      } catch (e) {
        showToast('⚠️ Gagal meminta izin notifikasi.');
        console.error('[PaulFolio] Notification permission error:', e);
      }
    });
  }

  // Situs ini sepenuhnya statis (tanpa server), jadi form tidak dikirim ke
  // backend. Isi form diteruskan ke WhatsApp Paulus lewat wa.me.
  window.handleFormSubmit = function(event) {
    event.preventDefault();
    const form = document.getElementById('contactForm');
    if (!form) return;

    const value = id => (document.getElementById(id) || {}).value || '';
    const name = value('name').trim();
    const email = value('email').trim();
    const subject = value('subject').trim();
    const message = value('message').trim();

    if (!name || !email || !message) {
      showToast('⚠️ Nama, email, dan pesan wajib diisi.');
      return;
    }

    const text = [
      `*${subject || 'Pesan dari situs'}*`,
      '',
      `Nama: ${name}`,
      `Email: ${email}`,
      '',
      message,
    ].join('\n');

    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener'
    );
    form.reset();
    showToast(`🎉 Terima kasih ${name}, lanjutkan kirim pesan di WhatsApp.`);
  };

  function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (toast && toastMessage) {
      toastMessage.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 4000);
    }
  }

  // Close modals when clicking outside content
  window.addEventListener('click', (e) => {
    if (projectModal && e.target === projectModal) projectModal.classList.remove('active');
    if (cvModal && e.target === cvModal) cvModal.classList.remove('active');
  });

  // Back to Top button action
  const backToTopBtn = document.getElementById('backToTopBtn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ==========================================
  // 9. HERO SLIDESHOW (CREATIVE / MULTIMEDIA DESIGN)
  // ==========================================
  const heroSlider = document.getElementById('heroSlider');
  const heroSlides = heroSlider ? [...heroSlider.querySelectorAll('.hero-slide')] : [];
  const heroDotsWrap = document.getElementById('heroSlideDots');
  const heroPrevBtn = document.getElementById('heroSlidePrev');
  const heroNextBtn = document.getElementById('heroSlideNext');
  const SLIDE_INTERVAL = 5000;
  let heroSlideIndex = 0;
  let heroTimer = null;

  if (heroSlider && heroSlides.length > 1) {
    const heroDots = heroSlides.map((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'hero-slide-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.addEventListener('click', () => {
        showSlide(i);
        restartSlideTimer();
      });
      heroDotsWrap.appendChild(dot);
      return dot;
    });

    function showSlide(nextIndex) {
      heroSlideIndex = (nextIndex + heroSlides.length) % heroSlides.length;
      heroSlides.forEach((slide, i) => slide.classList.toggle('is-active', i === heroSlideIndex));
      heroDots.forEach((dot, i) => dot.classList.toggle('active', i === heroSlideIndex));
    }

    function startSlideTimer() {
      heroTimer = setInterval(() => showSlide(heroSlideIndex + 1), SLIDE_INTERVAL);
    }

    function stopSlideTimer() {
      if (heroTimer) clearInterval(heroTimer);
      heroTimer = null;
    }

    function restartSlideTimer() {
      stopSlideTimer();
      startSlideTimer();
    }

    if (heroPrevBtn) heroPrevBtn.addEventListener('click', () => { showSlide(heroSlideIndex - 1); restartSlideTimer(); });
    if (heroNextBtn) heroNextBtn.addEventListener('click', () => { showSlide(heroSlideIndex + 1); restartSlideTimer(); });

    heroSlider.addEventListener('mouseenter', stopSlideTimer);
    heroSlider.addEventListener('mouseleave', startSlideTimer);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopSlideTimer();
      } else {
        startSlideTimer();
      }
    });

    startSlideTimer();
  }

} catch (err) {
  console.error('[PaulFolio] Script initialization error:', err);
}
}

// Safe bootstrap: works whether DOMContentLoaded has already fired or not
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
