export function initRoomChat(){
 const panel=document.createElement('section');panel.className='room-chat';panel.hidden=true;
 panel.innerHTML=`<div class="chat-heading"><h3>友人チャット</h3><label class="chat-mute">非表示 <input type="checkbox" data-mute aria-label="相手のチャットを非表示"></label></div><form><label>メッセージ <input data-input readonly maxlength="120" autocomplete="off" enterkeyhint="send" placeholder="クリックしてチャットを開く"></label></form><p data-status role="status"></p>`;
 document.querySelector('.actions').after(panel);
 new ResizeObserver(()=>document.documentElement.style.setProperty('--result-chat-height',panel.getBoundingClientRect().height+'px')).observe(panel);
 const dialog=document.createElement('dialog');dialog.className='chat-terms';
 dialog.innerHTML=`<h2>友人チャットの利用条件</h2><p>この部屋の対局相手とだけメッセージを送受信します。利用は任意です。</p><ul><li>誹謗中傷、嫌がらせ、違法な内容の送信は禁止です。</li><li>住所・電話番号などの個人情報は送らないでください。</li><li>本文はサーバーの中継中と画面表示中だけ扱い、データベース・棋譜・ブラウザの保存領域には保存しません。受信から3秒で表示を消し、履歴や再送は行いません。</li><li>相手によるコピーや撮影までは防げません。通信・端末の不調で届かない場合もあります。</li><li>困ったときは非表示の操作をご利用ください。お問い合わせ：<a href="mailto:yuki.s.115@outlook.jp">yuki.s.115@outlook.jp</a></li></ul><p>同意はこの部屋で開いている間だけ有効です。再読み込み後は再度確認します。</p><button type="button" data-agree>同意してチャットを開く</button> <button type="button" data-cancel>使わない</button>`;
 document.body.append(dialog);
 const messages=document.createElement('div');messages.className='room-chat-stream';messages.setAttribute('role','log');messages.setAttribute('aria-live','polite');messages.setAttribute('aria-label','流れる友人チャット');document.body.append(messages);
 const q=s=>panel.querySelector(s),status=q('[data-status]');let lane=0;
 let current=null,socket=null,consented=false,lastSent=0;const timers=new Set();
 function clear(){for(const t of timers)clearTimeout(t);timers.clear();messages.replaceChildren();q('[data-input]').value='';}
 function disconnect(){const previous=socket;socket=null;previous?.close();clear();q('[data-input]').readOnly=true;q('[data-input]').placeholder='クリックしてチャットを開く';}
 function connect(){
  if(!current||!consented)return;disconnect();
  const url=new URL('/api/rooms/'+current.room+'/chat',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('terms','2026-10-07');
  const ws=new WebSocket(url,['ose-chat','auth.'+current.token]);socket=ws;status.textContent='接続中…';
  ws.onopen=()=>{if(socket!==ws)return;status.textContent='';q('[data-input]').readOnly=false;q('[data-input]').placeholder='120文字まで・Enterで送信';q('[data-input]').focus();};
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
 const openChat=()=>{if(!q('[data-input]').readOnly||socket?.readyState===WebSocket.CONNECTING)return;if(consented)connect();else dialog.showModal();};
 q('[data-input]').onclick=openChat;
 q('[data-input]').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(q('[data-input]').readOnly)openChat();else q('form').requestSubmit();}};
 dialog.querySelector('[data-agree]').onclick=()=>{consented=true;dialog.close();connect();};
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 q('[data-mute]').onchange=clear;
 q('form').onsubmit=e=>{e.preventDefault();const text=q('[data-input]').value.trim();if(!text||socket?.readyState!==WebSocket.OPEN)return;if(Date.now()-lastSent<2000){status.textContent='2秒あけて送信してください。';return;}lastSent=Date.now();socket.send(JSON.stringify({type:'message',text}));q('[data-input]').value='';status.textContent='';};
 window.addEventListener('pagehide',disconnect);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 return {update(data){const eligible=data?.kind==='friend'&&data.joined&&!data.closed;if(!eligible||data.room!==current?.room){disconnect();consented=false;dialog.close();status.textContent='';q('[data-mute]').checked=false;}current=eligible?data:null;panel.hidden=!eligible;}};
}
