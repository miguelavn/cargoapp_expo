// Validaciones comunes reutilizables

export const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const NAME_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$/;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,}$/;
export const PHONE_REGEX = /^[0-9]{7,15}$/;

export function isEmail(value = '') {
  return EMAIL_REGEX.test(String(value).trim());
}

export function isName(value = '') {
  const v = String(value).trim();
  return !!v && NAME_REGEX.test(v);
}

export function isUsername(value = '') {
  const v = String(value).trim();
  return !!v && USERNAME_REGEX.test(v);
}

export function isPhone(value = '') {
  const v = String(value).trim();
  return !!v && PHONE_REGEX.test(v);
}

// Password fuerte: min 8, mayúscula, número, letra
export function isStrongPassword(pw = '') {
  if (!pw || pw.length < 8) return false;
  if (!/[A-Z]/.test(pw)) return false;
  if (!/[A-Za-z]/.test(pw)) return false;
  if (!/\d/.test(pw)) return false;
  return true;
}

export function passwordsMatch(a = '', b = '') {
  return a.length > 0 && a === b;
}

export function minLength(value = '', min = 6) {
  return String(value).length >= min;
}
