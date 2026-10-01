import {normalizeMoveLimit} from './judge-options.js';
import {normalizeTime,handicapOptions,applyHandicap} from './match-options.js';
import {initial,play,collapseAfterMove,label,names,moves} from './engine.js';

const lifetime=7*86400000;
const validId=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const sideName=n=>n===0?'先手':'後手';
const notation=(s,m)=>`${s.ply+1}. ${s.turn===0?'▲':'▽'}${9-m.to%9}${'一二三四五六七八九'[Math.floor(m.to/9)]} ${m.drop?names[m.drop]:label(s.board[m.from])}${m.drop?'打':m.prom?'成':''}`;
export const localAIStorageKey=id=>'hanten-local-ai-v1-'+id;
export const localAIStorageWarning='ブラウザに保存できません。このページを閉じるとAI対局は失われます。';

function normalizeSettings(input={}){
 if(input.paradoxAt!==undefined&&input.paradoxAt!==false&&(!Number.isInteger(input.paradoxAt)||input.paradoxAt<1||input.paradoxAt>1000))fail('崩壊開始は1〜1000手で指定してください。');
 try{normalizeTime(input.timeControl);}catch{fail('時間設定が不正です。');}
 return {timeControl:'none',handicap:Object.hasOwn(handicapOptions,input.handicap)?input.handicap:'none',paradoxAt:input.paradoxAt??150,moveLimit:normalizeMoveLimit(input.moveLimit),noDrops:input.noDrops===true,helperUnlimited:input.helperUnlimited===true,handicapSide:input.handicapSide==='human'?'human':'ai',aiLevel:['weak','normal','strong','expert','osesho'].includes(input.aiLevel)?input.aiLevel:'normal',thinkMs:[500,1000,3000,5000].includes(input.thinkMs)?input.thinkMs:1000};
}
function setupState(settings){const s=initial(true);s.noDrops=!!settings.noDrops;s.moveLimit=normalizeMoveLimit(settings.moveLimit,60);s.paradoxAt=settings.paradoxAt;return s;}
function undoIndex(data){return (data.takebacks||[]).findLastIndex(x=>x.state.turn===data.toss.hostSide);}
function remember(data){data.takebacks||=[];data.takebacks.push({state:structuredClone(data.state),logs:[...data.logs]});if(data.takebacks.length>128)data.takebacks.shift();data.undoOffer=null;}
function rewind(data,index){const saved=data.takebacks?.[index];if(!saved)fail('戻せる手がありません。',409);data.state=saved.state;data.logs=saved.logs;data.takebacks=data.takebacks.slice(0,index);data.undoOffer=null;data.offer=null;data.rematch=null;}

// This owns only the match state. AI search still runs through ai-client.js and
// every move uses the same engine and collapse rules as online matches.
export function createLocalAIStore({storage=()=>globalThis.localStorage,now=Date.now,random=bytes=>crypto.getRandomValues(bytes)}={}){
 const memory=new Map(),removed=new Set(),dirty=new Set();let warning='';
 const backend=()=>typeof storage==='function'?storage():storage;
 const storageFailed=()=>{warning=localAIStorageWarning;};
 function save(record){memory.set(record.room,structuredClone(record));removed.delete(record.room);try{backend().setItem(localAIStorageKey(record.room),JSON.stringify(record));dirty.delete(record.room);}catch{dirty.add(record.room);storageFailed();}}
 function remove(id){memory.delete(id);removed.add(id);try{backend().removeItem(localAIStorageKey(id));}catch{storageFailed();}}
 function readRecord(id){
  if(!validId(id)||removed.has(id))fail('対局が見つからないか、すでに閉じられています。',404);
  let record=memory.get(id);
  if(!dirty.has(id))try{const saved=backend().getItem(localAIStorageKey(id));if(saved)record=JSON.parse(saved);}catch{storageFailed();}
  if(!record)fail('このブラウザにはAI対局の保存データがありません。',404);
  if(record.schema!==1||record.room!==id||!Number.isInteger(record.version)||!Number.isFinite(record.expires)||record.data?.kind!=='ai'||record.data?.state?.board?.length!==81||!Array.isArray(record.data.logs)||![0,1].includes(record.data.toss?.hostSide))fail('AI対局の保存データを読み込めません。',400);
  if(record.expires<=now()||record.data.closed){remove(id);fail('対局が見つからないか、すでに閉じられています。',404);}
  if(record.data.state.mode===false)fail('通常将棋モードは終了しました。新しい対局を作成してください。',410);
  return structuredClone(record);
 }
 function view(record){const data=structuredClone(record.data),canUndo=undoIndex(data)>=0;delete data.takebacks;return {serverNow:now(),canUndo,room:record.room,seat:0,side:data.toss.hostSide,version:record.version,joined:true,expires:record.expires,...data,local:true,storageWarning:warning};}
 function toss(settings){const coins=Array.from(random(new Uint8Array(5)),n=>n%2),hostSide=coins.reduce((a,b)=>a+b,0)>=3?0:1;if(settings.aiLevel==='osesho'&&hostSide===0)return {coins:[0,0,0,0,0],originalCoins:coins,hostSide:1,intervened:true};return {coins,hostSide};}
 function freshRound(data){data.state=setupState(data.settings);data.takebacks=[];data.undoOffer=null;data.logs=[];data.offer=null;data.rematch=null;data.toss=toss(data.settings);data.round=(data.round||0)+1;applyHandicap(data.state,data.settings.handicapSide==='human'?data.toss.hostSide:1-data.toss.hostSide,data.settings.handicap);}
 return {
  get warning(){return warning;},
  create(input){const settings=normalizeSettings(input),id=Array.from(random(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join(''),data={kind:'ai',settings};freshRound(data);const record={schema:1,room:id,version:0,expires:now()+lifetime,data};save(record);return view(record);},
  read(id){return view(readRecord(id));},
  // Legacy GET responses do not contain takebacks. Start a new undo history at
  // the imported position, retaining the board, logs, round and helper usage.
  import(viewData){
   if(viewData.kind!=='ai'||viewData.seat!==0||!validId(viewData.room)||!Number.isFinite(viewData.expires)||viewData.expires<=now()||viewData.closed)fail('AI対局の保存データを読み込めません。');
   const data={kind:'ai',settings:normalizeSettings(viewData.settings),state:structuredClone(viewData.state),logs:[...viewData.logs],offer:viewData.offer??null,undoOffer:null,rematch:viewData.rematch??null,toss:structuredClone(viewData.toss),round:viewData.round||1,takebacks:[]};
   if(viewData.helperUsedRound!==undefined)data.helperUsedRound=viewData.helperUsedRound;
   const record={schema:1,room:viewData.room,version:viewData.version,expires:viewData.expires,data};save(record);return view(readRecord(record.room));
  },
  action(id,body){
   const record=readRecord(id),data=record.data,s=data.state,playingSide=data.toss.hostSide;
   if(!Number.isInteger(body.version)||body.version!==record.version)fail('盤面が更新されています。最新の盤面で操作してください。',409);
   if(body.action==='leave'){
    if(!s.result)s.result=`${sideName(1-playingSide)}の勝ち（投了）`;
    data.closed=true;data.offer=null;data.undoOffer=null;data.rematch=null;record.version++;save(record);const final=view(record);remove(id);return final;
   }
   if(['offer-undo','accept-undo','decline-undo'].includes(body.action)){
    if(body.action==='offer-undo')rewind(data,undoIndex(data));
    else if(body.action==='accept-undo')fail('相手の待った申請がありません。',409);
    else data.undoOffer=null;
   }else if(['offer-rematch','accept-rematch','decline-rematch'].includes(body.action)){
    if(!s.result)fail('再試合は対局終了後に申し込めます。',409);
    if(body.action==='offer-rematch')freshRound(data);
    else if(body.action==='accept-rematch')fail('相手からの再試合希望はありません。',409);
    else data.rematch=null;
   }else{
    if(s.result)fail('この対局は終了しています。',409);
    if(body.action==='ai-no-moves'){
     if(s.turn===playingSide)fail('AIの手番ではありません。',403);
     const sources=[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])];
     if(sources.some(src=>moves(s,src).length))fail('指せる手があります。');
     s.result=sideName(1-s.turn)+'の勝ち（指せる手なし）';
    }else if(['move','ai-move','helper-move'].includes(body.action)){
     if(body.action==='ai-move'){if(s.turn===playingSide)fail('AIの手番ではありません。',403);}
     else if(s.turn!==playingSide)fail('相手の手番です。',403);
     if(body.action==='helper-move'&&!data.settings.helperUnlimited&&data.helperUsedRound===(data.round||1))fail('オセショ様は1局に1回だけです。',403);
     const m=body.move;if(!m||!Number.isInteger(m.to)||m.to<0||m.to>80)fail('指せない手です。');
     let normalized;
     if(m.drop){if(!['R','B','G','S','N','L','P'].includes(m.drop))fail('指せない手です。');normalized={drop:m.drop,to:m.to};}
     else{if(!Number.isInteger(m.from)||m.from<0||m.from>80||typeof m.prom!=='boolean')fail('指せない手です。');normalized={from:m.from,to:m.to,prom:m.prom};}
     try{const next=collapseAfterMove(play(s,normalized));remember(data);data.logs.push(notation(s,normalized)+(next.flipped.length?` ／ ${next.flipped.length}枚反転`:'')+(next.destroyed?` ／ ${sideName(next.destroyed.piece.side)}の${label(next.destroyed.piece)}が崩壊`:next.spawned?` ／ ${sideName(next.spawned.piece.side)}の${label(next.spawned.piece)}が降臨`:''));data.state=next;if(body.action==='helper-move')data.helperUsedRound=data.round||1;data.offer=null;}catch{fail('指せない手です。');}
    }else if(body.action==='resign'){s.result=`${sideName(1-playingSide)}の勝ち（投了）`;data.offer=null;}
    else if(body.action==='offer-draw'){s.result='合意による引き分け';}
    else if(body.action==='accept-draw')fail('相手からの引き分け提案はありません。');
    else if(body.action==='decline-draw')data.offer=null;
    else fail('操作が正しくありません。');
   }
   record.version++;save(record);return view(record);
  }
 };
}
