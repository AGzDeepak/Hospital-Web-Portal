const apiBase = 'http://localhost:5000/api';

async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const res = await fetch(apiBase + path, {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadPublicData() {
  const statsEl = document.getElementById('stats');
  const patientListEl = document.getElementById('patientList');
  const doctorListEl = document.getElementById('doctorList');

  if (statsEl) {
    try {
      const dashboard = await request('/dashboard');
      statsEl.innerHTML = `
        <div class="stat"><strong>${dashboard.totalPatients}</strong><br/>Total Patients</div>
        <div class="stat"><strong>${dashboard.doctorsAvailable}</strong><br/>Doctors Available</div>
        <div class="stat"><strong>${dashboard.todayAppointments}</strong><br/>Today Appointments</div>
        <div class="stat"><strong>${dashboard.revenue}</strong><br/>Revenue</div>
      `;
    } catch (err) {
      statsEl.innerHTML = '<div class="stat">Dashboard unavailable</div>';
    }
  }

  if (patientListEl) {
    try {
      const patients = await request('/patients');
      patientListEl.innerHTML = patients.slice(0, 4).map(p => `<li><strong>${p.name}</strong> &mdash; ${p.disease} (${p.status})</li>`).join('');
    } catch (err) {
      patientListEl.innerHTML = '<li>Patients list unavailable</li>';
    }
  }

  if (doctorListEl) {
    try {
      const doctors = await request('/doctors');
      doctorListEl.innerHTML = doctors.slice(0, 6).map(d => `<li><strong>${d.name}</strong> &mdash; ${d.department} &middot; ${d.availability}</li>`).join('');
    } catch (err) {
      doctorListEl.innerHTML = '<li>Doctors list unavailable</li>';
    }
  }
}

function bindForms() {
  const authForm = document.getElementById('authForm');
  const authMessage = document.getElementById('authMessage');
  const patientForm = document.getElementById('patientForm');
  const appointmentForm = document.getElementById('appointmentForm');
  const appointmentMessage = document.getElementById('appointmentMessage');

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          name: document.getElementById('authName').value,
          email: document.getElementById('authEmail').value,
          password: document.getElementById('authPassword').value
        };
        const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
        localStorage.setItem('token', data.token);
        authMessage.textContent = `Welcome ${data.user.name}`;
      } catch (err) {
        authMessage.textContent = err.message;
      }
    });
  }

  if (patientForm) {
    patientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await request('/patients', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
          body: JSON.stringify({
            name: document.getElementById('pName').value,
            age: Number(document.getElementById('pAge').value),
            bloodGroup: document.getElementById('pBlood').value,
            disease: document.getElementById('pDisease').value,
            status: document.getElementById('pStatus').value,
            insurance: document.getElementById('pInsurance')?.value || '',
            emergencyContact: document.getElementById('pEmergencyContact')?.value || ''
          })
        });
        patientForm.reset();
        loadPublicData();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (appointmentForm) {
    appointmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await request('/appointments', {
          method: 'POST',
          body: JSON.stringify({
            patientName: document.getElementById('aPatient').value,
            doctorName: document.getElementById('aDoctor').value,
            date: document.getElementById('aDate').value,
            time: document.getElementById('aTime').value,
            type: document.getElementById('aType').value,
            status: 'Pending'
          })
        });
        appointmentForm.reset();
        setMinimumAppointmentDate();
        if (appointmentMessage) appointmentMessage.textContent = 'Appointment request saved. Our desk will confirm shortly.';
      } catch (err) {
        if (appointmentMessage) appointmentMessage.textContent = err.message;
      }
    });
  }
}

function animateCounters() {
  const counters = document.querySelectorAll('[data-target]');
  counters.forEach((counter) => {
    const target = Number(counter.getAttribute('data-target'));
    const duration = 1400;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const current = Math.floor(progress * target);
      counter.textContent = target >= 1000 ? `${current.toLocaleString()}+` : `${current}+`;
      if (progress < 1) requestAnimationFrame(step);
      else counter.textContent = target >= 1000 ? `${target.toLocaleString()}+` : `${target}+`;
    }

    requestAnimationFrame(step);
  });
}

function setMinimumAppointmentDate() {
  const dateInput = document.getElementById('aDate');
  if (!dateInput) return;

  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  dateInput.min = new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function initScroll3D() {
  const animatedItems = document.querySelectorAll(
    '[data-scroll-3d], .about-card, .essential-card, .stat-card, .card, .form-panel, .portal-card'
  );

  if (!animatedItems.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animatedItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  animatedItems.forEach((item, index) => {
    item.classList.add('scroll-3d');
    item.style.setProperty('--motion-delay', `${Math.min(index * 35, 280)}ms`);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });

  animatedItems.forEach((item) => observer.observe(item));
}

function initHeroDepth() {
  const depthCard = document.querySelector('[data-depth-card]');
  if (!depthCard || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let ticking = false;

  function updateDepth() {
    const scrollAmount = Math.min(window.scrollY, 420);
    depthCard.style.setProperty('--hero-tilt', `${scrollAmount / 70}deg`);
    depthCard.style.setProperty('--hero-lift', `${scrollAmount / -22}px`);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateDepth);
  }, { passive: true });

  updateDepth();
}

window.addEventListener('DOMContentLoaded', () => {
  loadPublicData();
  bindForms();
  setMinimumAppointmentDate();
  animateCounters();
  initScroll3D();
  initHeroDepth();
});
