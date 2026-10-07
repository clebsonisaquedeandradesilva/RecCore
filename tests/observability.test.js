import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createApplication} from '../src/application.js';
const secret='observability-secret-32-characters-min';
Object.assign(process.env,{PUBLIC_BASE_URL:'http://localhost:10000',MAX_ACCOUNTS_PER_IP:'0',MAX_ACCOUNTS_PER_PLATFORM_ID:'0',PHOTON_REALTIME_APP_ID:'APPID-REALTIME-TEST',PHOTON_REGION:'us',LOG_LEVEL:'debug'});
const dir=mkdtempSync(path.join(os.tmpdir(),'recflare-obs-'));let app=createApplication({dataDir:dir,jwtSecret:secret});
const rq=(p,o={})=>app.fetch(new Request('http://localhost:10000'+p,o));
const form=o=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(o).toString()});
const logs=[];const orig=console.log;
const capture=()=>{logs.length=0;console.log=(...a)=>{logs.push(a.join(' '));};};const release=()=>{console.log=orig;};
async function signup(){const r=await rq('/auth/connect/token',form({grant_type:'create_account',password:'Pw12345678!aA',client_id:'recroom',scope:'rn.accounts',ver:'20230414'}));assert.equal(r.status,200);const b=await r.json();const me=await (await rq('/accounts/account/me',{headers:{authorization:'Bearer '+b.access_token}})).json();return {token:b.access_token,id:me.accountId,H:{authorization:'Bearer '+b.access_token}};}
let p1,p2;
test.after(()=>{release();app.close();rmSync(dir,{recursive:true,force:true});});

test('[HTTP] logs method, path, account, status and time; never the full token',async()=>{p1=await signup();capture();const r=await rq('/match/matchmake/dorm',{method:'POST',headers:p1.H});release();assert.equal(r.status,200);
 const out=logs.join('\n');assert.match(out,/\[HTTP\] POST \/match\/matchmake\/dorm/);assert.match(out,new RegExp('account='+p1.id));assert.match(out,/status=200/);assert.match(out,/\d+ms/);assert.ok(!out.includes(p1.token),'token completo vazou no log');});

test('[HTTP_404] logs method, path, query, account and body, without 500',async()=>{capture();const r=await rq('/match/FDAJBGDDMEI/whatever?x=1&token=abcdefghijklmnop',{method:'POST',headers:{...p1.H,'content-type':'application/x-www-form-urlencoded'},body:'a=1&password=hunter2hunter2'});release();assert.equal(r.status,404);
 const out=logs.join('\n');assert.match(out,/\[HTTP_404\] POST \/match\/FDAJBGDDMEI\/whatever/);assert.match(out,new RegExp('account='+p1.id));assert.match(out,/"x":"1"/);assert.ok(!out.includes('hunter2hunter2')&&!out.includes('abcdefghijklmnop'),'segredo vazou');});

test('unknown service 404 is also logged',async()=>{capture();const r=await rq('/nope/abc');release();assert.equal(r.status,404);assert.match(logs.join('\n'),/\[HTTP_404\] GET \/nope\/abc/);});

test('Dorm: each player has own instance; repeat calls reuse it (id and photonRoomId stable)',async()=>{p2=await signup();const dorm=async p=>(await (await rq('/match/matchmake/dorm',{method:'POST',headers:p.H})).json()).roomInstance;
 const a1=await dorm(p1),a2=await dorm(p1),b1=await dorm(p2),b2=await dorm(p2);
 assert.equal(a1.roomInstanceId,a2.roomInstanceId);assert.equal(a1.photonRoomId,a2.photonRoomId);assert.equal(b1.roomInstanceId,b2.roomInstanceId);
 assert.notEqual(a1.roomInstanceId,b1.roomInstanceId);assert.notEqual(a1.photonRoomId,b1.photonRoomId);assert.ok(a1.roomInstanceId>=1000001);assert.equal(a1.photonRegion,'us');});

test('/auth/photon: token from connection-info authenticates the existing account',async()=>{await rq('/match/matchmake/dorm',{method:'POST',headers:p1.H});
 const ci=await (await rq('/match/player/connection-info',{headers:p1.H})).json();assert.equal(ci.value.photonRegion,'us');
 capture();const r=await rq('/auth/photon?token='+encodeURIComponent(ci.value.photonAuthToken)+'&foo=bar');release();
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.ResultCode,1);assert.equal(j.UserId,String(p1.id));
 const out=logs.join('\n');assert.match(out,/\[PHOTON_AUTH\]/);assert.match(out,/result=success/);assert.match(out,/tokenSource=param:token/);assert.match(out,/region=us/);assert.ok(out.includes(ci.value.photonRoomId));assert.ok(!out.includes(ci.value.photonAuthToken),'token completo vazou');
 // mesmo token via POST/form e via header
 let r2=await rq('/auth/photon',form({anything:ci.value.photonAuthToken}));assert.equal((await r2.json()).ResultCode,1);
 r2=await rq('/auth/photon',{headers:{authorization:'Bearer '+ci.value.photonAuthToken}});assert.equal((await r2.json()).ResultCode,1);});

test('/auth/photon: missing, forged and wrong-audience credentials fail visibly',async()=>{
 capture();let j=await (await rq('/auth/photon?x=1')).json();release();assert.equal(j.ResultCode,3);assert.match(logs.join('\n'),/UNKNOWN \/ REQUIRES CLIENT TRACE/);
 j=await (await rq('/auth/photon?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIyIn0.bad')).json();assert.equal(j.ResultCode,2);
 // JWT de acesso do jogo (aud != AppId do Photon) não deve passar como credencial Photon
 j=await (await rq('/auth/photon',{headers:p1.H})).json();assert.equal(j.ResultCode,2);});

test('account id is stable across restart and /auth/photon still resolves it',async()=>{const ci=await (await rq('/match/player/connection-info',{headers:p1.H})).json();app.close();app=createApplication({dataDir:dir,jwtSecret:secret});
 const me=await (await rq('/accounts/account/me',{headers:p1.H})).json();assert.equal(me.accountId,p1.id);const j=await (await rq('/auth/photon?token='+ci.value.photonAuthToken)).json();assert.equal(j.ResultCode,1);assert.equal(j.UserId,String(p1.id));});
