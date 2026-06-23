/* G.Licious Pics — main.js */

// ── HERO SLIDESHOW ──
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.hero-dots .dot');
if (slides.length > 0) {
  let currentSlide = 0;
  let slideInterval;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  if (!prefersReducedMotion) {
    slideInterval = setInterval(nextSlide, 4000);
  }

  dots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      if (slideInterval) clearInterval(slideInterval);
      goToSlide(index);
      if (!prefersReducedMotion) {
        slideInterval = setInterval(nextSlide, 4000);
      }
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
        const parent = dropdownTrigger.closest('.nav-dropdown');
        const isOpen = parent.classList.toggle('open');
        dropdownTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
    });
  }
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
