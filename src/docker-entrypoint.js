// Make a newly mounted Render disk writable, then permanently drop root privileges.
import {mkdirSync,chownSync,lstatSync} from 'node:fs';import path from 'node:path';
const dataDir=path.resolve(process.env.DATA_DIR||'/var/data');mkdirSync(dataDir,{recursive:true});
if(typeof process.getuid==='function'&&process.getuid()===0){
 if(lstatSync(dataDir).isSymbolicLink())throw Error('DATA_DIR must not be a symbolic link');
 chownSync(dataDir,1000,1000);
 process.setgroups([]);process.setgid(1000);process.setuid(1000);
}
await import('./server.js');
