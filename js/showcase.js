/* G.Licious Pics — Customer Wall Showcase & Reviews JavaScript */

(function () {
  'use strict';

  let showcaseData = [];
  let currentFilteredList = [];
  let currentModalIndex = 0;
  let activeFilter = 'all';

  const gridEl = document.getElementById('showcase-grid');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const modalEl = document.getElementById('showcase-modal');
  const modalCloseBtn = document.getElementById('showcase-modal-close');
  const modalPrevBtn = document.getElementById('showcase-modal-prev');
  const modalNextBtn = document.getElementById('showcase-modal-next');
  const modalImg = document.getElementById('modal-img');
  const modalQuote = document.getElementById('modal-quote');
  const modalReviewFull = document.getElementById('modal-review-full');
  const modalCustomerName = document.getElementById('modal-customer-name');
  const modalCustomerLoc = document.getElementById('modal-customer-loc');
  const modalPrintTitle = document.getElementById('modal-print-title');
  const modalMedium = document.getElementById('modal-medium');
  const modalSize = document.getElementById('modal-size');
  const modalRoomType = document.getElementById('modal-room-type');
  const modalShopBtn = document.getElementById('modal-shop-btn');

  // Initialize Showcase
  async function initShowcase() {
    try {
      const response = await fetch('../showcase.json');
      if (response.ok) {
        showcaseData = await response.json();
      } else {
        const rootResponse = await fetch('showcase.json');
        if (rootResponse.ok) {
          showcaseData = await rootResponse.json();
        }
      }
    } catch (e) {
      console.warn('Failed to fetch showcase.json, using fallback data', e);
    }

    if (!showcaseData || showcaseData.length === 0) {
      showcaseData = getEmbeddedFallback();
    }

    currentFilteredList = [...showcaseData];
    renderCards(currentFilteredList);
    setupFilters();
    setupModalEvents();
  }

  // Render cards to the grid
  function renderCards(items) {
    if (!gridEl) return;

    if (items.length === 0) {
      gridEl.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--silver);">
          <p>No photos found in this category.</p>
        </div>
      `;
      return;
    }

    gridEl.innerHTML = items
      .map((item, index) => {
        const mediumBadge = item.medium.includes('Metal') ? 'Chromaluxe Metal' : 'Framed Lustre';
        return `
        <article class="showcase-card fade-up" data-id="${escapeHtml(item.id)}">
          <div class="showcase-card-img-wrap" data-index="${index}" role="button" tabindex="0" aria-label="View photo of ${escapeHtml(item.printTitle)} in ${escapeHtml(item.roomLabel)}">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.printTitle)} on wall in ${escapeHtml(item.roomLabel)}" loading="lazy" />
            <span class="showcase-card-badge">${escapeHtml(item.roomLabel)} · ${escapeHtml(item.size)}</span>
            <div class="showcase-card-zoom-hint">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
              <span>View Wall Photo</span>
            </div>
          </div>
          <div class="showcase-card-body">
            <div class="showcase-stars" aria-label="5 out of 5 stars">★★★★★</div>
            <p class="showcase-quote">"${escapeHtml(item.quote)}"</p>
            <div class="showcase-meta">
              <div class="showcase-collector">
                <strong>${escapeHtml(item.customerName)}</strong>
                <span class="showcase-verified">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Verified Buyer
                </span>
              </div>
              <span class="showcase-location">${escapeHtml(item.location)}</span>
              <div class="showcase-print-tag">
                <span>Print:</span>
                <strong>${escapeHtml(item.printTitle)}</strong>
                <span>(${escapeHtml(mediumBadge)})</span>
              </div>
            </div>
            <div class="showcase-card-actions">
              <a href="product.html?id=${encodeURIComponent(item.productId)}" class="showcase-buy-link">
                Shop Print →
              </a>
              <button class="showcase-expand-btn" data-index="${index}" type="button">
                View Details
              </button>
            </div>
          </div>
        </article>
      `;
      })
      .join('');

    // Attach click handlers to cards
    gridEl.querySelectorAll('.showcase-card-img-wrap, .showcase-expand-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        if (!isNaN(idx) && currentFilteredList[idx]) {
          openModal(idx);
        }
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          if (!isNaN(idx) && currentFilteredList[idx]) {
            openModal(idx);
          }
        }
      });
    });

    // Animate newly added cards
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08 }
      );
      gridEl.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));
    }
  }

  // Setup category filter buttons
  function setupFilters() {
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        activeFilter = filter;

        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (filter === 'all') {
          currentFilteredList = [...showcaseData];
        } else if (filter === 'metal') {
          currentFilteredList = showcaseData.filter((x) => x.medium.toLowerCase().includes('metal'));
        } else if (filter === 'framed') {
          currentFilteredList = showcaseData.filter(
            (x) => x.medium.toLowerCase().includes('framed') || x.medium.toLowerCase().includes('lustre')
          );
        } else {
          // By roomType (e.g. living-room, bedroom, office)
          currentFilteredList = showcaseData.filter((x) => x.roomType === filter);
        }

        renderCards(currentFilteredList);
      });
    });
  }

  // Setup modal behavior & controls
  function setupModalEvents() {
    if (!modalEl) return;

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        closeModal();
      }
    });

    if (modalPrevBtn) {
      modalPrevBtn.addEventListener('click', () => {
        navigateModal(-1);
      });
    }

    if (modalNextBtn) {
      modalNextBtn.addEventListener('click', () => {
        navigateModal(1);
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!modalEl.classList.contains('active')) return;
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'ArrowLeft') {
        navigateModal(-1);
      } else if (e.key === 'ArrowRight') {
        navigateModal(1);
      }
    });
  }

  function openModal(index) {
    if (!currentFilteredList[index]) return;
    currentModalIndex = index;
    const item = currentFilteredList[index];

    if (modalImg) {
      modalImg.src = item.imageUrl;
      modalImg.alt = `${item.printTitle} on wall in ${item.roomLabel}`;
    }
    if (modalQuote) modalQuote.textContent = `"${item.quote}"`;
    if (modalReviewFull) modalReviewFull.textContent = item.fullReview || item.quote;
    if (modalCustomerName) modalCustomerName.textContent = item.customerName;
    if (modalCustomerLoc) modalCustomerLoc.textContent = item.location;
    if (modalPrintTitle) modalPrintTitle.textContent = item.printTitle;
    if (modalMedium) modalMedium.textContent = item.medium;
    if (modalSize) modalSize.textContent = item.size;
    if (modalRoomType) modalRoomType.textContent = item.roomLabel;

    if (modalShopBtn) {
      modalShopBtn.href = `product.html?id=${encodeURIComponent(item.productId)}`;
      modalShopBtn.textContent = `Shop "${item.printTitle}" Print →`;
    }

    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  function navigateModal(direction) {
    if (currentFilteredList.length === 0) return;
    let nextIndex = currentModalIndex + direction;
    if (nextIndex < 0) {
      nextIndex = currentFilteredList.length - 1;
    } else if (nextIndex >= currentFilteredList.length) {
      nextIndex = 0;
    }
    openModal(nextIndex);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getEmbeddedFallback() {
    return [
      {
        id: 'napali-living-room-metal',
        productId: 'hawaii-nature-valley-ridge-line-print',
        printTitle: 'Nā Pali Ridges',
        medium: 'Chromaluxe Metal',
        size: '30x45',
        roomType: 'living-room',
        roomLabel: 'Living Room',
        customerName: 'Elena & Ryan M.',
        location: 'Honolulu, HI',
        rating: 5,
        quote: 'The depth and vibrant greens on the metal print completely transformed our main room. Everyone who visits stops to admire it.',
        fullReview: 'We wanted a statement piece that brought the feeling of the islands into our home. The metal finish catches the light in the most incredible way. Quality and packaging were top tier.',
        imageUrl: 'https://res.cloudinary.com/dbqfibadw/image/upload/v1779769098/gliciouspics/landscapes/room%20mockups/living-room-mockup-print-06.jpg'
      },
      {
        id: 'makapuu-milkyway-suite',
        productId: 'oahu-makapuu-beach-night-sky-milky-way-photography',
        printTitle: 'Milky Makapuʻu',
        medium: 'Chromaluxe Metal',
        size: '24x36',
        roomType: 'bedroom',
        roomLabel: 'Primary Bedroom',
        customerName: 'Marcus T.',
        location: 'San Francisco, CA',
        rating: 5,
        quote: 'The night sky clarity is unreal. It feels like having an open window directly into the Pacific stars.',
        fullReview: 'I was skeptical about how well night sky photography would print, but Gentry\'s work exceeded every expectation. The blacks are deep and rich, and the stars glisten against the metal surface.',
        imageUrl: 'https://res.cloudinary.com/dbqfibadw/image/upload/v1779769104/gliciouspics/nightscapes/room%20mockups/living-room-mockup-print-104.jpg'
      },
      {
        id: 'hidden-honu-office',
        productId: 'hidden-honu-hawaii-green-sea-turtle-underwater',
        printTitle: 'Hidden Honu',
        medium: 'Framed Lustre Print',
        size: '20x30',
        roomType: 'office',
        roomLabel: 'Home Office',
        customerName: 'Dr. Sarah K.',
        location: 'San Diego, CA',
        rating: 5,
        quote: 'Brings immediate calm and serenity to my workspace. The colors of the water and reef are stunning.',
        fullReview: 'As a marine enthusiast, this turtle print brings so much peace to my daily workspace. The black gallery frame is sleek and modern, and the print paper texture holds every fine detail of the coral and honu shell.',
        imageUrl: 'https://res.cloudinary.com/dbqfibadw/image/upload/v1779769468/gliciouspics/underwater/room%20mockups/living-room-mockup-print-76.jpg'
      }
    ];
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShowcase);
  } else {
    initShowcase();
  }
})();
