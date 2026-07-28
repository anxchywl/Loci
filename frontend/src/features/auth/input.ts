const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const EMAIL_ALLOWED_CHARACTERS = /[^a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/g;

export function cleanEmailInput(value: string): string {
  return value
    .replace(UNSAFE_CONTROL_CHARACTERS, "")
    .replace(EMAIL_ALLOWED_CHARACTERS, "")
    .slice(0, 254);
}

export function cleanPasswordInput(value: string): string {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").replace(/^\s+/, "").slice(0, 256);
}
