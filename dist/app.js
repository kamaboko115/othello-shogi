import {kingCaptureSquare,runKingImpact} from './impact.js';
import {minuteSteps,byoyomiSteps,clockRule,handicapOptions,clockBudget} from './match-options.js';
import {runCombo,comboTier,decorateFinish,capturedPiece,runCapture,flipNeedsShake,slidingMove,runSlide} from './combo.js';
import {initDeveloper} from './developer.js';
import {resultView} from './result-view.js';
import {paradoxSound,paradoxBanner} from './paradox.js';
import {animateFlipLight} from './flip-light.js';
import {moveEffects,runEffects,showVictory} from './move-effect.js';
import {startAI} from './ai-client.js';
import {playMoveSound,playMultiFlipSound,playVictorySound,playApplauseSound,playArcadeCue,playHelperDeparture} from './sound.js';
import {initial,moves,label,names,points} from './engine.js';
const $=id=>document.getElementById(id),side=n=>n===0?'先手':'後手',coord=i=>`${9-i%9}${'一二三四五六七八九'[Math.floor(i/9)]}`;
const statusPanel=document.querySelector('.status'),statusParent=statusPanel.parentElement,statusNext=statusPanel.nextSibling;
let comboActive=false,comboPreparing=false,comboController=null;
function cancelCombo(){comboController?.abort();comboController=null;comboActive=false;comboPreparing=false;cancelEffects();}
let effectsActive=false,effectsController=null,victoryNode=null,clearFinish=null;
function hideBurst(){clearFinish?.();clearFinish=null;victoryNode?.remove();victoryNode=null;clearTimeout(burstTimer);const el=document.getElementById('flipBurst');if(el)el.hidden=true;}
function cancelEffects(){effectsController?.abort();effectsController=null;effectsActive=false;hideBurst();}
function presentEffects(next){
 cancelEffects();const effects=moveEffects(next);if(!effects.length)return;
 const controller=new AbortController();effectsController=controller;effectsActive=true;
 runEffects(effects,{signal:controller.signal,show:effect=>{if(effect.kind==='check')playArcadeCue('check');if(effect.kind==='victory')victoryNode=showVictory(effect,online?.side??0);else showFlipBurst(0,effect.text);},hide:()=>{if(effectsController===controller)hideBurst();},applause:playApplauseSound,victory:()=>{if(effects[0]?.text.startsWith(side(online?.side??0)))playVictorySound();}}).finally(()=>{if(controller.signal.aborted)return;effectsActive=false;render();});
}
const homeMessage='対局を作成するか、招待リンクから参加してください。';
let state=initial(),selected=null,legal=[],stack=[],logs=[],pending=[],message=homeMessage;
let online=null,busy=false,connected=true,pollTimer=null,inviteRoom=null;
let selectedKind='friend',clockOffset=0;
let autoHelperAttempt=null;
let aiJob=null,aiTiming=null,helperJob=null,helperDeparting=false,helperLingering=false,helperIdea=false,helperFarewell=false,helperIdeaTimer=null;
let collapseEffect=null,collapseTimer=null,removeParadoxBanner=null;
function cancelCollapse(){clearTimeout(collapseTimer);removeParadoxBanner?.();removeParadoxBanner=null;collapseEffect=null;}
function paintCollapse(){
 if(!collapseEffect)return;
 const d=collapseEffect.destroyed||collapseEffect.spawned,cell=document.querySelector('[data-square="'+d.square+'"]');if(!cell)return;
 const e=document.createElement('span');e.className='piece paradox-ghost'+(d.piece.side!==(online?.side??0)?' enemy':'')+(collapseEffect.spawned?' paradox-spawn':collapseEffect.breaking?' paradox-breaking':'');e.textContent=label(d.piece);cell.append(e);
 if(collapseEffect.destroyed){const lightning=document.createElement('span');lightning.className='paradox-lightning';cell.append(lightning);}
}
function beginCollapse(next){
 cancelCollapse();collapseEffect={destroyed:next.destroyed,spawned:next.spawned,breaking:false};
 if(next.paradoxStarted){removeParadoxBanner=paradoxBanner();paradoxSound(true);}
 const finish=()=>{removeParadoxBanner?.();removeParadoxBanner=null;paradoxSound(false);collapseEffect.breaking=true;render();collapseTimer=setTimeout(()=>{collapseEffect=null;presentEffects(state);render();},600);};
 collapseTimer=setTimeout(finish,next.paradoxStarted?3000:120);
}
function stopAI(){aiJob?.task.cancel();aiJob=null;}
function syncAutoHelper(){
 if(!$('autoHelper').checked||!$('furigoma').hidden||!helperAvailable())return;
 const key=online.room+':'+online.round+':'+online.version;
 if(autoHelperAttempt===key)return;
 autoHelperAttempt=key;
 queueMicrotask(()=>{
  if(!$('autoHelper').checked||!$('furigoma').hidden||!helperAvailable()||key!==online.room+':'+online.round+':'+online.version){if(autoHelperAttempt===key)autoHelperAttempt=null;return;}
  useHelper();
 });
}
function syncAI(){
 syncAutoHelper();
 const key=online?online.room+':'+online.version:'';
 const needsAI=online?.kind==='ai'&&!state.result&&state.turn!==online.side;
 if(aiJob&&(!needsAI||aiJob.key!==key))stopAI();
 if(!needsAI||aiJob||busy||!connected||comboActive||comboPreparing||effectsActive||collapseEffect||!$('furigoma').hidden)return;
 const room=online.room,version=online.version,token=online.token;
 const task=startAI(state,online.settings?.aiLevel,online.settings?.thinkMs);
 const job={key,task};aiJob=job;
 $('connection').textContent=online.settings?.aiLevel==='osesho'?`オセショ様対局 · あなたは${side(online.side)} · オセショ様思考中…`:`AI対局 · あなたは${side(online.side)} · AI思考中…`;
 task.promise.then(async result=>{
  if(aiJob!==job||online?.room!==room||online.version!==version)return;
  aiTiming=result;
  const data=await request('/'+room+'/action',token,{action:result.move?'ai-move':'ai-no-moves',move:result.move,version});
  if(aiJob===job&&online?.room===room)adopt(data);
 }).catch(error=>{if(error.name==='AbortError'||aiJob!==job)return;message=error.message;connected=false;render();}).finally(()=>{if(aiJob===job)aiJob=null;});
}

let lastTossKey="",animationKey="",animationStarted=0;
let burstTimer;
function showFlipBurst(count,victoryText=''){
 if(!victoryText&&count<2)return;
 let el=document.getElementById('flipBurst');
 if(!el){el=document.createElement('div');el.id='flipBurst';el.setAttribute('aria-hidden','true');document.querySelector('.board-area').append(el);}
 clearTimeout(burstTimer);el.className=comboTier(Number((victoryText||'').match(/^(\d+)枚抜き$/)?.[1]||count));el.textContent=victoryText||count+'枚抜き';el.hidden=false;
 el.getAnimations().forEach(a=>a.cancel());
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.65)'},{offset:.22,opacity:1,transform:'translate(-50%,-50%) scale(1.12)'},{offset:.65,opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-54%) scale(1.03)'}],{duration:1000,easing:'ease-out'});
 clearFinish?.();clearFinish=decorateFinish(el,Number((victoryText||'').match(/^(\d+)枚抜き$/)?.[1]||count));
 burstTimer=setTimeout(()=>{el.hidden=true;clearFinish?.();clearFinish=null;},Number((victoryText||'').match(/^(\d+)枚抜き$/)?.[1]||count)>=4?2400:1000);
}
const freshToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const storage={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){localStorage.setItem(k,JSON.stringify(v));}};
function setBoardTheme(theme){
 const value=theme==='wood'?'wood':'green';document.documentElement.dataset.boardTheme=value;$('boardTheme').value=value;
 try{storage.set('hanten-board-theme-v2',value);}catch{}
}
setBoardTheme(storage.get('hanten-board-theme-v2')||'green');
$('boardTheme').onchange=()=>setBoardTheme($('boardTheme').value);
$('openSettings').onclick=()=>$('settingsDialog').showModal();
$('closeSettings').onclick=()=>{$('settingsDialog').close();syncAI();};
$('autoHelper').onchange=()=>{autoHelperAttempt=null;syncAI();};
initDeveloper(()=>({state,side:online?.side??0}));
function stone(side){const el=document.createElement('span');el.className='stone '+(side===0?'black':'white');el.setAttribute('aria-hidden','true');return el;}
function recordLine(text){const el=document.createElement('div');for(const part of text.split(/([▲▽])/)){if(part==='▲'||part==='▽'){const mark=stone(part==='▲'?0:1);mark.removeAttribute('aria-hidden');mark.setAttribute('aria-label',part==='▲'?'先手':'後手');el.append(mark);}else el.append(document.createTextNode(part));}return el;}
const selectedSettings=()=>({timeControl:selectedKind==='friend'&&Number($('mainTime').value)<minuteSteps.length?{minutes:minuteSteps[Number($('mainTime').value)],increment:Number($('incrementTime').value),byoyomi:byoyomiSteps[Number($('byoyomiTime').value)]}:'none',handicap:selectedKind==='friend'?$('handicap').value:$('aiHandicap').value,paradoxAt:$('paradoxAt').value==='none'?false:Number($('paradoxAt').value),moveLimit:$('moveLimit').value==='yes',noDrops:$('allowDrops').value==='no',...(selectedKind==='ai'?{helperUnlimited:$('helperUnlimited').checked,handicapSide:$('aiHandicapSide').value,aiLevel:$('aiLevel').value,thinkMs:Number($('thinkTime').value)}:{})});
const canAct=()=>!comboActive&&!comboPreparing&&!effectsActive&&!collapseEffect&&!state.result&&!busy&&!!online&&connected&&online.joined&&online.side===state.turn;
function renderHand(n){
 let clock=$('clock'+n);if(!clock){clock=document.createElement('div');clock.id='clock'+n;clock.className='player-clock';$('hand'+n).before(clock);}
 const h=$('hand'+n);h.replaceChildren();h.setAttribute('aria-label',`${side(n)}の駒台`);
 h.parentElement.className='player '+(n===(online?.side??0)?'self':'opponent');
 const oseshoMatch=online?.kind==='ai'&&online.settings?.aiLevel==='osesho',name=oseshoMatch&&n!==online.side?'オセショ様':side(n);h.parentElement.querySelector('strong').lastChild.textContent=' '+name;
 let badge=h.parentElement.querySelector('.hand-turn');if(!badge){badge=document.createElement('button');badge.type='button';badge.className='hand-turn';h.parentElement.insertBefore(badge,h);}
 badge.hidden=n!==(online?.side??0);badge.textContent=state.result?'対局終了':!online?.joined?'相手の参加待ち':online.side===state.turn?'自分の手番です':online?.settings?.aiLevel==='osesho'?'オセショ様の手番です':'相手の手番です';badge.disabled=!state.result;badge.onclick=()=>{if(state.result)leaveGame();};badge.title=state.result?'開始画面に戻る':'';badge.classList.toggle('my-turn',!!online&&online.side===state.turn&&!state.result);

 for(const type of ['R','B','G','S','N','L','P']){
  const count=state.hands[n][type]||0,btn=document.createElement('button');
  btn.className='hand-slot'+(count?' occupied':' empty')+(type==='P'?' pawn-slot':'');btn.dataset.type=type;
  btn.setAttribute('aria-label',`${side(n)} 持ち駒 ${names[type]} ${count}枚`);btn.disabled=!!state.noDrops||!count||n!==state.turn||!canAct();
  btn.setAttribute('aria-pressed',String(count>0&&n===state.turn&&selected===type));
  const glyph=document.createElement('span');glyph.className=count?'piece':'slot-label';glyph.textContent=names[type];btn.append(glyph);
  if(count){const quantity=document.createElement('span');quantity.className='hand-count';quantity.textContent=`×${count}`;btn.append(quantity);}
  btn.onclick=()=>select(type);h.append(btn);
 }
}
function render(){
 const oseshoMatch=online?.kind==='ai'&&online.settings?.aiLevel==='osesho';
 const helperVisible=online?.kind==='ai'&&online.joined&&((!state.result&&(online.settings?.helperUnlimited||online.helperUsedRound!==(online.round||1)))||helperLingering||helperIdea);
 $('askOsesho').hidden=!helperVisible||oseshoMatch;$('osesho').hidden=!(oseshoMatch||helperJob||helperLingering||helperIdea);$('tagline').hidden=!!online;
 $('osesho').disabled=oseshoMatch||!canAct()||!!helperJob||helperLingering;
 $('osesho').classList.toggle('idea',helperIdea);$('osesho').classList.toggle('thinking',!!helperJob);$('osesho').classList.toggle('departing',helperDeparting);
 $('oseshoStatus').textContent=oseshoMatch?'対局中のオセショ様':helperIdea?'ひらめいた！':helperLingering?(helperFarewell?'じゃあの':''):helperJob?'オセショ様が考えています…':state.turn!==online?.side?'あなたの手番で頼めます':online?.settings?.helperUnlimited?'無限オセショ様':'オセショ様 · 1局1回';
 if(comboActive)return;
 const showTutorial=!online;
 const homeNotice=showTutorial&&message!==homeMessage;
 $('tutorial').hidden=!showTutorial;
 document.querySelector('.play').hidden=showTutorial;
 document.querySelector('.status').hidden=showTutorial&&!homeNotice;
 document.querySelector('.status').classList.toggle('home-message',homeNotice);
 if(homeNotice)$('matchTitle').after(statusPanel);
 else if(statusPanel.parentElement!==statusParent)statusParent.insertBefore(statusPanel,statusNext);
 for(const selector of ['.actions','.end-actions','.record'])document.querySelector(selector).hidden=showTutorial;
 const video=$('tutorialVideo');
 if(!showTutorial)video.pause();
 else if(video.dataset.active==='false'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)video.play().catch(()=>{});
 video.dataset.active=String(showTutorial);

 const perspective=online?.side??0;
 const ending=!!online&&!!state.result&&!collapseEffect&&!comboPreparing;
 document.body.classList.toggle('game-ended',ending);
 $('resultHeading').hidden=$('resultActions').hidden=!ending;
 const resultInfo=ending?resultView(state,perspective):null;
 if(resultInfo){$('resultTitle').textContent=resultInfo.title;$('resultReason').textContent=resultInfo.reason;$('resultDetail').textContent=resultInfo.detail;}
 const rematchHome=ending?$('resultActions'):document.querySelector('aside');
 if($('rematchPanel').parentElement!==rematchHome)rematchHome.prepend($('rematchPanel'));

 const moveKey=online?online.room+':'+(online.round||1)+':'+state.ply:'';
 const elapsed=performance.now()-animationStarted;
 const animate=!comboPreparing&&!!animationKey&&animationKey===moveKey&&elapsed<950;
 document.querySelector('.files').replaceChildren(...(perspective?'１２３４５６７８９':'９８７６５４３２１').split('').map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 document.querySelector('.ranks').replaceChildren(...(perspective?'九八七六五四三二一':'一二三四五六七八九').split('').map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 const board=$('board');board.replaceChildren();
 for(let pos=0;pos<81;pos++){
  const i=perspective?80-pos:pos,p=state.board[i],el=document.createElement('button');
  el.className='cell'+(selected===i?' selected':'')+(legal.some(m=>m.to===i)?' legal':'')+(state.last.includes(i)?' last':'')+(state.flipped.includes(i)?' flipped':'');
  if(resultInfo?.square===i)el.classList.add('decisive');
  el.setAttribute('aria-label',`${coord(i)} ${p?side(p.side)+' '+label(p):'空き'}`);el.dataset.square=i;
  if(p){const span=document.createElement('span');span.className='piece'+((comboPreparing&&state.flipped.includes(i)?1-p.side:p.side)!==perspective?' enemy':'')+(p.prom?' prom':'')+(label(p).length>1?' long':'');span.textContent=label(p);if(animate&&state.flipped.includes(i)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const multi=state.flipped.length>=2,start=p.side!==perspective?0:180,end=start+180;const anim=span.animate(multi?[{transform:'translateY(0) scale(1) rotate('+start+'deg)'},{offset:.38,transform:'translateY(-8px) scale(1.13) rotate('+(start+70)+'deg)'},{offset:.75,transform:'translateY(-3px) scale(1.06) rotate('+end+'deg)'},{transform:'translateY(0) scale(1) rotate('+end+'deg)'}]:[{transform:'rotate('+start+'deg)'},{transform:'rotate('+end+'deg)'}],{duration:multi?900:650,easing:'ease-in-out'});anim.currentTime=elapsed;if(multi)el.classList.add('multi-flip');animateFlipLight(el,p.side,multi?900:650,elapsed);}el.append(span);}
  el.disabled=!canAct();el.onclick=()=>click(i);board.append(el);
 }
 if(state.destroyed&&!collapseEffect){const cell=board.querySelector('[data-square="'+state.destroyed.square+'"]');if(cell){const ash=document.createElement('span');ash.className='paradox-ash';ash.setAttribute('aria-label','前の手で崩壊した跡');cell.append(ash);}}
 for(let n=0;n<2;n++)renderHand(n);
 const oseshoTarget=oseshoMatch?document.querySelector('.player.opponent'):(helperJob||helperLingering||helperIdea)?document.querySelector('.player.self'):null;if(oseshoTarget){if($('osesho').parentElement!==oseshoTarget)oseshoTarget.prepend($('osesho'));}else if($('osesho').previousElementSibling!==$('oseshoHome'))$('oseshoHome').after($('osesho'));
 const turnName=oseshoMatch&&state.turn!==online.side?'オセショ様':side(state.turn);$('turn').textContent=state.result||` ${turnName}の番`;if(!state.result)$('turn').prepend(stone(state.turn));
 $('boardProgress').hidden=!state.mode;
 const collapseAt=state.paradoxAt===false?null:(state.paradoxAt??150);
 $('boardProgress').innerHTML=collapseAt?`終末まで ${state.ply}/${collapseAt}${state.ply>=collapseAt?' · <span class="paradox-active-label">盤面崩壊中</span>':''}${state.moveLimit===false?'':` ／ 決着まで ${Math.min(state.ply,60)}/60`}`:state.moveLimit===false?`${state.ply}手目`:`決着まで ${Math.min(state.ply,60)}/60`;
 $('boardProgress').title=collapseAt?`盤面崩壊までの手数（${collapseAt}手から開始）`:'';
 $('count').textContent='オセロ将棋';
 const scores=points(state);$('scores').hidden=!state.mode;$('scores').textContent=`盤上：先手 ${scores[0]}枚　／　後手 ${scores[1]}枚`;
 $('message').textContent=message.replaceAll('▲','●').replaceAll('▽','○');
 $('reset').hidden=!online;
 $('requestUndo').disabled=!online?.canUndo||busy||!connected||!!online?.undoOffer;
 $('undoPanel').hidden=!online?.undoOffer;
 const undoMine=online?.undoOffer?.seat===(online?.seat??online?.side);
 $('undoText').textContent=online?.undoOffer?(undoMine?'待ったの承諾を待っています。':'相手が待ったを希望しています。')+' '+online.undoOffer.ply+'手終了時の盤面へ戻します。':'';
 $('acceptUndo').hidden=undoMine;for(const id of ['acceptUndo','declineUndo'])$(id).disabled=busy||!connected;

 $('resign').disabled=!online||!!state.result||busy||!online.joined||!connected;
 $('draw').disabled=$('resign').disabled;$('draw').textContent='引き分けを提案';
 $('record').replaceChildren(...logs.slice(-12).reverse().map(recordLine));
 $('createRoom').hidden=!!online||!!inviteRoom;$('createRoom').disabled=busy;
 $('joinRoom').hidden=!inviteRoom||!!online;$('joinRoom').disabled=busy;
 $('roomTools').hidden=!online;
 $('connection').hidden=!online&&!inviteRoom;
 $('connection').textContent=online?.kind==='ai'?`${oseshoMatch?'オセショ様':'AI'}対局 · あなたは${side(online.side)}`:online?`${connected?'接続中':'再接続中…'} · あなたは${side(online.side)}${online.joined?'':' · 相手の参加待ち'}`:inviteRoom?'参加後、振り駒で先手・後手を決めます。':'招待リンクで、離れた相手と対戦できます。';
 if(online?.kind==='ai'){
  if(aiJob)$('connection').textContent+=oseshoMatch?' · オセショ様思考中…':' · AI思考中…';
  else if(aiTiming)$('connection').textContent+=' · AI思考 '+(aiTiming.elapsedMs/1000).toFixed(2)+'秒';
  $('connection').dataset.aiTiming=aiTiming?JSON.stringify(aiTiming):'';
 }
 $('inviteTools').hidden=!online||(online.seat??0)!==0||online.joined;
 if(online?.invite)$('inviteLink').value=location.origin+location.pathname+'#room='+online.room+'&invite='+online.invite+'&limit='+(online.settings?.moveLimit===false?'no':'yes')+'&drops='+(online.settings?.noDrops?'no':'yes');
 $('drawOffer').hidden=!online||online.offer===null||!!state.result;
 if(online&&online.offer!==null){$('drawText').textContent=online.offer===(online.seat??online.side)?'相手に引き分けを提案しています。':'相手から引き分けの提案があります。';$('acceptDraw').hidden=online.offer===(online.seat??online.side);}
 document.querySelector('.local').textContent=oseshoMatch?'オセショ様対局':online?.kind==='ai'?'AI対局':'オセロ将棋';
 $('matchSetup').hidden=!!online||!!inviteRoom;
 $('matchTitle').innerHTML=online?(oseshoMatch?'オセショ様対局':online.kind==='ai'?'AI対局':'友人対局'):'<ruby>対局<rt>たいきょく</rt></ruby>を<ruby>選<rt>えら</rt></ruby>ぶ';
 $('chooseAI').setAttribute('aria-pressed',selectedKind==='ai');$('chooseFriend').setAttribute('aria-pressed',selectedKind==='friend');
 $('helperUnlimitedRow').hidden=selectedKind!=='ai';$('aiHandicapRow').hidden=selectedKind!=='ai';$('friendSettings').hidden=selectedKind!=='friend';$('aiLevelRow').hidden=selectedKind!=='ai';$('thinkTimeRow').hidden=selectedKind!=='ai';$('aiSettingsRow').hidden=selectedKind!=='ai';
 const oseshoChallenge=selectedKind==='ai'&&$('aiLevel').value==='osesho';
 $('oseshoChallengeWarning').hidden=!oseshoChallenge;
 $('createRoom').textContent=oseshoChallenge?'オセショ様に挑戦する':selectedKind==='ai'?'AIと対局を始める':'対局を作って招待する';
 const settings=online?.settings||inviteRoom?.settings||selectedSettings();
 $('matchSettings').hidden=!online&&!inviteRoom;
 $('matchSettings').textContent='オセロジャッジ：'+(settings.moveLimit===false?'なし':'あり')+' ／ チェスモード：'+(settings.noDrops?'あり':'なし')+(online?.kind==='ai'?' ／ AI：'+({weak:'弱い',normal:'普通',strong:'強い',expert:'最強',osesho:'オセショ様（人間が勝てる保証なし）'}[settings.aiLevel]||'普通')+('（最大'+((settings.thinkMs||1000)/1000)+'秒）'):'');
 $('matchSettings').textContent+=' ／ 盤面崩壊：'+(settings.paradoxAt===false?'無制限':(settings.paradoxAt??150)+'手から');
 if(online?.kind==='ai')$('matchSettings').textContent+=' ／ '+(settings.handicapSide==='human'?'人間側':'AI側')+'：'+(handicapOptions[settings.handicap]||'平手');
 if(online?.kind!=='ai')$('matchSettings').textContent+=' ／ 時間：'+(clockRule(settings.timeControl).label)+' ／ 作成者：'+(handicapOptions[settings.handicap]||'平手');

 $('rematchPanel').hidden=!online||!state.result;
 const requested=online?.rematch!=null,mine=requested&&online.rematch===(online.seat??online.side);
 $('rematchText').textContent=requested?(mine?'相手の承諾を待っています。':'相手が再試合を希望しています。'):'';
 $('offerRematch').hidden=requested;$('acceptRematch').hidden=!requested||mine;$('declineRematch').hidden=!requested;
 for(const id of ['offerRematch','acceptRematch','declineRematch'])$(id).disabled=busy||!connected;
 if(!online)$('furigoma').hidden=true;
 if(online?.joined&&online.toss){const key=online.room+':'+online.round;if(lastTossKey!==key){lastTossKey=key;const toss=online.toss,playerSide=online.side,showCoins=coins=>$('tossCoins').replaceChildren(...coins.map((face,i)=>{const el=document.createElement('span');el.className='toss-piece';el.textContent=face?'歩':'と';el.style.animationDelay=(i*.1)+'s';return el;})),finish=()=>{$('furigoma').classList.remove('osesho-intervention');showCoins(toss.coins);$('tossResult').textContent='歩 '+toss.coins.filter(Boolean).length+'枚・と '+toss.coins.filter(v=>!v).length+'枚。あなたは'+side(playerSide)+'です。';};showCoins(toss.intervened?toss.originalCoins:toss.coins);$('furigoma').hidden=false;if(toss.intervened){$('furigoma').classList.add('osesho-intervention');$('tossResult').textContent='謎の力が駒に働きかける！！';setTimeout(()=>{if(lastTossKey===key)finish();},1400);}else finish();}}

 paintCollapse();syncAI();
}
function select(src){if(!canAct())return;selected=selected===src?null:src;legal=selected===null?[]:moves(state,selected);message=selected===null?'駒を選んで、移動先をクリック。':legal.length?'緑の印のマスへ移動できます。':'この駒は今、動かせません。';render();}
function click(i){if(!canAct())return;const choices=legal.filter(m=>m.to===i);if(choices.length>1){pending=choices;$('promotion').showModal();return;}if(choices.length){commit(choices[0]);return;}if(state.board[i]?.side===state.turn)select(i);else{selected=null;legal=[];message='自分の駒、または駒台の駒を選んでください。';render();}}
function commit(m){if(canAct())sendAction('move',m);}
function start(s,msg){state=s;stack=[];logs=[];selected=null;legal=[];message=msg||'駒を選んで、移動先をクリック。';render();}
let confirmAction=null;function confirm(title,fn){$('confirmTitle').textContent=title;confirmAction=fn;$('confirm').showModal();}
$('confirmYes').onclick=()=>{$('confirm').close();confirmAction?.();};$('confirmNo').onclick=()=>$('confirm').close();
$('promote').onclick=()=>{$('promotion').close();commit(pending.find(m=>m.prom));};$('stay').onclick=()=>{$('promotion').close();commit(pending.find(m=>!m.prom));};
function clearSession(){clearTimeout(helperIdeaTimer);helperJob?.cancel();helperJob=null;helperDeparting=false;helperLingering=false;helperIdea=false;cancelCombo();cancelCollapse();stopAI();aiTiming=null;clearTimeout(pollTimer);online=null;inviteRoom=null;connected=true;busy=false;animationKey='';}
function leaveGame(){routeVersion++;clearSession();history.replaceState(null,'',location.pathname);start(initial(),homeMessage);}
$('closeResult').onclick=()=>leaveGame();
$('reset').onclick=()=>{if(state.result)leaveGame();else confirm('対局を離れますか？',leaveGame);};
$('requestUndo').onclick=()=>sendAction('offer-undo');$('acceptUndo').onclick=()=>sendAction('accept-undo');$('declineUndo').onclick=()=>sendAction('decline-undo');
$('resign').onclick=()=>{if(online&&!state.result)confirm('投了しますか？',()=>sendAction('resign'));};
$('draw').onclick=()=>{if(online&&!state.result)sendAction('offer-draw');};
async function request(path,token,body){
 const response=await fetch('/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 let data;try{data=await response.json();}catch{throw new Error('サーバーに接続できません。再試行してください。');}
 if(!response.ok)throw Object.assign(new Error(data.error||'通信に失敗しました。'),{status:response.status});return data;
}
function adopt(data){
 if(!online||data.room!==online.room||data.version<online.version)return;
 clockOffset=(data.serverNow||Date.now())-Date.now();
 const previousRound=online.round||1,changed=data.version!==online.version,reconnected=!connected;if(changed)stopAI();online={...online,...data};connected=true;
 if(changed){
  cancelCombo();cancelCollapse();
  const moved=data.state.ply>state.ply&&(data.round||1)===previousRound,rewound=data.state.ply<state.ply;
  const last=data.state.last,promotedNow=moved&&last.length===2&&!state.board[last[0]]?.prom&&data.state.board[last[1]]?.prom;
  const slide=moved?slidingMove(state,data.state):null;
  const capture=moved?capturedPiece(state,data.state):null;
  const kingImpact=moved?kingCaptureSquare(state,data.state):null;
  state=data.state;logs=data.logs;selected=null;legal=[];
  if(rewound)animationKey='';if($('promotion').open)$('promotion').close();
  message=state.result||(state.flipped.length?`${state.flipped.length}枚が寝返りました。`:logs.at(-1)||'相手が参加しました。あなたの手番で指してください。');
  if(moved){
   if(promotedNow&&!state.result)playArcadeCue('promote');
   animationStarted=performance.now();animationKey=data.room+':'+(data.round||1)+':'+state.ply;
   const finish=()=>{if(state.destroyed||state.spawned)beginCollapse(state);else presentEffects(state);};
   if(state.flipped.length>=1||capture||slide||kingImpact!==null){
    comboPreparing=true;render();comboActive=true;comboPreparing=false;
    const controller=new AbortController();comboController=controller;
    (async()=>{if(slide)await runSlide(slide,$('board'),controller.signal,playMoveSound);if(controller.signal.aborted)return;if(kingImpact!==null)await runKingImpact($('board'),kingImpact,controller.signal);if(controller.signal.aborted)return;if(!slide&&!capture&&!state.flipped.length&&!state.result)playMoveSound();if(capture)await runCapture(capture,controller.signal,{moveSound:!slide,shake:!flipNeedsShake(state)});if(controller.signal.aborted)return;if(state.flipped.length)await runCombo(state,document.querySelector('.board-area'),online.side,controller.signal);})().finally(()=>{if(controller.signal.aborted)return;comboActive=false;comboController=null;animationKey='';finish();render();});
   }else{if(!state.destroyed&&!state.spawned&&!state.result){if(state.flipped.length)playMultiFlipSound();else playMoveSound();}finish();}
  }
 }
 if(changed||reconnected)render();else paintCollapse();syncAI();
}
async function poll(){
 clearTimeout(pollTimer);if(!online)return;const room=online.room,token=online.token;
 try{const data=await request('/'+room,token);if(online?.room===room)adopt(data);}catch(e){if(online?.room===room){connected=false;message=e.message;render();}}
 if(online?.room===room)pollTimer=setTimeout(poll,connected?2000:5000);
}
async function sendAction(action,move){
 if(!online||busy||collapseEffect||comboActive||comboPreparing||effectsActive)return;busy=true;render();const room=online.room;
 try{const data=await request('/'+room+'/action',online.token,{action,move,version:online.version});if(online?.room===room)adopt(data);}
 catch(e){message=e.message;if(e.status===409)await poll();}
 finally{busy=false;render();}
}
function enter(data,token,invite){
 cancelCombo();cancelCollapse();
 stopAI();aiTiming=null;online={...data,token,invite};state=data.state;logs=data.logs;stack=[];selected=null;legal=[];inviteRoom=null;connected=true;
 storage.set('hanten-room-'+data.room,{token,invite});history.replaceState(null,'',location.pathname+'#room='+data.room);
 message=state.result|| (data.joined?(data.kind==='ai'?'AIと対局を開始しました。':'対戦相手と接続しました。自分の手番で指してください。'):'招待リンクを相手に送ってください。');render();poll();
}
for(const [value,name] of Object.entries(handicapOptions)){const option=document.createElement('option');option.value=value;option.textContent=name;$('handicap').append(option);$('aiHandicap').append(option.cloneNode(true));}
const explainTime=()=>{const unlimited=Number($('mainTime').value)===minuteSteps.length;$('incrementTime').disabled=$('byoyomiTime').disabled=unlimited;const minutes=minuteSteps[Number($('mainTime').value)],increment=Number($('incrementTime').value),byoyomi=byoyomiSteps[Number($('byoyomiTime').value)];for(const [id,out,value,unit] of [['mainTime','mainTimeValue',minutes,'分'],['incrementTime','incrementValue',increment,'秒'],['byoyomiTime','byoyomiValue',byoyomi,'秒']]){const text=id==='mainTime'&&unlimited?'無限':value+unit;$(out).textContent=text;$(id).setAttribute('aria-valuetext',text);}$('timeHelp').textContent=unlimited?'時間無制限':!minutes&&!increment&&!byoyomi?'時間制限なし（持ち時間の右端で「無限」を選べます）':(!increment&&!byoyomi?'持ち時間が切れたら負け。':`毎手＋${increment}秒 ／ 持ち時間の後は秒読み${byoyomi}秒。`)+(minutes===0&&increment>0&&byoyomi===0?' 初手も加算秒数から開始。':'');};
for(const id of ['mainTime','incrementTime','byoyomiTime'])$(id).oninput=explainTime;explainTime();
for(const id of ['chooseRules','openRulesAlways','openRulesSettings'])$(id).onclick=()=>$('rulesDialog').showModal();$('closeRules').onclick=()=>$('rulesDialog').close();
setInterval(()=>{for(const n of [0,1]){const el=$('clock'+n);if(!el)continue;el.hidden=!online?.clock;if(el.hidden)continue;const now=Date.now()+clockOffset,ms=Math.max(0,clockBudget(online,n,now)),secs=Math.ceil(ms/1000);el.textContent=(n===(online?.side??0)?'あなた ':'相手 ')+Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0')+(!state.result&&n===state.turn&&now<online.clock.since?' · 準備／演出中':'');el.classList.toggle('clock-active',n===state.turn&&!state.result);}},100);
const advancedOpen={ai:false,friend:false};
function selectKind(kind){advancedOpen[selectedKind]=$('advancedSettings').open;selectedKind=kind;$('advancedSettings').open=advancedOpen[kind];render();}
$('chooseAI').onclick=()=>selectKind('ai');$('chooseFriend').onclick=()=>selectKind('friend');$('moveLimit').onchange=render;$('allowDrops').onchange=render;$('aiLevel').onchange=render;$('thinkTime').onchange=render;
$('challengeOsesho').onchange=()=>{const option=$('aiLevel').querySelector('option[value="osesho"]');option.hidden=!$('challengeOsesho').checked;if($('challengeOsesho').checked){$('aiLevel').value='osesho';$('thinkTime').value='5000';selectKind('ai');message='対オセショ様をAI一覧に表示しました。人間が勝てる保証はありません。';}else if($('aiLevel').value==='osesho')$('aiLevel').value='expert';render();};
$('createRoom').onclick=async()=>{
 if(!$('paradoxAt').reportValidity())return;
 if(state.ply&&!window.confirm('現在の盤面から離れ、新しいオンライン対局を作成しますか？'))return;
 busy=true;render();try{
  let draft=storage.get('hanten-pending-room');if(draft&&(draft.kind!==selectedKind||JSON.stringify(draft.settings)!==JSON.stringify(selectedSettings())))draft=null;if(!draft){draft={token:freshToken(),invite:freshToken(),kind:selectedKind,settings:selectedSettings()};storage.set('hanten-pending-room',draft);}
  const data=await request('',draft.token,{invite:draft.invite,kind:draft.kind,settings:draft.settings});enter(data,draft.token,draft.invite);localStorage.removeItem('hanten-pending-room');
 }catch(e){message=e.message;}finally{busy=false;render();}
};
$('joinRoom').onclick=async()=>{if(!inviteRoom)return;busy=true;render();try{const saved=storage.get('hanten-room-'+inviteRoom.room)||{token:freshToken()};storage.set('hanten-room-'+inviteRoom.room,saved);const data=await request('/'+inviteRoom.room+'/join',saved.token,{invite:inviteRoom.invite});enter(data,saved.token);}catch(e){message=e.message;}finally{busy=false;render();}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='コピーしました';}catch{$('inviteLink').select();message='招待リンクを選択しました。コピーして相手に送ってください。';render();}};
$('offerRematch').onclick=()=>sendAction('offer-rematch');$('acceptRematch').onclick=()=>sendAction('accept-rematch');$('declineRematch').onclick=()=>sendAction('decline-rematch');$('closeToss').onclick=()=>{playArcadeCue('start');$('furigoma').hidden=true;syncAI();};
$('acceptDraw').onclick=()=>sendAction('accept-draw');$('declineDraw').onclick=()=>sendAction('decline-draw');
let routeVersion=0;
async function restore(){
 const version=++routeVersion;clearSession();start(initial(),homeMessage);
 const params=new URLSearchParams(location.hash.slice(1)),room=params.get('room'),invite=params.get('invite');if(!room)return;
 if(!/^[a-f0-9]{32}$/.test(room)){message='招待リンクが正しくありません。';render();return;}
 const saved=storage.get('hanten-room-'+room);
 if(saved?.token){busy=true;render();try{const data=await request('/'+room,saved.token);if(version===routeVersion)enter(data,saved.token,saved.invite);return;}catch(e){if(version===routeVersion)message=e.message;return;}finally{if(version===routeVersion){busy=false;render();}}}
 if(invite&&/^[a-f0-9]{64}$/.test(invite)){try{const preview=await request('/'+room+'/preview',freshToken(),{invite});if(version!==routeVersion)return;inviteRoom={room,invite,settings:preview.settings};}catch(e){if(version===routeVersion){message=e.message;render();}return;}message='「この対局に参加」を押すと、振り駒で先手・後手を決めます。';}
 else message='参加情報がありません。元の招待リンクを開くか、参加したブラウザで開いてください。';render();
}
if(matchMedia('(prefers-reduced-motion: reduce)').matches){$('tutorialVideo').autoplay=false;$('tutorialVideo').pause();}
document.addEventListener('click',event=>{if(event.target.closest?.('#chooseAI,#chooseFriend,#chooseRules,#openRulesAlways,#openSettings,#closeSettings,#closeRules,#copyInvite'))playArcadeCue('tap');});
window.addEventListener('hashchange',restore);
render();restore();



function helperAvailable(){return canAct()&&online?.kind==='ai'&&!helperJob&&!helperLingering&&(online.settings?.helperUnlimited||online.helperUsedRound!==(online.round||1));}
const helperConfirmKey=()=>online?'skip-helper-confirm-'+online.room+'-'+(online.round||1):null;
$('skipHelperConfirm').onchange=()=>{const key=helperConfirmKey();if(key)storage.set(key,$('skipHelperConfirm').checked);};
const askOsesho=()=>{if(helperAvailable()){if(storage.get(helperConfirmKey())===true){useHelper();return;}$('skipHelperConfirm').checked=false;$('oseshoDialog').querySelector('p').textContent=(online.settings?.helperUnlimited?'オセロ将棋の神 オセショ様が何度でも代わりに打ってくれます':'オセロ将棋の神 オセショ様がゲーム中に1回だけ代わりに打ってくれます')+'。「仕方ないなぁ…」';$('oseshoDialog').showModal();}};$('askOsesho').onclick=askOsesho;$('osesho').onclick=askOsesho;
$('oseshoNo').onclick=()=>$('oseshoDialog').close();
$('oseshoYes').onclick=()=>useHelper();
async function useHelper(){
 $('oseshoDialog').close();if(!helperAvailable())return;
 clearTimeout(helperIdeaTimer);helperIdea=false;
 message='仕方ないなぁ… オセショ様がこちらへ移動しました。';
 const room=online.room,version=online.version,token=online.token,task=startAI(state,'osesho',5000);helperJob=task;busy=true;selected=null;legal=[];render();
 try{
  const result=await task.promise;
  if(helperJob!==task||online?.room!==room||online.version!==version)return;
  if(!result.move)throw new Error('指せる手がありません。');
  helperIdea=true;render();
  if(helperJob!==task||online?.room!==room||online.version!==version)return;
  const data=await request('/'+room+'/action',token,{action:'helper-move',move:result.move,version});
  if(helperJob!==task||online?.room!==room)return;
  helperJob=null;helperFarewell=false;helperLingering=!data.settings?.helperUnlimited;adopt(data);
  const round=online.round;helperIdeaTimer=setTimeout(()=>{if(online?.room!==room||online.round!==round)return;helperIdea=false;if(helperLingering)helperFarewell=true;render();},1800);setTimeout(()=>{if(online?.room!==room||online.round!==round||!helperLingering)return;helperDeparting=true;playHelperDeparture();render();setTimeout(()=>{if(online?.room===room&&online.round===round){helperDeparting=false;helperLingering=false;render();}},450);},2300);
 }catch(error){if(error.name!=='AbortError'){message=error.message;}}
 finally{if(helperJob===task){helperJob=null;helperIdea=false;}if(online?.room===room){busy=false;render();}}
};

$('helperAd').onclick=()=>{$('helperUnlimited').checked=true;$('helperAdNote').textContent='無限を有効にしました。現在は広告なしで利用できます。';};
