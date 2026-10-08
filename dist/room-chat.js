export function initRoomChat(){
 const panel=document.createElement('section');panel.className='room-chat';panel.hidden=true;
 panel.innerHTML=`<h3>友人チャット <small>画面を流れて3秒で消えます</small></h3><button type="button" data-start>利用条件を確認して開く</button><input data-mobile-start type="text" readonly aria-label="チャットを開く" aria-haspopup="dialog" placeholder="タップしてチャットを入力"><div data-active hidden><form><label>メッセージ <input data-input maxlength="120" autocomplete="off" placeholder="120文字まで"></label><button type="submit">送る</button></form><details><summary>チャット設定</summary><label><input type="checkbox" data-mute> 相手のチャットを非表示</label><button type="button" data-stop>チャットを閉じる</button></details></div><p data-status role="status"></p>`;
 document.querySelector('.actions').after(panel);
 new ResizeObserver(()=>document.documentElement.style.setProperty('--result-chat-height',panel.getBoundingClientRect().height+'px')).observe(panel);
 const dialog=document.createElement('dialog');dialog.className='chat-terms';
 dialog.innerHTML=`<h2>友人チャットの利用条件</h2><p>この部屋の対局相手とだけメッセージを送受信します。利用は任意です。</p><ul><li>誹謗中傷、嫌がらせ、違法な内容の送信は禁止です。</li><li>住所・電話番号などの個人情報は送らないでください。</li><li>本文はサーバーの中継中と画面表示中だけ扱い、データベース・棋譜・ブラウザの保存領域には保存しません。受信から3秒で表示を消し、履歴や再送は行いません。</li><li>相手によるコピーや撮影までは防げません。通信・端末の不調で届かない場合もあります。</li><li>困ったときは非表示・チャットを閉じる操作をご利用ください。お問い合わせ：<a href="mailto:yuki.s.115@outlook.jp">yuki.s.115@outlook.jp</a></li></ul><p>同意はこの部屋で開いている間だけ有効です。再読み込み後は再度確認します。</p><button type="button" data-agree>同意してチャットを開く</button> <button type="button" data-cancel>使わない</button>`;
 document.body.append(dialog);
 const messages=document.createElement('div');messages.className='room-chat-stream';messages.setAttribute('role','log');messages.setAttribute('aria-live','polite');messages.setAttribute('aria-label','流れる友人チャット');document.body.append(messages);
 const q=s=>panel.querySelector(s),status=q('[data-status]');let lane=0;
 let current=null,socket=null,consented=false,lastSent=0;const timers=new Set();
 function clear(){for(const t of timers)clearTimeout(t);timers.clear();messages.replaceChildren();q('[data-input]').value='';}
 function disconnect(){socket?.close();socket=null;clear();q('[data-active]').hidden=true;q('[data-start]').hidden=false;q('[data-mobile-start]').hidden=false;}
 function connect(){
  if(!current||!consented)return;disconnect();
  const url=new URL('/api/rooms/'+current.room+'/chat',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('terms','2026-10-07');
  const ws=new WebSocket(url,['ose-chat','auth.'+current.token]);socket=ws;status.textContent='接続中…';
  ws.onopen=()=>{if(socket!==ws)return;status.textContent='接続しました。相手も同意すると届きます。';q('[data-active]').hidden=false;q('[data-start]').hidden=true;q('[data-mobile-start]').hidden=true;q('[data-input]').focus();};
  ws.onmessage=e=>{if(socket!==ws)return;let data;try{data=JSON.parse(e.data);}catch{return;}
   if(data.type==='error'){status.textContent=data.text;return;}
   if(document.hidden||data.type!=='message'||typeof data.text!=='string'||(q('[data-mute]').checked&&data.seat!==current.seat))return;
   const line=document.createElement('p');line.className='room-chat-flying'+(data.seat===current.seat?' is-self':'');line.textContent=data.text;line.setAttribute('aria-label',(data.seat===current.seat?'あなた：':'相手：')+data.text);line.style.top=(12+(lane++%5)*16)+'%';messages.append(line);
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){line.classList.add('reduced-motion');}else{line.animate([{transform:'translateX('+messages.clientWidth+'px)'},{transform:'translateX(-'+line.offsetWidth+'px)'}],{duration:3000,easing:'linear',fill:'forwards'});}
   const timer=setTimeout(()=>{line.remove();timers.delete(timer);},3000);timers.add(timer);
  };
  ws.onclose=()=>{if(socket!==ws)return;disconnect();status.textContent='チャットは未接続です。開くボタンで再接続できます。';};
  ws.onerror=()=>{if(socket===ws)status.textContent='接続できませんでした。対局はそのまま続けられます。';};
 }
 q('[data-start]').onclick=()=>{if(consented)connect();else dialog.showModal();};
 q('[data-mobile-start]').onclick=()=>q('[data-start]').click();
 q('[data-mobile-start]').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();q('[data-start]').click();}};
 dialog.querySelector('[data-agree]').onclick=()=>{consented=true;dialog.close();connect();};
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 q('[data-stop]').onclick=()=>{disconnect();status.textContent='チャットを閉じました。';};
 q('[data-mute]').onchange=clear;
 q('form').onsubmit=e=>{e.preventDefault();const text=q('[data-input]').value.trim();if(!text||socket?.readyState!==WebSocket.OPEN)return;if(Date.now()-lastSent<2000){status.textContent='2秒あけて送信してください。';return;}lastSent=Date.now();socket.send(JSON.stringify({type:'message',text}));q('[data-input]').value='';status.textContent='';};
 window.addEventListener('pagehide',disconnect);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 return {update(data){const eligible=data?.kind==='friend'&&data.joined&&!data.closed;if(!eligible||data.room!==current?.room){disconnect();consented=false;dialog.close();status.textContent='';q('[data-mute]').checked=false;}current=eligible?data:null;panel.hidden=!eligible;}};
}
