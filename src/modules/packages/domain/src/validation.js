// Ported from packages/domain/src/validation.ts; TypeScript types erased; native runtime imports.
import isEmail from "../../../../../vendor/isemail.js";
const MAX_USERNAME_LENGTH = 50;
const MAX_DISPLAY_NAME_LENGTH = 15;
const MAX_ROOM_NAME_LENGTH = 32;
const MAX_CLUB_NAME_LENGTH = 40;
const MAX_CLUB_DESCRIPTION_LENGTH = 512;
const MAX_EVENT_NAME_LENGTH = 64;
const MAX_EVENT_DESCRIPTION_LENGTH = 512;
const MAX_EVENT_DURATION_MS = 24 * 60 * 60 * 1e3;
const MIN_INVENTION_NAME_LENGTH = 3;
const MAX_INVENTION_NAME_LENGTH = 24;
const MAX_INVENTION_DESCRIPTION_LENGTH = 512;
const MAX_INVENTION_LONG_DESCRIPTION_LENGTH = 4096;
const MAX_INVENTION_TAG_LENGTH = 15;
const glyphLength = (value) => Array.from(value).length;
const MAX_BIO_LENGTH = 255;
const NAME_PATTERN = /^[A-Za-z0-9]+$/;
function nameRejection(value, label, max) {
  if (value.length > max) {
    return `Your ${label} can be at most ${max} characters.`;
  }
  if (!NAME_PATTERN.test(value)) {
    return `Your ${label} can only contain letters and numbers.`;
  }
  return null;
}
const ROOM_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
function roomNameRejection(value, label) {
  if (value.length > MAX_ROOM_NAME_LENGTH) {
    return `Your ${label} can be at most ${MAX_ROOM_NAME_LENGTH} characters.`;
  }
  if (!ROOM_NAME_PATTERN.test(value)) {
    return `Your ${label} can only contain letters, numbers and underscores.`;
  }
  return null;
}
const INVENTION_NAME_PATTERN = /^[A-Za-z0-9 :-]+$/;
const INVENTION_TAG_PATTERN = /^[a-z]+$/;
function inventionNameRejection(value) {
  if (glyphLength(value) < MIN_INVENTION_NAME_LENGTH) {
    return `Invention names must be at least ${MIN_INVENTION_NAME_LENGTH} characters.`;
  }
  if (glyphLength(value) > MAX_INVENTION_NAME_LENGTH) {
    return `Invention names can be at most ${MAX_INVENTION_NAME_LENGTH} characters.`;
  }
  if (!INVENTION_NAME_PATTERN.test(value)) {
    return "Invention names can only contain letters, numbers, spaces, dashes and colons.";
  }
  return null;
}
function inventionDescriptionRejection(value) {
  if (glyphLength(value) > MAX_INVENTION_DESCRIPTION_LENGTH) {
    return `Invention descriptions can be at most ${MAX_INVENTION_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}
function inventionLongDescriptionRejection(value) {
  if (glyphLength(value) > MAX_INVENTION_LONG_DESCRIPTION_LENGTH) {
    return `Invention long descriptions can be at most ${MAX_INVENTION_LONG_DESCRIPTION_LENGTH} characters.`;
  }
  return null;
}
function inventionTagRejection(value) {
  if (value.length > MAX_INVENTION_TAG_LENGTH) {
    return `Invention tags can be at most ${MAX_INVENTION_TAG_LENGTH} characters.`;
  }
  if (!INVENTION_TAG_PATTERN.test(value)) {
    return "Invention tags can only contain letters.";
  }
  return null;
}
function isValidEmail(value) {
  return isEmail.validate(value);
}
function isValidBio(value) {
  return value.length <= MAX_BIO_LENGTH;
}
export {
  MAX_BIO_LENGTH,
  MAX_CLUB_DESCRIPTION_LENGTH,
  MAX_CLUB_NAME_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_DURATION_MS,
  MAX_EVENT_NAME_LENGTH,
  MAX_INVENTION_DESCRIPTION_LENGTH,
  MAX_INVENTION_LONG_DESCRIPTION_LENGTH,
  MAX_INVENTION_NAME_LENGTH,
  MAX_INVENTION_TAG_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_INVENTION_NAME_LENGTH,
  glyphLength,
  inventionDescriptionRejection,
  inventionLongDescriptionRejection,
  inventionNameRejection,
  inventionTagRejection,
  isValidBio,
  isValidEmail,
  nameRejection,
  roomNameRejection
};
