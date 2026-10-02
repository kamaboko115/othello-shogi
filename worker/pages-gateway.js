import {securityHeaders} from './security.js';

export default {
 async fetch(request,env){
  if(!new URL(request.url).pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(!env.GAME_API)return Response.json({error:'対戦サーバーの準備ができていません。'},{status:503,headers:{...securityHeaders,'Cache-Control':'no-store'}});
  // Keep the Pages URL, Origin, player token, IP, body and conditional headers.
  // The existing Worker performs authentication, room limits and D1 writes.
  return env.GAME_API.fetch(request);
 }
};
