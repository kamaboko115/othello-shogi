import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {activeHostRoomQuery} from '../worker/api.js';

test('大量の他人の部屋と期限切れ履歴があっても作成者・期限の索引で有効な部屋だけを探す',()=>{
 const db=new DatabaseSync(':memory:');try{
  // Exercise the actual deployment migrations and the query used by the API.
  for(const file of ['0000_rooms.sql','0001_room_creation_limits.sql'])db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const now=Date.now(),insert=db.prepare('INSERT INTO rooms (id,host_hash,invite_hash,data,expires) VALUES (?,?,?,?,?)');
  db.exec('BEGIN');
  for(let i=0;i<20000;i++)insert.run('other-'+i,'other-host-'+i,'invite','{}',now+100000);
  for(let i=0;i<2000;i++)insert.run('expired-'+i,'target-host','invite','{}',now-1);
  insert.run('target','target-host','invite','{}',now+100000);
  db.exec('COMMIT');db.exec('ANALYZE');
  const plan=db.prepare('EXPLAIN QUERY PLAN '+activeHostRoomQuery).all('target-host',now).map(row=>row.detail).join('\n');
  assert.match(plan,/SEARCH rooms USING INDEX rooms_host_expires/);
  assert.match(plan,/host_hash=\? AND expires>\?/);
  assert.doesNotMatch(plan,/SCAN rooms/);
  assert.equal(db.prepare(activeHostRoomQuery).get('target-host',now).id,'target');
  assert.equal(db.prepare(activeHostRoomQuery).get('missing-host',now),undefined);
  const guard=db.prepare('EXPLAIN QUERY PLAN SELECT 1 FROM rooms WHERE host_hash = ? AND expires > ?').all('target-host',now).map(row=>row.detail).join('\n');
  assert.match(guard,/SEARCH rooms USING COVERING INDEX rooms_host_expires/);
  for(const [sql,index,args] of [
   ['SELECT * FROM rooms WHERE id = ?','sqlite_autoindex_rooms_1',['target']],
   ['DELETE FROM rooms WHERE expires <= ?','rooms_expires',[now]],
   ['DELETE FROM room_creation_limits WHERE expires <= ?','room_creation_limits_expires',[now]]
  ]){
   const detail=db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(row=>row.detail).join('\n');
   assert.ok(detail.includes(index),detail);assert.doesNotMatch(detail,/SCAN (rooms|room_creation_limits)/);
  }
 }finally{db.close();}
});
