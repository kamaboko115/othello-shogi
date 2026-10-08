export const maxRequestBodyBytes=4096;
export const securityHeaders={
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' data: https://taira-komori.net; worker-src 'self'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
};

// Content-Length is only an early rejection hint. Always enforce the actual
// byte count, including chunked requests and multibyte UTF-8 characters.
export async function readLimitedRequestBody(request,maxBytes=maxRequestBodyBytes){
 const tooLarge=()=>Object.assign(new Error('リクエストが大きすぎます。'),{status:413});
 const length=request.headers.get('Content-Length');
 if(length!==null&&/^\d+$/.test(length)&&Number(length)>maxBytes){
  request.body?.cancel().catch(()=>{});throw tooLarge();
 }
 if(!request.body)return '';
 const reader=request.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes){reader.cancel().catch(()=>{});throw tooLarge();}
   text+=decoder.decode(value,{stream:true});
  }
  return text+decoder.decode();
 }finally{reader.releaseLock();}
}
