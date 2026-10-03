import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,initial,movementTargets,moves} from '../dist/engine.js';

test('相手番でない駒も向きを保って確認でき、局面や通常の合法手は変更しない',()=>{
 const s=initial(true),before=structuredClone(s);
 assert.deepEqual(movementTargets(s,18),[27]);
 assert.deepEqual(moves(s,18),[]);
 assert.deepEqual(s,before);
 s.turn=1;assert.deepEqual(movementTargets(s,54),[45]);
});

test('飛車の確認範囲は味方で止まり、敵のいるマスまで届く',()=>{
 const s=empty(true);
 s.board[40]={type:'R',side:1,prom:false};
 s.board[22]={type:'P',side:1,prom:false};
 s.board[58]={type:'P',side:0,prom:false};
 const targets=movementTargets(s,40);
 assert(targets.includes(31));assert(!targets.includes(22));assert(!targets.includes(13));
 assert(targets.includes(49));assert(targets.includes(58));assert(!targets.includes(67));
});

test('龍・馬の追加の動きを表示し、成りの選択で同じ移動先を重複させない',()=>{
 const s=empty(true);
 s.board[40]={type:'R',side:1,prom:true};assert(movementTargets(s,40).includes(30));
 s.board[40]={type:'B',side:1,prom:true};assert(movementTargets(s,40).includes(31));
 s.board[40]=null;s.board[49]={type:'P',side:1,prom:false};
 assert.equal(moves({...s,turn:1},49).filter(m=>m.to===58).length,2);
 assert.deepEqual(movementTargets(s,49),[58]);
});

test('盤外・空きマス・持ち駒を確認しようとしても移動先を返さない',()=>{
 const s=empty(true);
 for(const source of [-1,81,1.5,null,'P',40])assert.deepEqual(movementTargets(s,source),[]);
});
