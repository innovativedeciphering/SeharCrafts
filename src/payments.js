export const paymentFields = {
  bank_name: "Bank name",
  bank_account_title: "Bank account title",
  bank_account_number: "Bank account number",
  bank_iban: "Bank IBAN",
  jazzcash_name: "JazzCash account title",
  jazzcash_number: "JazzCash mobile number",
  easypaisa_name: "Easypaisa account title",
  easypaisa_number: "Easypaisa mobile number",
  payment_url: "Verified merchant payment link (https://)",
};
export const paymentLabels = {
  bank: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  online: "Online payment link",
  cod: "Cash on delivery",
};
export function paymentMethods(settings) {
  return Object.keys(paymentLabels).filter((k) =>
    k === "bank"
      ? settings.bank_name &&
        settings.bank_account_title &&
        (settings.bank_account_number || settings.bank_iban)
      : k === "jazzcash"
        ? settings.jazzcash_name && settings.jazzcash_number
        : k === "easypaisa"
          ? settings.easypaisa_name && settings.easypaisa_number
          : k === "online"
            ? /^https:\/\//i.test(settings.payment_url || "")
            : settings.cod_enabled,
  );
}
export function paymentPageUrl(token, baseUrl) {
  if (!/^[a-f0-9-]{36}$/i.test(token)) throw new Error("Invalid payment token");
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "/pay/" + token;
  return url.href;
}
