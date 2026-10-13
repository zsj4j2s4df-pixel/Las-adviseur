import type { Env, Data } from './functions/lib/types';
import { onRequestPost as chat } from './functions/api/chat';
import {
  onRequestDelete as deleteInventory,
  onRequestGet as getInventory,
  onRequestPost as postInventory,
  onRequestPut as putInventory,
} from './functions/api/inventory';
import { onRequestPost as createSttSession } from './functions/api/stt-session';
import { onRequestPost as createTrial, onRequestGet as getTrials } from './functions/api/trials';
import { onRequestPost as textToSpeech } from './functions/api/tts';
import { json } from './functions/lib/http';

type Handler = (data: Data) => Promisg¾w¶‰žËkºwµçn false;
  const actual=createHmac('sha256',secret).update(payload).digest();let given;
  try{given=Buffer.from(signature.replace(/-/g,'+').replace(/_/g,'/'),'base64')}catch{return false;}
  if(given.length!==actual.length||!timingSafeEqual(given,actual))return false;
  let claims;try{claims=JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'))}catch{return false;}
  const now=Math.floor(Date.now()/1000);if(!claims.nonce||claims.exp<now||claims.exp>now+130||seen.has(claims.nonce))return false;
  seen.set(claims.nonce,claims.exp);if(seen.size>5000)for(const [nonce,exp] of seen)if(exp<now)seen.delete(nonce);
  return true;
}
server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/stream'||!authorized(url.searchParams.get('token'))){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}
  sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws,req));
});
sockets.on('connection',ws=>{
  const call=client.streamingRecognize({config:{encoding:'LINEAR16',sampleRateHertz:16000,languageCode:'nl-NL',enableAutomaticPunctuation:true,model:'latest_long'},interimResults:true});
  let ended=false;
  const close=()=>{if(ended)return;ended=true;try{call.end()}catch{};if(ws.readyState===WebSocket.OPEN)ws.close();};
  const timer=setTimeout(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({error:'Sessie van vier minuten beÃ«indigd. Start opnieuw om verder te praten.'}));close()},4*60*1000);
  call.on('data',data=>{for(const result of data.results||[]){const text=result.alternatives?.[0]?.transcript;if(text&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({text,final:Boolean(result.isFinal)}));}});
  call.on('error',()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({error:'Google Speech-to-Text kon de audio niet verwerken.'}));close()});
  call.on('end',close);
  ws.on('message',(data,isBinary)=>{if(isBinary&&!ended){try{call.write({audioContent:Buffer.from(data)})}catch{close()}}else if(String(data)==='stop')close()});
  ws.on('close',()=>{clearTimeout(timer);close()});
  ws.on('error',close);
});
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
