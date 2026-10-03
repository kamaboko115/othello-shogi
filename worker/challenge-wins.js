// Local AI victories are browser reports, not an anti-cheat leaderboard.
export const challengeWinSchema=`CREATE TABLE IF NOT EXISTS challenge_wins (match_key TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, created INTEGER NOT NULL);`;
export function validChallengeWin(body){
 const s=body.settings;
 return /^[a-f0-9]{32}:[1-9][0-9]{0,5}$/.test(body.matchKey||'')&&body.side===1&&typeof body.result==='string'&&/^後手の勝ち（[^\n]{1,40}）$/.test(body.result)&&Number.isInteger(body.ply)&&body.ply>0&&body.ply<100000&&s?.aiLevel==='osesho'&&s.thinkMs===5000&&s.handicap==='none'&&s.noDrops===false&&s.moveLimit===false&&s.paradoxAt===200&&s.timeControl?.minutes===20&&s.timeControl?.increment===5&&s.timeControl?.byoyomi===0;
}
export async function challengeWinCount(db){return (await db.prepare('SELECT COUNT(*) AS total FROM challenge_wins').first()).total;}
export async function recordChallengeWin(db,matchKey,now){
 // The single SQLite statement serializes assignment; duplicate reports consume no ordinal.
 await db.prepare('INSERT OR IGNORE INTO challenge_wins (match_key,ordinal,created) SELECT ?,COALESCE(MAX(ordinal),0)+1,? FROM challenge_wins').bind(matchKey,now).run();
 return {...await db.prepare('SELECT ordinal FROM challenge_wins WHERE match_key = ?').bind(matchKey).first(),total:await challengeWinCount(db)};
}
