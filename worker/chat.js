import {parseMatchData} from '../dist/match-storage.js';
// Chat payloads are relayed only: never written to D1, storage or logs.
export const chatTermsVersion='2026-10-07';
export function chatMessage(raw,now,lastSent=0){
 if(typeof raw!=='string'||raw.length>1024)return null;
 let value;try{value=JSON.parse(raw);}catch{return null;}
 if(value.type!=='message'||typeof value.text!=='string'||now-lastSent<2000)return null;
 const text=value.text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim();
 if(!text||Array.from(text).length>120)return null;
 return {type:'message',text};
}
export async function authorizeChat(request,env,now=Date.now()){
 const url=new URL(request.url),match=/^\/api\/rooms\/([a-f0-9]{32})\/chat$/.exec(url.pathname);
 const deny=(status,error)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(!match||request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return deny(400,'接続方法が正しくありません。');
 if(request.headers.get('Origin')!==url.origin)return deny(403,'このページから接続してください。');
 if(url.searchParams.get('terms')!==chatTermsVersion)return deny(403,'チャットの利用条件への同意が必要です。');
 const protocols=(request.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(x=>x.trim());
 const token=protocols.find(x=>/^auth\.[a-f0-9]{64}$/.test(x))?.slice(5);
 if(!token||!protocols.includes('ose-chat'))return deny(401,'参加情報がありません。');
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
 const row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(match[1]).first();
 if(!row||row.expires<=now)return deny(404,'この部屋は閉じられています。');
 const seat=row.host_hash===digest?0:row.guest_hash===digest?1:null;
 if(seat===null)return deny(403,'この部屋の対局者だけが使えます。');
 const data=parseMatchData(row.data);
 if(data.kind!=='friend'||data.closed||!row.guest_hash)return deny(403,'参加済みの友人対局だけで使えます。');
 return {room:row.id,seat,expires:row.expires};
}

// Hibernating WebSockets keep only connection metadata. There is no history.
export class RoomChat {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  const seat=Number(request.headers.get('X-Chat-Seat')),expires=Number(request.headers.get('X-Chat-Expires'));
  for(const socket of this.ctx.getWebSockets(String(seat)))socket.close(1000,'別の画面で接続しました');
  const pair=new WebSocketPair(),client=pair[0],socket=pair[1];
  this.ctx.acceptWebSocket(socket,[String(seat)]);
  socket.serializeAttachment({seat,expires,lastSent:0,room:request.headers.get('X-Chat-Room')});
  return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'ose-chat'}});
 }
 async webSocketMessage(socket,raw){
  const meta=socket.deserializeAttachment(),now=Date.now();
  if(now-(meta.lastAttempt||0)<1000){socket.close(1008,'連投制限');return;}
  meta.lastAttempt=now;socket.serializeAttachment(meta);
  if(this.env.ROOM_ACTION_BURST&&!(await this.env.ROOM_ACTION_BURST.limit({key:'chat:'+meta.room+':'+meta.seat})).success){socket.close(1008,'送信回数制限');return;}
  const message=chatMessage(raw,now,meta.lastSent);
  if(!message){socket.send(JSON.stringify({type:'error',text:'120文字以内・2秒以上の間隔で送信してください。'}));return;}
  // Check closure on send, not on a polling timer. No chat writes occur.
  const row=await this.env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(meta.room).first();
  if(!row||row.expires<=now||parseMatchData(row.data).closed){socket.close(1000,'部屋が閉じられました');return;}
  meta.lastSent=now;socket.serializeAttachment(meta);
  const payload=JSON.stringify({...message,seat:meta.seat});
  for(const peer of this.ctx.getWebSockets())try{peer.send(payload);}catch{}
 }
 webSocketClose(socket,code){socket.close(code===1000||code>=3000&&code<=4999?code:1000);}
 webSocketError(socket){socket.close(1011,'接続が切れました');}
}
