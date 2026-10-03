import {empty,arrivals} from './engine.js';

const types='PLNSGBRK',handTypes='PLNSGBR';
export const replayLimit=4096;
// One small snapshot per ply; no duplicated logs or AI search state.
export function packReplayState(s){
 const extra=arrivals(s).slice(1).map(d=>d.square);
 return {b:s.board.map(p=>p?String.fromCharCode(65+types.indexOf(p.type)+8*p.side+(p.prom?16:0)):'.').join(''),h:s.hands.map(h=>Array.from(handTypes,t=>h[t]||0)),t:s.turn,p:s.ply,l:s.last||[],f:s.flipped||[],d:s.destroyed?.square??null,u:s.spawned?.square??null,...(extra.length?{a:extra}:{}),...(s.paradoxEvent?{e:structuredClone(s.paradoxEvent)}:{})};
}
export function unpackReplayState(frame){
 const bad=()=>{throw Error('棋譜データの形式が正しくありません。');};
 if(!frame||typeof frame.b!=='string'||frame.b.length!==81||![0,1].includes(frame.t)||!Number.isSafeInteger(frame.p)||frame.p<0)bad();
 const s=empty();s.moveLimit=false;s.paradoxAt=false;s.turn=frame.t;s.ply=frame.p;
 s.board=Array.from(frame.b,c=>{
  if(c==='.')return null;
  const code=c.charCodeAt(0)-65;if(code<0||code>31)bad();
  const p={type:types[code%8],side:Math.floor(code/8)%2,prom:code>=16};if(p.prom&&['G','K'].includes(p.type))bad();return p;
 });
 if(!Array.isArray(frame.h)||frame.h.length!==2)bad();
 s.hands=frame.h.map(h=>{if(!Array.isArray(h)||h.length!==7||h.some(n=>!Number.isInteger(n)||n<0||n>81))bad();return Object.fromEntries(Array.from(handTypes,(t,i)=>[t,h[i]]));});
 for(const [name,max]of [['l',2],['f',81]]){if(!Array.isArray(frame[name])||frame[name].length>max||frame[name].some(i=>!Number.isInteger(i)||i<0||i>80))bad();}
 s.last=[...frame.l];s.flipped=[...frame.f];
 for(const name of ['d','u'])if(frame[name]!==null&&(!Number.isInteger(frame[name])||frame[name]<0||frame[name]>80))bad();
 if(frame.d!==null){if(s.board[frame.d])bad();s.destroyed={square:frame.d};}
 if(frame.u!==null){const piece=s.board[frame.u];if(!piece?.prom||!['R','B'].includes(piece.type)||frame.d!==null)bad();s.spawned={square:frame.u,piece};}
 if(frame.a!==undefined){
  if(!s.spawned||!Array.isArray(frame.a)||frame.a.length>2||new Set([frame.u,...frame.a]).size!==frame.a.length+1)bad();
  s.spawned.additional=frame.a.map(square=>{if(!Number.isInteger(square)||square<0||square>80)bad();const piece=s.board[square];if(!piece?.prom||!['R','B'].includes(piece.type))bad();return {square,piece};});
 }
 if(frame.e!==undefined){
  const e=frame.e,validSquare=i=>Number.isInteger(i)&&i>=0&&i<81;
  if(!e||!['warp','flip','shuffle','invert','promote'].includes(e.kind)||frame.d!==null||frame.u!==null)bad();
  if(e.kind==='warp'||e.kind==='shuffle'){
   if(!Array.isArray(e.moves)||e.moves.length>81||e.moves.some(m=>!m||!validSquare(m.from)||!validSquare(m.to)||!s.board[m.to])||new Set(e.moves.map(m=>m.from)).size!==e.moves.length||new Set(e.moves.map(m=>m.to)).size!==e.moves.length)bad();
   if(e.kind==='warp'){
    if(e.moves.length>1)bad();
    if(e.moves.length){const m=e.moves[0];if(s.board[m.from]||s.board[m.to].type!=='K'||e.side!==s.board[m.to].side)bad();}
   }else if(e.skipped===true?e.moves.length!==0:e.moves.length!==s.board.filter(Boolean).length)bad();
   s.paradoxEvent={kind:e.kind,...(e.moves.length&&e.kind==='warp'?{side:e.side}:{}),...(e.kind==='shuffle'&&e.skipped===true?{skipped:true}:{}),moves:e.moves.map(m=>({from:m.from,to:m.to}))};
  }else{
   if(!Array.isArray(e.squares)||e.squares.length>81||new Set(e.squares).size!==e.squares.length||e.squares.some(i=>!validSquare(i)||!s.board[i]))bad();
   if(e.kind==='flip'&&(e.squares.length>5||e.squares.some(i=>s.board[i].type==='K')))bad();
   if(e.kind==='invert'&&e.squares.length!==s.board.filter(Boolean).length)bad();
   if(e.kind==='promote'&&e.squares.some(i=>!s.board[i].prom||!['P','L','N','S','B','R'].includes(s.board[i].type)))bad();
   s.paradoxEvent={kind:e.kind,squares:[...e.squares]};
  }
 }
 return s;
}
export function rememberReplay(data){data.replay||=[packReplayState(data.state)];}
export function appendReplay(data){rememberReplay(data);data.replay.push(packReplayState(data.state));if(data.replay.length>replayLimit)data.replay.shift();}
export function rewindReplay(data){if(data.replay)data.replay=data.replay.filter(f=>f.p<data.state.ply).concat(packReplayState(data.state));}
export function replayRecord(data){rememberReplay(data);return {v:1,frames:data.replay,logs:data.logs,result:data.state.result||'',rules:{noDrops:!!data.state.noDrops,moveLimit:data.state.moveLimit??false}};}
export function validateReplay(data){
 if(!data||data.v!==1||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>replayLimit||!Array.isArray(data.logs)||data.logs.length>100000||data.logs.some(l=>typeof l!=='string'||l.length>300)||typeof data.result!=='string'||data.result.length>200)throw Error('棋譜データの形式が正しくありません。');
 if(data.rules&&((typeof data.rules.noDrops!=='boolean')||(data.rules.moveLimit!==false&&(!Number.isInteger(data.rules.moveLimit)||data.rules.moveLimit<1||data.rules.moveLimit>1000))))throw Error('対局設定が正しくありません。');
 let previous=-1;for(const f of data.frames){unpackReplayState(f);if(f.p<=previous)throw Error('手数が正しくありません。');previous=f.p;}
 return {v:1,frames:data.frames,logs:data.logs,result:data.result,...(data.rules?{rules:{noDrops:data.rules.noDrops,moveLimit:data.rules.moveLimit}}:{})};
}
