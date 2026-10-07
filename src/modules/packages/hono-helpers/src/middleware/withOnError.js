// Ported from packages/hono-helpers/src/middleware/withOnError.ts; TypeScript types erased; native runtime imports.
import { HTTPException } from "../../../../../runtime/router.js";
import { httpStatus } from "../../../../../runtime/status.js";
import { logger } from "../helpers/logger.js";
function withOnError() {
  return async (err, ctx) => {
    const c = ctx;
    if (err instanceof HTTPException) {
      const status = err.getResponse().status;
      const body = { success: false, error: { message: err.message } };
      if (status >= 500) {
        logger.error(err);
      } else if (status === httpStatus.Unauthorized) {
        body.error.message = "unauthorized";
      }
      return c.json(body, status);
    }
    logger.error(err);
    return c.json(
      {
        success: false,
        error: { message: "internal server error" }
      },
      500
    );
  };
}
export {
  withOnError
};
