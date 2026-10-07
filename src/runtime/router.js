// Native HTTP routing and Fetch context. No Hono runtime is used.
export class HTTPException extends Error {
 constructor(status, options={}) { super(options.message||'HTTP error'); this.status=status;this.response=options.res; }
 getResponse(){return this.response||new Response(this.message,{status:this.status});}
}
function compile(path){
 const names=[];const parts=path.split('/').map(p=>{if(p==='*')return '.*';if(p.startsWith(':')){const m=/^:([^{}?]+)(?:\{(.+)\})?(\?)?$/.exec(p);if(!m)throw Error('Invalid route parameter: '+p);names.push(m[1]);return '('+(m[2]||'[^/]+')+')'+(m[3]?'?':'');}return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');});
 return {re:new RegExp('^'+parts.join('/').replace(/\/$/,'')+'/?$'),names};
}
export class NativeRouter {
 constructor(){this.routes=[];this.middleware=[];this.fetch=this.fetch.bind(this);}
 use(path,...handlers){if(typeof path==='function'){handlers.unshift(path);path='*';}this.middleware.push({path,...compile(path),handlers});return this;}
 onError(fn){this.errorHandler=fn;return this;}
 notFound(fn){this.notFoundHandler=fn;return this;}
 on(method,path,...handlers){for(const m of [].concat(method))for(const p of [].concat(path))this.routes.push({method:m.toUpperCase(),path:p,...compile(p),handlers});return this;}
 route(prefix,app){for(const r of app.routes){const path=(prefix==='/'?'':prefix)+r.path;this.on(r.method,path,...r.handlers);}for(const mw of app.middleware)this.use((prefix==='/'?'':prefix)+mw.path,...mw.handlers);return this;}
 get(p,...h){return this.on('GET',p,...h);} post(p,...h){return this.on('POST',p,...h);} put(p,...h){return this.on('PUT',p,...h);} delete(p,...h){return this.on('DELETE',p,...h);} patch(p,...h){return this.on('PATCH',p,...h);} options(p,...h){return this.on('OPTIONS',p,...h);} head(p,...h){return this.on('HEAD',p,...h);} all(p,...h){return this.on('ALL',p,...h);}
 async fetch(raw,env={},executionCtx={waitUntil:p=>Promise.resolve(p).catch(console.error)}){
  const url=new URL(raw.url);const params={};const valid={};const vars=new Map();let parsed;
  const route=this.routes.find(r=>(r.method===raw.method||r.method==='ALL'||(raw.method==='HEAD'&&r.method==='GET'))&&r.re.test(url.pathname));
  if(route){const values=route.re.exec(url.pathname);route.names.forEach((n,i)=>{params[n]=decodeURIComponent(values[i+1]);});}
  const headers=new Headers();let status=200;
  const req={raw,url:raw.url,path:url.pathname,method:raw.method,routePath:route?.path,
   param:n=>n?params[n]:params,query:n=>n?(url.searchParams.get(n)??undefined):Object.fromEntries(url.searchParams),queries:n=>n?url.searchParams.getAll(n):Object.fromEntries([...new Set(url.searchParams.keys())].map(k=>[k,url.searchParams.getAll(k)])),
   header:n=>n?(raw.headers.get(n)??undefined):Object.fromEntries(raw.headers),json:()=>raw.json(),text:()=>raw.text(),formData:()=>raw.formData(),
   parseBody:async(options={})=>{if(parsed)return parsed;const type=raw.headers.get('content-type')||'';if(type.includes('multipart/form-data')||type.includes('application/x-www-form-urlencoded')){const form=await raw.formData();parsed={};for(const [k,v]of form){if(options.all||k.endsWith('[]')){if(k in parsed)parsed[k]=[].concat(parsed[k],v);else parsed[k]=v;}else parsed[k]=v;}}else parsed={};return parsed;},valid:t=>valid[t],_valid:valid};
  const make=(body,s=status,h)=>{const hs=new Headers(headers);if(h)for(const [k,v] of new Headers(h))hs.set(k,v);return new Response(body,{status:s,headers:hs});};
  const c={req,env,executionCtx,res:undefined,error:undefined,
   json:(v,s,h)=>make(JSON.stringify(v),s,{...Object.fromEntries(new Headers(h)), 'content-type':'application/json; charset=utf-8'}),
   text:(v,s,h)=>make(v,s,{'content-type':'text/plain; charset=utf-8',...h}),html:(v,s,h)=>make(v,s,{'content-type':'text/html; charset=utf-8',...h}),body:make,
   status:s=>{status=s;},header:(k,v)=>{headers.set(k,v);if(c.res)c.res.headers.set(k,v);},set:(k,v)=>vars.set(k,v),get:k=>vars.get(k),
   newResponse:(b,s,h)=>s&&typeof s.status==='number'?new Response(b,{status:s.status,headers:s.headers}):make(b,s,h),
   redirect:(u,s=302)=>make(null,s,{location:u}),notFound:()=>this.notFoundHandler?this.notFoundHandler(c):make('Not Found',404)};
  const chain=this.middleware.filter(m=>m.path==='*'||m.re.test(url.pathname)).flatMap(m=>m.handlers).concat(route?route.handlers:[c=>c.notFound()]);
  const dispatch=async i=>{const fn=chain[i];if(!fn)return;const out=await fn(c,()=>dispatch(i+1));if(out&&typeof out.status==='number'&&out.headers&&typeof out.headers.get==='function')c.res=out;};
  try{await dispatch(0);if(!c.res)c.res=make(null,204);for(const [k,v]of headers)c.res.headers.set(k,v);return c.res;}catch(e){c.error=e;if(this.errorHandler)return this.errorHandler(e,c);console.error(e);return make('Internal Server Error',500);}
 }
}
export function cors(){return async(c,next)=>{c.header('access-control-allow-origin','*');c.header('access-control-allow-headers','authorization,content-type');c.header('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');if(c.req.method==='OPTIONS')return c.body(null,204);await next();};}

export { NativeRouter as Hono };
