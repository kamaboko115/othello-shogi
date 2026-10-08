export function undoWaitSeconds(data,now=Date.now()){
 if(data?.kind!=='friend')return 0;
 return Math.max(0,Math.ceil(((data.undoCooldowns?.[data.seat??data.side]||0)-now)/1000));
}
export function pendingRoomRequests(data){
 if(data?.kind!=='friend'||!data.joined||data.closed)return [];
 const seat=data.seat??data.side,out=[];
 if(!data.state?.result&&data.undoOffer&&data.undoOffer.seat!==seat)out.push({id:'undo:'+data.undoOffer.ply,text:`相手が待ったを希望しています（${data.undoOffer.ply}手目へ戻す）`,accept:'acceptUndo',decline:'declineUndo'});
 if(!data.state?.result&&data.offer!=null&&data.offer!==seat)out.push({id:'draw',text:'相手から引き分けの提案があります',accept:'acceptDraw',decline:'declineDraw'});
 if(data.state?.result&&data.rematch!=null&&data.rematch!==seat)out.push({id:'rematch',text:'相手が再試合を希望しています',accept:'acceptRematch',decline:'declineRematch'});
 return out;
}
export function initRoomRequests(){
 const panel=document.createElement('div');panel.className='room-request-actions';panel.hidden=true;panel.setAttribute('aria-label','相手からの依頼');document.querySelector('.room-chat').append(panel);
 const stream=document.createElement('div');stream.className='room-chat-stream room-request-stream';stream.setAttribute('role','status');document.body.append(stream);
 let context='',seen=new Set(),signature='';const timers=new Set();
 function clear(){for(const timer of timers)clearTimeout(timer);timers.clear();stream.replaceChildren();}
 return {update(data,disabled=false){
  const nextContext=data?.room+':'+data?.round;if(nextContext!==context){context=nextContext;seen.clear();signature='';clear();}
  const requests=pendingRoomRequests(data),nextSeen=new Set(requests.map(r=>r.id));
  for(const r of requests)if(!seen.has(r.id)){
   const line=document.createElement('p');line.className='room-chat-flying room-request-flying';line.textContent=r.text+'。チャット欄のボタンから返答してください。';line.style.top='20%';stream.append(line);
   if(matchMedia('(prefers-reduced-motion: reduce)').matches)line.classList.add('reduced-motion');else line.animate([{transform:`translateX(${innerWidth}px)`},{transform:`translateX(-${line.offsetWidth}px)`}],{duration:5000,easing:'linear',fill:'forwards'});
   const timer=setTimeout(()=>{line.remove();timers.delete(timer);},5000);timers.add(timer);
  }
  seen=nextSeen;const nextSignature=JSON.stringify([requests,disabled]);if(nextSignature===signature)return;signature=nextSignature;
  panel.replaceChildren();panel.hidden=!requests.length;
  for(const r of requests){const item=document.createElement('section'),text=document.createElement('p');text.textContent=r.text;item.append(text);
   for(const [id,label] of [[r.accept,'承諾する'],[r.decline,'断る']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=disabled;button.onclick=()=>document.getElementById(id)?.click();item.append(button);}panel.append(item);
  }
 }};
}
