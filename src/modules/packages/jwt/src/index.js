// Ported from packages/jwt/src/index.ts; TypeScript types erased; native runtime imports.
import {
  validateAndGetAccountId,
  validateAndGetPlus,
  validateAndGetRoles,
  validateAndGetVersion,
  generateToken,
  generatePhotonAuthToken,
  TOKEN_TTL_SECONDS
} from "./jwt.js";
export {
  TOKEN_TTL_SECONDS,
  generatePhotonAuthToken,
  generateToken,
  validateAndGetAccountId,
  validateAndGetPlus,
  validateAndGetRoles,
  validateAndGetVersion
};
