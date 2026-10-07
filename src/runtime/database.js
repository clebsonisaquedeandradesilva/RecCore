import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const clean=v=>typeof v==='bigint'?Number(v):v;
const row=v=>v&&Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)]));
export class D1Database {
 constructor(file){this.sqlite=new DatabaseSync(file);this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');}
 prepare(sql){return new D1Statement(this,sql);}
 async batch(statements){this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 async exec(sql){this.sqlite.exec(sql);return {count:1,duration:0};}
 close(){this.sqlite.close();}
}
class D1Statement {
 constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
 bind(...v){return new D1Statement(this.db,this.sql,v.map(x=>x===undefined?null:typeof x==='boolean'?Number(x):x instanceof ArrayBuffer?new Uint8Array(x):x));}
 execute(){const start=performance.now();const s=this.db.sqlite.prepare(this.sql);let results=[],changes=0,last=0;if(s.columns().length){results=s.all(...this.values).map(row);const meta=this.db.sqlite.prepare('SELECT changes() AS c,last_insert_rowid() AS id').get();changes=Number(meta.c);last=Number(meta.id);}else{const r=s.run(...this.values);changes=Number(r.changes);last=Number(r.lastInsertRowid);}return {success:true,results,meta:{changes,last_row_id:last,duration:performance.now()-start,rows_read:results.length,rows_written:changes}};}
 async all(){return this.execute();}async run(){return this.execute();}async first(column){const r=this.db.sqlite.prepare(this.sql).get(...this.values);return r?(column?clean(r[column]):row(r)):null;}async raw(options={}){const s=this.db.sqlite.prepare(this.sql);s.setReturnArrays(true);const r=s.all(...this.values);return options.columnNames?[s.columns().map(c=>c.name),...r]:r;}
}
export function migrate(db,root){
 db.sqlite.exec('CREATE TABLE IF NOT EXISTS _node_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
 const services=readdirSync(root).sort((a,b)=>{const order=['auth','rooms','econ','img','api'];return (order.indexOf(a)<0?100:order.indexOf(a))-(order.indexOf(b)<0?100:order.indexOf(b))||a.localeCompare(b);});
 let count=0;for(const service of services)for(const file of readdirSync(path.join(root,service)).filter(f=>f.endsWith('.sql')).sort()){
  const name=service+'/'+file;if(db.sqlite.prepare('SELECT 1 FROM _node_migrations WHERE name=?').get(name))continue;
  db.sqlite.exec('BEGIN IMMEDIATE');try{db.sqlite.exec(readFileSync(path.join(root,service,file),'utf8'));db.sqlite.prepare('INSERT INTO _node_migrations VALUES (?,?)').run(name,new Date().toISOString());db.sqlite.exec('COMMIT');count++;}catch(e){db.sqlite.exec('ROLLBACK');throw new Error('Migration '+name+': '+e.message,{cause:e});}
 }return count;
}
export function createDatabase(dataDir){mkdirSync(dataDir,{recursive:true});return new D1Database(path.join(dataDir,'recflare.sqlite'));}
