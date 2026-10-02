import gateway from '../../../worker/pages-gateway.js';

export function onRequest({request,env}){
 return gateway.fetch(request,env);
}
