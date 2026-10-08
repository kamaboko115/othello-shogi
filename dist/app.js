import {initRoomChat} from './room-chat.js';
import {initEffectsVolume} from './audio-settings.js';
import {collapseSteps,initCollapseSlider} from './collapse-options.js';
import {showChallengeCelebration} from './challenge-celebration.js';
import {createChallengeWins} from './challenge-wins.js';
import {allowsTakeback,challengeSettings,helperRemaining,isOseshoChallenge} from './challenge-options.js';
import {runParadoxEvent} from './paradox-event.js';
import {initMusic} from './music.js';
import {initReplayViewer} from './replay-view.js';
import {createRewardAds,rewardProviderEnabled} from './reward-ad.js';
import {createWinAdBreak} from './ad-break.js';
import {guideHTML,initBeginnerGuide,initTutorialMenu} from './novice-guide.js';
import {initCredits} from './credits.js';
import {placeHelper} from './helper-visit.js';
import {createDevAccess} from './dev-access.js';
import {presentToss,createTossHistory} from './toss.js';
import {adjudicationLimit} from './judge-options.js';
import {paintCollapse,paintArrival,collapseStrikeDuration,collapseStrikeDelay} from './collapse-view.js';
import {kingCaptureSquare,runKingImpact} from './impact.js';
import {minuteSteps,byoyomiSteps,clockRule,handicapOptions,clockBudget,clockSecondsLabel,timeHelp} from './match-options.js';
import {runCombo,comboTier,decorateFinish,capturedPiece,runCapture,flipNeedsShake,slidingMove,runSlide} from './combo.js';
import {initDeveloper} from './developer.js';
import {resultView} from './result-view.js';
import {paradoxSound,paradoxBanner,prepareParadoxSounds} from './paradox.js';
import {animateFlipLight} from './flip-light.js';
import {moveEffects,runEffects,showVictory,isVictoryFor} from './move-effect.js';
import {startAI} from './ai-client.js';
import {createLocalAIStore} from './local-ai-game.js';
import {createRoomTransport,createRoomPoller} from './room-network.js';
import {initBuildInfo,initBoardPreview,shareInvitation,initRecordViewer} from './lobby-tools.js';
import {createClockWarning} from './clock-warning.js';
import {playClockWarning} from './sound.js';
import {prepareMoveSound,playMoveSound,playTossShatterSound,playTossCutInSound,playMultiFlipSound,playResultSound,playApplauseSound,playArcadeCue,playHelperDeparture,playParadoxArrival} from './sound.js';
import {initial,moves,movementTargets,label,pieceGlyph,names,points,beforeParadox} from './engine.js';
const $=id=>document.getElementById(id),side=n=>n===0?'先手':'後手',coord=i=>`${9-i%9}${'一二三四五六七八九'[Math.floor(i/9)]}`;
const roomChat=initRoomChat();
// Reserve the toolbar's actual height, including rematch prompts and safe areas.
new ResizeObserver(([entry])=>{
 const height=entry.target.getBoundingClientRect().height;
 document.documentElement.style.setProperty('--result-actions-height',height+'px');
}).observe($('resultActions'));
const localAI=createLocalAIStore();
const challengeWins=createChallengeWins();
let challengeCountShown=false,challengeReportKey='';
function showChallengeCount(){if(challengeCountShown)return;challengeCountShown=true;challengeWins.count().then(total=>{$('challengeWins').textContent=`全プレイヤー合計：オセショ様に${total}勝`;} ).catch(()=>{$('challengeWins').textContent='全プレイヤーの合計勝利数は現在確認できません';});}
function showChallengeVictory(data){
 const el=$('challengeVictory'),eligible=challengeWins.eligible(data);el.hidden=!eligible;if(!eligible){el.classList.remove('challenge-crowned');return;}
 const key=data.room+':'+data.round;if(challengeReportKey===key)return;challengeReportKey=key;
 el.textContent='オセショ様に勝利！ 全プレイヤーの勝利数に加算しています…';$('retryChallengeWin').hidden=true;
 challengeWins.report(data).then(({ordinal})=>{if(challengeReportKey===key){showChallengeCelebration(el,ordinal);}}).catch(error=>{if(challengeReportKey===key){el.textContent='オセショ様に勝利！ '+(error.status===422?error.message:'集計に接続できませんでした。');$('retryChallengeWin').hidden=error.status===422;const link=document.createElement('a');link.className='challenge-share';link.textContent='ツイッターで共有';link.target='_blank';link.rel='noopener noreferrer';link.href='https://x.com/intent/tweet?'+new URLSearchParams({text:'私はオセショ様に勝ちました！ #オセロ将棋 #オセショギ #OSESHOGI',url:'https://oshogi-games.pages.dev/'});el.append(link);}});
}
$('retryChallengeWin').onclick=()=>{challengeReportKey='';showChallengeVictory(online);};
const winAds=createWinAdBreak();
initEffectsVolume(document);
const music=initMusic(document);
const rewardAds=createRewardAds({pause:()=>music.pause(),resume:()=>music.resume()});
if(!rewardProviderEnabled&&!['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname)){$('helperAd').disabled=true;$('helperAd').textContent='広告準備中';}
const statusPanel=document.querySelector('.status'),statusParent=statusPanel.parentElement,statusNext=statusPanel.nextSibling;
let comboActive=false,comboPreparing=false,comboController=null;
function cancelCombo(){comboController?.abort();comboController=null;comboActive=false;comboPreparing=false;cancelEffects();}
let effectsActive=false,effectsController=null,victoryNode=null,clearFinish=null;
function hideBurst(){clearFinish?.();clearFinish=null;victoryNode?.remove();victoryNode=null;clearTimeout(burstTimer);const el=document.getElementById('flipBurst');if(el)el.hidden=true;}
function cancelEffects(){effectsController?.abort();effectsController=null;effectsActive=false;hideBurst();}
function presentEffects(next){
 cancelEffects();const effects=moveEffects(next);if(!effects.length)return;
 const controller=new AbortController();effectsController=controller;effectsActive=true;
 runEffects(effects,{signal:controller.signal,show:effect=>{if(effect.kind==='check')playArcadeCue('check');if(effect.kind==='victory')victoryNode=showVictory(effect,online?.side??0);else showFlipBurst(0,effect.text);},hide:()=>{if(effectsController===controller)hideBurst();},applause:playApplauseSound,victory:effect=>playResultSound(isVictoryFor(effect,online?.side??0),controller.signal)}).finally(()=>{if(controller.signal.aborted)return;effectsActive=false;render();});
}
const homeMessage='対局を作成するか、招待リンクから参加してください。';
let state=initial(),selected=null,legal=[],stack=[],logs=[],pending=[],message=homeMessage;
let inspected=null,inspectedTargets=[];
function clearInspection(){inspected=null;inspectedTargets=[];}
let online=null,busy=false,connected=true,inviteRoom=null;
let selectedKind='friend',clockOffset=0;
const transport=createRoomTransport({onClock:now=>{clockOffset=now-Date.now();}});
function paintNetworkUsage(){const stats=transport.getStats(),el=$('networkUsage');if(el)el.textContent=`この対局のAPI通信: ${stats.requests}回（取得 ${stats.reads}／操作 ${stats.writes}） · 受信 ${(stats.responseBytes/1024).toFixed(1)} KiB · 変更なし ${stats.unchanged}回`+(online?.local?' · AI対局は端末内で処理':'');}
let autoHelperAttempt=null;
let aiJob=null,aiTiming=null,helperJob=null,helperDeparting=false,helperLingering=false,helperIdea=false,helperFarewell=false,helperIdeaTimer=null;
let helperVisiting=false,helperGreeting=false,helperTravelPending=false;
let collapseEffect=null,collapseTimer=null,collapseController=null,removeParadoxBanner=null;
function cancelCollapse(){collapseController?.abort();collapseController=null;clearTimeout(collapseTimer);removeParadoxBanner?.();removeParadoxBanner=null;collapseEffect=null;}
function paintLastCollapse(){
 if(collapseEffect?.paradoxEvent){paintCollapse($('board'),null);return;}
 if(collapseEffect?.spawned){paintCollapse($('board'),null);paintArrival($('board'),collapseEffect,collapseEffect.breaking);return;}
 paintCollapse($('board'),collapseEffect?.destroyed||state.destroyed,{perspective:online?.side??0,phase:collapseEffect?(collapseEffect.breaking?'breaking':'waiting'):comboPreparing||comboActive?'waiting':'ash',eventKey:(online?.room||'')+':'+(online?.round||1)+':'+state.ply});
}
function beginCollapse(next){
 cancelCollapse();collapseEffect={destroyed:next.destroyed,spawned:next.spawned,paradoxEvent:next.paradoxEvent,breaking:false};state=beforeParadox(next);
 if(next.paradoxEvent){
  const controller=new AbortController();collapseController=controller;render();
  collapseTimer=setTimeout(()=>runParadoxEvent($('board'),next,online?.side??0,controller.signal).finally(()=>{if(controller.signal.aborted)return;state=next;collapseEffect=null;collapseController=null;presentEffects(state);render();}),120);return;
 }
 if(next.paradoxStarted){removeParadoxBanner=paradoxBanner();paradoxSound(true);}
 const finish=()=>{removeParadoxBanner?.();removeParadoxBanner=null;if(next.paradoxStarted){collapseEffect=null;presentEffects(state);render();return;}state=next;if(next.spawned||next.paradoxEvent)playParadoxArrival();else paradoxSound(false);collapseEffect.breaking=true;render();collapseTimer=setTimeout(()=>{collapseEffect=null;presentEffects(state);render();},next.destroyed?collapseStrikeDuration:1200);};
 collapseTimer=setTimeout(finish,next.paradoxStarted?3000:next.destroyed?collapseStrikeDelay:120);
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
const tossHistory=createTossHistory({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
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
$('openSettings').onclick=()=>{paintNetworkUsage();$('settingsDialog').showModal();};
$('closeSettings').onclick=()=>{$('settingsDialog').close();syncAI();};
initCredits(document);
createDevAccess({document}).guardDeveloperTools();
initBoardPreview(document);
initBuildInfo(document);
const recordViewer=initRecordViewer(document,recordLine);
const replayViewer=initReplayViewer(document,async()=>{if(!online)throw Error('対局がありません。');return online.local?localAI.replay(online.room):request('/'+online.room+'/replay',online.token);});
$('autoHelper').onchange=()=>{autoHelperAttempt=null;syncAI();};
const updateCollapseSlider=initCollapseSlider($('paradoxAt'),$('paradoxAtValue'));

const tutorialTools=initDeveloper(()=>({state,side:online?.side??0}),()=> $('tutorialPuzzleLaunch').click());
function stone(side){const el=document.createElement('span');el.className='stone '+(side===0?'black':'white');el.setAttribute('aria-hidden','true');return el;}
function recordLine(text){const el=document.createElement('div');for(const part of text.split(/([▲▽])/)){if(part==='▲'||part==='▽'){const mark=stone(part==='▲'?0:1);mark.removeAttribute('aria-hidden');mark.setAttribute('aria-label',part==='▲'?'先手':'後手');el.append(mark);}else el.append(document.createTextNode(part));}return el;}
const selectedSettings=()=>challengeSettings({timeControl:selectedKind==='friend'&&Number($('mainTime').value)<minuteSteps.length?{minutes:minuteSteps[Number($('mainTime').value)],increment:Number($('incrementTime').value),byoyomi:byoyomiSteps[Number($('byoyomiTime').value)]}:'none',handicap:selectedKind==='friend'?$('handicap').value:$('aiHandicap').value,paradoxAt:collapseSteps[Number($('paradoxAt').value)],moveLimit:false,noDrops:$('allowDrops').value==='no',...(selectedKind==='ai'?{helperUnlimited:$('helperUnlimited').checked,handicapSide:$('aiHandicapSide').value,aiLevel:$('aiLevel').value,thinkMs:Number($('thinkTime').value)}:{})},selectedKind);
// A collapse can change ownership/positions after the move animation. Do not
// allow moves or helper searches against that temporary presentation board.
const canAct=()=>!state.result&&!busy&&!!online&&connected&&online.joined&&online.side===state.turn&&!collapseEffect&&!((comboActive||comboPreparing)&&(online.state?.paradoxEvent||online.state?.destroyed||online.state?.spawned||online.state?.paradoxStarted));
const canInspect=()=>!!online?.joined&&!state.result&&!comboActive&&!comboPreparing&&!effectsActive&&!collapseEffect&&$('furigoma').hidden;
function renderHand(n){
 let clock=$('clock'+n);if(!clock){clock=document.createElement('div');clock.id='clock'+n;clock.className='player-clock';$('hand'+n).before(clock);}
 const h=$('hand'+n);h.replaceChildren();h.setAttribute('aria-label',`${side(n)}の駒台`);
 h.parentElement.className='player '+(n===(online?.side??0)?'self':'opponent');
 const oseshoMatch=online?.kind==='ai'&&online.settings?.aiLevel==='osesho',name=oseshoMatch&&n!==online.side?'オセショ様':side(n);h.parentElement.querySelector('strong').lastChild.textContent=' '+name;
 let badge=h.parentElement.querySelector('.hand-turn');if(!badge){badge=document.createElement('button');badge.type='button';badge.className='hand-turn';h.parentElement.insertBefore(badge,h);}
 badge.hidden=n!==(online?.side??0);badge.textContent=state.result?'対局終了':!online?.joined?'相手の参加待ち':online.side===state.turn?'自分の手番です':online?.settings?.aiLevel==='osesho'?'オセショ様の手番です':'相手の手番です';badge.disabled=!state.result;badge.onclick=()=>{if(state.result)resignAndLeave();};badge.title=state.result?'開始画面に戻る':'';badge.classList.toggle('my-turn',!!online&&online.side===state.turn&&!state.result);

 for(const type of ['R','B','G','S','N','L','P']){
  const count=state.hands[n][type]||0,btn=document.createElement('button');
  btn.className='hand-slot'+(count?' occupied':' empty')+(type==='P'?' pawn-slot':'');btn.dataset.type=type;
  btn.setAttribute('aria-label',`${side(n)} 持ち駒 ${names[type]} ${count}枚`);btn.disabled=!!state.noDrops||!count||n!==state.turn||!canAct();
  btn.setAttribute('aria-pressed',String(count>0&&n===state.turn&&selected===type));
  const glyph=document.createElement('span');glyph.className=count?'piece':'slot-label';glyph.textContent=names[type];btn.append(glyph);
  if(count){const quantity=document.createElement('span');quantity.className='hand-count';quantity.textContent=`×${count}`;btn.append(quantity);}
  glyph.dataset.side=n;btn.onclick=()=>select(type);h.append(btn);
 }
}
function render(){
 roomChat.update(online);
 const oseshoMatch=online?.kind==='ai'&&online.settings?.aiLevel==='osesho';
 const helperVisible=online?.kind==='ai'&&online.joined&&((!state.result&&helperRemaining(online)>0)||helperLingering||helperIdea);
 $('askOsesho').hidden=!oseshoMatch||!helperVisible;$('askOsesho').disabled=!helperAvailable();$('osesho').hidden=!(oseshoMatch||helperVisible);$('tagline').hidden=!!online;
 $('osesho').disabled=oseshoMatch||!canAct()||!!helperJob||helperLingering;
 $('osesho').classList.toggle('idea',helperIdea);$('osesho').classList.toggle('thinking',!!helperJob);$('osesho').classList.toggle('departing',helperDeparting);
 $('oseshoStatus').textContent=helperGreeting?'仕方ないなぁ…':helperIdea?'ひらめいた！':helperFarewell?'じゃあの':oseshoMatch&&!helperJob&&!helperLingering?'対局中のオセショ様':helperLingering?'':helperJob?'オセショ様が考えています…':state.turn!==online?.side?'あなたの手番で頼めます':isOseshoChallenge(online?.settings)?`オセショ様 · 残り${helperRemaining(online)}回`:online?.settings?.helperUnlimited?'無限オセショ様':'オセショ様 · 1局1回';
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

 const perspective=online?.side??0;
 const ending=!!online&&!!state.result&&!collapseEffect&&!comboPreparing;
 document.body.classList.toggle('game-ended',ending);
 $('resultHeading').hidden=$('resultActions').hidden=!ending;
 const resultInfo=ending?resultView(state,perspective):null;
 if(ending){winAds.counter.record({...online,state});showChallengeVictory({...online,state});}else{$('challengeVictory').hidden=true;$('retryChallengeWin').hidden=true;}
 if(resultInfo){$('resultTitle').textContent=resultInfo.title;$('resultReason').textContent=resultInfo.reason;$('resultDetail').textContent=resultInfo.detail;}
 const rematchHome=ending?$('resultActions'):document.querySelector('aside');
 if($('rematchPanel').parentElement!==rematchHome)rematchHome.prepend($('rematchPanel'));
 const replayHome=ending?$('resultActions'):$('recordDialog');if($('openReplay').parentElement!==replayHome)replayHome.append($('openReplay'));
 const recordHome=ending?$('resultActions'):$('record').parentElement;
 if($('openRecord').parentElement!==recordHome){if(ending)recordHome.append($('openRecord'));else recordHome.insertBefore($('openRecord'),$('record'));}

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
  if(p){const span=document.createElement('span');span.className='piece'+((comboPreparing&&state.flipped.includes(i)?1-p.side:p.side)!==perspective?' enemy':'')+(p.prom?' prom':'')+(p.wings?' has-wings':'')+(pieceGlyph(p).length>1?' long':'');span.dataset.side=comboPreparing&&state.flipped.includes(i)?1-p.side:p.side;span.textContent=pieceGlyph(p);if(animate&&state.flipped.includes(i)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const multi=state.flipped.length>=2,start=p.side!==perspective?0:180,end=start+180;const anim=span.animate(multi?[{transform:'translateY(0) scale(1) rotate('+start+'deg)'},{offset:.38,transform:'translateY(-8px) scale(1.13) rotate('+(start+70)+'deg)'},{offset:.75,transform:'translateY(-3px) scale(1.06) rotate('+end+'deg)'},{transform:'translateY(0) scale(1) rotate('+end+'deg)'}]:[{transform:'rotate('+start+'deg)'},{transform:'rotate('+end+'deg)'}],{duration:multi?900:650,easing:'ease-in-out'});anim.currentTime=elapsed;if(multi)el.classList.add('multi-flip');animateFlipLight(el,p.side,multi?900:650,elapsed);}el.append(span);}
  el.classList.toggle('inspected',inspected===i);el.classList.toggle('inspect-target',inspectedTargets.includes(i));
  el.setAttribute('aria-pressed',String(selected===i||inspected===i));
  if(inspectedTargets.includes(i))el.setAttribute('aria-label',el.getAttribute('aria-label')+' 相手の移動先（確認のみ）');
  el.disabled=!canAct()&&!canInspect();el.onclick=()=>click(i);board.append(el);
 }
 for(let n=0;n<2;n++)renderHand(n);
 placeHelper($('osesho'),{home:$('oseshoHome'),opponent:oseshoMatch?document.querySelector('.player.opponent'):null,visiting:helperVisiting,travel:helperTravelPending,sound:playHelperDeparture});helperTravelPending=false;
 const turnName=oseshoMatch&&state.turn!==online.side?'オセショ様':side(state.turn);$('turn').textContent=state.result||` ${turnName}の番`;if(!state.result)$('turn').prepend(stone(state.turn));
 $('boardProgress').hidden=!state.mode;
 const collapseAt=state.paradoxAt===false?null:(state.paradoxAt??150);
 $('boardProgress').innerHTML=collapseAt!==null?`${collapseAt===0?state.ply+'手目':`終末まで ${state.ply}/${collapseAt}`}${state.ply>=collapseAt?' · <span class="paradox-active-label">盤面崩壊中</span>':''}${adjudicationLimit(state)===false?'':` ／ 決着まで ${Math.min(state.ply,adjudicationLimit(state))}/${adjudicationLimit(state)}`}`:adjudicationLimit(state)===false?`${state.ply}手目`:`決着まで ${Math.min(state.ply,adjudicationLimit(state))}/${adjudicationLimit(state)}`;
 $('boardProgress').title=collapseAt===0?'最初の1手から盤面崩壊が発動します':collapseAt!==null?`盤面崩壊までの手数（${collapseAt}手から開始）`:'';
 $('count').textContent='オセロ将棋';
 const scores=points(state);$('scores').hidden=!state.mode;$('scores').textContent=`盤上：先手 ${scores[0]}枚　／　後手 ${scores[1]}枚`;
 $('message').textContent=message.replaceAll('▲','●').replaceAll('▽','○');
 $('reset').hidden=!online;
 $('requestUndo').title=allowsTakeback(online)?'':'対オセショ様では待ったを使えません。';
 $('requestUndo').disabled=!allowsTakeback(online)||!online?.canUndo||busy||!connected||!!online?.undoOffer;
 $('undoPanel').hidden=!online?.undoOffer;
 const undoMine=online?.undoOffer?.seat===(online?.seat??online?.side);
 $('undoText').textContent=online?.undoOffer?(undoMine?'待ったの承諾を待っています。':'相手が待ったを希望しています。')+' '+online.undoOffer.ply+'手終了時の盤面へ戻します。':'';
 $('acceptUndo').hidden=undoMine;for(const id of ['acceptUndo','declineUndo'])$(id).disabled=busy||!connected;

 $('resign').disabled=!online||!!state.result||busy||!online.joined||!connected;
 $('draw').disabled=$('resign').disabled;$('draw').textContent='引き分けを提案';
 $('record').replaceChildren(...logs.slice(-12).reverse().map(recordLine));
 replayViewer.update(online?online.room+':'+(online.round||1):null,!!state.result,ending);
 recordViewer.update(logs,online?online.room+':'+(online.round||1):null);
 $('createRoom').hidden=!!online||!!inviteRoom;$('createRoom').disabled=busy;
 $('joinRoom').hidden=!inviteRoom||!!online;$('joinRoom').disabled=busy;
 $('roomTools').hidden=!online;
 $('connection').hidden=!online&&!inviteRoom;
 $('connection').textContent=online?.kind==='ai'?`${oseshoMatch?'オセショ様':'AI'}対局 · あなたは${side(online.side)}`:online?`${connected?'接続中':'再接続中…'} · あなたは${side(online.side)}${online.joined?'':' · 相手の参加待ち'}`:inviteRoom?'参加後、振り駒で先手・後手を決めます。':'招待リンクで、離れた相手と対戦できます。';
 if(online?.kind==='ai'){
  if(aiJob)$('connection').textContent+=oseshoMatch?' · オセショ様思考中…':' · AI思考中…';
  else if(aiTiming)$('connection').textContent+=' · AI思考 '+(aiTiming.elapsedMs/1000).toFixed(2)+'秒';
  $('connection').dataset.aiTiming=aiTiming?JSON.stringify(aiTiming):'';
  if(online.local&&online.storageWarning)$('connection').textContent+=' · '+online.storageWarning;
 }
 $('inviteTools').hidden=!online||(online.seat??0)!==0||online.joined;
 if(online?.invite)$('inviteLink').value=location.origin+location.pathname+'#room='+online.room+'&invite='+online.invite+'&limit='+(adjudicationLimit(online.settings||{})===false?'no':adjudicationLimit(online.settings||{}))+'&drops='+(online.settings?.noDrops?'no':'yes');
 $('drawOffer').hidden=!online||online.offer===null||!!state.result;
 if(online&&online.offer!==null){$('drawText').textContent=online.offer===(online.seat??online.side)?'相手に引き分けを提案しています。':'相手から引き分けの提案があります。';$('acceptDraw').hidden=online.offer===(online.seat??online.side);}
 document.querySelector('.local').textContent=oseshoMatch?'オセショ様対局':online?.kind==='ai'?'AI対局':'オセロ将棋';
 $('matchSetup').hidden=!!online||!!inviteRoom;
 $('matchTitle').innerHTML=online?(oseshoMatch?'オセショ様対局':online.kind==='ai'?'AI対局':'友人対局'):'<ruby>対局<rt>たいきょく</rt></ruby>を<ruby>選<rt>えら</rt></ruby>ぶ';
 $('chooseAI').setAttribute('aria-pressed',selectedKind==='ai');$('chooseFriend').setAttribute('aria-pressed',selectedKind==='friend');
 $('helperUnlimitedRow').hidden=selectedKind!=='ai';$('aiHandicapRow').hidden=selectedKind!=='ai';$('friendSettings').hidden=selectedKind!=='friend';$('aiLevelRow').hidden=selectedKind!=='ai';$('thinkTimeRow').hidden=selectedKind!=='ai';$('aiSettingsRow').hidden=selectedKind!=='ai';
 const oseshoChallenge=selectedKind==='ai'&&$('aiLevel').value==='osesho';
 $('oseshoChallengeWarning').hidden=!oseshoChallenge;if(oseshoChallenge)showChallengeCount();
 $('createRoom').textContent=oseshoChallenge?'オセショ様に挑戦する':selectedKind==='ai'?'AIと対局を始める':'対局を作って招待する';
 const settings=online?.settings||inviteRoom?.settings||selectedSettings();
 $('matchSettings').hidden=!online&&!inviteRoom;
 $('matchSettings').textContent='チェスモード：'+(settings.noDrops?'あり':'なし')+(online?.kind==='ai'?' ／ AI：'+({weak:'弱い',normal:'普通',strong:'強い',expert:'最強',osesho:'オセショ様（人間が勝てる保証なし）'}[settings.aiLevel]||'普通')+('（最大'+((settings.thinkMs||1000)/1000)+'秒）'):'');
 $('matchSettings').textContent+=' ／ 盤面崩壊：'+(settings.paradoxAt===false?'無制限':(settings.paradoxAt??150)+'手から');
 if(online?.kind==='ai')$('matchSettings').textContent+=' ／ '+(settings.handicapSide==='human'?'人間側':'AI側')+'：'+(handicapOptions[settings.handicap]||'平手');
 if(online?.kind!=='ai')$('matchSettings').textContent+=' ／ 時間：'+(clockRule(settings.timeControl).label)+' ／ 作成者：'+(handicapOptions[settings.handicap]||'平手');

 $('rematchPanel').hidden=!online||!state.result;
 const requested=online?.rematch!=null,mine=requested&&online.rematch===(online.seat??online.side);
 $('rematchText').textContent=requested?(mine?'相手の承諾を待っています。':'相手が再試合を希望しています。'):'';
 $('offerRematch').hidden=requested;$('acceptRematch').hidden=!requested||mine;$('declineRematch').hidden=!requested;
 for(const id of ['offerRematch','acceptRematch','declineRematch'])$(id).disabled=busy||!connected;
 if(!online)$('furigoma').hidden=true;
 if(online?.joined&&online.toss){const key=online.room+':'+online.round;if(lastTossKey!==key){lastTossKey=key;if(tossHistory.claim(key,online.state.ply>0||!!online.state.result))presentToss({toss:online.toss,playerSide:online.side,dialog:$('furigoma'),coins:$('tossCoins'),result:$('tossResult'),banner:$('tossSide'),cutin:$('tossCutIn'),close:$('closeToss'),onShatter:playTossShatterSound,onCutIn:playTossCutInSound,isCurrent:()=>lastTossKey===key&&online?.room+':'+online?.round===key});else $('furigoma').hidden=true;}}

 paintLastCollapse();syncAI();
}
function interruptMoveEffects(){
 if(!comboActive&&!comboPreparing&&!effectsActive&&!collapseEffect)return;
 cancelCombo();cancelCollapse();
 // Resign/undo and other interruptions must never leave beforeParadox() on screen.
 if(online?.state)state=online.state;
 selected=null;legal=[];clearInspection();animationKey='';render();
}
function select(src){if(!canAct())return;interruptMoveEffects();clearInspection();selected=selected===src?null:src;legal=selected===null?[]:moves(state,selected);message=selected===null?'駒を選んで、移動先をクリック。':legal.length?'白い印のマスへ移動できます。':'この駒は今、動かせません。';render();}
function click(i){
 if(!canAct()&&!canInspect())return;
 const choices=canAct()?legal.filter(m=>m.to===i):[];
 if(choices.length){interruptMoveEffects();if(choices.length>1){pending=choices;$('promotion').showModal();return;}commit(choices[0]);return;}
 if(state.board[i]?.side===1-online.side&&canInspect()){
  selected=null;legal=[];const same=inspected===i;clearInspection();
  if(!same){inspected=i;inspectedTargets=movementTargets(state,i);}
  message=inspected===null?'相手の駒を押すと、移動範囲を確認できます。':inspectedTargets.length?`相手の${label(state.board[i])}の移動範囲です（確認のみ）。`:'この相手の駒は今、動かせるマスがありません。';render();return;
 }
 if(canAct()&&state.board[i]?.side===state.turn){select(i);return;}
 clearInspection();selected=null;legal=[];message=canAct()?'自分の駒、または駒台の駒を選んでください。':'相手の手番です。相手の駒の移動範囲を確認できます。';render();
}
function commit(m){if(canAct())sendAction('move',m);}
function start(s,msg){clearInspection();state=s;stack=[];logs=[];selected=null;legal=[];message=msg||'駒を選んで、移動先をクリック。';render();}
let confirmAction=null;function confirm(title,fn){$('confirmTitle').textContent=title;confirmAction=fn;$('confirm').showModal();}
$('confirmYes').onclick=()=>{$('confirm').close();confirmAction?.();};$('confirmNo').onclick=()=>$('confirm').close();
$('promote').onclick=()=>{$('promotion').close();commit(pending.find(m=>m.prom));};$('stay').onclick=()=>{$('promotion').close();commit(pending.find(m=>!m.prom));};
function clearSession(){clearTimeout(helperIdeaTimer);helperJob?.cancel();helperJob=null;helperDeparting=false;helperLingering=false;helperIdea=false;helperFarewell=false;helperGreeting=false;helperVisiting=false;helperTravelPending=false;cancelCombo();cancelCollapse();stopAI();aiTiming=null;roomPoller.stop();online=null;inviteRoom=null;connected=true;busy=false;animationKey='';}
function leaveGame(){routeVersion++;clearSession();history.replaceState(null,'',location.pathname);start(initial(),homeMessage);}
async function resignAndLeave(){
 if(busy)return;
 if(!online){leaveGame();return;}
 const room=online.room,round=online.round;
 const data=await sendAction('leave');
 if(data?.closed&&online?.room===room&&online.round===round){leaveGame();await winAds.betweenMatches();}
}
$('closeResult').onclick=()=>resignAndLeave();
function requestLeave(){if(busy)return;if(state.result||!online?.joined)resignAndLeave();else confirm('対局を離れますか？',resignAndLeave);}
$('reset').onclick=requestLeave;
$('settingsLobby').onclick=()=>{if(busy)return;$('settingsDialog').close();requestLeave();};
$('requestUndo').onclick=()=>sendAction('offer-undo');$('acceptUndo').onclick=()=>sendAction('accept-undo');$('declineUndo').onclick=()=>sendAction('decline-undo');
$('resign').onclick=()=>{if(online&&!state.result)confirm('投了しますか？',()=>sendAction('resign'));};
$('draw').onclick=()=>{if(online&&!state.result)sendAction('offer-draw');};
async function request(path,token,body,options){
 if(online?.local&&path==='/'+online.room+(body?'/action':''))return body?localAI.action(online.room,body):localAI.read(online.room);
 try{return await transport.request(path,token,body,options);}finally{paintNetworkUsage();}
}
function adopt(data){
 if(!online||data.room!==online.room||data.version<online.version)return;
 clockOffset=(data.serverNow||Date.now())-Date.now();
 const previousRound=online.round||1,changed=data.version!==online.version,reconnected=!connected;if(changed)stopAI();online={...online,...data};connected=true;
 if(changed){
  cancelCombo();cancelCollapse();
  const moved=data.state.ply>state.ply&&(data.round||1)===previousRound,rewound=data.state.ply<state.ply;
  const ended=!state.result&&!!data.state.result&&(data.round||1)===previousRound;
  const settled=data.state,played=moved?beforeParadox(settled):settled;
  const last=played.last,promotedNow=moved&&last.length===2&&!state.board[last[0]]?.prom&&played.board[last[1]]?.prom;
  const slide=moved?slidingMove(state,played):null;
  const capture=moved?capturedPiece(state,played):null;
  const kingImpact=moved?kingCaptureSquare(state,played):null;
  clearInspection();state=played;logs=data.logs;selected=null;legal=[];
  if(rewound)animationKey='';if($('promotion').open)$('promotion').close();
  message=state.result||(state.flipped.length?`${state.flipped.length}枚が寝返りました。`:logs.at(-1)||'相手が参加しました。あなたの手番で指してください。');
  if(moved){
   if(promotedNow&&!state.result)playArcadeCue('promote');
   animationStarted=performance.now();animationKey=data.room+':'+(data.round||1)+':'+state.ply;
   const finish=()=>{state=settled;if(state.paradoxStarted||state.destroyed||state.spawned||state.paradoxEvent)beginCollapse(state);else presentEffects(state);};
   if(state.flipped.length>=1||capture||slide||kingImpact!==null){
    comboPreparing=true;render();comboActive=true;comboPreparing=false;
    const controller=new AbortController();comboController=controller;
    (async()=>{if(slide)await runSlide(slide,$('board'),controller.signal,playMoveSound);if(controller.signal.aborted)return;if(kingImpact!==null)await runKingImpact($('board'),kingImpact,controller.signal);if(controller.signal.aborted)return;if(!slide&&!capture&&!state.flipped.length&&!state.result)playMoveSound();if(capture)await runCapture(capture,controller.signal,{moveSound:!slide,shake:!flipNeedsShake(state)});if(controller.signal.aborted)return;if(state.flipped.length)await runCombo(state,document.querySelector('.board-area'),online.side,controller.signal);})().finally(()=>{if(controller.signal.aborted)return;comboActive=false;comboController=null;animationKey='';finish();render();});
   }else{if(!state.destroyed&&!state.spawned&&!state.result){if(state.flipped.length)playMultiFlipSound();else playMoveSound();}finish();}
  }else if(ended)presentEffects(state);
 }
 if(changed||reconnected)render();else paintLastCollapse();syncAI();
}
const roomPoller=createRoomPoller({
 read:options=>options.signal.aborted||!online||online.local?null:request('/'+online.room,online.token,undefined,{...options,version:online.version}),
 getState:()=>({joined:online?.joined,turn:state.turn,side:online?.side,result:!!state.result,hidden:document.hidden,connected,closed:!online||online.local||online.closed}),
 getDelay:(data,delay)=>{
  if(!online?.clock||state.result||!connected)return delay;
  const remaining=clockBudget(online,state.turn,Date.now()+clockOffset);
  return Number.isFinite(remaining)?Math.min(delay,Math.max(1000,remaining+100)):delay;
 },
 onData:data=>{if(data)adopt(data);else if(!connected){connected=true;render();}},
 onError:error=>{connected=false;if(error.status===404)online.closed=true;message=error.message;render();}
});
function schedulePolling(){if(online&&!online.local&&!online.closed)roomPoller.start({immediate:false});paintNetworkUsage();}
async function poll(){if(!online||online.local||online.closed)return;roomPoller.start({immediate:false});return roomPoller.refresh();}
async function sendAction(action,move){
 if(!online||busy)return;roomPoller.stop();interruptMoveEffects();busy=true;render();const room=online.room;
 const generation=routeVersion,current=()=>generation===routeVersion&&online?.room===room;
 try{const data=await request('/'+room+'/action',online.token,{action,move,version:online.version});if(current()){adopt(data);return data;}}
 catch(e){if(!current())return;if(action==='leave'&&e.status===404){leaveGame();return;}message=e.message;if(e.status===409){if(online?.local)adopt(localAI.read(room));else await poll();}}
 finally{if(current()){busy=false;render();schedulePolling();}}
}
function enter(data,token,invite){
 prepareMoveSound();prepareParadoxSounds(data.settings?.paradoxAt!==false);
 roomPoller.stop();cancelCombo();cancelCollapse();
 stopAI();aiTiming=null;clearInspection();online={...data,token,invite};state=data.state;logs=data.logs;stack=[];selected=null;legal=[];inviteRoom=null;connected=true;
 if(!data.local)storage.set('hanten-room-'+data.room,{token,invite});history.replaceState(null,'',location.pathname+(data.local?'#ai=':'#room=')+data.room);
 message=state.result|| (data.joined?(data.kind==='ai'?'AIと対局を開始しました。':'対戦相手と接続しました。自分の手番で指してください。'):'招待リンクを相手に送ってください。');render();schedulePolling();
}
for(const [value,name] of Object.entries(handicapOptions)){const option=document.createElement('option');option.value=value;option.textContent=name;$('handicap').append(option);$('aiHandicap').append(option.cloneNode(true));}
const explainTime=()=>{const unlimited=Number($('mainTime').value)===minuteSteps.length;$('incrementTime').disabled=$('byoyomiTime').disabled=unlimited;const minutes=minuteSteps[Number($('mainTime').value)],increment=Number($('incrementTime').value),byoyomi=byoyomiSteps[Number($('byoyomiTime').value)];for(const [id,out,value,unit] of [['mainTime','mainTimeValue',minutes,'分'],['incrementTime','incrementValue',increment,'秒'],['byoyomiTime','byoyomiValue',byoyomi,'秒']]){const text=id==='mainTime'?(unlimited?'無限':value+unit):(unlimited?'なし':clockSecondsLabel(value));$(out).textContent=text;$(id).setAttribute('aria-valuetext',text);}$('timeHelp').textContent=unlimited?'時間無制限':timeHelp({minutes,increment,byoyomi});};
for(const id of ['mainTime','incrementTime','byoyomiTime'])$(id).oninput=explainTime;explainTime();
const beginnerGuide=initBeginnerGuide(document,guideHTML);
initTutorialMenu(document,beginnerGuide,tutorialTools.startTutorial);
for(const id of ['chooseRules','openRulesAlways','openRulesSettings'])$(id).onclick=()=>$('rulesDialog').showModal();for(const id of ['closeRules','closeRulesTop'])$(id).onclick=()=>$('rulesDialog').close();
const warnClock=createClockWarning(playClockWarning);
setInterval(()=>{
 const now=Date.now()+clockOffset;
 if(online?.local&&online.clock&&!busy&&!state.result&&clockBudget(online,state.turn,now)<=0){adopt(localAI.read(online.room));}
 for(const n of [0,1]){const el=$('clock'+n);if(!el)continue;el.hidden=!online?.clock||online.kind==='ai'&&n!==online.side;if(el.hidden)continue;const ms=Math.max(0,clockBudget(online,n,now)),secs=Math.ceil(ms/1000);el.textContent=(n===(online?.side??0)?'あなた ':'相手 ')+(Number.isFinite(secs)?Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0'):'制限なし')+(!state.result&&n===state.turn&&now<online.clock.since?' · 準備／演出中':'');el.classList.toggle('clock-active',n===state.turn&&!state.result);}
 warnClock({turnKey:online?`${online.room}:${online.round}:${state.ply}:${state.turn}`:null,remaining:online?.clock?clockBudget(online,online.side,now):Infinity,active:!!online?.clock&&online.joined&&!online.closed&&!state.result&&state.turn===online.side&&now>=online.clock.since&&$('furigoma').hidden,audible:!document.hidden});
},100);
const advancedOpen={ai:false,friend:false};
function selectKind(kind){advancedOpen[selectedKind]=$('advancedSettings').open;selectedKind=kind;$('advancedSettings').open=advancedOpen[kind];syncChallengeControls();render();}
$('chooseAI').onclick=()=>selectKind('ai');$('chooseFriend').onclick=()=>selectKind('friend');$('allowDrops').onchange=render;$('aiLevel').onchange=render;$('thinkTime').onchange=render;
let normalAIControls=null;
function syncChallengeControls(){
 const challenge=selectedKind==='ai'&&$('aiLevel').value==='osesho';
 const ids=['thinkTime','paradoxAt','allowDrops','aiHandicap','aiHandicapSide'];
 if(challenge&&!normalAIControls)normalAIControls=Object.fromEntries(ids.map(id=>[id,$(id).value]));
 if(challenge){$('thinkTime').value='5000';$('paradoxAt').value=String(collapseSteps.indexOf(200));$('allowDrops').value='yes';$('aiHandicap').value='none';}
 else if(normalAIControls){for(const [id,value] of Object.entries(normalAIControls))$(id).value=value;normalAIControls=null;}
 updateCollapseSlider();
 for(const id of ids)$(id).disabled=challenge;
 $('aiLevel').classList.toggle('osesho-level',challenge);
 $('helperUnlimitedLabel').textContent=challenge?'オセショ様に3回頼む':'オセショ様を無限に';
 $('helperUnlimitedHelp').textContent=challenge?'次のオセショ様対局で代打を3回まで頼めます。オフなら1回です。':'次のAI対局のオセショ様が帰らずにいっぱいうってくれます';
}
$('aiLevel').onchange=()=>{syncChallengeControls();render();};
$('createRoom').onclick=async()=>{
 if(!$('paradoxAt').reportValidity())return;
 if(state.ply&&!window.confirm(selectedKind==='ai'?'現在の盤面から離れ、新しいAI対局を作成しますか？':'現在の盤面から離れ、新しいオンライン対局を作成しますか？'))return;
 if(busy)return;
 transport.resetStats();busy=true;render();try{
  await winAds.betweenMatches();
  if(selectedKind==='ai'){enter(localAI.create(selectedSettings()));return;}
  let draft=storage.get('hanten-pending-room');if(draft&&(draft.kind!==selectedKind||JSON.stringify(draft.settings)!==JSON.stringify(selectedSettings())))draft=null;if(!draft){draft={token:freshToken(),invite:freshToken(),kind:selectedKind,settings:selectedSettings()};storage.set('hanten-pending-room',draft);}
  const data=await request('',draft.token,{invite:draft.invite,kind:draft.kind,settings:draft.settings});enter(data,draft.token,draft.invite);localStorage.removeItem('hanten-pending-room');
 }catch(e){message=e.message;}finally{busy=false;render();}
};
$('joinRoom').onclick=async()=>{if(!inviteRoom)return;busy=true;render();try{const saved=storage.get('hanten-room-'+inviteRoom.room)||{token:freshToken()};storage.set('hanten-room-'+inviteRoom.room,saved);const data=await request('/'+inviteRoom.room+'/join',saved.token,{invite:inviteRoom.invite});enter(data,saved.token);}catch(e){message=e.message;}finally{busy=false;render();}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='コピーしました';}catch{$('inviteLink').select();message='招待リンクを選択しました。コピーして相手に送ってください。';render();}};
$('shareInvite').onclick=async()=>{
 const button=$('shareInvite');button.disabled=true;
 try{
  const result=await shareInvitation($('inviteLink').value);
  if(result==='copied')button.textContent='リンクをコピーしました';
  if(result==='select'){$('inviteLink').focus();$('inviteLink').select();message='共有に対応していないため、招待リンクを選択しました。コピーして相手に送ってください。';render();}
 }finally{button.disabled=false;}
};
async function rematchWithAd(action){
 if(busy||!online)return;const room=online.room,round=online.round;busy=true;render();
 await winAds.betweenMatches();busy=false;render();
 if(online?.room===room&&online.round===round&&state.result)return sendAction(action);
}
$('offerRematch').onclick=()=>rematchWithAd('offer-rematch');$('acceptRematch').onclick=()=>rematchWithAd('accept-rematch');$('declineRematch').onclick=()=>sendAction('decline-rematch');$('closeToss').onclick=()=>{playArcadeCue('start');$('furigoma').hidden=true;syncAI();};
$('acceptDraw').onclick=()=>sendAction('accept-draw');$('declineDraw').onclick=()=>sendAction('decline-draw');
let routeVersion=0;
async function restore(){
 const version=++routeVersion;clearSession();transport.resetStats();paintNetworkUsage();start(initial(),homeMessage);
 const params=new URLSearchParams(location.hash.slice(1)),localRoom=params.get('ai'),room=params.get('room'),invite=params.get('invite');
 if(localRoom){try{enter(localAI.read(localRoom));}catch(e){message=e.message;render();}return;}
 if(!room)return;
 if(!/^[a-f0-9]{32}$/.test(room)){message='招待リンクが正しくありません。';render();return;}
 // An old bookmark must resume the migrated local position, not overwrite it
 // with the server snapshot from before the migration.
 try{enter(localAI.read(room));return;}catch(e){if(e.status!==404){message=e.message;render();return;}}
 const saved=storage.get('hanten-room-'+room);
 if(saved?.token){busy=true;render();try{let data=await request('/'+room,saved.token);if(version===routeVersion){if(data.kind==='ai')data=localAI.import(data);enter(data,saved.token,saved.invite);}return;}catch(e){if(version===routeVersion)message=e.message;return;}finally{if(version===routeVersion){busy=false;render();}}}
 if(invite&&/^[a-f0-9]{64}$/.test(invite)){try{const preview=await request('/'+room+'/preview',freshToken(),{invite});if(version!==routeVersion)return;inviteRoom={room,invite,settings:preview.settings};}catch(e){if(version===routeVersion){message=e.message;render();}return;}message='「この対局に参加」を押すと、振り駒で先手・後手を決めます。';}
 else message='参加情報がありません。元の招待リンクを開くか、参加したブラウザで開いてください。';render();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){roomPoller.stop();schedulePolling();}else if(!busy)void poll();});
window.addEventListener('online',()=>{if(!busy)void poll();});
document.addEventListener('click',event=>{if(event.target.closest?.('#chooseAI,#chooseFriend,#chooseRules,#openRulesAlways,#openSettings,#closeSettings,#closeRules,#closeRulesTop,#copyInvite,#shareInvite,#openRecord'))playArcadeCue('tap');});
window.addEventListener('hashchange',restore);
render();restore();



function helperAvailable(){return canAct()&&online?.kind==='ai'&&!helperJob&&!helperLingering&&helperRemaining(online)>0;}
const helperConfirmKey=()=>online?'skip-helper-confirm-'+online.room+'-'+(online.round||1):null;
$('skipHelperConfirm').onchange=()=>{const key=helperConfirmKey();if(key)storage.set(key,$('skipHelperConfirm').checked);};
const askOsesho=()=>{if(helperAvailable()){if(storage.get(helperConfirmKey())===true){useHelper();return;}$('skipHelperConfirm').checked=false;$('oseshoDialog').querySelector('p').textContent=(isOseshoChallenge(online.settings)?`オセロ将棋の神 オセショ様が代わりに打ってくれます（残り${helperRemaining(online)}回）`:online.settings?.helperUnlimited?'オセロ将棋の神 オセショ様が何度でも代わりに打ってくれます':'オセロ将棋の神 オセショ様がゲーム中に1回だけ代わりに打ってくれます')+'。';$('oseshoDialog').showModal();}};$('askOsesho').onclick=askOsesho;$('osesho').onclick=()=>{if(online?.settings?.aiLevel!=='osesho')askOsesho();};
$('oseshoNo').onclick=()=>$('oseshoDialog').close();
$('oseshoYes').onclick=()=>useHelper();
async function useHelper(){
 $('oseshoDialog').close();if(!helperAvailable())return;
 clearTimeout(helperIdeaTimer);helperIdea=false;
 interruptMoveEffects();
 const challenge=online.settings?.aiLevel==='osesho';helperVisiting=challenge;helperGreeting=challenge;helperTravelPending=challenge;helperFarewell=false;
 message='オセショ様が代わりに指します。';
 const room=online.room,version=online.version,token=online.token,task=startAI(state,'osesho',5000);helperJob=task;busy=true;selected=null;legal=[];render();
 try{
  // Search runs during the greeting; ordinary AI helper timing is unchanged.
  const result=challenge?(await Promise.all([task.promise,new Promise(resolve=>setTimeout(()=>{if(helperJob===task&&online?.room===room){helperGreeting=false;render();}resolve();},1000))]))[0]:await task.promise;
  if(helperJob!==task||online?.room!==room||online.version!==version)return;
  helperGreeting=false;
  if(!result.move)throw new Error('指せる手がありません。');
  helperIdea=true;render();
  if(helperJob!==task||online?.room!==room||online.version!==version)return;
  const data=await request('/'+room+'/action',token,{action:'helper-move',move:result.move,version});
  if(helperJob!==task||online?.room!==room)return;
  helperJob=null;helperFarewell=false;helperLingering=challenge||!data.settings?.helperUnlimited;adopt(data);
  const round=online.round;helperIdeaTimer=setTimeout(()=>{if(online?.room!==room||online.round!==round)return;helperIdea=false;if(helperLingering)helperFarewell=true;if(challenge){helperVisiting=false;helperTravelPending=true;}render();},1800);setTimeout(()=>{if(online?.room!==room||online.round!==round||!helperLingering)return;if(challenge){helperLingering=false;helperFarewell=false;render();return;}helperDeparting=true;playHelperDeparture();render();setTimeout(()=>{if(online?.room===room&&online.round===round){helperDeparting=false;helperLingering=false;helperFarewell=false;render();}},450);},2300);
 }catch(error){if(error.name!=='AbortError'){message=error.message;}}
 finally{if(helperJob===task){helperJob=null;helperIdea=false;helperGreeting=false;if(helperVisiting){helperVisiting=false;helperTravelPending=true;}}if(online?.room===room){busy=false;render();}}
};

$('helperAd').onclick=async()=>{const button=$('helperAd'),note=$('helperAdNote');button.disabled=true;try{const result=await rewardAds.watch();if(result.rewarded){$('helperUnlimited').checked=true;note.textContent=$('aiLevel').value==='osesho'?'視聴完了。次のオセショ様対局で代打を3回利用できます。':'視聴完了。次のAI対局で無限オセショ様を利用できます。';}else note.textContent=result.reason==='not-configured'?'広告は配信準備中です。現在はチェックを入れるだけで利用できます。':'視聴を完了しなかったため、設定は変えていません。';}finally{button.disabled=false;}};

$('rulesTutorial').onclick=()=>{$('rulesDialog').close();$('openTutorial').click();};
