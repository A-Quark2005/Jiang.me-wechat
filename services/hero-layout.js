/**
 * Build safe-area-aware layout metrics for blue hero pages.
 *
 * @returns {{
 *   heroSafeTopPx: number,
 *   activationSafeTopPx: number
 * }} Pixel metrics for hero layout.
 */
function buildHeroLayoutData() {
  return {
    heroSafeTopPx: 0,
    activationSafeTopPx: 0,
  };
}

module.exports = {
  buildHeroLayoutData,
};
