import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomTransport,pollDelay,createRoomPoller} from '../dist/room-network.js';
test('transport skips unchanged JSON, synchronizes clocks, forwards cancellation, and reports aggregate body bytes only',async()=>{
 const calls=[],clocks=[];
 const full={serverNow:123,version:4,state:{result:'日本語'}};
 const replies=[Response.json(full),new Response(null,{status:304,headers:{'X-Room-Server-Now':'456','X-Room-Version':'4'}}),Response.json({error:'拒否'},{status:403})];
 const transport=createRoomTransport({fetchImpl:async(...args)=>{calls.push(args);return replies.shift();},onClock:n=>clocks.push(n)}),abort=new AbortController();
 assert.deepEqual(await transport.request('/secret-room','secret-token',{action:'move'}),full);
 assert.equal(await transport.request('/secret-room','secret-token',undefined,{version:4,signal:abort.signal}),null);
 abort.abort();assert.equal(calls[1][1].signal.aborted,true);
 await assert.rejects(transport.request('/secret-room','secret-token'),e=>e.status===403&&e.message==='拒否');
 assert.equal(calls[1][0],'/api/rooms/secret-room?version=4');assert.equal(calls[1][1].cache,'no-store');assert.deepEqual(clocks,[123,456]);
 assert.deepEqual(transport.getStats(),{requests:3,reads:2,writes:1,unchanged:1,errors:1,aborted:0,responseBytes:new TextEncoder().encode(JSON.stringify(full)+JSON.stringify({error:'拒否'})).byteLength});
 assert.ok(!JSON.stringify(transport.getStats()).includes('secret'));assert.ok(Object.isFrozen(transport.getStats()));
 transport.resetStats();assert.equal(transport.getStats().requests,0);
});
test('poll timing retains offer, rematch and waiting detection with bounded background and failure delays',()=>{
 assert.equal(pollDelay({joined:false}),2000);
 assert.equal(pollDelay({joined:true,turn:0,side:0}),8000);
 assert.equal(pollDelay({joined:true,turn:1,side:0}),2000);
 assert.equal(pollDelay({joined:true,turn:0,side:0,result:true}),2000);
 assert.equal(pollDelay({hidden:true}),10000);
 assert.equal(pollDelay({closed:true}),null);
 assert.deepEqual([1,2,3,4,9].map(errors=>pollDelay({connected:false,errors,random:()=>0.5})),[5000,10000,20000,30000,30000]);
 assert.equal(pollDelay({errors:9,random:()=>1}),30000);
});
test('poller coalesces overlapping reads, cancels stale delivery, and restarts immediately',async()=>{
 let reads=0,resolveRead,signal;const delivered=[],timers=new Map();let timerId=0;
 const poller=createRoomPoller({read:options=>{reads++;signal=options.signal;return new Promise(resolve=>{resolveRead=resolve;});},getState:()=>({joined:true,turn:0,side:0}),onData:d=>delivered.push(d),setTimer:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimer:id=>timers.delete(id)});
 const first=poller.start();assert.equal(poller.refresh(),first);await Promise.resolve();assert.equal(reads,1);
 resolveRead({version:1});await first;assert.deepEqual(delivered,[{version:1}]);assert.equal([...timers.values()][0].delay,8000);
 const stale=poller.refresh();await Promise.resolve();assert.equal(timers.size,0);poller.stop();assert.equal(signal.aborted,true);resolveRead({version:2});await stale;assert.equal(delivered.length,1);assert.equal(timers.size,0);
 const next=poller.start();await Promise.resolve();resolveRead(null);await next;assert.equal(reads,3);assert.equal(delivered.at(-1),null);poller.stop();assert.equal(timers.size,0);
});
test('aborted requests and late completions from a previous match do not pollute reset counters',async()=>{
 let resolveFetch;const transport=createRoomTransport({fetchImpl:()=>new Promise(resolve=>{resolveFetch=resolve;})});
 const old=transport.request('/old','token');transport.resetStats();resolveFetch(Response.json({serverNow:1}));await old;assert.equal(transport.getStats().requests,0);assert.equal(transport.getStats().responseBytes,0);
 const aborted=createRoomTransport({fetchImpl:async()=>{throw new DOMException('Aborted','AbortError');}});await assert.rejects(aborted.request('/old','token'));assert.equal(aborted.getStats().aborted,1);assert.equal(aborted.getStats().errors,0);
});
test('poller can defer its first read after a mutation and clamp delay to a clock deadline',async()=>{
 let reads=0,scheduled,cleared=0;
 const poller=createRoomPoller({read:async()=>{reads++;return null;},getState:()=>({joined:true,turn:0,side:0}),getDelay:(state,delay)=>Math.min(delay,750),setTimer:(fn,delay)=>{scheduled={fn,delay};return 1;},clearTimer:()=>cleared++});
 await poller.start({immediate:false});assert.equal(reads,0);assert.equal(scheduled.delay,750);
 await poller.refresh();assert.equal(reads,1);assert.equal(scheduled.delay,750);assert.ok(cleared>=1);
 poller.stop();await poller.start({immediate:false});assert.equal(reads,1);await poller.refresh();assert.equal(reads,2);poller.stop();
});
