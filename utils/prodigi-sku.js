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

  if (prefix === 'GLOBAL-PAP') {
    if (formattedSize === '8X24') {
      return 'P-PHO-LPP-203X610';
    }
    if (formattedSize === '12X36') {
      return 'P-PHO-LPP-305X914';
    }
  }

  return `${prefix}-${formattedSize}`;
}

// Inverse of the prefix table above. Kept adjacent to getProdigiSku so the two
// cannot drift apart.
const PREFIX_TO_MATERIAL = {
  'GLOBAL-PAP': 'Lustre Paper',
  'GLOBAL-MET': 'Chromaluxe Metal',
  'GLOBAL-FAP': 'Matte Fine Art Paper'
};

// The two sizes that map to bespoke SKUs rather than the GLOBAL-* pattern.
const SPECIAL_SKUS = {
  'P-PHO-LPP-203X610': { material: 'Lustre Paper', size: '8x24' },
  'P-PHO-LPP-305X914': { material: 'Lustre Paper', size: '12x36' }
};

/**
 * Best-effort inverse of getProdigiSku: turn a SKU back into a human
 * description for customer-facing copy, e.g. "12x18 / Lustre Paper".
 *
 * Returns { material, size } with nulls when the SKU is not one of ours —
 * callers must treat this as optional decoration, never as order data.
 */
function describeProdigiSku(sku) {
  if (!sku || typeof sku !== 'string') return { material: null, size: null };

  const upper = sku.toUpperCase();
  if (SPECIAL_SKUS[upper]) return { ...SPECIAL_SKUS[upper] };

  const match = upper.match(/^(GLOBAL-(?:PAP|MET|FAP))-(\d+X\d+)$/);
  if (!match) return { material: null, size: null };

  return {
    material: PREFIX_TO_MATERIAL[match[1]] || null,
    size: match[2].toLowerCase()
  };
}

module.exports = { getProdigiSku, describeProdigiSku };
