import {animateFlipLight} from './flip-light.js';
import {moveEffect} from './move-effect.js';
import {startAI} from './ai-client.js';
import {playMoveSound,playMultiFlipSound,playVictorySound} from './sound.js';
import {initial,moves,label,names,points} from './engine.js';
const $=id=>document.getElementById(id),side=n=>n===0?'先手':'後手',coord=i=>`${9-i%9}${'一二三四五六七八九'[Math.floor(i/9)]}`;
let state=initial(),selected=null,legal=[],stack=[],logs=[],pending=[],message='対局を作成するか、招待リンクから参加してください。';
let online=null,busy=false,connected=true,pollTimer=null,inviteRoom=null;
let selectedKind='friend';
let aiJob=null,aiTiming=null;
function stopAI(){aiJob?.task.cancel();aiJob=null;}
function syncAI(){
 const key=online?online.room+':'+online.version:'';
 const needsAI=online?.kind==='ai'&&!state.result&&state.turn!==online.side;
 if(aiJob&&(!needsAI||aiJob.key!==key))stopAI();
 if(!needsAI||aiJob||busy||!connected)return;
 const room=online.room,version=online.version,token=online.token;
 const task=startAI(state,online.settings?.aiLevel,online.settings?.thinkMs);
 const job={key,task};aiJob=job;
 $('connection').textContent=`AI対局 · あなたは${side(online.side)} · AI思考中…`;
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
 if(!el){el=document.createElement('div');el.id='flipBurst';el.setAttribute('aria-hidden','true');document.body.append(el);}
 clearTimeout(burstTimer);el.textContent=victoryText||count+'枚抜き';el.hidden=false;
 el.getAnimations().forEach(a=>a.cancel());
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)el.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.65)'},{offset:.22,opacity:1,transform:'translate(-50%,-50%) scale(1.12)'},{offset:.65,opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-54%) scale(1.03)'}],{duration:1000,easing:'ease-out'});
 burstTimer=setTimeout(()=>{el.hidden=true;},1000);
}
const freshToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const storage={get(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set(k,v){localStorage.setItem(k,JSON.stringify(v));}};
function setBoardTheme(theme){
 const value=theme==='wood'?'wood':'green';document.documentElement.dataset.boardTheme=value;$('boardTheme').value=value;
 try{storage.set('hanten-board-theme',value);}catch{}
}
setBoardTheme(storage.get('hanten-board-theme')||'green');
$('boardTheme').onchange=()=>setBoardTheme($('boardTheme').value);
function stone(side){const el=document.createElement('span');el.className='stone '+(side===0?'black':'white');el.setAttribute('aria-hidden','true');return el;}
function recordLine(text){const el=document.createElement('div');for(const part of text.split(/([▲▽])/)){if(part==='▲'||part==='▽'){const mark=stone(part==='▲'?0:1);mark.removeAttribute('aria-hidden');mark.setAttribute('aria-label',part==='▲'?'先手':'後手');el.append(mark);}else el.append(document.createTextNode(part));}return el;}
const selectedSettings=()=>({moveLimit:$('moveLimit').value==='yes',noDrops:$('allowDrops').value==='no',...(selectedKind==='ai'?{aiLevel:$('aiLevel').value,thinkMs:Number($('thinkTime').value)}:{})});
const canAct=()=>!state.result&&!busy&&!!online&&connected&&online.joined&&online.side===state.turn;
function renderHand(n){
 const h=$('hand'+n);h.replaceChildren();h.setAttribute('aria-label',`${side(n)}の駒台`);
 h.parentElement.className='player '+(n===(online?.side??0)?'self':'opponent');
 let badge=h.parentElement.querySelector('.hand-turn');if(!badge){badge=document.createElement('button');badge.type='button';badge.className='hand-turn';h.parentElement.insertBefore(badge,h);}
 badge.hidden=n!==(online?.side??0);badge.textContent=state.result?'対局終了':!online?.joined?'相手の参加待ち':online.side===state.turn?'自分の手番です':'相手の手番です';badge.disabled=!state.result;badge.onclick=()=>{if(state.result)leaveGame();};badge.title=state.result?'開始画面に戻る':'';badge.classList.toggle('my-turn',!!online&&online.side===state.turn&&!state.result);

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
 const showTutorial=!online;
 $('tutorial').hidden=!showTutorial;
 document.querySelector('.play').hidden=showTutorial;
 for(const selector of ['.status','.actions','.end-actions','.record'])document.querySelector(selector).hidden=showTutorial;
 const video=$('tutorialVideo');
 if(!showTutorial)video.pause();
 else if(video.dataset.active==='false'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)video.play().catch(()=>{});
 video.dataset.active=String(showTutorial);

 const perspective=online?.side??0;
 const moveKey=online?online.room+':'+(online.round||1)+':'+state.ply:'';
 const elapsed=performance.now()-animationStarted;
 const animate=!!animationKey&&animationKey===moveKey&&elapsed<950;
 document.querySelector('.files').replaceChildren(...(perspective?'１２３４５６７８９':'９８７６５４３２１').split('').map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 document.querySelector('.ranks').replaceChildren(...(perspective?'九八七六五四三二一':'一二三四五六七八九').split('').map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 const board=$('board');board.replaceChildren();
 for(let pos=0;pos<81;pos++){
  const i=perspective?80-pos:pos,p=state.board[i],el=document.createElement('button');
  el.className='cell'+(selected===i?' selected':'')+(legal.some(m=>m.to===i)?' legal':'')+(state.last.includes(i)?' last':'')+(state.flipped.includes(i)?' flipped':'');
  el.setAttribute('aria-label',`${coord(i)} ${p?side(p.side)+' '+label(p):'空き'}`);el.dataset.square=i;
  if(p){const span=document.createElement('span');span.className='piece'+(p.side!==perspective?' enemy':'')+(p.prom?' prom':'')+(label(p).length>1?' long':'');span.textContent=label(p);if(animate&&state.flipped.includes(i)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const multi=state.flipped.length>=2,start=p.side!==perspective?0:180,end=start+180;const anim=span.animate(multi?[{transform:'translateY(0) scale(1) rotate('+start+'deg)'},{offset:.38,transform:'translateY(-8px) scale(1.13) rotate('+(start+70)+'deg)'},{offset:.75,transform:'translateY(-3px) scale(1.06) rotate('+end+'deg)'},{transform:'translateY(0) scale(1) rotate('+end+'deg)'}]:[{transform:'rotate('+start+'deg)'},{transform:'rotate('+end+'deg)'}],{duration:multi?900:650,easing:'ease-in-out'});anim.currentTime=elapsed;if(multi)el.classList.add('multi-flip');animateFlipLight(el,p.side,multi?900:650,elapsed);}el.append(span);}
  el.disabled=!canAct();el.onclick=()=>click(i);board.append(el);
 }
 for(let n=0;n<2;n++)renderHand(n);
 $('turn').textContent=state.result||` ${side(state.turn)}の番`;if(!state.result)$('turn').prepend(stone(state.turn));
 $('boardProgress').hidden=!state.mode;
 $('boardProgress').textContent=state.moveLimit===false?`${state.ply}手目`:`決着まで ${Math.min(state.ply,81)}/81`;
 $('count').textContent='反転将棋';
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
 $('connection').textContent=online?.kind==='ai'?`AI対局 · あなたは${side(online.side)}`:online?`${connected?'接続中':'再接続中…'} · あなたは${side(online.side)}${online.joined?'':' · 相手の参加待ち'}`:inviteRoom?'参加後、振り駒で先手・後手を決めます。':'招待リンクで、離れた相手と対戦できます。';
 if(online?.kind==='ai'){
  if(aiJob)$('connection').textContent+=' · AI思考中…';
  else if(aiTiming)$('connection').textContent+=' · AI思考 '+(aiTiming.elapsedMs/1000).toFixed(2)+'秒';
  $('connection').dataset.aiTiming=aiTiming?JSON.stringify(aiTiming):'';
 }
 $('inviteTools').hidden=!online||(online.seat??0)!==0||online.joined;
 if(online?.invite)$('inviteLink').value=location.origin+location.pathname+'#room='+online.room+'&invite='+online.invite+'&limit='+(online.settings?.moveLimit===false?'no':'yes')+'&drops='+(online.settings?.noDrops?'no':'yes');
 $('drawOffer').hidden=!online||online.offer===null||!!state.result;
 if(online&&online.offer!==null){$('drawText').textContent=online.offer===(online.seat??online.side)?'相手に引き分けを提案しています。':'相手から引き分けの提案があります。';$('acceptDraw').hidden=online.offer===(online.seat??online.side);}
 document.querySelector('.local').textContent=online?.kind==='ai'?'AI対局':'反転将棋';
 $('matchSetup').hidden=!!online||!!inviteRoom;
 $('matchTitle').textContent=online?(online.kind==='ai'?'AI対局':'友人対局'):'対局を選ぶ';
 $('chooseAI').setAttribute('aria-pressed',selectedKind==='ai');$('chooseFriend').setAttribute('aria-pressed',selectedKind==='friend');
 $('aiLevelRow').hidden=selectedKind!=='ai';$('thinkTimeRow').hidden=selectedKind!=='ai'||!['strong','expert'].includes($('aiLevel').value);
 $('modeDescription').textContent=selectedKind==='ai'?'反転ルールに対応した簡易AIと対局します。':'招待リンクで友人と対局します。';
 $('createRoom').textContent=selectedKind==='ai'?'AIと対局を始める':'対局を作って招待する';
 const settings=online?.settings||inviteRoom?.settings||selectedSettings();
 $('matchSettings').hidden=!online&&!inviteRoom;
 $('matchSettings').textContent='81手で判定：'+(settings.moveLimit===false?'なし':'あり')+' ／ 持ち駒：'+(settings.noDrops?'使用不可':'使用可')+(online?.kind==='ai'?' ／ AI：'+({weak:'弱い',normal:'普通',strong:'強い',expert:'最強'}[settings.aiLevel]||'普通')+(['strong','expert'].includes(settings.aiLevel)?'（最大'+((settings.thinkMs||1000)/1000)+'秒）':''):'');
 $('limitRule').hidden=settings.moveLimit===false;

 $('rematchPanel').hidden=!online||!state.result;
 const requested=online?.rematch!=null,mine=requested&&online.rematch===(online.seat??online.side);
 $('rematchText').textContent=requested?(mine?'相手の承諾を待っています。':'相手が再試合を希望しています。'):'同じ相手と、もう一局。';
 $('offerRematch').hidden=requested;$('acceptRematch').hidden=!requested||mine;$('declineRematch').hidden=!requested;
 for(const id of ['offerRematch','acceptRematch','declineRematch'])$(id).disabled=busy||!connected;
 if(!online)$('furigoma').hidden=true;
 if(online?.joined&&online.toss){const key=online.room+':'+online.round;if(lastTossKey!==key){lastTossKey=key;$('tossCoins').replaceChildren(...online.toss.coins.map((face,i)=>{const el=document.createElement('span');el.className='toss-piece';el.textContent=face?'歩':'と';el.style.animationDelay=(i*.1)+'s';return el;}));$('tossResult').textContent='歩 '+online.toss.coins.filter(Boolean).length+'枚・と '+online.toss.coins.filter(v=>!v).length+'枚。あなたは'+side(online.side)+'です。';$('furigoma').hidden=false;}}

 syncAI();
}
function select(src){if(!canAct())return;selected=selected===src?null:src;legal=selected===null?[]:moves(state,selected);message=selected===null?'駒を選んで、移動先をクリック。':legal.length?'緑の印のマスへ移動できます。':'この駒は今、動かせません。';render();}
function click(i){if(!canAct())return;const choices=legal.filter(m=>m.to===i);if(choices.length>1){pending=choices;$('promotion').showModal();return;}if(choices.length){commit(choices[0]);return;}if(state.board[i]?.side===state.turn)select(i);else{selected=null;legal=[];message='自分の駒、または駒台の駒を選んでください。';render();}}
function commit(m){if(canAct())sendAction('move',m);}
function start(s,msg){state=s;stack=[];logs=[];selected=null;legal=[];message=msg||'駒を選んで、移動先をクリック。';render();}
let confirmAction=null;function confirm(title,fn){$('confirmTitle').textContent=title;confirmAction=fn;$('confirm').showModal();}
$('confirmYes').onclick=()=>{$('confirm').close();confirmAction?.();};$('confirmNo').onclick=()=>$('confirm').close();
$('promote').onclick=()=>{$('promotion').close();commit(pending.find(m=>m.prom));};$('stay').onclick=()=>{$('promotion').close();commit(pending.find(m=>!m.prom));};
function leaveGame(){stopAI();aiTiming=null;clearTimeout(pollTimer);online=null;inviteRoom=null;connected=true;busy=false;animationKey='';history.replaceState(null,'',location.pathname);start(initial(),'対局を作成するか、招待リンクから参加してください。');}
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
 const previousRound=online.round||1,changed=data.version!==online.version,reconnected=!connected;if(changed)stopAI();online={...online,...data};connected=true;
 if(changed){if(data.state.ply>state.ply&&(data.round||1)===previousRound){const effect=moveEffect(data.state);if(effect?.kind==='victory')playVictorySound();else if(data.state.flipped.length>=1)playMultiFlipSound();else playMoveSound();if(effect)showFlipBurst(0,effect.text);animationStarted=performance.now();animationKey=data.room+':'+(data.round||1)+':'+data.state.ply;}const rewound=data.state.ply<state.ply;state=data.state;logs=data.logs;selected=null;legal=[];if(rewound)animationKey='';if($('promotion').open)$('promotion').close();message=state.result|| (state.flipped.length?`${state.flipped.length}枚が寝返りました。`:logs.at(-1)||'相手が参加しました。あなたの手番で指してください。');}
 if(changed||reconnected)render();else syncAI();
}
async function poll(){
 clearTimeout(pollTimer);if(!online)return;const room=online.room,token=online.token;
 try{const data=await request('/'+room,token);if(online?.room===room)adopt(data);}catch(e){if(online?.room===room){connected=false;message=e.message;render();}}
 if(online?.room===room)pollTimer=setTimeout(poll,connected?2000:5000);
}
async function sendAction(action,move){
 if(!online||busy)return;busy=true;render();const room=online.room;
 try{const data=await request('/'+room+'/action',online.token,{action,move,version:online.version});if(online?.room===room)adopt(data);}
 catch(e){message=e.message;if(e.status===409)await poll();}
 finally{busy=false;render();}
}
function enter(data,token,invite){
 stopAI();aiTiming=null;online={...data,token,invite};state=data.state;logs=data.logs;stack=[];selected=null;legal=[];inviteRoom=null;connected=true;
 storage.set('hanten-room-'+data.room,{token,invite});history.replaceState(null,'',location.pathname+'#room='+data.room);
 message=state.result|| (data.joined?(data.kind==='ai'?'AIと対局を開始しました。':'対戦相手と接続しました。自分の手番で指してください。'):'招待リンクを相手に送ってください。');render();poll();
}
$('chooseAI').onclick=()=>{selectedKind='ai';render();};$('chooseFriend').onclick=()=>{selectedKind='friend';render();};$('moveLimit').onchange=render;$('allowDrops').onchange=render;$('aiLevel').onchange=render;$('thinkTime').onchange=render;
$('createRoom').onclick=async()=>{
 if(state.ply&&!window.confirm('現在の盤面から離れ、新しいオンライン対局を作成しますか？'))return;
 busy=true;render();try{
  let draft=storage.get('hanten-pending-room');if(draft&&(draft.kind!==selectedKind||JSON.stringify(draft.settings)!==JSON.stringify(selectedSettings())))draft=null;if(!draft){draft={token:freshToken(),invite:freshToken(),kind:selectedKind,settings:selectedSettings()};storage.set('hanten-pending-room',draft);}
  const data=await request('',draft.token,{invite:draft.invite,kind:draft.kind,settings:draft.settings});enter(data,draft.token,draft.invite);localStorage.removeItem('hanten-pending-room');
 }catch(e){message=e.message;}finally{busy=false;render();}
};
$('joinRoom').onclick=async()=>{if(!inviteRoom)return;busy=true;render();try{const saved=storage.get('hanten-room-'+inviteRoom.room)||{token:freshToken()};storage.set('hanten-room-'+inviteRoom.room,saved);const data=await request('/'+inviteRoom.room+'/join',saved.token,{invite:inviteRoom.invite});enter(data,saved.token);}catch(e){message=e.message;}finally{busy=false;render();}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);$('copyInvite').textContent='コピーしました';}catch{$('inviteLink').select();message='招待リンクを選択しました。コピーして相手に送ってください。';render();}};
$('offerRematch').onclick=()=>sendAction('offer-rematch');$('acceptRematch').onclick=()=>sendAction('accept-rematch');$('declineRematch').onclick=()=>sendAction('decline-rematch');$('closeToss').onclick=()=>{$('furigoma').hidden=true;};
$('acceptDraw').onclick=()=>sendAction('accept-draw');$('declineDraw').onclick=()=>sendAction('decline-draw');
async function restore(){
 const params=new URLSearchParams(location.hash.slice(1)),room=params.get('room'),invite=params.get('invite');if(!room)return;
 if(!/^[a-f0-9]{32}$/.test(room)){message='招待リンクが正しくありません。';render();return;}
 const saved=storage.get('hanten-room-'+room);
 if(saved?.token){busy=true;render();try{const data=await request('/'+room,saved.token);enter(data,saved.token,saved.invite);return;}catch(e){message=e.message;}finally{busy=false;render();}}
 if(invite&&/^[a-f0-9]{64}$/.test(invite)){try{const preview=await request('/'+room+'/preview',freshToken(),{invite});inviteRoom={room,invite,settings:preview.settings};}catch(e){message=e.message;render();return;}message='「この対局に参加」を押すと、振り駒で先手・後手を決めます。';}
 else message='参加情報がありません。元の招待リンクを開くか、参加したブラウザで開いてください。';render();
}
if(matchMedia('(prefers-reduced-motion: reduce)').matches){$('tutorialVideo').autoplay=false;$('tutorialVideo').pause();}
render();restore();
