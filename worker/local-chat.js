import {WebSocketServer} from 'ws';
import {authorizeChat,RoomChat} from './chat.js';
export function attachLocalChat(server,DB){
 const rooms=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:1024,handleProtocols:()=> 'ose-chat'});
 server.on('upgrade',async(req,socket,head)=>{
  try{
   const request=new Request(new URL(req.url,'http://'+req.headers.host),{headers:req.headers});
   const auth=await authorizeChat(request,{DB});
   if(auth instanceof Response){socket.end('HTTP/1.1 '+auth.status+' Rejected\r\nConnection: close\r\n\r\n');return;}
   wss.handleUpgrade(req,socket,head,ws=>{
    let peers=rooms.get(auth.room);if(!peers){peers=new Set();rooms.set(auth.room,peers);}
    for(const peer of peers)if(peer.deserializeAttachment().seat===auth.seat)peer.close(1000);
    let metadata={...auth,lastSent:0};ws.serializeAttachment=value=>{metadata={...value};};ws.deserializeAttachment=()=>({...metadata});peers.add(ws);
    const hub=new RoomChat({getWebSockets:()=>[...peers]},{DB});
    ws.on('message',(data,binary)=>{void hub.webSocketMessage(ws,binary?data:data.toString()).catch(()=>ws.close(1011));});
    ws.on('error',()=>{});ws.on('close',()=>{peers.delete(ws);if(!peers.size)rooms.delete(auth.room);});
   });
  }catch{socket.destroy();}
 });
 return wss;
}
