import {DatabaseSync} from 'node:sqlite';
import {schema} from './api.js';
export function localDB(filename=':memory:'){
 const db=new DatabaseSync(filename);db.exec(schema);
 return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}};},close(){db.close();}};
}
