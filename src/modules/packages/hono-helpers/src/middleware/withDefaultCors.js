// Ported from packages/hono-helpers/src/middleware/withDefaultCors.ts; TypeScript types erased; native runtime imports.
import { cors } from "../../../../../runtime/router.js";
function withDefaultCors() {
  return cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allowHeaders: ["Content-Type", "Authorization"]
  });
}
export {
  withDefaultCors
};
