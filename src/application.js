import path from 'node:path';import {fileURLToPath} from 'node:url';import {readFileSync} from 'node:fs';
import {services} from './registry.js';import {NotificationsHub} from './modules/apps/notify/src/notifications-hub.js';
import {createDatabase,migrate,D1Database} from './runtime/database.js';import {KVNamespace,Bucket,Assets,installCache} from './runtime/storage.js';import {durableContext,installWebSocketGlobals} from './runtime/websocket.js';import {withRequestLog,photonAuth} from './runtime/observability.js';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function createApplication(options={}){
 const dataDir=path.resolve(options.dataDir||process.env.DATA_DIR||path.join(root,'data'));const db=createDatabase(dataDir);const migrationCount=migrate(db,path.join(root,'migrations'));installCache();installWebSocketGlobals();
 const secret=options.jwtSecret||process.env.JWT_SECRET;if(!secret||secret.length<32)throw Error('JWT_SECRET must contain at least 32 characters');
 const hubDb=new D1Database(path.join(dataDir,'notifications.sqlite'));const hubEnv={...process.env,DB:db};const hub=new NotificationsHub(durableContext(hubDb),hubEnv);
 const secretNames=['TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET'];const extraSecrets=Object.fromEntries(secretNames.map(n=>[n,{get:async()=>process.env[n]||''}]));
 const envBase={...process.env,...extraSecrets,DB:db,JWT_SECRET:{get:async()=>secret},META_APP_SECRET:{get:async()=>process.env.META_APP_SECRET||''},IMG_SIGNING_KEY:process.env.IMG_SIGNING_KEY||'',IMG_SIGNING_ENABLED:process.env.IMG_SIGNING_ENABLED==='true',RECFLARE_PLAYER_SETTINGS:new KVNamespace(db,'player-settings'),CDN_ASSETS:new Bucket(path.join(dataDir,'cdn')),IMAGES:new Bucket(path.join(dataDir,'images')),RECFLARE_NOTIFICATIONS_HUB:{getByName:()=>hub,idFromName:n=>n,get:()=>hub},DOMAIN:process.env.DOMAIN||'localhost',ENVIRONMENT:process.env.NODE_ENV||'development',SENTRY_RELEASE:'native-node',STARTING_TOKENS:process.env.STARTING_TOKENS||'0'};
 const ctx={waitUntil:p=>Promise.resolve(p).catch(console.error)};
 const serviceEnv=name=>({...envBase,NAME:name,ASSETS:new Assets(path.join(root,'static',name)),AUTH:{fetch:req=>services.auth.fetch(req,serviceEnv('auth'),ctx)}});
 async function dispatch(request){const u=new URL(request.url);if(u.pathname==='/healthz'){db.sqlite.prepare('SELECT 1').get();return Response.json({status:'ok',services:Object.keys(services).length});}
  let name=u.hostname.split('.')[0];if(!(name in services)){const first=u.pathname.split('/')[1];if(first in services){name=first;u.pathname=u.pathname.slice(first.length+1)||'/';request=new Request(u,request);}else if(u.pathname==='/')name='ns';else return Response.json({error:'unknown_service',services:Object.keys(services)},{status:404});}
  if(name==='auth'&&/^\/photon\/?$/.test(u.pathname))return photonAuth(request,{db,secret});
  return services[name].fetch(request,serviceEnv(name),ctx);
 }
 const loggedFetch=withRequestLog(dispatch,{secret});
 return {fetch:loggedFetch,scheduled:()=>services.match.scheduled({},serviceEnv('match'),ctx),db,hub,hubDb,dataDir,migrationCount,close:()=>{db.close();hubDb.close();}};
}
