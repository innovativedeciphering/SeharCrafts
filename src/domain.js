export function priceOf(product) {
  return product.sale_price != null && product.sale_price < product.price
    ? product.sale_price
    : product.price;
}
export function totalOf(cart, products) {
  return cart.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.id);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1)
      throw new Error("Invalid cart");
    return sum + priceOf(product) * item.quantity;
  }, 0);
}
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeImage(url) {
  if (typeof url === "string" && /^\/(?!\/)/.test(url) && !url.includes("\\"))
    return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}
