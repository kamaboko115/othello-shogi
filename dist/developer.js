import {paradoxSound} from './paradox.js';
import {encodeBoard,decodeBoard} from './board-code.js';
import {initial,empty,moves,play,label,collapseAfterMove} from './engine.js';
import {runCombo,comboTier,decorateFinish,capturedPiece,runCapture,flipNeedsShake,slidingMove,runSlide,runSword} from './combo.js';
import {moveEffects,runEffects,showVictory} from './move-effect.js';
import {playMoveSound,playMultiFlipSound,playVictorySound,playApplauseSound,playArcadeCue} from './sound.js';
export function initDeveloper(getCurrent){
 const $=id=>document.getElementById(id);let state=initial(),selected=null,working=false,controller=null,history=[],tutorial=false,lesson=0;
 for(const side of [1,0]){const tray=document.createElement('div');tray.id='devHand'+side;tray.className='dev-capture-hand';tray.setAttribute('aria-label',side?'相手の駒台':'自分の駒台');$('devBoard').insertAdjacentElement(side?'beforebegin':'afterend',tray);}
 const six=document.createElement('option');six.value='6';six.textContent='6枚';$('devDemoCount').append(six);
 const swordPreview=document.createElement('button');swordPreview.textContent='剣の演出を試す';$('devDemo').after(swordPreview);
 swordPreview.onclick=async()=>{if(working)return;controller?.abort();controller=new AbortController();const current=controller;working=true;draw();try{await runSword($('devBoard'),40,current.signal);}finally{if(controller===current){working=false;draw();}}};
 state.moveLimit=false;state.paradoxAt=false;
 const copyCurrent=()=>{const current=getCurrent(),s=structuredClone(current.state);if(current.side===1){s.board.reverse();s.board.forEach(p=>{if(p)p.side=1-p.side;});s.hands.reverse();s.turn=1-s.turn;}return s;};
 const reset=(s,remember=true)=>{if(remember)history.push(structuredClone(state));controller?.abort();working=false;state=structuredClone(s);state.result='';state.flipped=[];state.last=[];state.moveLimit=false;state.paradoxAt=tutorial&&lesson===3?150:false;selected=null;$('devTurn').value=String(state.turn);draw();};
 function draw(){
  document.querySelectorAll('#developerDialog select,#developerDialog input,.dev-buttons button').forEach(el=>el.disabled=working);
  $('devUndo').disabled=working||!history.length;
  for(const side of [0,1]){const tray=$('devHand'+side);tray.replaceChildren();for(const type of ['R','B','G','S','N','L','P']){const slot=document.createElement('span');slot.dataset.type=type;slot.textContent=label({type,prom:false})+' ×'+(state.hands[side][type]||0);tray.append(slot);}}
  $('lessonProgress').hidden=!tutorial||lesson!==3;$('lessonProgress').textContent='終末まで '+state.ply+'/150';
  const board=$('devBoard');board.replaceChildren();const legal=selected===null?[]:moves(state,selected);
  for(let i=0;i<81;i++){const b=document.createElement('button'),p=state.board[i];b.className='cell'+(i===selected?' selected':'')+(legal.some(m=>m.to===i)?' legal':'');if(tutorial&&!working&&i===[49,58,49,58][lesson]&&state.ply===(lesson===3?149:0))b.classList.add('tutorial-hint');b.dataset.square=i;b.disabled=working;b.setAttribute('aria-label',(9-i%9)+'列'+(Math.floor(i/9)+1)+'段 '+(p?(p.side?'相手 ':'自分 ')+label(p):'空き'));if(p){const el=document.createElement('span');el.className='piece'+((working&&state.flipped.includes(i)?1-p.side:p.side)?' enemy':'')+(p.prom?' prom':'');el.textContent=label(p);b.append(el);}b.onclick=()=>click(i);board.append(b);}
 }
 async function click(i){
  if(working)return;
  if($('devMode').value==='edit'){history.push(structuredClone(state));const type=$('devPiece').value;state.board[i]=type==='erase'?null:{type,side:Number($('devSide').value),prom:$('devPromoted').checked&&['P','L','N','S','B','R'].includes(type)};state.result='';selected=null;draw();return;}
  if(state.result){$('devStatus').textContent=tutorial?'「もう一度」で練習できます。':'手番を選び直すと続けられます。';return;}
  const options=selected===null?[]:moves(state,selected).filter(m=>m.to===i);
  if(!options.length){selected=state.board[i]?.side===state.turn?i:null;draw();return;}
  history.push(structuredClone(state));const before=state,mover=state.turn;state=play(state,options.find(m=>!m.prom)||options[0]);const slide=slidingMove(before,state),capture=capturedPiece(before,state),effects=moveEffects(state).filter(e=>!(tutorial&&e.kind==='check'&&before.board[state.last.at(-1)]?.type==='K'&&before.board[state.last.at(-1)]?.side!==mover));state.turn=mover;selected=null;working=true;draw();controller=new AbortController();const current=controller;
  if(!before.board[state.last[0]]?.prom&&state.board[state.last[1]]?.prom&&!state.result)playArcadeCue('promote');
  if(slide)await runSlide(slide,$('devBoard'),current.signal,playMoveSound);
  if(current.signal.aborted)return;
  if(capture)await runCapture(capture,current.signal,{moveSound:!slide,shake:!flipNeedsShake(state),board:$('devBoard'),hand:$('devHand'+mover),overlay:$('developerDialog')});
  if(current.signal.aborted)return;
  if(state.flipped.length>=1)await runCombo(state,$('devBoard'),0,current.signal);
  else if(!slide&&!capture&&!state.result)playMoveSound();
  if(current.signal.aborted)return;
  if(tutorial&&lesson===3){
   state.turn=1-mover;collapseAfterMove(state);state.turn=mover;
   if(state.destroyed){
    const wait=ms=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);current.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);current.signal.addEventListener('abort',done,{once:true});if(current.signal.aborted)done();});
    const note=document.createElement('div');note.className='tutorial-collapse-note';note.textContent=state.paradoxStarted?'オセロ将棋パラドックスにより、盤面が崩れてゆく！':'両陣営からランダムに1枚壊れます';$('devBoard').append(note);
    try{
     if(state.paradoxStarted){paradoxSound(true);await wait(3000);}
     if(current.signal.aborted)return;
     const cell=$('devBoard').querySelector('[data-square="'+state.destroyed.square+'"] .piece');paradoxSound(false);
     const animation=cell?.animate([{opacity:1,transform:'scale(1)'},{opacity:.7,transform:'scale(1.25) rotate(12deg)'},{opacity:0,transform:'scale(.1) rotate(-20deg)'}],{duration:600,fill:'forwards'});
     try{await wait(600);}finally{animation?.cancel();}
     effects.splice(0,effects.length,...moveEffects(state));
    }finally{note.remove();}
   }
  }
  if(current.signal.aborted)return;
  let banner=null,clearFinish=null;
  await runEffects(effects,{signal:current.signal,applause:playApplauseSound,victory:()=>{if(effects[0]?.text.startsWith('先手'))playVictorySound();},hide:()=>{clearFinish?.();clearFinish=null;banner?.remove();banner=null;},show:effect=>{if(effect.kind==='check')playArcadeCue('check');if(effect.kind==='victory'){banner=showVictory(effect,0,$('developerDialog'));return;}banner=document.createElement('div');banner.className='combo-notice dev-finish '+(effect.kind==='flip'?comboTier(state.flipped.length):'');banner.textContent=effect.text;$('devStatus').textContent=effect.text;$('devBoard').append(banner);if(effect.kind==='flip')clearFinish=decorateFinish(banner,state.flipped.length);}});
  if(current.signal.aborted)return;
  $('devStatus').textContent=effects.filter(effect=>effect.text).at(-1)?.text||(state.turn?'相手':'自分')+'の手番';
  working=false;$('devTurn').value=String(state.turn);draw();
 }
 $('openDeveloper').onclick=()=>{tutorial=false;$('developerDialog').classList.remove('tutorial-mode');$('tutorialLesson').hidden=true;$('settingsDialog').close();history=[];reset(copyCurrent(),false);$('devTransfer').hidden=true;$('devStatus').textContent='練習専用の盤面です。配置・陣営・成りを自由に変更できます。';$('developerDialog').showModal();};
 $('closeDeveloper').onclick=()=>$('developerDialog').close();
 $('developerDialog').addEventListener('close',()=>{controller?.abort();working=false;});
 $('devCopy').onclick=()=>reset(copyCurrent());$('devInitial').onclick=()=>reset(initial());$('devClear').onclick=()=>reset(empty());
 $('devTurn').onchange=()=>{if(working)return;history.push(structuredClone(state));state.turn=Number($('devTurn').value);state.result='';selected=null;draw();};
 $('devUndo').onclick=()=>{if(working||!history.length)return;const previous=history.pop();reset(previous,false);$('devStatus').textContent='1手戻しました。';};
 $('devExport').onclick=async()=>{const code=encodeBoard(state);$('devTransfer').hidden=false;$('devCode').value=code;try{await navigator.clipboard.writeText(code);$('devStatus').textContent='盤面をコピーしました。ペーストで復元できます。';}catch{$('devCode').focus();$('devCode').select();$('devStatus').textContent='盤面データを選択しました。コピーして保存できます。';}};
 $('devPaste').onclick=async()=>{$('devTransfer').hidden=false;try{$('devCode').value=await navigator.clipboard.readText();}catch{$('devCode').value='';}$('devCode').focus();$('devStatus').textContent='貼り付けた内容を「この盤面を読み込む」で反映します。';};
 $('devImport').onclick=()=>{if(working)return;try{const next=decodeBoard($('devCode').value);reset(next);$('devStatus').textContent='盤面を読み込みました。';}catch(e){$('devStatus').textContent=e.message;}};
 $('devMode').onchange=()=>{selected=null;draw();};
 $('devDemo').onclick=()=>{const s=empty(),count=Number($('devDemoCount').value),to=37+count,from=to+9;for(const [i,type,side] of [[76,'K',0],[4,'K',1],[36,'P',0],[from,'P',0]])s.board[i]={type,side,prom:false};const types=['P','N','S','G','B','R'].slice(-count);types.forEach((type,j)=>s.board[37+j]={type,side:1,prom:false});reset(s);$('devMode').value='play';$('devStatus').textContent=(9-from%9)+'列6段の歩を1マス上へ動かすと'+count+'枚反転します。';};
 const lessons=[
  ['挟んで味方にしよう','5列6段の歩を1マス上へ。歩・金・銀を挟むと、その場で味方に変わります。'],
  ['王を取ってみよう','5列7段の飛車を、5列4段の王まで動かして取ってみましょう。王を取ると勝利です。「もう一度」で繰り返せます。'],
  ['王も挟める！','5列6段の歩を1マス上へ。王と金を挟んで、王ごと味方にしましょう。'],
  ['盤面崩壊（終末）','149手目から開始です。光る飛車を1マス前へ動かして、150手目の崩壊を体験しましょう。設定した手数になると、味方・敵の両方からランダムに1枚壊れます。王も対象です。長引く対局を終わらせるためのルールです。上手い人には不要な場合もあるので、上級者は対局前に「盤面崩壊：無制限」を選んでオフにするのがお勧めです。']
 ];
 function loadLesson(){
  const s=empty();s.mode=true;s.board[76]={type:'K',side:0,prom:false};
  const put=(i,type,side)=>s.board[i]={type,side,prom:false};
  if(lesson===0){put(36,'P',0);put(49,'P',0);put(37,'P',1);put(38,'G',1);put(39,'S',1);put(4,'K',1);}
  else if(lesson===2){put(37,'P',0);put(49,'P',0);put(38,'K',1);put(39,'G',1);}
  else if(lesson===3){
   s.ply=149;
   for(const [i,type,side] of [[4,'K',1],[58,'R',0],[10,'R',1],[64,'B',0],[16,'B',1],[75,'G',0],[77,'G',0],[3,'G',1],[5,'G',1],[74,'S',0],[78,'S',0],[2,'S',1],[6,'S',1],[54,'P',0],[56,'P',0],[60,'P',0],[62,'P',0],[18,'P',1],[20,'P',1],[24,'P',1],[26,'P',1]])put(i,type,side);
  }else{put(58,'R',0);put(31,'K',1);}

  reset(s,false);$('devMode').value='play';$('lessonTitle').textContent=(lesson+1)+' / 4　'+lessons[lesson][0];$('lessonText').textContent=lessons[lesson][1];$('lessonNext').textContent=lesson===3?'チュートリアルを終える':'次へ';$('devStatus').textContent='自分の駒をクリックして、移動先を選んでください。';
 }
 $('openTutorial').onclick=()=>{tutorial=true;lesson=0;history=[];$('developerDialog').classList.add('tutorial-mode');$('tutorialLesson').hidden=false;$('devTransfer').hidden=true;loadLesson();$('developerDialog').showModal();};
 $('lessonReset').onclick=()=>{if(!working)loadLesson();};
 $('lessonNext').onclick=()=>{if(working)return;if(lesson===3){$('developerDialog').close();return;}lesson++;loadLesson();};

}

