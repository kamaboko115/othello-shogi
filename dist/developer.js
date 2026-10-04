import {runParadoxEvent} from './paradox-event.js';
import {paintCollapse,paintArrival,collapseStrikeDuration,collapseStrikeDelay} from './collapse-view.js';
import {lessons,lessonState,collapseReply,tutorialMoves,collapseLesson} from './tutorial-lessons.js';
import {kingCaptureSquare,runKingImpact} from './impact.js';
import {paradoxSound} from './paradox.js';
import {encodeBoard,decodeBoard} from './board-code.js';
import {initial,empty,moves,play,label,collapseAfterMove,arrivalSummary,paradoxSummary,beforeParadox} from './engine.js';
import {runCombo,comboTier,decorateFinish,capturedPiece,runCapture,flipNeedsShake,slidingMove,runSlide,runSword} from './combo.js';
import {moveEffects,runEffects,showVictory,isVictoryFor} from './move-effect.js';
import {playParadoxArrival,playMoveSound,playMultiFlipSound,playResultSound,playApplauseSound,playArcadeCue} from './sound.js';
export function initDeveloper(getCurrent){
 const $=id=>document.getElementById(id);let state=initial(),selected=null,working=false,controller=null,history=[],tutorial=false,lesson=0,collapseTrial=0,collapsePhase='ash';
 for(const side of [1,0]){const tray=document.createElement('div');tray.id='devHand'+side;tray.className='dev-capture-hand';tray.setAttribute('aria-label',side?'相手の駒台':'自分の駒台');$('devBoardFrame').insertAdjacentElement(side?'beforebegin':'afterend',tray);}
 const six=document.createElement('option');six.value='6';six.textContent='6枚';$('devDemoCount').append(six);
 const swordPreview=document.createElement('button');swordPreview.textContent='剣の演出を試す';$('devDemo').after(swordPreview);
 swordPreview.onclick=async()=>{if(working)return;controller?.abort();controller=new AbortController();const current=controller;working=true;draw();try{await runSword($('devBoard'),40,current.signal);}finally{if(controller===current){working=false;draw();}}};
 state.moveLimit=false;state.paradoxAt=false;
 const guided=()=>tutorial&&!lessons[lesson].collapse;
 const availableMoves=source=>tutorial?tutorialMoves(state,lesson,source):moves(state,source);
 let updateTutorialArrow=()=>{};
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>updateTutorialArrow()).observe($('devBoardFrame'));
 const copyCurrent=()=>{const current=getCurrent(),s=structuredClone(current.state);if(current.side===1){s.board.reverse();s.board.forEach(p=>{if(p)p.side=1-p.side;});s.hands.reverse();s.turn=1-s.turn;}return s;};
 const reset=(s,remember=true,preserveDebug=false)=>{if(remember)history.push(structuredClone(state));controller?.abort();working=false;state=structuredClone(s);state.result='';state.flipped=[];state.last=[];state.moveLimit=false;if(!tutorial&&!preserveDebug){state.ply=0;state.destroyed=null;state.spawned=null;delete state.paradoxEvent;state.paradoxStarted=false;}state.paradoxAt=tutorial&&lessons[lesson].collapse?150:false;collapsePhase='ash';selected=null;$('devTurn').value=String(state.turn);draw();};
 function draw(){
  document.querySelectorAll('#developerDialog select,#developerDialog input,.dev-buttons button').forEach(el=>el.disabled=working);
  $('devUndo').disabled=working||!history.length;
  for(const side of [0,1]){const tray=$('devHand'+side);tray.replaceChildren();for(const type of ['R','B','G','S','N','L','P']){
   const amount=(collapsePhase==='waiting'?beforeParadox(state):state).hands[side][type]||0,slot=document.createElement('button');slot.type='button';slot.dataset.type=type;slot.textContent=label({type,prom:false})+' ×'+amount;slot.setAttribute('aria-label',(side?'相手':'自分')+'の持ち駒 '+label({type,prom:false})+' '+amount+'枚');slot.setAttribute('aria-pressed',String(side===state.turn&&selected===type));slot.disabled=working||!!state.result||side!==state.turn||!amount||$('devMode').value!=='play';
   slot.hidden=tutorial&&!amount;
   if(tutorial&&type===lessons[lesson].move.drop&&side===0&&state.ply===0)slot.classList.add('tutorial-hint');
   if(guided())slot.disabled||=state.ply!==0||side!==0||type!==lessons[lesson].move.drop;
   slot.onclick=()=>{if(slot.disabled)return;selected=type;draw();};tray.append(slot);
  }}
  $('lessonProgress').hidden=true;$('lessonProgress').textContent='';
  const board=$('devBoard');board.replaceChildren();updateTutorialArrow=()=>{};const legal=selected===null?[]:availableMoves(selected),guide=guided()&&!working&&state.ply===0?lessons[lesson].move:null;
  const visible=collapsePhase==='waiting'?beforeParadox(state):state;
  for(let i=0;i<81;i++){const b=document.createElement('button'),p=visible.board[i];b.className='cell'+(i===selected?' selected':'')+(legal.some(m=>m.to===i)?' legal':'');if(guide&&i===(guide.from??guide.to))b.classList.add('tutorial-hint');if(guide&&i===guide.to)b.classList.add('tutorial-target');b.dataset.square=i;b.disabled=working||(guided()&&(state.ply!==0||(i!==lessons[lesson].move.from&&!legal.some(m=>m.to===i))));b.setAttribute('aria-label',(9-i%9)+'列'+(Math.floor(i/9)+1)+'段 '+(p?(p.side?'相手 ':'自分 ')+label(p):'空き')+(guide&&i===guide.to?' 移動先':guide&&i===guide.from?' この駒を動かす':''));if(p){const el=document.createElement('span');el.className='piece'+((working&&!state.paradoxEvent&&state.flipped.includes(i)?1-p.side:p.side)?' enemy':'')+(p.prom?' prom':'')+(p.wings?' has-wings':'');el.dataset.side=working&&!state.paradoxEvent&&state.flipped.includes(i)?1-p.side:p.side;el.textContent=label(p);b.append(el);}b.onclick=()=>click(i);board.append(b);}
  if(guide){
   const arrow=document.createElement('div');arrow.className='tutorial-arrow';arrow.setAttribute('aria-hidden','true');
   board.append(arrow);
   updateTutorialArrow=()=>{
    const x=(guide.to%9+.5)*100/9,y=(Math.floor(guide.to/9)+.5)*100/9;
    let path=`M${x} ${(Math.floor((guide.from??guide.to)/9)+.5)*100/9-3} L${x} ${y+3}`;
    if(guide.drop){
     const tray=$('devHand0').querySelector('[data-type="'+guide.drop+'"]'),origin=tray?.getBoundingClientRect?.(),rect=arrow.getBoundingClientRect?.();
     if(!origin||!rect?.width||!rect.height)return;
     const sx=(origin.left+origin.width/2-rect.left)*100/rect.width,sy=(origin.top-rect.top)*100/rect.height;
     path=`M${sx} ${sy} Q${sx} ${y+18} ${x} ${y+3}`;
    }
    arrow.innerHTML=`<svg viewBox="0 0 100 100"><defs><marker id="tutorialArrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5 Z" fill="#fff19b"/></marker></defs><path d="${path}" stroke="#13382c" stroke-width="2.2" fill="none"/><path d="${path}" stroke="#fff19b" stroke-width="1.1" fill="none" marker-end="url(#tutorialArrowhead)"/></svg>`;
   };
   updateTutorialArrow();if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>updateTutorialArrow());
  }
  paintCollapse(board,state.destroyed,{phase:collapsePhase,eventKey:state.ply});
  if(state.spawned&&working)paintArrival(board,state,collapsePhase==='breaking');
 }
 async function click(i){
  if(working)return;
  if($('devMode').value==='edit'){history.push(structuredClone(state));const type=$('devPiece').value;state.board[i]=type==='erase'?null:{type,side:Number($('devSide').value),prom:$('devPromoted').checked&&['P','L','N','S','B','R'].includes(type)};state.result='';selected=null;draw();return;}
  if(state.result){$('devStatus').textContent=tutorial?'「もう一度」で練習できます。':'手番を選び直すと続けられます。';return;}
  const options=selected===null?[]:availableMoves(selected).filter(m=>m.to===i);
  if(!options.length){if(guided()&&(state.ply!==0||i!==lessons[lesson].move.from))return;selected=state.board[i]?.side===state.turn?i:null;draw();return;}
  history.push(structuredClone(state));const before=state,mover=state.turn,chosen=options.find(m=>!m.prom)||options[0],expected=lessons[lesson].move,completed=tutorial&&!lessons[lesson].collapse&&before.ply===0&&chosen.from===expected.from&&chosen.to===expected.to&&chosen.drop===expected.drop;state=play(state,chosen);const played=beforeParadox(state),slide=slidingMove(before,played),capture=capturedPiece(before,played),kingImpact=kingCaptureSquare(before,played),effects=moveEffects(state).filter(e=>!(tutorial&&e.kind==='check'&&before.board[state.last.at(-1)]?.type==='K'&&before.board[state.last.at(-1)]?.side!==mover));if(!(tutorial&&lessons[lesson].collapse))state.turn=mover;selected=null;working=true;if(state.paradoxEvent?.kind==='rebirth')collapsePhase='waiting';draw();controller=new AbortController();const current=controller;
  if(!before.board[state.last[0]]?.prom&&state.board[state.last[1]]?.prom&&!state.result)playArcadeCue('promote');
  if(slide)await runSlide(slide,$('devBoard'),current.signal,playMoveSound);
  if(current.signal.aborted)return;
  if(kingImpact!==null)await runKingImpact($('devBoard'),kingImpact,current.signal);
  if(current.signal.aborted)return;
  if(capture)await runCapture(capture,current.signal,{moveSound:!slide,shake:!flipNeedsShake(state),board:$('devBoard'),hand:$('devHand'+mover),overlay:$('developerDialog')});
  if(current.signal.aborted)return;
  if(state.flipped.length>=1)await runCombo(played,$('devBoard'),0,current.signal);
  else if(!slide&&!capture&&!state.result)playMoveSound();
  if(current.signal.aborted)return;
  if(state.paradoxEvent?.kind==='rebirth'){await runParadoxEvent($('devBoard'),state,0,current.signal);collapsePhase='ash';draw();}
  else if(tutorial&&lessons[lesson].collapse){
   const wait=ms=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);current.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);current.signal.addEventListener('abort',done,{once:true});if(current.signal.aborted)done();});
   const collapse=async()=>{
    if(tutorial){collapseLesson(state,collapseTrial);if(state.destroyed||state.spawned)collapseTrial++;}else collapseAfterMove(state,undefined,undefined,mover);
    if(!state.paradoxStarted&&!state.destroyed&&!state.spawned&&!state.paradoxEvent)return;
    collapsePhase='waiting';draw();
    if(state.paradoxEvent){await wait(120);if(current.signal.aborted)return;await runParadoxEvent($('devBoard'),state,0,current.signal);collapsePhase='ash';draw();return;}
    const note=document.createElement('div');note.className='tutorial-collapse-note';note.textContent=state.paradoxStarted?'オセロ将棋パラドックスにより、盤面が崩れてゆく！':state.spawned?arrivalSummary(state)+'！ この手では盤面崩壊による破壊はありません。':state.paradoxEvent?paradoxSummary(state):'盤上の駒が1枚壊れます';$('devBoard').append(note);
    try{
     if(state.paradoxStarted){paradoxSound(true);await wait(3000);return;}else if(state.destroyed)await wait(collapseStrikeDelay);
     if(current.signal.aborted)return;
     if(state.spawned||state.paradoxEvent)playParadoxArrival();else paradoxSound(false);collapsePhase='breaking';draw();
    await wait(state.destroyed?collapseStrikeDuration:1200);collapsePhase='ash';
    }finally{note.remove();}
    draw();
   };
   await collapse();
   if(tutorial&&!state.result&&!current.signal.aborted){
    await wait(450);if(current.signal.aborted)return;const reply=collapseReply(state,lessons[lesson].collapseSequence.slice(collapseTrial));
    if(reply){state=play(state,reply);$('devStatus').textContent='相手が穴熊を守る手を指しました。';draw();playMoveSound();if(!current.signal.aborted)await collapse();}
   }
   effects.splice(0,effects.length,...moveEffects(state));
  }
  if(current.signal.aborted)return;
  let banner=null,clearFinish=null;
  await runEffects(effects,{signal:current.signal,applause:playApplauseSound,victory:effect=>playResultSound(isVictoryFor(effect,0),current.signal),hide:()=>{clearFinish?.();clearFinish=null;banner?.remove();banner=null;},show:effect=>{if(effect.kind==='check')playArcadeCue('check');if(effect.kind==='victory'){banner=showVictory(effect,0,$('developerDialog'));return;}banner=document.createElement('div');banner.className='combo-notice dev-finish '+(effect.kind==='flip'?comboTier(state.flipped.length):'');banner.textContent=effect.text;$('devStatus').textContent=effect.text;$('devBoard').append(banner);if(effect.kind==='flip')clearFinish=decorateFinish(banner,state.flipped.length);}});
  if(current.signal.aborted)return;
  $('devStatus').textContent=effects.filter(effect=>effect.text).at(-1)?.text||(state.turn?'相手':'自分')+'の手番';
  working=false;$('devTurn').value=String(state.turn);draw();
  if(tutorial&&(completed||(lessons[lesson].collapse&&state.result))){$('lessonCompleteNext').textContent=lesson===lessons.length-1?'チュートリアルを終える':'次へ';$('lessonComplete').showModal();}
 }
 $('openDeveloper').onclick=()=>{tutorial=false;$('developerDialog').classList.remove('tutorial-mode');$('tutorialLesson').hidden=true;$('settingsDialog').close();history=[];reset(copyCurrent(),false);$('devTransfer').hidden=true;$('devStatus').textContent='練習専用の盤面です。配置・陣営・成りを自由に変更できます。';$('developerDialog').showModal();};
 $('closeDeveloper').onclick=()=>$('developerDialog').close();
 $('developerDialog').addEventListener('close',()=>{controller?.abort();working=false;$('lessonComplete').close();});
 $('devCopy').onclick=()=>reset(copyCurrent());$('devInitial').onclick=()=>reset(initial());$('devClear').onclick=()=>reset(empty());
 $('devTurn').onchange=()=>{if(working)return;history.push(structuredClone(state));state.turn=Number($('devTurn').value);state.result='';selected=null;draw();};
 $('devUndo').onclick=()=>{if(working||!history.length)return;const previous=history.pop();reset(previous,false,true);$('devStatus').textContent='1手戻しました。';};
 $('devExport').onclick=async()=>{const code=encodeBoard(state);$('devTransfer').hidden=false;$('devCode').value=code;try{await navigator.clipboard.writeText(code);$('devStatus').textContent='盤面をコピーしました。ペーストで復元できます。';}catch{$('devCode').focus();$('devCode').select();$('devStatus').textContent='盤面データを選択しました。コピーして保存できます。';}};
 $('devPaste').onclick=async()=>{$('devTransfer').hidden=false;try{$('devCode').value=await navigator.clipboard.readText();}catch{$('devCode').value='';}$('devCode').focus();$('devStatus').textContent='貼り付けた内容を「この盤面を読み込む」で反映します。';};
 $('devImport').onclick=()=>{if(working)return;try{const next=decodeBoard($('devCode').value);reset(next);$('devStatus').textContent='盤面を読み込みました。';}catch(e){$('devStatus').textContent=e.message;}};
 $('devMode').onchange=()=>{selected=null;draw();};
 $('devDemo').onclick=()=>{const s=empty(),count=Number($('devDemoCount').value),to=37+count,from=to+9;for(const [i,type,side] of [[76,'K',0],[4,'K',1],[36,'P',0],[from,'P',0]])s.board[i]={type,side,prom:false};const types=['P','N','S','G','B','R'].slice(-count);types.forEach((type,j)=>s.board[37+j]={type,side:1,prom:false});reset(s);$('devMode').value='play';$('devStatus').textContent=(9-from%9)+'列6段の歩を1マス上へ動かすと'+count+'枚反転します。';};
 function loadLesson(){
  $('lessonComplete').close();$('lessonAdvice').hidden=!lessons[lesson].collapse;
  $('developerDialog').classList.toggle('tutorial-drop',!!lessons[lesson].move.drop);
  history=[];collapseTrial=0;$('devMode').value='play';reset(lessonState(lesson),false);
  $('lessonTitle').textContent=(lesson+1)+' / '+lessons.length+'　'+lessons[lesson].title;
  $('lessonText').textContent=lessons[lesson].text;$('lessonNext').textContent=lesson===lessons.length-1?'チュートリアルを終える':'次へ';
  $('devStatus').textContent=lessons[lesson].collapse?'好きな駒を動かして、盤面崩壊を体験してみましょう。':lessons[lesson].move.drop?'駒台の金を選び、矢印の移動先へ打ってください。':'光る駒を選び、矢印の移動先を押してください。';
 }
 const startTutorial=()=>{tutorial=true;lesson=0;history=[];$('developerDialog').classList.add('tutorial-mode');$('tutorialLesson').hidden=false;$('devTransfer').hidden=true;loadLesson();$('developerDialog').showModal();};
 $('openTutorial').onclick=startTutorial;
 $('lessonReset').onclick=()=>{if(!working)loadLesson();};
 const nextLesson=()=>{if(working)return;if(lesson===lessons.length-1){$('developerDialog').close();return;}lesson++;loadLesson();};
 $('lessonNext').onclick=nextLesson;$('lessonCompleteNext').onclick=()=>{$('lessonComplete').close();nextLesson();};$('lessonCompleteRepeat').onclick=()=>{if(!working)loadLesson();};
 const exitTutorial=()=>{$('lessonComplete').close();$('developerDialog').close();};$('lessonExit').onclick=exitTutorial;$('lessonCompleteExit').onclick=exitTutorial;
 return {startTutorial};
}

