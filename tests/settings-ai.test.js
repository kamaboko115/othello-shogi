import test from 'node:test';import assert from 'node:assert/strict';
import {initial,empty,moves,play,points} from '../dist/engine.js';import {chooseAI} from '../worker/ai.js';import {api} from '../worker/api.js';import {localDB} from '../worker/local-db.js';
const host='a'.repeat(64),invite='b'.repeat(64),guest='c'.repeat(64);
async function call(db,path='',body,token=host){const r=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});return {status:r.status,data:await r.json()};}
test('持ち駒禁止は打ち手を生成せずサーバー共通エンジンで拒否',()=>{const s=initial();s.hands[0].G=1;s.noDrops=true;assert.deepEqual(moves(s,'G'),[]);assert.throws(()=>play(s,{drop:'G',to:40}));assert.ok(moves(s,54).length);});
test('60手判定なしは60手を越えて続行する',()=>{let s=initial();s.moveLimit=false;s.ply=59;s=play(s,{from:54,to:45,prom:false});assert.equal(s.ply,60);assert.equal(s.result,'');});
test('AIは王取りを選び、反転勝利も認識する',()=>{const s=empty();s.board[76]={type:'K',side:0};s.board[4]={type:'K',side:1};s.board[13]={type:'R',side:0};let m=chooseAI(s);assert.equal(m.to,4);assert.match(play(s,m).result,/先手の勝ち/);s.board[4]=null;s.board[13]=null;s.board[39]={type:'K',side:1};s.board[38]={type:'P',side:0};s.hands[0].G=1;m=chooseAI(s);assert.match(play(s,m).result,/王を反転/);});
test('AI対局開始・AI着手・再接続・再試合時に設定を維持',async()=>{const db=localDB();try{let r=await call(db,'',{invite,kind:'ai',settings:{moveLimit:false,noDrops:true}});assert.equal(r.status,201);let d=r.data;assert.equal(d.joined,true);assert.equal(d.state.moveLimit,false);assert.equal(d.state.noDrops,true);const path='/'+d.room;if(d.side===0){const m=chooseAI(d.state);r=await call(db,path+'/action',{action:'move',move:m,version:d.version});assert.equal(r.status,200);d=r.data;}r=await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version});assert.equal(r.status,200);d=r.data;assert.equal(d.state.turn,d.side);assert.ok(d.state.ply>0);d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;assert.equal(d.state.ply,0);assert.equal(d.round,2);assert.equal(d.state.noDrops,true);assert.equal(d.state.moveLimit,false);}finally{db.close();}});
test('招待先はサーバーの設定を参加前に取得できる',async()=>{const db=localDB();try{const d=(await call(db,'',{invite,settings:{noDrops:true,moveLimit:false}})).data;const p=await call(db,'/'+d.room+'/preview',{invite},guest);assert.deepEqual(p.data.settings,{noDrops:true,moveLimit:false,paradoxAt:150,timeControl:"none",handicap:"none"});assert.equal((await call(db,'/'+d.room+'/preview',{invite:guest},guest)).status,403);const j=(await call(db,'/'+d.room+'/join',{invite},guest)).data;assert.equal(j.state.noDrops,true);}finally{db.close();}});

test('対人の待ったは相手の承諾が必要・2手戻し・再試合で履歴消去',async()=>{const db=localDB();try{let d=(await call(db,'',{invite})).data;const path='/'+d.room;let j=(await call(db,path+'/join',{invite},guest)).data;const first=j.side===0?guest:host,second=first===host?guest:host;let a=(await call(db,path+'/action',{action:'move',version:j.version,move:{from:54,to:45,prom:false}},first)).data;let b=(await call(db,path+'/action',{action:'move',version:a.version,move:{from:18,to:27,prom:false}},second)).data;let offer=(await call(db,path+'/action',{action:'offer-undo',version:b.version},first)).data;assert.equal(offer.state.ply,2);assert.equal(offer.undoOffer.ply,0);assert.equal((await call(db,path+'/action',{action:'accept-undo',version:offer.version},first)).status,409);let back=(await call(db,path+'/action',{action:'accept-undo',version:offer.version},second)).data;assert.equal(back.state.ply,0);assert.equal(back.state.board[54].type,'P');assert.equal(back.state.board[18].type,'P');assert.deepEqual(back.logs,[]);assert.equal(back.canUndo,false);assert.ok(!('takebacks' in back));assert.equal((await call(db,path+'/action',{action:'accept-undo',version:offer.version},second)).status,409);}finally{db.close();}});
test('AIの待ったは自分の手とAIの応手を戻し、再接続でも維持',async()=>{const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai'})).data;const path='/'+d.room;if(d.state.turn!==d.side)d=(await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).data;const baseline=d.state.ply;const m=chooseAI(d.state);d=(await call(db,path+'/action',{action:'move',version:d.version,move:m})).data;d=(await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).data;assert.equal(d.state.ply,baseline+2);d=(await call(db,path+'/action',{action:'offer-undo',version:d.version})).data;assert.equal(d.state.ply,baseline);assert.equal(d.state.turn,d.side);assert.equal((await call(db,path)).data.state.ply,baseline);}finally{db.close();}});
test('AI4段階が合法手を返し、強さ設定を再試合でも保持',async()=>{for(const level of ['weak','normal','strong','expert']){const state=initial();const move=chooseAI(state,level);assert.doesNotThrow(()=>play(state,move));const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai',settings:{aiLevel:level}})).data;assert.equal(d.settings.aiLevel,level);const path='/'+d.room;d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;assert.equal(d.settings.aiLevel,level);}finally{db.close();}}});
test('開発者向けオセショ様難易度を保持し、振り駒介入を含め必ず先手になる',async()=>{const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai',settings:{aiLevel:'osesho',thinkMs:5000}})).data;assert.equal(d.settings.aiLevel,'osesho');assert.equal(d.settings.thinkMs,5000);assert.equal(d.toss.hostSide,1);const path='/'+d.room;assert.equal((await call(db,path)).data.settings.aiLevel,'osesho');d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;assert.equal(d.settings.aiLevel,'osesho');assert.equal(d.toss.hostSide,1);}finally{db.close();}});

test('AI GET is read-only; AI moves require AI turn and legal move; stale results rejected',async()=>{
 const db=localDB();try{
  let d=(await call(db,'',{invite,kind:'ai',settings:{aiLevel:'expert',thinkMs:5000}})).data;
  const path='/'+d.room;
  const read=(await call(db,path)).data;assert.equal(read.version,d.version);assert.equal(read.state.ply,0);
  if(d.state.turn===d.side){
   assert.equal((await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).status,403);
   d=(await call(db,path+'/action',{action:'move',move:chooseAI(d.state),version:d.version})).data;
  }
  assert.equal((await call(db,path+'/action',{action:'ai-no-moves',version:d.version})).status,400);
  assert.equal((await call(db,path+'/action',{action:'ai-move',move:{from:0,to:80,prom:false},version:d.version})).status,400);
  const stale={action:'ai-move',move:chooseAI(d.state),version:d.version};
  const moved=await call(db,path+'/action',stale);assert.equal(moved.status,200);assert.equal(moved.data.state.ply,d.state.ply+1);
  assert.equal((await call(db,path+'/action',stale)).status,409);
 }finally{db.close();}
});
test('friend rooms reject client AI moves',async()=>{
 const db=localDB();try{
  let d=(await call(db,'',{invite})).data;const path='/'+d.room;
  d=(await call(db,path+'/join',{invite},guest)).data;
  assert.equal((await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).status,403);
 }finally{db.close();}
});


test('崩壊設定の検証・双方同期・再取得で再抽選しない・待った復元',async()=>{const db=localDB();try{
 assert.equal((await call(db,'',{invite,settings:{paradoxAt:0}})).status,400);
 const d=(await call(db,'',{invite,settings:{paradoxAt:1,moveLimit:false}})).data,path='/'+d.room;
 const j=(await call(db,path+'/join',{invite},guest)).data;const first=j.side===0?guest:host,second=first===host?guest:host;
 const a=(await call(db,path+'/action',{action:'move',version:j.version,move:{from:54,to:45,prom:false}},first)).data;
 assert.equal(a.state.board.filter(Boolean).length,39);assert.ok([0,1].includes(a.state.destroyed.piece.side));assert.equal(a.state.paradoxStarted,true);
 const b=(await call(db,path,undefined,second)).data;assert.deepEqual(b.state,a.state);
 const repeat=await call(db,path+'/action',{action:'move',version:j.version,move:{from:54,to:45,prom:false}},first);assert.equal(repeat.status,409);
 const offer=(await call(db,path+'/action',{action:'offer-undo',version:a.version},first)).data;
 const back=(await call(db,path+'/action',{action:'accept-undo',version:offer.version},second)).data;assert.equal(back.state.board.filter(Boolean).length,40);assert.equal(back.state.ply,0);assert.equal(back.state.paradoxAt,1);
 }finally{db.close();}});

test('盤面崩壊なしは作成・招待・再試合で維持される',async()=>{const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai',settings:{paradoxAt:false,moveLimit:false,noDrops:true}})).data;assert.equal(d.state.paradoxAt,false);const path='/'+d.room;const preview=(await call(db,path+'/preview',{invite},guest)).data;assert.equal(preview.settings.paradoxAt,false);assert.equal(preview.settings.noDrops,true);d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;assert.equal(d.state.paradoxAt,false);assert.equal(d.state.noDrops,true);}finally{db.close();}});

test('オセショ様は1局1回・待ったと再接続で復活せず再試合では使用可能',async()=>{const db=localDB();try{
 let d=(await call(db,'',{invite,kind:'ai'})).data;const path='/'+d.room;
 const ownTurn=async()=>{if(d.state.turn!==d.side)d=(await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).data;};
 await ownTurn();let r=await call(db,path+'/action',{action:'helper-move',move:chooseAI(d.state),version:d.version});assert.equal(r.status,200);d=r.data;assert.equal(d.helperUsedRound,1);
 d=(await call(db,path+'/action',{action:'offer-undo',version:d.version})).data;
 d=(await call(db,path)).data;assert.equal(d.helperUsedRound,1);
 assert.equal((await call(db,path+'/action',{action:'helper-move',move:chooseAI(d.state),version:d.version})).status,403);
 d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;
 await ownTurn();r=await call(db,path+'/action',{action:'helper-move',move:chooseAI(d.state),version:d.version});assert.equal(r.status,200);assert.equal(r.data.helperUsedRound,2);
 }finally{db.close();}});
test('AI駒落ちは指定側だけに適用し再試合でも保持',async()=>{for(const target of ['ai','human']){const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai',settings:{handicap:'two',handicapSide:target}})).data;const check=()=>{const dropped=target==='human'?d.side:1-d.side;assert.equal(d.state.board.filter(p=>p?.side===dropped).length,18);assert.equal(d.state.board.filter(p=>p?.side===1-dropped).length,20);};check();const path='/'+d.room;d=(await call(db,path+'/action',{action:'resign',version:d.version})).data;d=(await call(db,path+'/action',{action:'offer-rematch',version:d.version})).data;check();}finally{db.close();}}});
test('オセショ様の無限設定は同一対局で繰り返し使える',async()=>{const db=localDB();try{let d=(await call(db,'',{invite,kind:'ai',settings:{helperUnlimited:true}})).data;const path='/'+d.room;for(let i=0;i<2;i++){if(d.state.turn!==d.side)d=(await call(db,path+'/action',{action:'ai-move',move:chooseAI(d.state),version:d.version})).data;const r=await call(db,path+'/action',{action:'helper-move',move:chooseAI(d.state),version:d.version});assert.equal(r.status,200);d=r.data;}assert.equal((await call(db,path)).data.settings.helperUnlimited,true);}finally{db.close();}});
