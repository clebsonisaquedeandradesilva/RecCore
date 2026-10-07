// Ported from packages/hono-helpers/src/helpers/errors.ts; TypeScript types erased; native runtime imports.
import { HTTPException } from "../../../../../runtime/router.js";
function newHTTPException(status, message) {
  return new HTTPException(status, { message });
}
export {
  newHTTPException
};
