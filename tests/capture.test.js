import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={addEventListener(){}};
const {capturedPiece,isImpactPiece,flipNeedsShake}=await import('../dist/combo.js');
test('大駒・成り駒・2枚以上の反転だけを揺らす',()=>{
 for(const type of ['R','B'])assert.equal(isImpactPiece({type}),true);
 for(const type of ['P','L','N','S'])assert.equal(isImpactPiece({type,prom:true}),true);
 assert.equal(isImpactPiece({type:'G'}),false);
 const s={board:[{type:'P'},{type:'G'}],flipped:[0]};assert.equal(flipNeedsShake(s),false);s.flipped=[0,1];assert.equal(flipNeedsShake(s),true);s.flipped=[0];s.board[0].prom=true;assert.equal(flipNeedsShake(s),true);
});
test('通常の駒取りを検出し、成り飛車も飛車の駒台へ送る',()=>{
 const before={ply:2,turn:0,board:Array(81).fill(null)};before.board[30]={type:'R',side:1,prom:true};
 const after={ply:3,last:[39,30],result:''};
 assert.deepEqual(capturedPiece(before,after),{type:'R',side:0,prom:true,square:30});
 assert.equal(capturedPiece(before,{...after,result:'先手の勝ち'}),null);
 assert.equal(capturedPiece(before,{...after,last:[30]}),null);
 assert.equal(capturedPiece(before,{...after,ply:4}),null);
 before.board[30]={type:'K',side:1};assert.equal(capturedPiece(before,after),null);
 before.board[30]=null;assert.equal(capturedPiece(before,after),null);
});
