export function passwordError(password, confirmation) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128 ||
    !password.trim()
  )
    return "Choose a password between 8 and 128 characters.";
  if (password !== confirmation) return "The new passwords do not match.";
  return "";
}
export function authRedirect(base, origin, recovery = false) {
  const url = new URL(base, origin);
  if (recovery) url.searchParams.set("auth", "recovery");
  return url.href;
}
