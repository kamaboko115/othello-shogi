import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guideHTML,initBeginnerGuide,initTutorialMenu} from '../dist/novice-guide.js';
import {empty,reaches} from '../dist/engine.js';

test('fixed guides reject unknown topics and provide accessible diagrams',()=>{
 for(const topic of ['othello','shogi']){
  const html=guideHTML(topic),svgs=[...html.matchAll(/<svg\b([^>]+)>/g)];
  assert.ok(svgs.length>=4);
  for(const [,attrs] of svgs){assert.match(attrs,/role="img"/);assert.match(attrs,/aria-label="[^"]+"/);}
  assert.doesNotMatch(html,/<script|on\w+=|javascript:|id=/i);
 }
 for(const topic of ['unknown','<img onerror="alert(1)">',null])assert.throws(()=>guideHTML(topic),RangeError);
});

test('sandwich examples have actual contiguous endpoints and the gap is invalid',()=>{
 const figures=[...guideHTML('othello').matchAll(/<figure data-example="([^"]+)">([\s\S]*?)<\/figure>/g)];
 const counts={single:1,multiple:3,'eight-directions':8,'empty-gap':0};
 for(const [,id,html] of figures){
  const board=new Map([...html.matchAll(/<circle class="guide-disc guide-(black|white)" cx="(\d+)" cy="(\d+)"/g)].map(([,color,x,y])=>[`${(Number(x)-20)/40},${(Number(y)-20)/40}`,color]));
  const [,sx,sy]=html.match(/<circle class="guide-new" cx="(\d+)" cy="(\d+)"/);
  let flipped=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!dx&&!dy)continue;
   let x=(Number(sx)-20)/40+dx,y=(Number(sy)-20)/40+dy,n=0;
   while(board.get(`${x},${y}`)==='white'){n++;x+=dx;y+=dy;}
   if(board.get(`${x},${y}`)==='black')flipped+=n;
  }
  assert.equal(flipped,counts[id],id);
 }
 assert.equal(figures.length,4);
 assert.match(guideHTML('othello'),/両者とも置けなくなると終了/);
 assert.match(guideHTML('othello'),/位置と成り状態はそのまま/);
});

test('all movement arrows match engine geometry, including gold promotions, dragon and horse',()=>{
 const cards=[...guideHTML('shogi').matchAll(/<article class="guide-piece" data-piece="([^"]+)">([\s\S]*?)<\/article>/g)];
 assert.equal(cards.length,11);
 const types={dragon:'R',horse:'B','gold-promotions':'P'};
 for(const [,,html] of cards)assert.match(html,/上が前です/);
 for(const [,code,html] of cards){
  const state=empty(true),type=types[code]||code;
  state.board[40]={type,side:0,prom:!!types[code]};
  const arrows=[...html.matchAll(/<g class="guide-arrow( guide-ray)?"><path d="M[^L]+L([\d.-]+) ([\d.-]+)"/g)].map(([,ray,x,y])=>({ray:!!ray,dx:Math.round((Number(x)-100)/40),dy:Math.round((Number(y)-100)/40)}));
  const expected=[];
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(reaches(state,40,40+dy*9+dx))expected.push(`${dx},${dy}`);
  const represented=[];
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(arrows.some(a=>a.ray?(dx||dy)&&dx*a.dy===dy*a.dx&&dx*a.dx+dy*a.dy>0:dx===a.dx&&dy===a.dy))represented.push(`${dx},${dy}`);
  assert.deepEqual(represented,expected,code);
 }
 assert.match(guideHTML('shogi'),/王手を防ぐ義務はありません/);
});

test('guide opens above the existing rules, resets each topic, and uses native dialog dismissal',()=>{
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.match(html,/<dialog id="beginnerGuide" aria-labelledby="beginnerTitle">/);
 const elements=new Map(ids.map(id=>[id,{id,open:false,scrollTop:88,textContent:'',innerHTML:'',focus(){document.activeElement=this;},showModal(){this.open=true;this.opener=document.activeElement;},close(){this.open=false;this.opener?.focus();}}]));
 const document={getElementById:id=>elements.get(id),activeElement:null},get=id=>document.getElementById(id);
 initBeginnerGuide(document);
 get('rulesDialog').showModal();
 for(const [id,topic,title] of [['openOthelloBasics','othello','オセロの基本'],['openShogiBasics','shogi','将棋の基本']]){
  get(id).focus();get(id).onclick();
  assert.equal(get('rulesDialog').open,true);
  assert.equal(get('beginnerGuide').open,true);
  assert.equal(get('beginnerTitle').textContent,title);
  assert.equal(get('beginnerBody').innerHTML,guideHTML(topic));
  assert.equal(get('beginnerBody').scrollTop,0);
  assert.equal(document.activeElement,get('beginnerTitle'));
  get('closeBeginner').onclick();
  assert.equal(get('rulesDialog').open,true);
  assert.equal(document.activeElement,get(id));
 }
 // No cancel override: Escape is handled by the browser's top dialog.
 assert.equal(get('beginnerGuide').oncancel,undefined);
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 assert.match(app,/initBeginnerGuide\(document,guideHTML\)/);
 const assets=readFileSync(new URL('../worker/static-assets.js',import.meta.url),'utf8');
 assert.match(assets,/'novice-guide.js'/);
});

test('チュートリアルの3入口は基本解説か練習を開き、解説から練習へ進める',()=>{
 const ids=['tutorialMenu','tutorialMenuTitle','openTutorial','tutorialShogi','tutorialOthello','tutorialKnown','closeTutorialMenu','beginnerTutorial','beginnerGuide','beginnerTitle','beginnerBody','closeBeginner','openOthelloBasics','openShogiBasics'];
 const elements=new Map(ids.map(id=>[id,{open:false,hidden:true,showModal(){this.open=true;},close(){this.open=false;},focus(){}}]));
 const document={getElementById:id=>elements.get(id)},get=id=>elements.get(id),guide=initBeginnerGuide(document);let starts=0;
 initTutorialMenu(document,guide,()=>starts++);
 get('openTutorial').onclick();assert.equal(get('tutorialMenu').open,true);assert.equal(starts,0);
 for(const [button,title] of [['tutorialShogi','将棋の基本'],['tutorialOthello','オセロの基本']]){
  get(button).onclick();assert.equal(get('beginnerGuide').open,true);assert.equal(get('beginnerTitle').textContent,title);assert.equal(get('beginnerTutorial').hidden,false);
  get('closeBeginner').onclick();assert.equal(get('tutorialMenu').open,true);
 }
 get('tutorialShogi').onclick();get('beginnerTutorial').onclick();assert.equal(starts,1);assert.equal(get('beginnerGuide').open,false);assert.equal(get('tutorialMenu').open,false);
 get('openTutorial').onclick();get('tutorialKnown').onclick();assert.equal(starts,2);
 get('openTutorial').onclick();get('closeTutorialMenu').onclick();assert.equal(starts,2);assert.equal(get('tutorialMenu').open,false);
 get('openShogiBasics').onclick();assert.equal(get('beginnerTutorial').hidden,true,'通常のルール解説には練習へ進む操作を追加しない');
});
