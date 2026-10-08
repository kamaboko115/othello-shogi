// Local AI victories are browser reports, not an anti-cheat leaderboard.
export const challengeWinSchema=`CREATE TABLE IF NOT EXISTS challenge_wins (match_key TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS challenge_win_backups (hour INTEGER PRIMARY KEY, created INTEGER NOT NULL, total INTEGER NOT NULL, last_ordinal INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS challenge_win_proofs (proof_hash TEXT PRIMARY KEY, match_key TEXT NOT NULL UNIQUE); CREATE INDEX IF NOT EXISTS challenge_wins_created ON challenge_wins(created);`;
export async function backupChallengeWins(db,now=Date.now()){
 const hour=Math.floor(now/3600000);
 await db.prepare('INSERT OR IGNORE INTO challenge_win_backups (hour,created,total,last_ordinal) SELECT ?,?,COUNT(*),COALESCE(MAX(ordinal),0) FROM challenge_wins').bind(hour,now).run();
 // Preserve 90 days of hourly recovery points. Victory rows themselves stay intact.
 await db.prepare('DELETE FROM challenge_win_backups WHERE hour < ?').bind(hour-90*24).run();
}
export function validChallengeWin(body){
 const s=body.settings;
 return /^[a-f0-9]{32}:[1-9][0-9]{0,5}$/.test(body.matchKey||'')&&body.side===1&&typeof body.result==='string'&&/^後手の勝ち（[^\n]{1,40}）$/.test(body.result)&&Number.isInteger(body.ply)&&body.ply>0&&body.ply<100000&&s?.aiLevel==='osesho'&&s.thinkMs===5000&&s.handicap==='none'&&s.noDrops===false&&s.moveLimit===false&&s.paradoxAt===200&&s.timeControl?.minutes===20&&s.timeControl?.increment===5&&s.timeControl?.byoyomi===0;
}
export async function challengeWinCount(db){return (await db.prepare('SELECT COUNT(*) AS total FROM challenge_wins').first()).total;}
export async function recordChallengeWin(db,matchKey,now,proofHash){
 if(proofHash){
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO challenge_wins (match_key,ordinal,created) SELECT ?,COALESCE(MAX(ordinal),0)+1,? FROM challenge_wins HAVING NOT EXISTS (SELECT 1 FROM challenge_win_proofs WHERE proof_hash = ?)').bind(matchKey,now,proofHash),
   db.prepare('INSERT OR IGNORE INTO challenge_win_proofs (proof_hash,match_key) SELECT ?,? WHERE EXISTS (SELECT 1 FROM challenge_wins WHERE match_key = ?)').bind(proofHash,matchKey,matchKey)
  ]);
  const receipt=await db.prepare('SELECT w.ordinal FROM challenge_win_proofs p JOIN challenge_wins w ON w.match_key = p.match_key WHERE p.proof_hash = ?').bind(proofHash).first();
  return {ordinal:receipt?.ordinal??(await db.prepare('SELECT ordinal FROM challenge_wins WHERE match_key = ?').bind(matchKey).first())?.ordinal,total:await challengeWinCount(db)};
 }
 // The single SQLite statement serializes assignment; duplicate reports consume no ordinal.
 await db.prepare('INSERT OR IGNORE INTO challenge_wins (match_key,ordinal,created) SELECT ?,COALESCE(MAX(ordinal),0)+1,? FROM challenge_wins').bind(matchKey,now).run();
 return {...await db.prepare('SELECT ordinal FROM challenge_wins WHERE match_key = ?').bind(matchKey).first(),total:await challengeWinCount(db)};
}
