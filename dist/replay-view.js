import {validateReplay,unpackReplayState} from './replay-code.js';
import {label,arrivals} from './engine.js';

const maxBytes=2*1024*1024;
export function replayIndexAt(ratio,count){return Math.round(Math.max(0,Math.min(1,Number.isFinite(ratio)?ratio:0))*Math.max(0,count-1));}
async function readBounded(stream){
 const reader=stream.getReader(),parts=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('棋譜データが大きすぎます。');parts.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
}
export async function encodeReplayLink(record,base){
 const bytes=new TextEncoder().encode(JSON.stringify(validateReplay(record)));if(bytes.length>maxBytes)throw Error('棋譜データが大きすぎます。');
 const zipped=typeof CompressionStream==='function',data=zipped?await readBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))):bytes;
 let binary='';for(const n of data)binary+=String.fromCharCode(n);
 const url=new URL(base);url.search='';url.hash='replay='+(zipped?'z':'j')+btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
 if(url.href.length>64000)throw Error('共有URLが長すぎます。棋譜ファイルを保存して共有してください。');return url.href;
}
export async function decodeReplayLink(value){
 if(typeof value!=='string'||value.length>64000||! /^[zj][A-Za-z0-9_-]+$/.test(value))throw Error('棋譜リンクが正しくありません。');
 const data=Uint8Array.from(atob(value.slice(1).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const bytes=value[0]==='z'?await readBounded(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))):data;
 if(bytes.length>maxBytes)throw Error('棋譜データが大きすぎます。');return validateReplay(JSON.parse(new TextDecoder().decode(bytes)));
}
export function initReplayViewer(document,load){
 const $=id=>document.getElementById(id),dialog=$('replayDialog');let matchKey=null,record=null,index=0,task=null,generation=0,openGeneration=0,worker=null,sharedMode=false,scores=null,graphSlider=null,graphCursor=null,resultVisible=false,resultAttempted=false,wasEnded=false;
 async function getRecord(){
  if(record)return record;const current=generation;
  task||=Promise.resolve().then(load).then(validateReplay);
  const next=await task;if(current!==generation)return null;record=next;return record;
 }
 function paintCursor(){
  if(!graphSlider||!record)return;
  const x=index*600/Math.max(1,record.frames.length-1);
  graphCursor.setAttribute('x1',x);graphCursor.setAttribute('x2',x);
  graphSlider.setAttribute('aria-valuenow',record.frames[index].p);
  graphSlider.setAttribute('aria-valuetext',record.frames[index].p+'手目、評価 '+Math.round(scores[index]));
 }
 function paint(){
  if(!record)return;const frame=record.frames[index],state=unpackReplayState(frame),board=$('replayBoard');board.replaceChildren();
  state.board.forEach((p,i)=>{const cell=document.createElement('div');cell.className='cell'+(state.last.includes(i)?' last':'')+(state.flipped.includes(i)||state.paradoxEvent?.squares?.includes(i)?' replay-flipped':'')+(frame.d===i||['annihilate','thunder','wind'].includes(state.paradoxEvent?.kind)&&state.paradoxEvent.pieces.some(d=>d.square===i)?' replay-destroyed':'')+(arrivals(state).some(d=>d.square===i)||state.paradoxEvent?.moves?.some(m=>m.to===i)?' replay-spawned':'');cell.setAttribute('aria-label',(9-i%9)+'列'+(Math.floor(i/9)+1)+'段 '+(p?(p.side?'後手 ':'先手 ')+label(p):'空き'));
   if(p){const piece=document.createElement('span');piece.className='piece'+(p.side?' enemy':'')+(p.prom?' prom':'')+(p.wings?' has-wings':'')+(label(p).length>1?' long':'');piece.dataset.side=p.side;piece.textContent=label(p);cell.append(piece);}board.append(cell);
  });
  for(const side of [0,1])$('replayHand'+side).textContent=(side?'後手':'先手')+'の持ち駒：'+Object.entries(state.hands[side]).filter(([,n])=>n).map(([type,n])=>label({type,prom:false})+'×'+n).join(' ');
  $('replayPly').textContent=frame.p+'手目 / '+record.frames.at(-1).p+'手'+(record.frames[0].p?'（途中からの記録）':'');
  $('replayLine').textContent=index===0?'記録の開始局面':record.logs[frame.p-1]||'';
  $('replayResult').textContent=index===record.frames.length-1?record.result:'';
  $('replaySlider').max=record.frames.length-1;$('replaySlider').value=index;
  $('replayFirst').disabled=$('replayPrevious').disabled=index===0;$('replayLast').disabled=$('replayNext').disabled=index===record.frames.length-1;
  paintCursor();
 }
 async function open(){
  const current=++openGeneration;dialog.showModal();$('replayStatus').textContent='棋譜を読み込んでいます…';
  try{if(!await getRecord()||openGeneration!==current||!dialog.open)return;index=record.frames.length-1;paint();if(scores)showGraph();else evaluate();}catch(error){if(openGeneration===current){$('replayStatus').textContent=error.message;task=null;}}
 }
 $('openReplay').addEventListener('click',open);$('closeReplay').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{openGeneration++;if(!resultVisible){worker?.terminate();worker=null;}$('replayEvaluate').disabled=false;});
 for(const [id,where]of [['replayFirst',()=>0],['replayPrevious',()=>index-1],['replayNext',()=>index+1],['replayLast',()=>record.frames.length-1]])$(id).onclick=()=>{if(!record)return;index=Math.max(0,Math.min(record.frames.length-1,where()));paint();};
 $('replaySlider').oninput=()=>{if(record){index=Number($('replaySlider').value);paint();}};
 async function shareURL(){if(!record)throw Error('棋譜を読み込んでください。');const link=await encodeReplayLink(record,new URL('/',document.defaultView.location.href));$('replayLink').value=link;$('replayShareBox').hidden=false;return link;}
 $('replayShare').onclick=async()=>{try{const url=await shareURL();try{await document.defaultView.navigator.clipboard.writeText(url);$('replayStatus').textContent='共有URLをコピーしました。';}catch{$('replayLink').focus();$('replayLink').select();$('replayStatus').textContent='共有URLを選択しました。コピーしてください。';}}catch(error){$('replayStatus').textContent=error.message;}};
 $('replayTwitter').onclick=async()=>{try{const url=await shareURL();document.defaultView.open('https://twitter.com/intent/tweet?'+new URLSearchParams({text:'オセロ将棋の対局を振り返る',url}),'_blank','noopener,noreferrer');}catch(error){$('replayStatus').textContent=error.message;}};
 $('replayDownload').onclick=()=>{if(!record)return;const url=URL.createObjectURL(new Blob([JSON.stringify(record)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='othello-shogi-replay.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function evaluationPlot(){
   const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 160');
   const line=document.createElementNS(ns,'line');for(const [key,val]of Object.entries({x1:0,x2:600,y1:80,y2:80,stroke:'currentColor','stroke-opacity':'.3'}))line.setAttribute(key,val);svg.append(line);
   const path=document.createElementNS(ns,'polyline');path.setAttribute('points',scores.map((n,i)=>i*600/Math.max(1,scores.length-1)+','+(80-70*Math.tanh(n/1800))).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','var(--replay-accent,#39a17a)');path.setAttribute('stroke-width','3');svg.append(path);
   return svg;
 }
 function showResultGraph(){
  if(!resultVisible||!record||!scores)return;
  const svg=evaluationPlot();svg.setAttribute('role','img');svg.setAttribute('aria-label','評価値の推移。上が先手有利、下が後手有利。');
  $('resultEvaluationGraph').replaceChildren(svg);$('resultEvaluationGraph').hidden=false;
  $('resultEvaluationRange').textContent=record.frames[0].p+'手目 → '+record.frames.at(-1).p+'手目';
  $('resultEvaluationStatus').textContent='オセショ様の局面評価（探索なし・目安）。上が先手有利、下が後手有利。';
  $('resultEvaluationRetry').hidden=true;
 }
 async function showResult(){
  const current=generation;resultAttempted=true;$('resultEvaluationStatus').textContent='評価値を読み込んでいます…';$('resultEvaluationRetry').hidden=true;
  try{if(!await getRecord()||current!==generation||!resultVisible)return;if(scores)showResultGraph();else evaluate();}
  catch{if(current===generation&&resultVisible){task=null;$('resultEvaluationStatus').textContent='評価値を読み込めませんでした。';$('resultEvaluationRetry').hidden=false;}}
 }
 $('resultEvaluationRetry').onclick=()=>showResult();
 function showGraph(){
   const graph=$('replayGraph');graph.replaceChildren();
   const ns='http://www.w3.org/2000/svg',svg=evaluationPlot();svg.setAttribute('role','slider');svg.setAttribute('tabindex','0');svg.setAttribute('aria-label','局面評価グラフ。押すとその手へ移動。左右キーでも移動できます');svg.setAttribute('aria-valuemin',record.frames[0].p);svg.setAttribute('aria-valuemax',record.frames.at(-1).p);svg.setAttribute('aria-controls','replayBoard');
   graphCursor=document.createElementNS(ns,'line');for(const [key,val]of Object.entries({y1:0,y2:160,stroke:'currentColor','stroke-width':2,'stroke-dasharray':'4 4'}))graphCursor.setAttribute(key,val);svg.append(graphCursor);graphSlider=svg;
   svg.onclick=event=>{const rect=svg.getBoundingClientRect();if(!rect.width)return;index=replayIndexAt((event.clientX-rect.left)/rect.width,record.frames.length);paint();};
   svg.onkeydown=event=>{const next={ArrowLeft:index-1,ArrowRight:index+1,Home:0,End:record.frames.length-1}[event.key];if(next===undefined)return;event.preventDefault();index=Math.max(0,Math.min(record.frames.length-1,next));paint();};
   graph.append(svg);graph.hidden=false;paintCursor();$('replayStatus').textContent='オセショ様の局面評価（探索なし・目安）。上が先手有利、下が後手有利。グラフを押すとその手へ移動できます。';
 }
 function evaluate(){
  if(!record||worker)return;
  $('replayEvaluate').disabled=true;$('replayStatus').textContent='端末内で局面を評価しています…';
  if(resultVisible)$('resultEvaluationStatus').textContent='端末内で局面を評価しています…';
  const fail=()=>{$('replayEvaluate').disabled=false;$('replayStatus').textContent='評価を読み込めませんでした。棋譜の再生は利用できます。';if(resultVisible){$('resultEvaluationStatus').textContent='評価値を読み込めませんでした。';$('resultEvaluationRetry').hidden=false;}};
  try{
   const job=new (document.defaultView.Worker??globalThis.Worker)(new URL('./replay-worker.js',import.meta.url),{type:'module'});worker=job;
   job.onmessage=({data})=>{if(worker!==job)return;job.terminate();worker=null;$('replayEvaluate').disabled=false;if(!Array.isArray(data)||data.length!==record.frames.length||data.some(n=>!Number.isFinite(n))){fail();return;}scores=data;if(dialog.open)showGraph();showResultGraph();};
   job.onerror=()=>{if(worker!==job)return;job.terminate();worker=null;fail();};job.postMessage(record);
  }catch{worker?.terminate();worker=null;fail();}
 }
 $('replayEvaluate').onclick=()=>{if(scores)showGraph();else evaluate();};
 const shared=new URLSearchParams(document.defaultView.location.hash.slice(1)).get('replay');
 if(shared){sharedMode=true;task=decodeReplayLink(shared);queueMicrotask(open);}
 return {update(key,ended,showOnResult=false){
  const wasResultVisible=resultVisible;
  $('openReplay').hidden=!ended;resultVisible=!!key&&ended&&showOnResult;$('resultEvaluation').hidden=!resultVisible;
  if(key!==matchKey||(wasEnded&&!ended)){
   matchKey=key;if(key)sharedMode=false;
   if(!sharedMode){generation++;openGeneration++;worker?.terminate();worker=null;record=null;task=null;scores=null;resultAttempted=false;graphSlider=null;graphCursor=null;if(dialog.open)dialog.close();$('replayBoard').replaceChildren();for(const id of ['replayPly','replayHand0','replayHand1','replayLine','replayResult','replayStatus','resultEvaluationStatus','resultEvaluationRange'])$(id).textContent='';$('replayGraph').replaceChildren();$('replayGraph').hidden=true;$('replayShareBox').hidden=true;$('resultEvaluationGraph').replaceChildren();$('resultEvaluationGraph').hidden=true;$('resultEvaluationRetry').hidden=true;}
  }
  wasEnded=ended;
  if(resultVisible&&(!resultAttempted||!wasResultVisible))return showResult();
 }};
}
