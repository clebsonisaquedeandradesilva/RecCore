// Ported from apps/img/src/openapi.ts; TypeScript types erased; native runtime imports.
import { resolver } from "../../../../runtime/openapi.js";
import { z } from "../../../../../vendor/zod.js";
function json(schema, description) {
  return { description, content: { "application/json": { schema: resolver(schema) } } };
}
function imageBytes(description) {
  const schema = { type: "string", format: "binary" };
  return {
    description,
    content: {
      "image/jpeg": { schema },
      "image/png": { schema }
    }
  };
}
const ServiceStatus = z.object({
  service: z.literal("img"),
  status: z.literal("ok")
});
export {
  ServiceStatus,
  imageBytes,
  json
};
