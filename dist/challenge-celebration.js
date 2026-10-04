const publicURL='https://oshogi-games.pages.dev/';
export function victoryShareData(ordinal){
 if(!Number.isSafeInteger(ordinal)||ordinal<1)throw new RangeError('勝利番号が不正です');
 return {title:'オセロ将棋｜オセショ様に勝利！',text:`私はオセショ様に${ordinal}回目に勝ったプレイヤーです！`,url:publicURL};
}
export function victoryTweetURL(ordinal){
 const {text,url}=victoryShareData(ordinal);
 return 'https://x.com/intent/tweet?'+new URLSearchParams({text,url});
}
export function showChallengeCelebration(el,ordinal){
 victoryShareData(ordinal);
 el.classList.remove('challenge-crowned');
 el.innerHTML=`<div class="challenge-sparks" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--spark-angle:${i*20}deg;--spark-delay:${(i%4)*80}ms"></i>`).join('')}</div><div class="challenge-achievement"><span class="challenge-defeated">オセショ様 撃破</span><span class="challenge-total">全プレイヤー合計で</span><strong class="challenge-number">${ordinal.toLocaleString('ja-JP')}<span>回目の勝利！</span></strong><a class="challenge-share" target="_blank" rel="noopener noreferrer">ツイッターで共有</a></div>`;
 el.querySelector('.challenge-share').href=victoryTweetURL(ordinal);
 el.classList.add('challenge-crowned');
}
