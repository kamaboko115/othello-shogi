import test from 'node:test';
import assert from 'node:assert/strict';
import {initCredits,creators,testPlayers} from '../dist/credits.js';

test('credits can open over settings, close back to it, and reopen without duplicate people',()=>{
 const elements=new Map(),document={activeElement:null,createElement:()=>node(),getElementById:id=>elements.get(id)};
 function node(){return {children:[],hidden:false,open:false,append(child){this.children.push(child);},focus(){document.activeElement=this;},showModal(){this.opener=document.activeElement;this.open=true;},close(){this.open=false;this.opener?.focus();}};}
 for(const id of ['creditsDialog','creditsCreators','creditsTesters','creditsTestersSection','creditsTitle','openCredits','closeCredits','settingsDialog'])elements.set(id,node());
 const get=id=>elements.get(id);initCredits(document);get('settingsDialog').showModal();
 for(let i=0;i<2;i++){
  get('openCredits').focus();get('openCredits').onclick();
  assert.equal(get('settingsDialog').open,true);assert.equal(get('creditsDialog').open,true);
  assert.equal(document.activeElement,get('creditsTitle'));
  assert.deepEqual(get('creditsCreators').children.map(li=>li.children[0].textContent),creators);
  for(const li of get('creditsCreators').children){assert.equal(li.children[0].href,'https://github.com/'+li.children[0].textContent);assert.equal(li.children[0].rel,'noopener noreferrer');}
  assert.equal(get('creditsTestersSection').hidden,testPlayers.length===0);
  get('closeCredits').onclick();assert.equal(get('settingsDialog').open,true);assert.equal(get('creditsDialog').open,false);
  assert.equal(document.activeElement,get('openCredits'));
 }
 // Native Escape closes just the top dialog; there is no cancel interception.
 assert.equal(get('creditsDialog').oncancel,undefined);
});
