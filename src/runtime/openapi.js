import { z } from '../../vendor/zod.js';
export const resolver=schema=>z.toJSONSchema(schema,{unrepresentable:'any'});
export function describeRoute(description){const fn=async(c,next)=>next();fn.description=description;return fn;}
export function validator(target,schema,hook){return async(c,next)=>{
 let value;try{value=target==='form'?await c.req.parseBody():target==='json'?await c.req.json():target==='query'?c.req.query():c.req.param();}catch{return c.json({success:false,error:'invalid body'},400);}
 const result=await schema.safeParseAsync(value);if(hook){const response=await hook({...result,target},c);if(response)return response;}if(!result.success)return c.json({success:false,error:result.error.issues},400);c.req._valid[target]=result.data;await next();
};}
export const openAPIRouteHandler=(app,options={})=>c=>{
 const paths={};for(const r of app.routes){const meta=r.handlers.find(h=>h.description)?.description||{};if(meta.hide)continue;const path=r.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)(?:\{(?:[^{}]|\{[^{}]*\})*\})?/g,'{$1}');paths[path]||={};paths[path][r.method.toLowerCase()]={...meta,responses:meta.responses||{'200':{description:'Response from original handler'}}};}
 return c.json({openapi:'3.1.0',info:options.documentation?.info||{title:'API',version:'1.0.0'},servers:[{url:(process.env.PUBLIC_BASE_URL||'http://localhost:10000')+(process.env.ROUTING_MODE==='subdomain'?'':'/'+c.env.NAME)}],components:options.documentation?.components||{},paths});
};
