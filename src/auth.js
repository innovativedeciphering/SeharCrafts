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

export const RECOVERY_KEY = "sehar-owner-recovery";
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;

// This tab-local marker is created only after PASSWORD_RECOVERY. It never stores
// credentials and is not a substitute for server-side session/owner validation.
export function createRecoveryStore(storage, now = () => Date.now()) {
  let memory = null;
  const fingerprint = async (token) => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    return Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  };
  const clear = () => {
    memory = null;
    try {
      storage.removeItem(RECOVERY_KEY);
    } catch {
      /* Storage may be disabled. */
    }
  };
  return {
    clear,
    async remember(session) {
      if (!session?.user?.id || !session.access_token) {
        clear();
        return;
      }
      const timestamp = now();
      const expiresAt = Math.min(
        timestamp + RECOVERY_WINDOW_MS,
        session.expires_at ? session.expires_at * 1000 : Infinity,
      );
      const record = {
        userId: session.user.id,
        fingerprint: await fingerprint(session.access_token),
        createdAt: timestamp,
        expiresAt,
      };
      memory = record;
      try {
        storage.setItem(RECOVERY_KEY, JSON.stringify(record));
      } catch {
        /* Keep current-page recovery usable. */
      }
    },
    async matches(session) {
      try {
        const record =
          memory || JSON.parse(storage.getItem(RECOVERY_KEY) || "null");
        const timestamp = now();
        if (
          !session?.access_token ||
          !record ||
          record.userId !== session.user?.id ||
          !Number.isFinite(record.expiresAt) ||
          !Number.isFinite(record.createdAt) ||
          record.createdAt > timestamp ||
          record.expiresAt <= timestamp ||
          record.expiresAt - record.createdAt > RECOVERY_WINDOW_MS ||
          record.fingerprint !== (await fingerprint(session.access_token))
        ) {
          clear();
          return false;
        }
        return true;
      } catch {
        clear();
        return false;
      }
    },
  };
}
