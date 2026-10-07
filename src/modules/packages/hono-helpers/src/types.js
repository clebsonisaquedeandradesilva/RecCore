// Ported from packages/hono-helpers/src/types.ts; TypeScript types erased; native runtime imports.
import { z } from "../../../../../vendor/zod.js";
const WorkersEnvironment = z.enum(["VITEST", "development", "staging", "production"]);
export {
  WorkersEnvironment
};
