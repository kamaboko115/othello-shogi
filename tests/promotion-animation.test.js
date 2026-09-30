import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={addEventListener(){}};
globalThis.matchMedia=()=>({matches:false});
const {runSlide,slidingMove,runSword}=await import('../dist/combo.js');

test('駒打ちは通常駒と大駒を分け、同じ局面の再受信では再生しない',()=>{
 const before={ply:8,board:Array(81).fill(null)};
 for(const type of ['P','G','R','B']){
  const after={ply:9,last:[40],board:[...before.board]};after.board[40]={type,side:0,prom:false};
  assert.deepEqual(slidingMove(before,after),{drop:true,to:40,major:['R','B'].includes(type)});
  assert.equal(slidingMove(after,after),null);
 }
});

test('剣の途中で閉じても演出が完了し装飾を片付ける',async()=>{
 let removed=0;const rect={left:0,top:0,width:40,height:40};
 globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){removed++;}})};
 const board={querySelector:()=>({getBoundingClientRect:()=>rect}),getBoundingClientRect:()=>rect,append(){}};
 const controller=new AbortController();const done=runSword(board,40,controller.signal);controller.abort();await done;assert.equal(removed,1);
});

test('駒打ちは通常リングと大駒の縦横衝撃波を使い分け、剣を出さない',async()=>{
 const rect={left:0,top:0,width:40,height:40};
 for(const major of [false,true]){
  const layers=[];let landed=0;
  globalThis.document={createElement:()=>({style:{},setAttribute(){},remove(){},animate(){return {finished:Promise.resolve(),cancel(){}};}})};
  const board={querySelector:()=>({getBoundingClientRect:()=>rect}),getBoundingClientRect:()=>rect,append(node){assert.equal(landed,1);layers.push(node);}};
  await runSlide({drop:true,to:40,major},board,new AbortController().signal,()=>landed++);
  assert.equal(landed,1);
  assert.deepEqual(layers.map(node=>node.className),major?['drop-ring major-drop-wave','drop-ring major-drop-wave',...Array(8).fill('major-drop-spark')]:['drop-ring']);
 }
});

test('成り演出はキャンセル済み移動の新しい完了Promiseを待たない',async()=>{
 let cancelledReads=0,removed=0;
 const rect={left:0,top:0,width:40,height:40};
 const node=()=>({style:{},classList:{contains:()=>false,toggle(){},remove(){}},textContent:'馬',setAttribute(){},remove(){removed++;},getBoundingClientRect:()=>rect,
  animate(){let cancelled=false;return {cancel(){cancelled=true;},get finished(){if(cancelled){cancelledReads++;return new Promise(()=>{});}return Promise.resolve();}};}});
 globalThis.document={createElement:node};
 for(const major of [true,false]){
  const piece=node(),cell={...node(),querySelector:()=>piece};
  const board={...node(),append(){},querySelector:()=>cell};
  let timer;
  try{await Promise.race([runSlide({from:40,to:31,major,rainbow:false,promoting:true,beforeLabel:'角'},board,new AbortController().signal),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('成り演出が停止')),2000);})]);}finally{clearTimeout(timer);}
  assert.equal(piece.textContent,'馬');
 }
 assert.equal(cancelledReads,0);assert.ok(removed>0);
});
