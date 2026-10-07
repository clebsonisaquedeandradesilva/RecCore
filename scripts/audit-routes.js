import {services} from '../src/registry.js';
import {app as matchApp} from '../src/modules/apps/match/src/match.app.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const inventory=[];for(const[name,service]of Object.entries(services)){const app=name==='match'?matchApp:service;for(const route of app.routes||[]){const meta=route.handlers.find(h=>h.description)?.description;inventory.push({service:name,method:route.method,path:route.path,url:`/${name}${route.path}`,summary:meta?.summary||'',documentation:route.path==='/openapi.json'});}}
const unique=[...new Map(inventory.map(r=>[`${r.service} ${r.method} ${r.path}`,r])).values()];mkdirSync('docs',{recursive:true});writeFileSync('docs/endpoints.json',JSON.stringify(unique,null,2));const csv=v=>'"'+String(v).replaceAll('"','""')+'"';writeFileSync('docs/endpoints.csv','service,method,path,url,summary,documentation\n'+unique.map(r=>Object.values(r).map(csv).join(',')).join('\n')+'\n');
console.log(JSON.stringify({registered:inventory.length,unique:unique.length,documentation:unique.filter(r=>r.documentation).length,services:Object.fromEntries(Object.keys(services).map(n=>[n,unique.filter(r=>r.service===n).length]))},null,2));
