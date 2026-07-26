const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

export function cleanEmailInput(value: string): string {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").replace(/\s/g, "").slice(0, 254);
}

export function cleanPasswordInput(value: string): string {
  return value.replace(UNSAFE_CONTROL_CHARACTERS, "").replace(/^\s+/, "").slice(0, 256);
}
