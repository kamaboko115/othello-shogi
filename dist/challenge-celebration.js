const publicURL='https://oshogi-games.pages.dev/';
export function victoryShareData(ordinal){
 if(!Number.isSafeInteger(ordinal)||ordinal<1)throw new RangeError('勝利番号が不正です');
 return {title:'オセロ将棋｜オセショ様に勝利！',text:`オセショ様を倒した！ 全プレイヤー合計で${ordinal}回目の勝利！ #オセロ将棋`,url:publicURL};
}
export async function shareVictory(ordinal,platform=navigator){
 const data=victoryShareData(ordinal);
 if(platform.share){try{await platform.share(data);return 'shared';}catch(error){if(error.name==='AbortError')return 'cancelled';}}
 await platform.clipboard.writeText(`${data.text}\n${data.url}`);return 'copied';
}
export function showChallengeCelebration(el,ordinal){
 victoryShareData(ordinal);
 el.classList.remove('challenge-crowned');
 el.innerHTML=`<div class="challenge-sparks" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--spark-angle:${i*20}deg;--spark-delay:${(i%4)*80}ms"></i>`).join('')}</div><div class="challenge-achievement"><span class="challenge-defeated">オセショ様 撃破</span><span class="challenge-total">全プレイヤー合計で</span><strong class="challenge-number">${ordinal.toLocaleString('ja-JP')}<span>回目の勝利！</span></strong><button type="button" class="challenge-share">勝利を共有</button><span class="challenge-share-status" role="status"></span><textarea class="challenge-share-copy" aria-label="共有する文章" readonly hidden></textarea></div>`;
 const button=el.querySelector('button'),status=el.querySelector('[role="status"]'),copy=el.querySelector('textarea');
 button.onclick=async()=>{button.disabled=true;status.textContent='';copy.hidden=true;try{const result=await shareVictory(ordinal);status.textContent=result==='copied'?'勝利メッセージとURLをコピーしました。':result==='shared'?'共有しました。':'';}catch{const data=victoryShareData(ordinal);copy.value=`${data.text}\n${data.url}`;copy.hidden=false;copy.select();status.textContent='この文章をコピーして共有できます。';}finally{button.disabled=false;}};
 el.classList.add('challenge-crowned');
}
