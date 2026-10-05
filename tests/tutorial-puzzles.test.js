import test from 'node:test';
import assert from 'node:assert/strict';
import {moves,inCheck} from '../dist/engine.js';
import {tutorialPuzzles,puzzleState,tryPuzzleMove} from '../dist/tutorial-puzzles.js';
for(let i=0;i<3;i++)test(`beginner puzzle ${i+1} has its intended one-move win and rejects other moves`,()=>{
 const s=puzzleState(i),before=structuredClone(s),answer=tutorialPuzzles[i].answer;
 const sources=[...s.board.flatMap((p,i)=>p?.side===0?[i]:[]),...Object.keys(s.hands[0])];
 const legal=sources.flatMap(source=>moves(s,source));
 const wins=legal.filter(m=>tryPuzzleMove(s,m).correct);
 assert.ok(wins.length>0);
 for(const m of wins){assert.equal(m.to,answer.to);assert.equal(m.from,answer.from);assert.equal(m.drop,answer.drop);}
 assert.ok(legal.some(m=>!tryPuzzleMove(s,m).correct));
 const result=tryPuzzleMove(s,answer);assert.equal(result.correct,true);assert.equal(result.state.ply,1);
 assert.equal(result.state.flipped.length,[0,1,2][i]);assert.deepEqual(s,before);
 assert.equal(s.paradoxAt,false);assert.equal(s.moveLimit,false);
});

test('defense puzzle is mate in standard shogi but reversible in othello shogi',()=>{
 const s=puzzleState(3),sources=[...s.board.flatMap((p,i)=>p?.side===0?[i]:[]),...Object.keys(s.hands[0])];
 const normal={...s,mode:false};assert.equal(inCheck(normal,0),true);
 assert.equal(sources.flatMap(i=>moves(normal,i)).length,0);
 const available=sources.flatMap(i=>moves(s,i)),answers=available.filter(m=>tryPuzzleMove(s,m,'defend').correct);
 assert.ok(answers.length>0);
 for(const m of answers){const {state:n}=tryPuzzleMove(s,m,'defend');assert.equal(n.result,'');assert.equal(n.board[67].side,0);assert.equal(inCheck(n,0),false);}
 assert.equal(tryPuzzleMove(s,tutorialPuzzles[3].answer,'defend').correct,true);
 assert.equal(tryPuzzleMove(s,{from:76,to:67},'defend').correct,false);
 assert.equal(tryPuzzleMove(s,{drop:'G',to:0},'defend').correct,false);
});
