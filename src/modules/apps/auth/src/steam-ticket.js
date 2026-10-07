// Ported from apps/auth/src/steam-ticket.ts; TypeScript types erased; native runtime imports.
const STEAM_SYSTEM_PUBLIC_KEY_SPKI = "MIGdMA0GCSqGSIb3DQEBAQUAA4GLADCBhwKBgQDf7BrWLBBmLBc1OhSwfFkRf53T2Ct64+AVzRkeRuh7h3SiGEYxqQMUeYKO6UWiSRKpI2hzic9pobFhRr3Bvr/WARvYgdTckPv+T1JzZsuVcNfFjrocejN1oWI0Rrtgt4Bo+hOneoo3S57G9F1fOpn5nsQ66WOiu4gZKODnFMBCiQIBEQ==";
let cachedKey = null;
function steamPublicKey() {
  cachedKey ??= crypto.subtle.importKey(
    "spki",
    Uint8Array.from(atob(STEAM_SYSTEM_PUBLIC_KEY_SPKI), (ch) => ch.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
    false,
    ["verify"]
  );
  return cachedKey;
}
function hexToBytes(hex) {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
class Reader {
  constructor(view) {
    this.view = view;
  }
  view;
  pos = 0;
  get offset() {
    return this.pos;
  }
  skip(n) {
    this.pos += n;
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u64() {
    const v = this.view.getBigUint64(this.pos, true);
    this.pos += 8;
    return v;
  }
}
function parseSteamTicket(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const r = new Reader(view);
  const limit = buf.byteLength;
  try {
    const initialLength = r.u32();
    if (initialLength === 20) {
      r.skip(8);
      r.skip(8);
      r.u32();
      if (r.u32() !== 24) return null;
      r.skip(8);
      r.u32();
      r.skip(4);
      r.u32();
      r.u32();
      if (r.u32() + r.offset !== limit) return null;
    } else {
      r.skip(-4);
    }
    const ownershipTicketOffset = r.offset;
    const ownershipTicketLength = r.u32();
    if (ownershipTicketOffset + ownershipTicketLength !== limit && ownershipTicketOffset + ownershipTicketLength + 128 !== limit) {
      return null;
    }
    r.u32();
    const steamId = r.u64().toString();
    const appId = r.u32();
    r.u32();
    r.u32();
    r.u32();
    r.u32();
    const expiresAt = r.u32() * 1e3;
    const licenseCount = r.u16();
    for (let i = 0; i < licenseCount; i++) r.u32();
    const dlcCount = r.u16();
    for (let i = 0; i < dlcCount; i++) {
      r.u32();
      const dlcLicenseCount = r.u16();
      for (let j = 0; j < dlcLicenseCount; j++) r.u32();
    }
    r.u16();
    if (r.offset + 128 !== limit) return null;
    return {
      steamId,
      appId,
      expiresAt,
      signedStart: ownershipTicketOffset,
      signedEnd: ownershipTicketOffset + ownershipTicketLength,
      signature: buf.subarray(r.offset, r.offset + 128)
    };
  } catch {
    return null;
  }
}
async function verifySteamTicketSignature(buf, ticket) {
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await steamPublicKey(),
    ticket.signature,
    buf.subarray(ticket.signedStart, ticket.signedEnd)
  );
}
async function verifySteamTicket(platformAuth, now = Date.now()) {
  let ticketHex;
  try {
    const parsed = JSON.parse(platformAuth);
    if (typeof parsed.Ticket !== "string") return null;
    ticketHex = parsed.Ticket;
  } catch {
    return null;
  }
  const buf = hexToBytes(ticketHex);
  if (!buf) return null;
  const ticket = parseSteamTicket(buf);
  if (!ticket) return null;
  if (ticket.expiresAt !== 0 && ticket.expiresAt < now) return null;
  if (!await verifySteamTicketSignature(buf, ticket)) return null;
  return { steamId: ticket.steamId, appId: ticket.appId };
}
export {
  parseSteamTicket,
  verifySteamTicket,
  verifySteamTicketSignature
};
