import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {judgeSteps,normalizeMoveLimit,initJudgeSlider} from '../dist/judge-options.js';
import {initial,play} from '../dist/engine.js';
import {SearchPosition,chooseOsesho} from '../dist/osesho-ai.js';
import {chooseAI} from '../dist/ai.js';
import {resultView} from '../dist/result-view.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';

test('各手数の直前まで続行し、指定手数で判定する。AIも同じ境界を使う',()=>{
 for(const limit of judgeSteps.filter(Boolean)){
  const s=initial();s.moveLimit=limit;s.ply=limit-2;
  const before=play(s,{from:54,to:45,prom:false});assert.equal(before.result,'');
  assert.equal(new SearchPosition(before).terminal(),null);
  const end=play(before,{from:18,to:27,prom:false});assert.match(end.result,new RegExp('引き分け（'+limit+'手'));
  assert.equal(new SearchPosition(end).terminal(),0);
  assert.equal(resultView(end).reason,'オセロジャッジで引き分け');assert.match(resultView(end).detail,new RegExp('^'+limit+'手'));
 }
 const s=initial();s.moveLimit=80;s.ply=79;s.board[27]={type:'P',side:1};s.board[36]={type:'G',side:0};
 for(const choose of [()=>chooseAI(s,'expert',300),()=>chooseOsesho(s,300)])assert.match(play(s,choose()).result,/先手の勝ち.*80手/);
 s.moveLimit=false;s.ply=300;assert.equal(play(s,{from:54,to:45,prom:false}).result,'');assert.equal(new SearchPosition(s).terminal(),null);
});

test('スライダーは全8選択肢を表示し、既存の真偽値設定と互換性がある',()=>{
 assert.equal(normalizeMoveLimit(),false);assert.equal(normalizeMoveLimit(true),60);assert.throws(()=>normalizeMoveLimit(90));assert.throws(()=>normalizeMoveLimit('80'));
 let handler;const input={value:'7',addEventListener:(event,fn)=>{assert.equal(event,'input');handler=fn;},setAttribute:(key,val)=>{input[key]=val;}},output={};initJudgeSlider(input,output);assert.equal(output.textContent,'無制限');
 judgeSteps.forEach((limit,i)=>{input.value=String(i);handler();assert.equal(output.textContent,limit===false?'無制限':limit+'手');assert.equal(input['aria-valuetext'],output.textContent);});
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.match(html,/id="moveLimit" type="range"[^>]*value="7"/);
});

test('AI・対人の作成、招待、再接続、再試合で全判定手数が保持され、不正な手数は拒否する',async()=>{
 const token='a'.repeat(64),invite='b'.repeat(64),guest='c'.repeat(64);
 for(const kind of ['ai','friend'])for(const limit of [...judgeSteps,true]){
  const db=localDB();try{
   const call=async(path,body,auth=token)=>{const r=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});assert.ok(r.ok);return r.json();};
   let d=await call('',{invite,kind,settings:{moveLimit:limit}}),expected=limit===true?60:limit;const path='/'+d.room;
   assert.equal(d.state.moveLimit,expected);assert.equal((await call(path)).settings.moveLimit,expected);assert.equal((await call(path+'/preview',{invite},guest)).settings.moveLimit,expected);
   if(kind==='friend')await call(path+'/join',{invite},guest);
   d=await call(path);d=await call(path+'/action',{action:'resign',version:d.version});d=await call(path+'/action',{action:'offer-rematch',version:d.version});
   if(kind==='friend')d=await call(path+'/action',{action:'accept-rematch',version:d.version},guest);
   assert.equal(d.state.moveLimit,expected);assert.equal(d.settings.moveLimit,expected);
  }finally{db.close();}
 }
 const db=localDB();try{const r=await api(new Request('https://test.local/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({invite,settings:{moveLimit:90}})}),{DB:db});assert.equal(r.status,400);}finally{db.close();}
});
