// Keep the board in place while only the composer follows the visible viewport.
export function initChatViewport(form,input,win=window,doc=document){
 let saved=null;
 const mobile=win.matchMedia('(max-width:700px)'),root=doc.documentElement;
 const position=()=>{if(!saved)return;const view=win.visualViewport;
  root.style.setProperty('--chat-viewport-top',(view?.offsetTop||0)+'px');
  root.style.setProperty('--chat-keyboard-inset',Math.max(0,win.innerHeight-(view?view.offsetTop+view.height:win.innerHeight))+'px');
 };
 const release=()=>{if(!saved)return;const {x,y}=saved;saved=null;
  root.classList.remove('chat-composing');form.classList.remove('chat-composer-floating');
  for(const name of ['--chat-scroll-top','--chat-viewport-top','--chat-keyboard-inset','--chat-board-width','--chat-page-width'])root.style.removeProperty(name);
  win.scrollTo({left:x,top:y,behavior:'instant'});
 };
 const hold=restorePosition=>{if(saved||!mobile.matches||input.readOnly)return;
  saved={x:restorePosition?.left??win.scrollX,y:restorePosition?.top??win.scrollY};
  root.style.setProperty('--chat-page-width',root.clientWidth+'px');
  const board=doc.querySelector('.tabletop');if(board)root.style.setProperty('--chat-board-width',board.getBoundingClientRect().width+'px');
  root.style.setProperty('--chat-scroll-top',-saved.y+'px');
  root.classList.add('chat-composing');form.classList.add('chat-composer-floating');position();
 };
 input.addEventListener('pointerdown',e=>{if(mobile.matches&&!input.readOnly){e.preventDefault();hold();input.focus({preventScroll:true});}});input.addEventListener('focus',hold);
 form.addEventListener('focusout',()=>win.requestAnimationFrame(()=>{if(!form.contains(doc.activeElement))release();}));
 win.visualViewport?.addEventListener('resize',position);win.visualViewport?.addEventListener('scroll',position);
 mobile.addEventListener('change',()=>{if(!mobile.matches)release();});
 return {focus(position){hold(position);input.focus({preventScroll:true});},release};
}
export function initRoomChat(){
 const panel=document.createElement('section');panel.className='room-chat';panel.hidden=true;
 panel.innerHTML=`<div class="chat-heading"><h3>友人チャット</h3><label class="chat-mute">非表示 <input type="checkbox" data-mute aria-label="相手のチャットを非表示"></label></div><form><button type="button" data-compose>タップして送信を始める</button><label data-field hidden>メッセージ <input data-input readonly maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="120文字まで・Enterで送信"></label><button type="button" data-done aria-label="チャット入力を閉じる">閉じる</button></form><p data-status role="status"></p>`;
 document.querySelector('.actions').after(panel);
 new ResizeObserver(()=>document.documentElement.style.setProperty('--result-chat-height',panel.getBoundingClientRect().height+'px')).observe(panel);
 const dialog=document.createElement('dialog');dialog.className='chat-terms';
 dialog.innerHTML=`<h2 tabindex="-1" autofocus>友人チャットの利用条件</h2><p>相手のメッセージは自動で表示されます。「非表示」で隠せます。自分から送信する場合は、以下に同意してください。</p><ul><li>誹謗中傷、嫌がらせ、違法な内容の送信は禁止です。</li><li>住所・電話番号などの個人情報は送らないでください。</li><li>本文はサーバーの中継中と画面表示中だけ扱い、データベース・棋譜・ブラウザの保存領域には保存しません。受信から3秒で表示を消し、履歴や再送は行いません。</li><li>相手によるコピーや撮影までは防げません。通信・端末の不調で届かない場合もあります。</li><li>困ったときは非表示の操作をご利用ください。お問い合わせ：<a href="mailto:yuki.s.115@outlook.jp">yuki.s.115@outlook.jp</a></li></ul><p>送信の同意はこの部屋で開いている間だけ有効です。再読み込み後は再度確認します。</p><button type="button" data-agree>同意して送信を始める</button> <button type="button" data-cancel>受信だけにする</button>`;
 document.body.append(dialog);
 const messages=document.createElement('div');messages.className='room-chat-stream';messages.setAttribute('role','log');messages.setAttribute('aria-live','polite');messages.setAttribute('aria-label','流れる友人チャット');document.body.append(messages);
 const q=s=>panel.querySelector(s),status=q('[data-status]');let lane=0;
 const input=q('[data-input]'),viewport=initChatViewport(q('form'),input);
 let current=null,socket=null,consented=false,lastSent=0;const timers=new Set();
 function clear(){for(const t of timers)clearTimeout(t);timers.clear();messages.replaceChildren();q('[data-input]').value='';}
 function disconnect(){const previous=socket;socket=null;previous?.close();}
 function reset(){disconnect();viewport.release();input.blur();clear();consented=false;input.readOnly=true;q('[data-compose]').hidden=false;q('[data-field]').hidden=true;}
 function connect(){
  if(!current)return;disconnect();
  const url=new URL('/api/rooms/'+current.room+'/chat',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
  if(consented)url.searchParams.set('terms','2026-10-07');else url.searchParams.set('receive','1');
  const ws=new WebSocket(url,['ose-chat','auth.'+current.token]);socket=ws;status.textContent='接続中…';
  ws.onopen=()=>{if(socket!==ws)return;status.textContent='';};
  ws.onmessage=e=>{if(socket!==ws)return;let data;try{data=JSON.parse(e.data);}catch{return;}
   if(data.type==='error'){status.textContent=data.text;return;}
   if(document.hidden||data.type!=='message'||typeof data.text!=='string'||(q('[data-mute]').checked&&data.seat!==current.seat))return;
   const line=document.createElement('p');line.className='room-chat-flying'+(data.seat===current.seat?' is-self':'');line.textContent=data.text;line.setAttribute('aria-label',(data.seat===current.seat?'あなた：':'相手：')+data.text);line.style.top=(12+(lane++%5)*16)+'%';messages.append(line);
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){line.classList.add('reduced-motion');}else{line.animate([{transform:'translateX('+messages.clientWidth+'px)'},{transform:'translateX(-'+line.offsetWidth+'px)'}],{duration:3000,easing:'linear',fill:'forwards'});}
   const timer=setTimeout(()=>{line.remove();timers.delete(timer);},3000);timers.add(timer);
  };
  ws.onclose=()=>{if(socket!==ws)return;disconnect();status.textContent='未接続です。入力欄から再接続できます。';};
  ws.onerror=()=>{if(socket===ws)status.textContent='接続できませんでした。対局はそのまま続けられます。';};
 }
 let consentScroll=null;
 const restoreConsentScroll=()=>{if(!consentScroll)return;window.scrollTo({...consentScroll,behavior:'instant'});consentScroll=null;};
 const closeTerms=()=>{dialog.close();restoreConsentScroll();};
 dialog.addEventListener('cancel',e=>{e.preventDefault();closeTerms();});
 dialog.addEventListener('close',restoreConsentScroll);
 const openChat=()=>{if(!current)return;if(!socket||socket.readyState>WebSocket.OPEN)connect();if(consented)viewport.focus();else if(!dialog.open){consentScroll={left:window.scrollX,top:window.scrollY};dialog.showModal();}};
 q('[data-compose]').onclick=openChat;
 q('[data-input]').onclick=openChat;
 q('[data-input]').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(q('[data-input]').readOnly)openChat();else q('form').requestSubmit();}};
 dialog.querySelector('[data-agree]').onclick=()=>{const position=consentScroll;consented=true;closeTerms();q('[data-compose]').hidden=true;q('[data-field]').hidden=false;input.readOnly=false;viewport.focus(position);connect();};
 dialog.querySelector('[data-cancel]').onclick=closeTerms;
 q('[data-done]').onclick=()=>{input.blur();q('[data-done]').blur();viewport.release();};
 q('[data-mute]').onchange=clear;
 q('form').onsubmit=e=>{e.preventDefault();if(!consented){openChat();return;}const text=input.value.trim();if(!text||socket?.readyState!==WebSocket.OPEN)return;if(Date.now()-lastSent<2000){status.textContent='2秒あけて送信してください。';return;}lastSent=Date.now();socket.send(JSON.stringify({type:'message',text}));input.value='';status.textContent='';};
 window.addEventListener('pagehide',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();input.blur();viewport.release();}else if(current&&(!socket||socket.readyState>WebSocket.OPEN))connect();});
 return {update(data){const eligible=data?.kind==='friend'&&data.joined&&!data.closed,changed=data?.room!==current?.room||data?.token!==current?.token;if(!eligible||changed){reset();dialog.close();status.textContent='';q('[data-mute]').checked=false;}current=eligible?data:null;panel.hidden=!eligible;if(eligible&&changed)connect();}};
}
