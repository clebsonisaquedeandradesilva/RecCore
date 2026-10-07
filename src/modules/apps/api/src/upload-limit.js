// Ported from apps/api/src/upload-limit.ts; TypeScript types erased; native runtime imports.
import { intVar } from "../../../packages/hono-helpers/src/index.js";
const DEFAULT_MAX_API_UPLOAD_BYTES = 64 * 1024 * 1024;
function maxApiUploadBytes(env) {
  const configured = intVar(env.RECFLARE_MAX_API_UPLOAD_BYTES, DEFAULT_MAX_API_UPLOAD_BYTES);
  return configured > 0 ? configured : DEFAULT_MAX_API_UPLOAD_BYTES;
}
function exceedsApiUploadLimit(file, limit) {
  return file.size > limit;
}
export {
  DEFAULT_MAX_API_UPLOAD_BYTES,
  exceedsApiUploadLimit,
  maxApiUploadBytes
};
