import {empty} from './engine.js';
export function encodeBoard(state){return JSON.stringify({version:1,board:state.board,hands:state.hands,turn:state.turn,ply:state.ply});}
export function decodeBoard(text){
 if(typeof text!=='string'||text.length>20000)throw Error('盤面データが長すぎます。');
 let data;try{data=JSON.parse(text);}catch{throw Error('コピーした盤面データを貼り付けてください。');}
 if(!data||data.version!==1||!Array.isArray(data.board)||data.board.length!==81||![0,1].includes(data.turn))throw Error('盤面データの形式が正しくありません。');
 const state=empty();state.board=data.board.map(p=>{if(p===null)return null;if(!p||!['P','L','N','S','G','B','R','K'].includes(p.type)||![0,1].includes(p.side)||typeof p.prom!=='boolean'||(p.prom&&['K','G'].includes(p.type)))throw Error('駒の情報が正しくありません。');if(p.wings!==undefined&&(p.type!=='K'||p.wings!==true))throw Error('翼の情報が正しくありません。');return {type:p.type,side:p.side,prom:p.prom,...(p.wings?{wings:true}:{})};});
 if(!Array.isArray(data.hands)||data.hands.length!==2)throw Error('持ち駒の情報が正しくありません。');
 state.hands=data.hands.map(hand=>{if(!hand||typeof hand!=='object')throw Error('持ち駒の情報が正しくありません。');const out={};for(const type of ['P','L','N','S','G','B','R']){const n=hand[type]??0;if(!Number.isInteger(n)||n<0||n>81+4*(Number.isInteger(data.ply)&&data.ply>=0?Math.min(data.ply,100000):0))throw Error('持ち駒の数が正しくありません。');out[type]=n;}return out;});
 state.turn=data.turn;state.ply=Number.isInteger(data.ply)&&data.ply>=0?Math.min(data.ply,100000):0;state.moveLimit=false;state.paradoxAt=false;return state;
}
