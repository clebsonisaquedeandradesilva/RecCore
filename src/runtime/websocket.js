import {createHash} from 'node:crypto';
class PairSocket {
 constructor(){this.readyState=1;this.attachment=null;this.pending=[];}
 serializeAttachment(v){this.attachment=structuredClone(v);}deserializeAttachment(){return structuredClone(this.attachment);}
 send(value){if(this.readyState!==1)throw Error('Socket closed');if(this.transport)this.transport.send(value);else this.pending.push(value);}
 close(code=1000,reason=''){this.readyState=3;if(this.transport)this.transport.close(code,reason);}
 accept(){}
}
export function installWebSocketGlobals(){
 globalThis.WebSocketPair=class {constructor(){const client=new PairSocket(),server=new PairSocket();client.peer=server;server.peer=client;this[0]=client;this[1]=server;}};
 const Base=globalThis.Response;
 globalThis.Response=class extends Base{constructor(body,init){if(init?.status===101){super(null,{status:200,headers:init.headers});this.upgradeStatus=101;this.webSocket=init.webSocket;}else super(body,init);}get status(){return this.upgradeStatus||super.status;}};
}
export function durableContext(db){const sockets=new Set();const context={
 storage:{sql:{exec(sql,...params){let rows=[];if(!params.length&&sql.split(';').filter(s=>s.trim()).length>1)db.sqlite.exec(sql);else {const stmt=db.sqlite.prepare(sql);if(stmt.columns().length)rows=stmt.all(...params);else stmt.run(...params);}return {toArray:()=>rows,one:()=>{if(rows.length!==1)throw Error('Expected one row');return rows[0];},[Symbol.iterator]:()=>rows[Symbol.iterator](),raw:()=>rows.map(Object.values)[Symbol.iterator]()};}},transactionSync(fn){db.sqlite.exec('BEGIN');try{const r=fn();db.sqlite.exec('COMMIT');return r;}catch(e){db.sqlite.exec('ROLLBACK');throw e;}}},
 blockConcurrencyWhile:async fn=>fn(),getWebSockets:tag=>[...sockets].filter(ws=>ws.readyState===1&&(!tag||ws.tags.includes(tag))),
 acceptWebSocket(ws,tags=[]){ws.tags=tags;sockets.add(ws);ws.context=context;},_sockets:sockets,waitUntil:p=>Promise.resolve(p).catch(console.error)};return context;
}
function frame(op,data=Buffer.alloc(0)){data=Buffer.from(data);let head;if(data.length<126){head=Buffer.from([0x80|op,data.length]);}else if(data.length<65536){head=Buffer.alloc(4);head[0]=0x80|op;head[1]=126;head.writeUInt16BE(data.length,2);}else{head=Buffer.alloc(10);head[0]=0x80|op;head[1]=127;head.writeBigUInt64BE(BigInt(data.length),2);}return Buffer.concat([head,data]);}
export function upgradeSocket(request,socket,head,response,hub){
 const key=request.headers['sec-websocket-key'];if(typeof key!=='string'||Buffer.from(key,'base64').length!==16||request.headers['sec-websocket-version']!=='13'){socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
 const accept=createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
 const ws=response.webSocket.peer;let buffer=Buffer.alloc(0),chunks=[],fragmentOp=0,size=0,chain=Promise.resolve(),closed=false;const max=1024*1024;
 const write=b=>{if(socket.writableLength>max*4){socket.destroy();return;}socket.write(b);};
 const close=(code=1000,reason='')=>{if(closed)return;closed=true;const body=Buffer.alloc(2);body.writeUInt16BE(code);socket.end(frame(8,Buffer.concat([body,Buffer.from(reason).subarray(0,123)])));};
 ws.transport={send:value=>write(frame(typeof value==='string'?1:2,typeof value==='string'?Buffer.from(value):new Uint8Array(value))),close};for(const value of ws.pending)ws.transport.send(value);ws.pending=[];
 const onData=data=>{buffer=Buffer.concat([buffer,data]);if(buffer.length>max+14){close(1009);return;}while(buffer.length>=2){const fin=!!(buffer[0]&128),op=buffer[0]&15,masked=!!(buffer[1]&128);if(buffer[0]&112||!masked){close(1002);return;}let len=buffer[1]&127,offset=2;if(len===126){if(buffer.length<4)return;len=buffer.readUInt16BE(2);offset=4;}else if(len===127){if(buffer.length<10)return;const big=buffer.readBigUInt64BE(2);if(big>BigInt(max)){close(1009);return;}len=Number(big);offset=10;}if(len>max||op>=8&&(!fin||len>125)){close(1002);return;}if(buffer.length<offset+4+len)return;const mask=buffer.subarray(offset,offset+4);offset+=4;const body=Buffer.from(buffer.subarray(offset,offset+len));buffer=buffer.subarray(offset+len);for(let i=0;i<body.length;i++)body[i]^=mask[i%4];if(op===8){close();return;}if(op===9){write(frame(10,body));continue;}if(op===10)continue;if(op===1||op===2){if(fragmentOp){close(1002);return;}fragmentOp=op;}else if(op!==0||!fragmentOp){close(1002);return;}size+=body.length;if(size>max){close(1009);return;}chunks.push(body);if(fin){const full=Buffer.concat(chunks),msg=fragmentOp===1?full.toString('utf8'):Uint8Array.from(full).buffer;chunks=[];fragmentOp=0;size=0;chain=chain.then(()=>hub.webSocketMessage(ws,msg)).catch(e=>{console.error('websocket',e);close(1011);});}}};
 socket.on('data',onData);socket.on('error',()=>{});socket.on('close',()=>{ws.readyState=3;ws.context?._sockets.delete(ws);Promise.resolve(hub.webSocketClose(ws,1000,'',true)).catch(console.error);});if(head?.length)onData(head);
}
