/** Remembers the plots chosen on Plots, so coming back from PayPal or Duitku keeps them. */
export const SELECTION_KEY = "locanix.checkout.selection";

/** Link back to checkout with the remembered selection (browser only). */
export function checkoutHref() {
  try {
    const saved = sessionStorage.getItem(SELECTION_KEY);
    return saved ? `/checkout?plots=${saved}` : "/checkout";
  } catch {
    return "/checkout";
  }
}
