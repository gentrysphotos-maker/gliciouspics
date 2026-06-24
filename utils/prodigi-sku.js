/**
 * Map a (material, size) pair to a Prodigi SKU prefix and formatted size.
 *
 * Prefix rules:
 *   - "Chromaluxe" / "Metal"        -> GLOBAL-MET  (aluminum metal print)
 *   - "Matte"                       -> GLOBAL-FAP  (fine art paper)
 *   - "Lustre" / "Paper" (default)  -> GLOBAL-PAP  (photo paper)
 *
 * Size formatting:
 *   - Uppercased, whitespace removed (so "12x18" -> "12X18", "16 x 24" -> "16X24")
 *   - Defaults to "12X18" when no size is provided
 *
 * This module is intentionally pure (no I/O, no env reads) so it can be
 * unit-tested without any external dependencies.
 */

function getProdigiSku(material, size) {
  let prefix = 'GLOBAL-PAP';

  if (material) {
    const mat = String(material).toLowerCase();
    if (mat.includes('metal') || mat.includes('chromaluxe')) {
      prefix = 'GLOBAL-MET';
    } else if (mat.includes('matte')) {
      prefix = 'GLOBAL-FAP';
    } else if (mat.includes('lustre') || mat.includes('paper')) {
      prefix = 'GLOBAL-PAP';
    }
  }

  const formattedSize = String(size || '12x18').toUpperCase().replace(/\s+/g, '');
  return `${prefix}-${formattedSize}`;
}

module.exports = { getProdigiSku };
