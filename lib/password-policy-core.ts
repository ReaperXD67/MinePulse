const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 64;
const MAX_BCRYPT_BYTES = 72;

const commonPasswords = new Set([
  "123456789012345",
  "admin1234567890",
  "letmein123456789",
  "minecraft123456",
  "password123456",
  "passwordpassword",
  "qwerty123456789",
  "welcome12345678"
]);

export function passwordPolicyError(password: string, identityValues: string[] = []) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > MAX_BCRYPT_BYTES) {
    return `Password must be no more than ${MAX_PASSWORD_LENGTH} characters and 72 UTF-8 bytes.`;
  }

  const normalized = password.toLowerCase();
  if (commonPasswords.has(normalized)) {
    return "Choose a less common password or passphrase.";
  }

  if (identityValues.some((value) => value.length >= 3 && normalized.includes(value.toLowerCase()))) {
    return "Password must not contain your email name or display name.";
  }

  return null;
}

export const passwordPolicy = {
  minLength: MIN_PASSWORD_LENGTH,
  maxLength: MAX_PASSWORD_LENGTH
};
