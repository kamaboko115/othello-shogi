import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingRoomRequests} from '../dist/room-requests.js';
const friend={kind:'friend',joined:true,seat:0,side:1,state:{result:null}};
test('only incoming friend requests are surfaced, using seat rather than playing side',()=>{
 assert.deepEqual(pendingRoomRequests({...friend,undoOffer:{seat:0,ply:4},offer:0}),[]);
 assert.deepEqual(pendingRoomRequests({...friend,undoOffer:{seat:1,ply:4},offer:1}).map(r=>r.accept),['acceptUndo','acceptDraw']);
 for(const extra of [{kind:'ai'},{closed:true},{joined:false}])assert.deepEqual(pendingRoomRequests({...friend,offer:1,...extra}),[]);
});
test('rematch appears only after the game ends and old live-game requests disappear',()=>{
 assert.deepEqual(pendingRoomRequests({...friend,rematch:1}),[]);
 assert.deepEqual(pendingRoomRequests({...friend,state:{result:'終了'},rematch:1,offer:1,undoOffer:{seat:1,ply:4}}).map(r=>r.accept),['acceptRematch']);
 assert.deepEqual(pendingRoomRequests({...friend,state:{result:'終了'},rematch:0}),[]);
});
