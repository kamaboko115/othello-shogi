// Shared by both match stores; challenge rules cannot be bypassed by the lobby.
export const isOseshoChallenge=settings=>settings?.aiLevel==='osesho';
export function challengeSettings(settings,kind='ai'){
 const next={...settings,moveLimit:false};
 return kind==='ai'&&isOseshoChallenge(next)?{...next,thinkMs:5000,handicap:'none',noDrops:false,paradoxAt:200,timeControl:{minutes:20,increment:5,byoyomi:0}}:next;
}
export const helperLimit=settings=>isOseshoChallenge(settings)?(settings.helperUnlimited?3:1):settings?.helperUnlimited?Infinity:1;
export const helperUses=data=>data?.helperUsedRound===(data?.round||1)?(data.helperUsedCount??1):0;
export const helperRemaining=data=>Math.max(0,helperLimit(data?.settings)-helperUses(data));
export function recordHelperUse(data){const used=helperUses(data);data.helperUsedRound=data.round||1;data.helperUsedCount=used+1;}

export const allowsTakeback=data=>!(data?.kind==='ai'&&isOseshoChallenge(data.settings));
