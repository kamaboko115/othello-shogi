import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,initial,moves,raw,safeArrivalSquares,collapseAfterMove} from '../dist/engine.js';
const arrival={type:'B',side:0,prom:true};
const piece=(type,side)=>({type,side,prom:false});
const oracle=(s,target)=>{
 const trial={...s,board:s.board.slice(),turn:1-arrival.side};trial.board[target]=arrival;
 const sources=[...trial.board.flatMap((p,i)=>p?.side===trial.turn?[i]:[]),...Object.keys(trial.hands[trial.turn])];
 return !sources.flatMap(src=>moves(trial,src)).some(m=>m.to===target||raw(trial,m).board[target]?.side!==arrival.side);
};
test('safe arrival rejects direct captures and moved-piece sandwiching, without mutating state',()=>{
 const s=empty();s.board[4]=piece('K',1);s.board[76]=piece('K',0);
 s.board[36]=piece('R',1);s.board[39]=piece('P',0);s.board[49]=piece('G',1);
 const before=structuredClone(s),safe=safeArrivalSquares(s,arrival);
 assert.ok(!safe.includes(37),'rook capture');assert.ok(!safe.includes(38),'gold can move 49→40 and sandwich with rook');
 for(let i=0;i<81;i++)if(!s.board[i])assert.equal(safe.includes(i),oracle(s,i),`square ${i}`);
 assert.deepEqual(s,before);
});
test('safe arrival includes hand drops as threats and respects disabled drops',()=>{
 const s=empty();s.board[4]=piece('K',1);s.board[76]=piece('K',0);s.board[36]=piece('P',1);s.hands[1]={G:1};
 assert.ok(!safeArrivalSquares(s,arrival).includes(37),'gold drop on 38 sandwiches new horse');
 s.noDrops=true;assert.ok(safeArrivalSquares(s,arrival).includes(37));
});
test('arrival uses safe pool on nine of ten preference rolls, both pieces promoted',()=>{
 const base=empty();base.ply=151;base.paradoxAt=150;base.board[4]=piece('K',1);base.board[76]=piece('K',0);base.board[36]=piece('R',1);
 for(const typeRoll of [0,1])for(let preference=0;preference<10;preference++){
  const s=structuredClone(base),p={type:typeRoll?'R':'B',side:0,prom:true},safe=safeArrivalSquares(s,p),all=s.board.flatMap((v,i)=>v?[]:[i]);
  const picks=[typeRoll,0,preference,0];collapseAfterMove(s,n=>{const x=picks.shift()??0;assert.ok(x>=0&&x<n);return x;},()=>true);
  assert.deepEqual(s.spawned.piece,p);assert.equal(s.spawned.square,(preference<9?safe:all)[0]);
 }
});
test('arrival falls back to empty squares when every empty square is capturable',()=>{
 const s=empty();s.ply=151;s.paradoxAt=150;
 s.board=s.board.map(()=>piece('R',1));s.board[40]=null;
 assert.deepEqual(safeArrivalSquares(s,arrival),[]);
 const picks=[0,0,0];collapseAfterMove(s,n=>picks.shift()%n,()=>true);
 assert.equal(s.spawned.square,40);assert.equal(s.spawned.piece.prom,true);assert.equal(s.destroyed,null);
});
test('safe arrival on crowded opening with every hand type matches next-move simulation',()=>{
 const s=initial();s.hands[1]={R:1,B:1,G:1,S:1,N:1,L:1,P:1};
 const safe=safeArrivalSquares(s,arrival);
 for(const i of [30,31,39,40,41,48,49,50])assert.equal(safe.includes(i),oracle(s,i));
});
