/* G.licious Pics — Microsoft Clarity
 *
 * Paste the project ID from https://clarity.microsoft.com
 * (Settings → Setup → the string in the tracking snippet after /tag/).
 */
var CLARITY_PROJECT_ID = 'y2wbmy76t6';

(function () {
  if (!CLARITY_PROJECT_ID) return;

  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_PROJECT_ID);

  window.gliciousTrack = function (name, details) {
    if (typeof window.clarity !== 'function') return;
    window.clarity('event', name);
    if (!details) return;
    Object.keys(details).forEach(function (key) {
      var value = details[key];
      if (value != null && value !== '') {
        window.clarity('set', key, String(value));
      }
    });
  };

  function pageTypeFromPath(pathname) {
    var p = pathname.replace(/\/+$/, '') || '/';
    if (p === '/' || /\/index\.html$/.test(p)) return 'home';
    if (/\/cart\.html$/.test(p)) return 'cart';
    if (/\/product\.html$/.test(p)) return 'product';
    if (/\/(faq|privacy|terms|returns)\.html$/.test(p)) return 'legal';
    if (/\/(underwater|landscapes|flora-fauna|nightscapes|aerial|travel|panoramas)\.html$/.test(p)) return 'gallery';
    if (/404\.html$/.test(p)) return 'not_found';
    return 'other';
  }

  var path = window.location.pathname;
  window.clarity('set', 'page_type', pageTypeFromPath(path));

  var galleryMatch = path.match(/\/(underwater|landscapes|flora-fauna|nightscapes|aerial|travel|panoramas)\.html$/);
  if (galleryMatch) {
    window.clarity('set', 'gallery', galleryMatch[1]);
  }

  var params = new URLSearchParams(window.location.search);
  var productId = params.get('id');
  if (productId) {
    window.clarity('set', 'product_id', productId);
  }

  var checkout = params.get('checkout');
  if (checkout === 'success') {
    window.clarity('event', 'purchase');
  } else if (checkout === 'cancelled') {
    window.clarity('event', 'checkout_cancelled');
  }
})();
