import {securityHeaders} from './security.js';

export const roomCreationLimit=100;
export const roomCreationWindowMs=12*60*60*1000;
export const roomLimitSchema=`
CREATE TABLE IF NOT EXISTS room_creation_limits (
 ip_hash TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 last_room_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS room_creation_limits_expires ON room_creation_limits(expires);
CREATE INDEX IF NOT EXISTS rooms_host_expires ON rooms(host_hash,expires);
`;

export function roomLimitResponse(retryAfter){
 return Response.json({error:'友人対局の作成回数が上限に達しました。しばらく待ってから作成してください。'},
  {status:429,headers:{...securityHeaders,'Retry-After':String(Math.max(1,Math.ceil(retryAfter))),'Cache-Control':'no-store'}});
}

// D1 batch is transactional: the quota and room are committed together.
// The marker also prevents a denied request from inserting a room. Checking
// the host inside the transaction makes simultaneous retries count only once.
export async function insertLimitedFriendRoom(DB,{ipHash,id,hostHash,inviteHash,data,now}){
 const results=await DB.batch([
  DB.prepare(`INSERT INTO room_creation_limits (ip_hash,count,expires,last_room_id)
   SELECT ?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM rooms WHERE host_hash = ? AND expires > ?)
   ON CONFLICT(ip_hash) DO UPDATE SET
    count = CASE WHEN room_creation_limits.expires <= ? THEN 1 ELSE room_creation_limits.count + 1 END,
    expires = CASE WHEN room_creation_limits.expires <= ? THEN excluded.expires ELSE room_creation_limits.expires END,
    last_room_id = excluded.last_room_id
   WHERE room_creation_limits.expires <= ? OR room_creation_limits.count < ?`)
   .bind(ipHash,now+roomCreationWindowMs,id,hostHash,now,now,now,now,roomCreationLimit),
  DB.prepare(`INSERT INTO rooms (id,host_hash,invite_hash,data,expires)
   SELECT ?,?,?,?,? FROM room_creation_limits WHERE ip_hash = ? AND last_room_id = ?`)
   .bind(id,hostHash,inviteHash,JSON.stringify(data),now+7*86400000,ipHash,id)
 ]);
 return results[1].meta.changes===1;
}
