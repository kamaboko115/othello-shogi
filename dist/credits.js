// Static credits keep opening this screen independent of GitHub and the network.
// Add a tester's chosen public name here after confirming it with them.
export const creators=['kamaboko115','yuuki1293','9syk','urua12345'];
export const testPlayers=[];

export function initCredits(document){
 const get=id=>document.getElementById(id),dialog=get('creditsDialog');
 const creatorsList=get('creditsCreators'),testersList=get('creditsTesters');
 for(const login of creators){
  const item=document.createElement('li'),link=document.createElement('a');
  link.textContent=login;link.href='https://github.com/'+login;
  link.target='_blank';link.rel='noopener noreferrer';item.append(link);creatorsList.append(item);
 }
 for(const name of testPlayers){const item=document.createElement('li');item.textContent=name;testersList.append(item);}
 get('creditsTestersSection').hidden=testPlayers.length===0;
 get('openCredits').onclick=()=>{dialog.showModal();get('creditsTitle').focus();};
 get('closeCredits').onclick=()=>dialog.close();
}
