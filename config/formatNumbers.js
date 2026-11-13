export function formatCompactCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return '0';

  const tiers = [
    { divisor: 1_000_000_000, suffix: 'B' },
    { divisor: 1_000_000, suffix: 'M' },
    { divisor: 1_000, suffix: 'K' },
  ];
  let tierIndex = tiers.findIndex((tier) => count >= tier.divisor);
  if (tierIndex === -1) return String(Math.floor(count));

  const formatTier = (tier) => {
    const scaled = count / tier.divisor;
    const precision = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    return Number(scaled.toFixed(precision));
  };

  let formatted = formatTier(tiers[tierIndex]);
  if (formatted >= 1000 && tierIndex > 0) {
    tierIndex -= 1;
    formatted = formatTier(tiers[tierIndex]);
  }

  return `${formatted}${tiers[tierIndex].suffix}`;
}
