import {DatabaseSync} from 'node:sqlite';
import {schema} from './api.js';
export function localDB(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec(schema);
 const execute=Symbol('execute');
 function prepare(sql,args=[]){
  return {bind(...values){return prepare(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},
   [execute](){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},
   async run(){return this[execute]();}};
 }
 return {prepare,async batch(statements){
  db.exec('BEGIN');
  try{const results=statements.map(statement=>statement[execute]());db.exec('COMMIT');return results;}
  catch(error){db.exec('ROLLBACK');throw error;}
 },close(){db.close();}};
}

// Local development counterpart of the Workers 5-per-minute binding.
export function localRoomBurstLimiter(){
 const counters=new Map();
 return {async limit({key}){
  const now=Date.now();
  for(const [ip,counter] of counters)if(counter.expires<=now)counters.delete(ip);
  let counter=counters.get(key);
  if(!counter){counter={count:0,expires:now+60000};counters.set(key,counter);}
  if(counter.count>=5)return {success:false};
  counter.count++;return {success:true};
 }};
}
