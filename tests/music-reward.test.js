import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusic} from '../dist/music.js';
import {createRewardAds,showTestReward} from '../dist/reward-ad.js';
test('BGM is lazy, local, remembers on/off and pauses while hidden or in an ad',async()=>{
 const disk=new Map(),events={};let made=0,plays=0,pauses=0;
 const document={hidden:false,addEventListener:(name,fn)=>events[name]=fn},audio={play(){plays++;return Promise.resolve();},pause(){pauses++;}};
 const music=createMusic({storage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)},document,audioFactory:()=>{made++;return audio;}});
 assert.equal(made,0);await music.setEnabled(true);assert.equal(made,1);assert.equal(audio.src,'/music/electrodoodle.mp3');assert.equal(audio.loop,true);assert.equal(audio.volume,.16);
 music.pause();await events.pointerdown();assert.equal(plays,1);await music.resume();assert.equal(plays,2);
 document.hidden=true;await events.visibilitychange();assert.ok(pauses>=2);
 await music.setEnabled(false);document.hidden=false;await events.visibilitychange();assert.equal(plays,2);assert.equal([...disk.values()][0],'off');
});
test('only fully viewed rewarded ads grant a reward; concurrent clicks coalesce',async()=>{
 let hooks,calls=0,pauses=0,resumes=0;
 const ads=createRewardAds({hostname:'example.com',provider:options=>{hooks=options;calls++;},pause:()=>pauses++,resume:()=>resumes++});
 const a=ads.watch(),b=ads.watch();assert.equal(a,b);assert.equal(calls,1);let shown=0;hooks.beforeReward(()=>shown++);assert.equal(shown,1);hooks.beforeAd();hooks.adViewed();hooks.adBreakDone({breakStatus:'viewed'});
 assert.deepEqual(await a,{rewarded:true,reason:'viewed'});assert.equal(pauses,1);assert.equal(resumes,1);
 const c=ads.watch();hooks.beforeAd();hooks.adDismissed();hooks.adBreakDone({breakStatus:'dismissed'});assert.equal((await c).rewarded,false);
});
test('unconfigured production, no ad, exceptions and timeouts do not unlock the reward',async()=>{
 const ads=createRewardAds({hostname:'example.com',showTest:()=>assert.fail('no test ad on production')});
 for(let i=0;i<2;i++)assert.equal((await ads.watch()).reason,'not-configured');
 for(const provider of [()=>{throw Error('offline');},opts=>opts.adBreakDone({breakStatus:'noAdPreloaded'})])assert.equal((await createRewardAds({provider}).watch()).rewarded,false);
 let expire;const timeout=createRewardAds({provider:()=>{},setTimer:fn=>{expire=fn;return 1;},clearTimer:()=>{}});const pending=timeout.watch();expire();assert.equal((await pending).rewarded,false);
 let hooks;const incomplete=createRewardAds({provider:opts=>hooks=opts,setTimer:fn=>{expire=fn;return 1;},clearTimer:()=>{}});const unfinished=incomplete.watch();hooks.adViewed();expire();assert.equal((await unfinished).rewarded,false);
});
test('local reward can be cancelled and cannot be claimed before the full five seconds',async()=>{
 for(const completed of [false,true]){
  let now=0,tick,cleared=false;const nodes=[];
  const document={body:{append(){}},createElement(){const events={};const el={events,append(){},setAttribute(){},addEventListener:(name,fn)=>events[name]=fn,showModal(){},close(){events.close();},remove(){}};nodes.push(el);return el;}};
  const pending=showTestReward({document,now:()=>now,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>cleared=true}),finish=nodes[3],cancel=nodes[4];
  assert.equal(finish.disabled,true);finish.onclick();now=5000;tick();assert.equal(finish.disabled,false);(completed?finish:cancel).onclick();assert.equal((await pending).rewarded,completed);assert.equal(cleared,true);
 }
});
