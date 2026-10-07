// Ported from packages/hono-helpers/src/middleware/withCache.ts; TypeScript types erased; native runtime imports.
import { httpStatus } from "../../../../../runtime/status.js";
function withCache(ttl) {
  return async (ctx, next) => {
    const c = ctx;
    const cache = await caches.open("default");
    const reqMatcher = new Request(c.req.url, { method: c.req.method });
    const cachedRes = await cache.match(reqMatcher);
    if (cachedRes) {
      return c.newResponse(cachedRes.body, cachedRes);
    }
    await next();
    if (c.res.status === httpStatus.OK) {
      const clonedRes = c.res.clone();
      clonedRes.headers.set("Cloudflare-CDN-Cache-Control", `max-age=${ttl}`);
      c.executionCtx.waitUntil(cache.put(reqMatcher, clonedRes));
    }
  };
}
function withCacheDefault(ttl) {
  return async (ctx, next) => {
    const c = ctx;
    const cache = await caches.open("default");
    const cachedRes = await cache.match(c.req.raw);
    if (cachedRes) {
      return c.newResponse(cachedRes.body, cachedRes);
    }
    await next();
    if (c.res.status === httpStatus.OK) {
      const clonedRes = c.res.clone();
      clonedRes.headers.set("Cloudflare-CDN-Cache-Control", `max-age=${ttl}`);
      c.executionCtx.waitUntil(cache.put(c.req.raw, clonedRes));
    }
  };
}
function withCacheByStatus(options) {
  return async (ctx, next) => {
    const c = ctx;
    const cache = await caches.open("default");
    const reqMatcher = options.force ? new Request(c.req.url, { method: c.req.method }) : c.req.raw;
    const cachedRes = await cache.match(reqMatcher);
    if (cachedRes) {
      return c.newResponse(cachedRes.body, cachedRes);
    }
    await next();
    const opts = options.rules.find((o) => o.status === c.res.status);
    if (opts) {
      const clonedRes = c.res.clone();
      clonedRes.headers.set("Cloudflare-CDN-Cache-Control", `max-age=${opts.ttl}`);
      c.executionCtx.waitUntil(cache.put(reqMatcher, clonedRes));
    }
  };
}
export {
  withCache,
  withCacheByStatus,
  withCacheDefault
};
