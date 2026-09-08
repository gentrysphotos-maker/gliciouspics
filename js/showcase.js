/* G.licious Pics — Customer Wall Showcase & Submission JavaScript */

(function () {
  'use strict';

  function initShowcase() {
    const submitModalEl = document.getElementById('submit-modal');
    const openSubmitModalBtn = document.getElementById('open-submit-modal-btn');
    const openSubmitModalBtn2 = document.getElementById('open-submit-modal-btn-2');
    const closeSubmitModalBtn = document.getElementById('submit-modal-close');
    const copyEmailBtn = document.getElementById('btn-copy-email');

    function openModal() {
      if (submitModalEl) {
        submitModalEl.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeModal() {
      if (submitModalEl) {
        submitModalEl.classList.remove('active');
        document.body.style.overflow = '';
      }
    }

    if (openSubmitModalBtn) {
      openSubmitModalBtn.addEventListener('click', openModal);
    }

    if (openSubmitModalBtn2) {
      openSubmitModalBtn2.addEventListener('click', openModal);
    }

    if (closeSubmitModalBtn) {
      closeSubmitModalBtn.addEventListener('click', closeModal);
    }

    if (submitModalEl) {
      submitModalEl.addEventListener('click', (e) => {
        if (e.target === submitModalEl) {
          closeModal();
        }
      });
    }

    if (copyEmailBtn) {
      copyEmailBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText('gentrysphotos@gmail.com');
          copyEmailBtn.textContent = 'Copied! ✓';
          copyEmailBtn.style.background = 'var(--accent)';
          copyEmailBtn.style.color = 'var(--black)';
          setTimeout(() => {
            copyEmailBtn.textContent = 'Copy Email';
            copyEmailBtn.style.background = '';
            copyEmailBtn.style.color = '';
          }, 2500);
        } catch (err) {
          console.error('Failed to copy email to clipboard', err);
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && submitModalEl && submitModalEl.classList.contains('active')) {
        closeModal();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShowcase);
  } else {
    initShowcase();
  }
})();
