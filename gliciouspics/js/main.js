/* G.Licious Pics — main.js */

// ── HERO SLIDESHOW ──
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.hero-dots .dot');
if (slides.length > 0) {
  let currentSlide = 0;
  let slideInterval;

  function goToSlide(index) {
    slides[currentSlide].classList.remove('active');
    dots[currentSlide].classList.remove('active');
    currentSlide = index;
    slides[currentSlide].classList.add('active');
    dots[currentSlide].classList.add('active');
  }

  function nextSlide() {
    goToSlide((currentSlide + 1) % slides.length);
  }

  slideInterval = setInterval(nextSlide, 4000);

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      clearInterval(slideInterval);
      goToSlide(index);
      slideInterval = setInterval(nextSlide, 4000);
    });
  });
}

// ── NAV SCROLL EFFECT ──
const header = document.getElementById('site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });
}

// ── MOBILE NAV TOGGLE ──
const navToggle = document.getElementById('nav-toggle');
const siteNav   = document.getElementById('site-nav');
if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    siteNav.classList.toggle('open');
  });
  // close on link click
  siteNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('open');
      siteNav.classList.remove('open');
    });
  });
  // mobile dropdown
  const dropdownTrigger = siteNav.querySelector('.dropdown-trigger');
  if (dropdownTrigger) {
    dropdownTrigger.addEventListener('click', (e) => {
      if (window.innerWidth <= 768) {
        e.preventDefault();
        dropdownTrigger.closest('.nav-dropdown').classList.toggle('open');
      }
    });
  }
}

// ── CONTACT FORM ──
const form    = document.getElementById('contact-form');
const success = document.getElementById('form-success');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Placeholder — will connect to backend/Formspree/Netlify Forms when deployed
    if (success) {
      success.classList.add('show');
      form.reset();
      setTimeout(() => success.classList.remove('show'), 6000);
    }
  });
}

// ── SCROLL ANIMATIONS ──
const fadeEls = document.querySelectorAll('.fade-up');
if (fadeEls.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  fadeEls.forEach(el => observer.observe(el));
}

// ── LIGHTBOX ──
function initLightbox() {
  const items = document.querySelectorAll('.gallery-masonry-item');
  if (!items.length) return;

  // create lightbox element
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<img src="" alt="Full size photo" /><button class="lightbox-close">Close ✕</button>';
  document.body.appendChild(lb);

  const lbImg   = lb.querySelector('img');
  const lbClose = lb.querySelector('.lightbox-close');

  items.forEach(item => {
    if (item.tagName === 'A') return;
    item.addEventListener('click', () => {
      const src = item.querySelector('img').src
        .replace('/w_415,', '/w_1200,')
        .replace('/w_416,', '/w_1200,')
        .replace('/w_480,', '/w_1200,');
      lbImg.src = src;
      lb.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  });

  lbClose.addEventListener('click', closeLightbox);
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    lbImg.src = '';
  }
}
initLightbox();
