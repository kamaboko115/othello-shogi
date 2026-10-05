import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,raw,MAX_GAME_PLIES} from '../dist/engine.js';
import {evaluateAI} from '../dist/ai.js';
import {SearchPosition,searchMoveCodec,evaluateOsesho,chooseOsesho} from '../dist/osesho-ai.js';

test('winged king collision preserves noDrops in search and reversible state',()=>{
 for(const noDrops of [true,false]){
  const s=empty();Object.assign(s,{noDrops,moveLimit:false,paradoxAt:false});s.hands[0].G=1;
  for(const [i,type,side]of [[4,'K',1],[6,'B',0],[9,'S',0],[11,'P',0],[13,'K',0]])s.board[i]={type,side,prom:false,...(type==='K'?{wings:true}:{})};
  const m={from:13,to:4,prom:false},p=new SearchPosition(s),before=structuredClone(p),expected=new SearchPosition(raw(s,m));
  p.make(searchMoveCodec.encode(m));
  for(const field of ['board','hands','kings','hash','lock','turn','ply','wings'])assert.deepEqual(p[field],expected[field],field);
  p.unmake();for(const field of ['board','hands','kings','hash','lock','turn','ply','wings'])assert.deepEqual(p[field],before[field],field);
 }
});

test('both AI evaluators treat 1000 plies as draw while king capture retains priority',()=>{
 const s=empty();s.moveLimit=false;s.board[76]={type:'K',side:0};s.board[4]={type:'K',side:1};s.board[49]={type:'R',side:0,prom:true};
 s.ply=MAX_GAME_PLIES-1;assert.equal(new SearchPosition(s).terminal(),null);
 s.ply=MAX_GAME_PLIES;assert.equal(new SearchPosition(s).terminal(),0);assert.equal(evaluateAI(s,0),0);assert.equal(evaluateOsesho(s,0),0);assert.equal(chooseOsesho(s,10),null);
 s.board[4]=null;assert.ok(new SearchPosition(s).terminal()>900000);assert.ok(evaluateAI(s,0)>900000);assert.ok(evaluateOsesho(s,0)>900000);
});
