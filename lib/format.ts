// Small values (e.g. a 0.001 ha loss behind a "high" risk) keep two significant
// digits so they never round down to "0".
export const formatAmount = (n: number) =>
  n !== 0 && Math.abs(n) < 0.1
    ? n.toLocaleString("en-US", { maximumSignificantDigits: 2 })
    : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
