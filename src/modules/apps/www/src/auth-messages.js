// Ported from apps/www/src/auth-messages.ts; TypeScript types erased; native runtime imports.
const AUTH_MESSAGES = {
  "too many accounts created from this network": "Too many accounts have already been created from your network. Try again later, or from a different connection.",
  "account limit reached for this platform account": "This platform account has already created as many accounts as it is allowed.",
  "invalid account_id or password": "That username or password is incorrect.",
  "account_id or username is required": "Username and password are required.",
  "invalid or missing platform_auth": "Your platform sign-in could not be verified.",
  "unsupported platform; only Steam and Meta can be verified": "That platform cannot be verified \u2014 only Steam and Meta are supported.",
  "no linked account for this platform identity": "No account is linked to this platform sign-in yet. Sign in with your password once to link it.",
  "refresh_token is invalid or expired": "Your session has expired. Please sign in again.",
  // An account that shares a device or network with a BANNED one. Phrased for BOTH the
  // person evading a ban and the housemate of one — the IP arm cannot tell them apart —
  // and for both forms, since signup and sign-in send the same description. A directly
  // banned account is not refused a sign-in at all (auth issues it a token so the game
  // client can show the block screen), which is why there is no "banned" entry here.
  "this device or network is blocked": "This device or network is blocked. If you think that is a mistake, contact the server operator."
};
const GENERIC_MESSAGES = {
  signup: {
    rejected: "Your account could not be created. Please check your details and try again.",
    broken: "Accounts cannot be created right now. This is a problem on our end \u2014 please try again later."
  },
  login: {
    rejected: "You could not be signed in. Please check your details and try again.",
    broken: "Sign-in is unavailable right now. This is a problem on our end \u2014 please try again later."
  }
};
const authUnreachable = (action) => GENERIC_MESSAGES[action].broken;
function authFailure(action, status, code, description) {
  const broken = status >= 500 || code === "server_error";
  const generic = GENERIC_MESSAGES[action];
  return {
    message: !broken && AUTH_MESSAGES[description] || (broken ? generic.broken : generic.rejected),
    status: broken ? 502 : 400,
    upstream: description ? `${code || "unknown"}: ${description}` : code || `HTTP ${status}`
  };
}
export {
  authFailure,
  authUnreachable
};
