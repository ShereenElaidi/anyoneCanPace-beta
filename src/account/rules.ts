/**
 * Username and display-name rules (design/backend-v1-spec.md §5). Pure: used by
 * the account screens (instant feedback) and by the server (the real check).
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const DISPLAY_NAME_MAX = 40;
/** A username someone gave up can't be taken by anyone else for this long. */
export const USERNAME_HOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** Names no one can take, so no one can pose as the app, the club or the admin. */
const RESERVED = [
  'admin', 'administrator', 'root', 'support', 'help', 'moderator', 'mod', 'staff', 'official', 'system',
  'anyonecanpace', 'anyone-can-pace', 'anyone_can_pace', 'anyonecanrun', 'anyone-can-run', 'acr', 'acp',
  'stooopid', 'stooopids', 'les-stooopids', 'les_stooopids', 'lesstooopids',
  'former-pacer', 'former_pacer', 'formerpacer', 'pacer', 'runner', 'duck', 'null', 'undefined', 'me',
];

/** Lower-cases and trims; usernames compare without case. */
export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();

/** `null` if fine, otherwise a sentence to show. Doesn't check whether it's taken. */
export function usernameProblem(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `Use ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
  }
  if (!/^[a-z]/.test(name)) return 'Start with a letter.';
  if (!/^[a-z0-9_-]+$/.test(name)) return 'Use only lowercase letters, numbers, _ and -.';
  if (RESERVED.includes(name)) return 'That username is reserved.';
  return null;
}

/** Trims and squeezes spaces. */
export const cleanDisplayName = (raw: string) => raw.trim().replace(/\s+/g, ' ');

/** `null` if fine, otherwise a sentence to show. Display names don't have to be unique. */
export function displayNameProblem(raw: string): string | null {
  const name = cleanDisplayName(raw);
  if (name.length === 0) return 'Enter a display name.';
  if (name.length > DISPLAY_NAME_MAX) return `Use at most ${DISPLAY_NAME_MAX} characters.`;
  // Control characters and invisible direction marks could disguise a name.
  if (/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/.test(name)) return 'Remove the hidden characters.';
  return null;
}
