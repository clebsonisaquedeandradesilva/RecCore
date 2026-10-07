// Ported from packages/hono-helpers/src/middleware/withNotFound.ts; TypeScript types erased; native runtime imports.
import { httpStatus } from "../../../../../runtime/status.js";
function withNotFound() {
  return async (ctx) => {
    const c = ctx;
    return c.json(notFoundResponse, httpStatus.NotFound);
  };
}
const notFoundResponse = {
  success: false,
  error: { message: "not found" }
};
export {
  notFoundResponse,
  withNotFound
};
