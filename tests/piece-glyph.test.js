import test from 'node:test';
import assert from 'node:assert/strict';
import {pieceGlyph,label} from '../dist/engine.js';
test('promoted board glyphs stay distinct from record and accessible names',()=>{
 for(const side of [0,1])for(const [type,glyph,name]of [['L','杏','成香'],['N','圭','成桂'],['S','全','成銀']]){
  const p={type,side,prom:true};assert.equal(pieceGlyph(p),glyph);assert.equal(label(p),name);
  assert.equal(pieceGlyph({...p,prom:false}),label({...p,prom:false}));
 }
 for(const type of ['R','B','P'])assert.equal(pieceGlyph({type,prom:true}),label({type,prom:true}));
});
