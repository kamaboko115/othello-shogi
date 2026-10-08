import {verifyChallengeProof,challengeProofMaxBytes} from './challenge-verification.js';
import {normalizeCollapseAt} from '../dist/collapse-options.js';
import {limitApiIP,limitRoomActions,rateAddress} from './action-limit.js';
import {challengeWinSchema,validChallengeWin,challengeWinCount,recordChallengeWin} from './challenge-wins.js';
import {allowsTakeback,challengeSettings,helperRemaining,recordHelperUse} from '../dist/challenge-options.js';
import {normalizeMoveLimit} from '../dist/judge-options.js';
import {normalizeTime,timeOptions,handicapOptions,applyHandicap,startClock,clockBudget,chargeClock,finishClockMove} from '../dist/match-options.js';
import {initial,play,collapseAfterMove,label,names,moves,arrivalSummary,paradoxSummary} from '../dist/engine.js';
import {roomLimitSchema,roomLimitResponse,insertLimitedFriendRoom} from './room-limits.js';
import {securityHeaders,readLimitedRequestBody} from './security.js';
import {rememberReplay,appendReplay,rewindReplay,replayRecord} from '../dist/replay-code.js';
import {serializeMatchData,parseMatchData} from '../dist/match-storage.js';

export const schema=`CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, host_hash TEXT NOT NULL, guest_hash TEXT, invite_hash TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rooms_expires ON rooms(expires);`+roomLimitSchema+challengeWinSchema;
export const activeHostRoomQuery='SELECT * FROM rooms WHERE host_hash = ? AND expires > ? LIMIT 1';
export const roomCloseGraceMs=60000;
export async function cleanupRooms(env,now=Date.now()){
 await env.DB.prepare('DELETE FROM room_creation_limits WHERE expires <= ?').bind(now).run();
 return env.DB.prepare('DELETE FROM rooms WHERE expires <= ?').bind(now).run();
}
const json=(body,status=200)=>Response.json(body,{status,headers:{...securityHeaders,'Cache-Control':'no-store'}});
const hash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const validToken=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const sideName=n=>n===0?'先手':'後手';
const notation=(s,m)=>`${s.ply+1}. ${s.turn===0?'▲':'▽'}${9-m.to%9}${'一二三四五六七八九'[Math.floor(m.to/9)]} ${m.drop?names[m.drop]:label(s.board[m.from])}${m.drop?'打':m.prom?'成':''}`;
export function furigoma(){const coins=Array.from(crypto.getRandomValues(new Uint8Array(5)),n=>n%2);return {coins,hostSide:coins.reduce((a,b)=>a+b,0)>=3?0:1};}
function matchToss(settings){const toss=furigoma();if(settings?.aiLevel!=='osesho'||toss.hostSide===1)return toss;return {coins:[0,0,0,0,0],originalCoins:toss.coins,hostSide:1,intervened:true};}
function setupState(settings){const state=initial(true);state.noDrops=!!settings?.noDrops;state.moveLimit=normalizeMoveLimit(settings?.moveLimit,60);state.paradoxAt=settings?.paradoxAt??150;return state;}
function remember(data){rememberReplay(data);data.takebacks||=[];data.takebacks.push({state:structuredClone(data.state),logLength:data.logs.length});if(data.takebacks.length>128)data.takebacks.shift();data.undoOffer=null;}
function undoIndex(data,side){return (data.takebacks||[]).findLastIndex(x=>x.state.turn===side);}
function rewind(data,index){const snapshot=data.takebacks?.[index];if(!snapshot)fail('戻せる手がありません。',409);data.state=snapshot.state;data.logs=snapshot.logs??data.logs.slice(0,snapshot.logLength);rewindReplay(data);data.takebacks=data.takebacks.slice(0,index);data.undoOffer=null;data.offer=null;data.rematch=null;}
const view=(row,seat)=>{const data=parseMatchData(row.data);const playerSide=seat===0?(data.toss?.hostSide??0):1-(data.toss?.hostSide??0);const canUndo=allowsTakeback(data)&&undoIndex(data,playerSide)>=0;delete data.takebacks;delete data.replay;return {serverNow:Date.now(),canUndo,room:row.id,seat,side:seat===0?(data.toss?.hostSide??0):1-(data.toss?.hostSide??0),version:row.version,joined:!!row.guest_hash,expires:row.expires,...data};};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
// Entrypoints supply a trusted IP: CF-Connecting-IP in Workers, socket IP locally.
// The default is for in-process callers; production requires its burst binding.
export async function api(request,env,{clientIP='127.0.0.1',requireBurstLimiter=false,allowServerAI=true}={}){
 try{
  const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean);
  if(!env.DB)return json({error:'対戦サーバーの準備ができていません。'},503);
  if(!['GET','POST'].includes(request.method))return json({error:'対応していない操作です。'},405);
  const ipLimited=await limitApiIP(env,{clientIP,required:requireBurstLimiter});if(ipLimited)return ipLimited;
  if(request.method==='POST'){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)fail('このページから操作してください。',403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSONが必要です。',415);
  }
  if(parts.length===2&&parts[1]==='challenge-wins'&&request.method==='GET')return Response.json({total:await challengeWinCount(env.DB)},{headers:{...securityHeaders,'Cache-Control':'public, max-age=300'}});
  const isWinReport=parts.length===2&&parts[0]==='api'&&parts[1]==='challenge-wins'&&request.method==='POST';
  if(isWinReport){
   const address=rateAddress(clientIP);if(!address)fail('通信元を確認できません。',503);
   if(env.ROOM_CREATE_BURST){if(!(await env.ROOM_CREATE_BURST.limit({key:'challenge-win:'+await hash(address)})).success)return roomLimitResponse(60);}
   else if(requireBurstLimiter)fail('集計サーバーの準備ができていません。',503);
  }
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!validToken(token))fail('対局の参加情報がありません。招待リンクから参加してください。',401);
  let body={};if(request.method==='POST'){const text=await readLimitedRequestBody(request,isWinReport?challengeProofMaxBytes:undefined);try{body=JSON.parse(text);}catch{fail('不正なリクエストです。');}if(!body||typeof body!=='object'||Array.isArray(body))fail('不正なリクエストです。');}
  const tokenHash=await hash(token),now=Date.now();
  if(parts.length===2&&parts[1]==='challenge-wins'&&request.method==='POST'){
   if(!validChallengeWin(body))fail('集計対象の勝利ではありません。');
   if(!verifyChallengeProof(body))fail('棋譜の形式・最終盤面を確認できません。更新後に開始した対局が集計対象です。',422);
   const proofHash=await hash(JSON.stringify(body.proof.steps.map(({move:m})=>m.drop?[m.drop,m.to]:[m.from,m.to,m.prom])));
   return json(await recordChallengeWin(env.DB,body.matchKey,now,proofHash));
  }
  if(parts.length===2&&parts[1]==='rooms' &&request.method==='POST'){
   if(!validToken(body.invite))fail('招待情報が不正です。');
   let row=await env.DB.prepare(activeHostRoomQuery).bind(tokenHash,now).first();
   if(row)return json({...view(row,0),invite:body.invite});
   if(body.kind==='ai'&&!allowServerAI)fail('AI対局はブラウザ内で作成してください。',410);
   let timeControl;try{timeControl=normalizeTime(body.settings?.timeControl);}catch{fail('時間設定が不正です。');}
   const settings={timeControl:body.kind!=='ai'?timeControl:'none',handicap:Object.hasOwn(handicapOptions,body.settings?.handicap)?body.settings.handicap:'none',paradoxAt:normalizeCollapseAt(body.settings?.paradoxAt),moveLimit:normalizeMoveLimit(body.settings?.moveLimit),noDrops:body.settings?.noDrops===true};if(body.kind==='ai'){settings.helperUnlimited=body.settings?.helperUnlimited===true;settings.handicapSide=body.settings?.handicapSide==='human'?'human':'ai';settings.aiLevel=['weak','normal','strong','expert','osesho'].includes(body.settings?.aiLevel)?body.settings.aiLevel:'normal';settings.thinkMs=[500,1000,3000,5000].includes(body.settings?.thinkMs)?body.settings.thinkMs:1000;}
   Object.assign(settings,challengeSettings(settings,body.kind));
   const id=random().slice(0,32),data={state:setupState(settings),settings,kind:body.kind==='ai'?'ai':'friend',logs:[],offer:null};
   if(data.kind==='ai'){data.toss=matchToss(settings);data.round=1;data.rematch=null;applyHandicap(data.state,settings.handicapSide==='human'?data.toss.hostSide:1-data.toss.hostSide,settings.handicap);}
   if(data.kind==='ai')startClock(data,now);
   if(data.kind==='friend'){
    if(!clientIP)fail('対戦サーバーの準備ができていません。',503);
    const address=rateAddress(clientIP);if(!address)fail('通信元を確認できません。',503);
    const ipHash=await hash(address);
    if(env.ROOM_CREATE_BURST){
     const {success}=await env.ROOM_CREATE_BURST.limit({key:ipHash});
     if(!success)return roomLimitResponse(60);
    }else if(requireBurstLimiter)fail('対戦サーバーの準備ができていません。',503);
    const created=await insertLimitedFriendRoom(env.DB,{ipHash,id,hostHash:tokenHash,inviteHash:await hash(body.invite),data,now});
    row=created
     ?await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first()
     :await env.DB.prepare(activeHostRoomQuery).bind(tokenHash,now).first();
    if(row)return json({...view(row,0),invite:body.invite},created?201:200);
    const quota=await env.DB.prepare('SELECT expires FROM room_creation_limits WHERE ip_hash = ?').bind(ipHash).first();
    return roomLimitResponse(((quota?.expires??now+60000)-now)/1000);
   }
   await env.DB.prepare('DELETE FROM rooms WHERE expires < ?').bind(now).run();
   await env.DB.prepare('INSERT INTO rooms (id,host_hash,invite_hash,data,expires) VALUES (?,?,?,?,?)').bind(id,tokenHash,await hash(body.invite),serializeMatchData(data),now+7*86400000).run();
   if(data.kind==='ai')await env.DB.prepare('UPDATE rooms SET guest_hash = ? WHERE id = ?').bind('ai',id).run();
   row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();return json({...view(row,0),invite:body.invite},201);
  }
  if(parts[0]!=='api'||parts[1]!=='rooms'||!/^[a-f0-9]{32}$/.test(parts[2]||'')||!(request.method==='GET'&&(parts.length===3||parts.length===4&&parts[3]==='replay')||request.method==='POST'&&parts.length===4&&['preview','join','action'].includes(parts[3])))fail('対局が見つかりません。',404);
  const id=parts[2];let row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();
  if(row&&row.expires<=now){await env.DB.prepare('DELETE FROM rooms WHERE id = ? AND expires <= ?').bind(id,now).run();row=null;}
  if(!row)fail('対局が見つからないか、すでに閉じられています。',404);
  const side=row.host_hash===tokenHash?0:row.guest_hash===tokenHash?1:null,action=parts[3];
  // Reject outsiders before decompressing potentially long match histories.
  if(side===null&&(!['preview','join'].includes(action)||!validToken(body.invite)||await hash(body.invite)!==row.invite_hash))fail('この対局を操作する権限がありません。',403);
  if(request.method==='POST'&&action==='action'){const actionLimited=await limitRoomActions(env,{tokenHash,required:requireBurstLimiter});if(actionLimited)return actionLimited;}
  if(parseMatchData(row.data).state.mode===false)fail('通常将棋モードは終了しました。新しい対局を作成してください。',410);
  if(action==='preview'&&request.method==='POST'){if(!validToken(body.invite)||await hash(body.invite)!==row.invite_hash)fail('招待リンクが正しくありません。',403);return json({settings:parseMatchData(row.data).settings||{moveLimit:true,noDrops:false}});}
  if(action==='join'&&request.method==='POST'){
   if(side!==null)return json(view(row,side));
   if(!validToken(body.invite)||await hash(body.invite)!==row.invite_hash)fail('招待リンクが正しくありません。',403);
   if(row.guest_hash)fail('この対局にはすでに2人が参加しています。',409);
   const fresh=parseMatchData(row.data);delete fresh.replay;fresh.toss=fresh.kind==='ai'?matchToss(fresh.settings):furigoma();fresh.round=1;fresh.rematch=null;applyHandicap(fresh.state,fresh.toss.hostSide,fresh.settings?.handicap);startClock(fresh,now);rememberReplay(fresh);
   const updated=await env.DB.prepare('UPDATE rooms SET guest_hash = ?, data = ?, version = version + 1 WHERE id = ? AND guest_hash IS NULL').bind(tokenHash,serializeMatchData(fresh),id).run();
   if(!updated.meta.changes)fail('この対局にはすでに2人が参加しています。',409);
   row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();return json(view(row,1));
  }
  if(side===null)fail('この対局を操作する権限がありません。',403);
  const timed=parseMatchData(row.data);
  if(body.action!=='leave'&&row.guest_hash&&!timed.state.result&&clockBudget(timed,timed.state.turn,now)<=0){
   chargeClock(timed,now);timed.state.result=sideName(1-timed.state.turn)+'の勝ち（時間切れ）';timed.offer=null;timed.undoOffer=null;
   await env.DB.prepare('UPDATE rooms SET data = ?, version = version + 1 WHERE id = ? AND version = ?').bind(serializeMatchData(timed),id,row.version).run();
   row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();return json(view(row,side));
  }
  if(request.method==='GET'&&action==='replay'){if(!timed.state.result)fail('棋譜の再生は対局終了後に利用できます。',409);return json(replayRecord(timed));}
  if(request.method==='GET'&&!action){
   // Authorize and settle expired clocks before considering the client's version.
   // Room versions include offers, joins, undo, rematches and closure, not just moves.
   const version=url.searchParams.get('version');
   if(version!==null&&/^(0|[1-9][0-9]*)$/.test(version)&&Number.isSafeInteger(Number(version))&&Number(version)===row.version)return new Response(null,{status:304,headers:{...securityHeaders,'Cache-Control':'no-store','X-Room-Version':String(row.version),'X-Room-Server-Now':String(Date.now())}});
   return json(view(row,side));
  }
  if(request.method!=='POST'||action!=='action')fail('操作が見つかりません。',404);
  // Leaving atomically records a resignation and closes the room. A friend
  // can still receive the final state during a short grace period.
  if(body.action==='leave'){
   const data=parseMatchData(row.data),playingSide=side===0?(data.toss?.hostSide??0):1-(data.toss?.hostSide??0);
   if(data.closed)return json(view(row,side));
   if(!Number.isInteger(body.version)||body.version!==row.version)fail('盤面が更新されています。最新の盤面で操作してください。',409);
   if(row.guest_hash&&!data.state.result){
    const timedOut=clockBudget(data,data.state.turn,now)<=0;
    chargeClock(data,now);data.state.result=timedOut?`${sideName(1-data.state.turn)}の勝ち（時間切れ）`:`${sideName(1-playingSide)}の勝ち（投了）`;
   }
   data.closed=true;data.offer=null;data.undoOffer=null;data.rematch=null;
   const expires=Math.min(row.expires,now+roomCloseGraceMs);
   const updated=await env.DB.prepare('UPDATE rooms SET data = ?, expires = ?, version = version + 1 WHERE id = ? AND version = ?').bind(serializeMatchData(data),expires,id,row.version).run();
   if(!updated.meta.changes)fail('盤面が更新されています。もう一度確認してください。',409);
   row={...row,data:serializeMatchData(data),expires,version:row.version+1};
   const final=view(row,side);
   if(data.kind==='ai'||!row.guest_hash)await env.DB.prepare('DELETE FROM rooms WHERE id = ? AND version = ?').bind(id,row.version).run();
   return json(final);
  }
  if(parseMatchData(row.data).closed)fail('相手が対局を離れたため、この部屋は閉じられました。',410);
  if(!row.guest_hash)fail('対戦相手の参加を待っています。',409);
  if(!Number.isInteger(body.version)||body.version!==row.version)fail('盤面が更新されています。最新の盤面で操作してください。',409);
  const data=parseMatchData(row.data),s=data.state,playingSide=side===0?(data.toss?.hostSide??0):1-(data.toss?.hostSide??0);
  if(['offer-undo','accept-undo','decline-undo'].includes(body.action)){
    if(!allowsTakeback(data))fail('対オセショ様では待ったを使えません。',403);
   if(body.action==='offer-undo'){const index=undoIndex(data,playingSide);if(index<0)fail('戻せる手がありません。',409);if(data.kind==='ai'){chargeClock(data,now);rewind(data,index);if(data.clock)data.clock.since=now;}else{if(data.undoOffer&&data.undoOffer.seat!==side)fail('相手の待ったに返答してください。',409);data.undoOffer={seat:side,index,ply:data.takebacks[index].state.ply};}}
   else if(body.action==='accept-undo'){if(!data.undoOffer||data.undoOffer.seat!==1-side)fail('相手の待った申請がありません。',409);chargeClock(data,now);rewind(data,data.undoOffer.index);if(data.clock)data.clock.since=now;}
   else{if(!data.undoOffer)return json(view(row,side));data.undoOffer=null;}
  }else if(['offer-rematch','accept-rematch','decline-rematch'].includes(body.action)){

   if(!s.result)fail('再試合は対局終了後に申し込めます。',409);
   if(body.action==='offer-rematch'&&data.kind==='ai'){data.state=setupState(data.settings);data.replay=null;data.takebacks=[];data.undoOffer=null;data.logs=[];data.offer=null;data.rematch=null;data.toss=matchToss(data.settings);data.round=(data.round||1)+1;applyHandicap(data.state,data.kind==='ai'&&data.settings?.handicapSide!=='human'?1-data.toss.hostSide:data.toss.hostSide,data.settings?.handicap);startClock(data,now);}
   else if(body.action==='offer-rematch'){if(data.rematch===1-side)fail('相手の再試合希望を承諾してください。',409);data.rematch=side;}
   else if(body.action==='accept-rematch'){if(data.rematch!==1-side)fail('相手からの再試合希望はありません。',409);data.state=setupState(data.settings);data.replay=null;data.takebacks=[];data.undoOffer=null;data.logs=[];data.offer=null;data.rematch=null;data.toss=data.kind==='ai'?matchToss(data.settings):furigoma();data.round=(data.round||1)+1;applyHandicap(data.state,data.kind==='ai'&&data.settings?.handicapSide!=='human'?1-data.toss.hostSide:data.toss.hostSide,data.settings?.handicap);startClock(data,now);}
   else{if(data.rematch==null)return json(view(row,side));data.rematch=null;}
  }else{
  if(s.result)fail('この対局は終了しています。',409);
  if(body.action==='ai-no-moves'){
   if(data.kind!=='ai'||side!==0||s.turn===playingSide)fail('AIの手番ではありません。',403);
   const sources=[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])];
   if(sources.some(src=>moves(s,src).length))fail('指せる手があります。');
   chargeClock(data,now);s.result=sideName(1-s.turn)+'の勝ち（指せる手なし）';
  }else if(body.action==='move'||body.action==='ai-move'||body.action==='helper-move'){

   if(body.action==='ai-move'){if(data.kind!=='ai'||side!==0||s.turn===playingSide)fail('AIの手番ではありません。',403);}
   else if(s.turn!==playingSide)fail('相手の手番です。',403);
   if(body.action==='helper-move'&&(data.kind!=='ai'||side!==0||(!data.settings?.helperUnlimited&&data.helperUsedRound===(data.round||1))))fail('この対局の代打回数を使い切りました。',403);
   const m=body.move;if(!m||!Number.isInteger(m.to)||m.to<0||m.to>80)fail('指せない手です。');
   let normalized;
   if(m.drop){if(!['R','B','G','S','N','L','P'].includes(m.drop))fail('指せない手です。');normalized={drop:m.drop,to:m.to};}
   else{if(!Number.isInteger(m.from)||m.from<0||m.from>80||typeof m.prom!=='boolean')fail('指せない手です。');normalized={from:m.from,to:m.to,prom:m.prom};}
   try{const next=collapseAfterMove(play(s,normalized));remember(data);chargeClock(data,now);data.logs.push(notation(s,normalized)+(next.flipped.length?` ／ ${next.flipped.length}枚反転`:'')+(next.destroyed?` ／ ${sideName(next.destroyed.piece.side)}の${label(next.destroyed.piece)}が崩壊`:next.spawned?' ／ '+arrivalSummary(next):next.paradoxEvent?' ／ '+paradoxSummary(next):''));data.state=next;appendReplay(data);if(body.action==='helper-move')recordHelperUse(data);finishClockMove(data,s.turn,now);data.offer=null;}catch{fail('指せない手です。');}
  }else if(body.action==='resign'){chargeClock(data,now);s.result=`${sideName(1-playingSide)}の勝ち（投了）`;data.offer=null;}
  else if(body.action==='offer-draw'){if(data.kind==='ai'){chargeClock(data,now);s.result='合意による引き分け';}else data.offer=side;}
  else if(body.action==='accept-draw'){if(data.offer!==1-side)fail('相手からの引き分け提案はありません。');chargeClock(data,now);s.result='合意による引き分け';data.offer=null;}
  else if(body.action==='decline-draw'){if(data.offer==null)return json(view(row,side));data.offer=null;}
  else fail('操作が正しくありません。');
  }
  const nextData=serializeMatchData(data);
  if(nextData===row.data)return json(view(row,side));
  const updated=await env.DB.prepare('UPDATE rooms SET data = ?, version = version + 1 WHERE id = ? AND version = ?').bind(nextData,id,row.version).run();
  if(!updated.meta.changes)fail('盤面が更新されています。もう一度確認してください。',409);
  row=await env.DB.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first();return json(view(row,side));
 }catch(error){return json({error:error.status?error.message:'通信処理に失敗しました。少し待って再接続してください。'},error.status||500);}
}
