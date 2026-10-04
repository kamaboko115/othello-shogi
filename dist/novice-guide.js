// Only fixed lesson data is rendered; callers cannot insert HTML through a topic.
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function grid(size){return Array.from({length:size+1},(_,i)=>`<path d="M${i*40} 0V${size*40}M0 ${i*40}H${size*40}"/>`).join('');}
function svg(label,size,body){return `<svg class="guide-board" viewBox="-2 -2 ${size*40+4} ${size*40+4}" role="img" aria-label="${escape(label)}" xmlns="http://www.w3.org/2000/svg"><g class="guide-grid">${grid(size)}</g>${body}</svg>`;}
function disc(x,y,side,newStone=false){return `<circle class="guide-disc ${side===0?'guide-black':'guide-white'}" cx="${x*40+20}" cy="${y*40+20}" r="14"/>${newStone?`<circle class="guide-new" cx="${x*40+20}" cy="${y*40+20}" r="18"/>`:''}`;}
function lineDiagram(id,title,stones,description){return `<figure data-example="${id}">${svg(description,5,stones.map(([x,side,newStone])=>disc(x,2,side,newStone)).join(''))}<figcaption><strong>${title}</strong> ${description}</figcaption></figure>`;}
const othello=`<p>黒と白が交互に、空いているマスに石を1つ置きます。自分の石で相手の石をはさむと、その石が自分の色になります。</p>
<section class="guide-card"><h3>はさみ方を見てみよう</h3><p>図では黒の番。金色の輪が、新しく置く黒い石です。</p><div class="guide-examples">
${lineDiagram('single','1枚をはさむ',[[1,0,true],[2,1],[3,0]],'黒・白・黒が一直線。間の白1枚を黒に変えます。')}
${lineDiagram('multiple','まとめてはさむ',[[0,0,true],[1,1],[2,1],[3,1],[4,0]],'黒・白・白・白・黒。連続する白3枚が全部黒になります。')}
<figure data-example="eight-directions">${svg('中央に黒を置くと、縦・横・斜めの8方向それぞれで白1枚を黒ではさめます。',5,disc(2,2,0,true)+dirs.map(([x,y])=>disc(2+x,2+y,1)+disc(2+2*x,2+2*y,0)).join(''))}<figcaption><strong>縦・横・斜めの8方向</strong> この例では、一手で8枚を黒に変えられます。</figcaption></figure>
${lineDiagram('empty-gap','空きマスがあると失敗',[[0,0,true],[1,1],[3,0]],'黒・白・空き・黒。途中が空いているので、白は変わりません。この方向だけでは石を置けません。')}
</div><p>少なくとも1方向ではさめる場所にだけ置けます。置ける場所がないときはパス。両者とも置けなくなると終了し、石の数が多い側の勝ちです。同数なら引き分けです。</p></section>
<section class="guide-card guide-variant"><h3>オセロ将棋では？</h3><p>石を置く代わりに、将棋の駒を<strong>移動するか、持ち駒を打つ</strong>ことで、はさむ端を作ります。動かした駒・打った駒と別の味方の駒で、連続した敵の駒をはさむと寝返ります。</p><p>8方向を一度に調べます。空きマスで途切れると寝返りません。寝返った駒の<strong>位置と成り状態はそのまま</strong>で、向きと味方・敵だけが変わります。はさめない手も指せます。</p><p>普通のオセロのパスや終了条件は使いません。王を取る・はさむと勝ち。盤面崩壊が有効なら、設定した手数を超えると駒の破壊などの特殊効果が起こります。</p></section>`;
function arrow(dx,dy,long=false,jump=false){
 const x=100+dx*40,y=100+dy*40,angle=Math.atan2(dy,dx),endX=x-Math.cos(angle)*7,endY=y-Math.sin(angle)*7;
 const p=(a,r)=>`${(endX-Math.cos(a)*r).toFixed(2)},${(endY-Math.sin(a)*r).toFixed(2)}`;
 return `<g class="guide-arrow${long?' guide-ray':''}"><path d="M${100+Math.cos(angle)*18} ${100+Math.sin(angle)*18}L${endX} ${endY}"${jump?' stroke-dasharray="4 3"':''}/><polygon points="${endX},${endY} ${p(angle-.5,11)} ${p(angle+.5,11)}"/></g>`;
}
function movement(code,name,steps,rays,description){return `<article class="guide-piece" data-piece="${code}"><h4>${name}</h4>${svg(`${name}：${description}。上が前です。`,5,rays.map(([x,y])=>arrow(x*2,y*2,true)).join('')+steps.map(([x,y])=>arrow(x,y,false,code==='N')).join('')+`<path class="guide-piece-shape" d="M100 83L113 91L116 116H84L87 91Z"/><text class="guide-piece-name" x="100" y="108" text-anchor="middle">${code==='gold-promotions'?'金':name.split('（')[0]}</text>`)}<p>${description}</p></article>`;}
const gold=[[0,-1],[-1,-1],[1,-1],[-1,0],[1,0],[0,1]],diagonals=dirs.filter(([x,y])=>x&&y),orthogonal=dirs.filter(([x,y])=>!x||!y);
const shogi=`<p>交互に自分の駒を1つ動かします。駒によって進める方向と距離が違います。図は<strong>上が前（相手の陣地）</strong>。相手の駒は逆向きなので、前も逆です。</p>
<section class="guide-card"><h3>8種類の駒の動き</h3><p>短い矢印は1マス、長い金色の矢印はその方向へ何マスでも。自分の駒のあるマスには進めません。相手の駒のマスに進むとその駒を取ります。桂以外は途中の駒を飛び越せません。</p><div class="guide-pieces">
${movement('K','王（玉）',dirs,[],'全8方向に1マス')}
${movement('R','飛車',[],orthogonal,'縦・横に何マスでも')}
${movement('B','角',[],diagonals,'斜めに何マスでも')}
${movement('G','金',gold,[],'前・斜め前・横・後ろに1マス。斜め後ろには進めない')}
${movement('S','銀',[[0,-1],...diagonals],[],'前と斜め4方向に1マス')}
${movement('N','桂',[[-1,-2],[1,-2]],[],'前に2マス、左右に1マスの場所へ跳ぶ。途中の駒を飛び越せる')}
${movement('L','香',[],[[0,-1]],'前に何マスでも')}
${movement('P','歩',[[0,-1]],[],'前に1マス')}
</div></section>
<section class="guide-card"><h3>取る・持ち駒・打つ</h3><p>取った相手の駒は自分の<strong>持ち駒</strong>になります。成り駒を取ると元の駒に戻ります。手番では、動かす代わりに持ち駒を空きマスへ<strong>打つ</strong>こともできます。打つときは成れません。</p><p>歩・香を一番奥の段に、桂を奥の2段に打つことはできません。同じ縦の列に自分の成っていない歩を2枚置く「二歩」も禁止です。普通の将棋では、歩を打って即座に詰ませる「打ち歩詰め」も禁止です。</p></section>
<section class="guide-card"><h3>成ると動きが変わる</h3><p>相手側の3段が<strong>敵陣</strong>です。敵陣に入る・敵陣から出る・敵陣内で動くとき、歩・香・桂・銀・飛・角は成れます。成った駒は、取られるまで元には戻れません。王と金は成りません。</p><p>歩・香が一番奥へ、桂が奥の2段へ進むと、次に動けなくなるため必ず成ります。</p><div class="guide-pieces">
${movement('gold-promotions','と・成香・成桂・成銀',gold,[],'歩→と金、香→成香、桂→成桂、銀→成銀。すべて金と同じ動き')}
${movement('dragon','龍',diagonals,orthogonal,'成った飛車。縦・横に何マスでも、さらに斜めに1マス')}
${movement('horse','馬',orthogonal,diagonals,'成った角。斜めに何マスでも、さらに縦・横に1マス')}
</div></section>
<section class="guide-card guide-variant"><h3>王手と、オセロ将棋の勝ち方</h3><p>普通の将棋は、王が取られそうな「王手」を必ず防ぎます。逃げる・相手の駒を取る・間に駒を置くなどで防ぎ、どの手でも防げない「詰み」にすると勝ちです。</p><p><strong>オセロ将棋では、王手を防ぐ義務はありません。</strong>王を直接取るか、移動・打つ手で王をはさむと勝ちです。二歩や行き場のない駒の制限はありますが、打ち歩詰めの制限はありません。寝返った成り駒は、成ったまま味方になります。チェスモードでは持ち駒を打てません。</p></section>`;

export function guideHTML(topic){
 if(topic==='othello')return othello;
 if(topic==='shogi')return shogi;
 throw new RangeError('Unknown beginner guide topic');
}

export function initBeginnerGuide(document,render=guideHTML){
 const get=id=>document.getElementById(id),dialog=get('beginnerGuide');
 const topics=[['openOthelloBasics','othello','オセロの基本'],['openShogiBasics','shogi','将棋の基本']];
 const open=(topic,practice=false)=>{
   const title=topics.find(item=>item[1]===topic)?.[2];
   get('beginnerBody').innerHTML=render(topic);
   get('beginnerTitle').textContent=title;
   get('beginnerTutorial').hidden=!practice;
   get('closeBeginner').textContent=practice?'入口に戻る':'ルールに戻る';
   dialog.showModal();get('beginnerTitle').focus();get('beginnerBody').scrollTop=0;
 };
 for(const [id,topic] of topics)get(id).onclick=()=>open(topic);
 get('closeBeginner').onclick=()=>dialog.close();
 // Native dialog Escape closes only the top modal and restores opener focus.
 return {open,close:()=>dialog.close()};
}

export function initTutorialMenu(document,guide,startTutorial){
 const get=id=>document.getElementById(id),dialog=get('tutorialMenu');
 get('openTutorial').onclick=()=>dialog.showModal();
 get('tutorialShogi').onclick=()=>guide.open('shogi',true);
 get('tutorialOthello').onclick=()=>guide.open('othello',true);
 const practice=()=>{guide.close();dialog.close();startTutorial();};
 get('tutorialKnown').onclick=practice;
 get('beginnerTutorial').onclick=practice;
 get('closeTutorialMenu').onclick=()=>dialog.close();
}
