import { FormEvent, useEffect, useRef, useState } from 'react';
type World = 'tig'|'migmag';
type Message = { role: 'user'|'assistant'; content: string; spoken?: string };
type Item = { id: string; world: string; category: string; name: string; spec: string; notes: string; available: number };
type Trial = { id: string; world: World; material: string; thickness: string; joint: string; fitup: string; result: string; settings: string; created_at: string };
const firstMessage: Message = { role:'assistant', content:'Ik help je met een praktische startinstelling. Vertel wat je gaat lassen: materiaal, dikte en verbinding. Als je het al weet: passing, gewenste afwerking en welk toevoegmateriaal er klaar ligt.' };
const categories = ['Materiaal','Toevoegmateriaal / draad','Wolfraam','Gas','Machine','Toorts','Werkplaats / veiligheid','Overig'];
const categoryByWorld: Record<World,string[]> = { tig:categories, migmag:categories.filter(x=>x!=='Wolfraam') };
const getJSON = async (url:string, init?:RequestInit) => { const res=await fetch(url,{...init,headers:{'content-type':'application/json',...(init?.headers||{})}}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Er ging iets mis.'); return data; };
function dataUrl(file:File) { return new Promise<string>((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result).split(',')[1]); r.onerror=reject; r.readAsDataURL(file); }); }

export default function App() {
  const [world,setWorld]=useState<World>('tig');
  const [tab,setTab]=useState<'advies'|'beheer'|'proeven'>('advies');
  const [threads,setThreads]=useState<Record<World,Message[]>>({tig:[firstMessage],migmag:[firstMessage]});
  const messages=threads[world];
  const [draft,setDraft]=useState('');
  const [image,setImage]=useState<File|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [busySpeak,setBusySpeak]=useState(false);
  const [listening,setListening]=useState(false);
  const [continuous,setContinuous]=useState(false);
  const [partial,setPartial]=useState('');
  const [budgetWarning,setBudgetWarning]=useState(false);
  const [items,setItems]=useState<Item[]>([]);
  const [trials,setTrials]=useState<Trial[]>([]);
  const [editId,setEditId]=useState('');
  const [form,setForm]=useState({world:'tig',category:'Materiaal',name:'',spec:'',notes:'',available:true});
  const [trialForm,setTrialForm]=useState({material:'',thickness:'',joint:'',fitup:'',result:'',settings:''});
  const [toast,setToast]=useState('');
  const bottomRef=useRef<HTMLDivElement>(null);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const socketRef=useRef<WebSocket|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const audioContextRef=useRef<AudioContext|null>(null);
  const processorRef=useRef<ScriptProcessorNode|null>(null);
  const draftRef=useRef('');
  useEffect(()=>{draftRef.current=draft},[draft]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages,loading,partial]);
  useEffect(()=>{ if(tab==='beheer') void loadItems(); if(tab==='proeven') void loadTrials(); },[tab,world]);
  useEffect(()=>()=>{ stopListening(); stopSpeech(); },[]);

  function updateMessages(next:Message[]|((old:Message[])=>Message[])) { setThreads(prev=>({...prev,[world]:typeof next==='function'?next(prev[world]):next})); }
  async function speak(text:string) {
    stopSpeech(); if(!text) return;
    try {
      const result=await getJSON('/api/tts',{method:'POST',body:JSON.stringify({text})});
      const audio=new Audio(`data:audio/mp3;base64,${result.audioContent}`); audioRef.current=audio; setBusySpeak(true);
      audio.onended=()=>setBusySpeak(false); audio.onerror=()=>{setBusySpeak(false);fallbackSpeak(text)}; await audio.play();
    } catch { fallbackSpeak(text); }
  }
  function fallbackSpeak(text:string) { if(!('speechSynthesis' in window)) return; window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='nl-NL'; u.onstart=()=>setBusySpeak(true); u.onend=()=>setBusySpeak(false); speechSynthesis.speak(u); }
  function stopSpeech() { audioRef.current?.pause(); audioRef.current=null; if('speechSynthesis' in window) speechSynthesis.cancel(); setBusySpeak(false); }
  function command(text:string):string|null {
    const normalized=text.trim().toLocaleLowerCase('nl-NL').replace(/[.!?]+$/,'');
    if(normalized==='stop'||normalized==='stop voorlezen') { stopSpeech(); stopListening(); return null; }
    if(normalized==='herhaal'||normalized==='herhaal dat') { const last=[...messages].reverse().find(m=>m.role==='assistant'); if(last) void speak(last.spoken||last.content); return null; }
    if(normalized==='nieuwe klus'||normalized==='nieuwe opdracht') { stopListening(); updateMessages([firstMessage]); setDraft(''); setImage(null); setToast('Nieuwe klus gestart'); return null; }
    if(normalized==='volgende stap') return 'Wat is de volgende stap?';
    return text;
  }
  async function sendMessage(event?:FormEvent) {
    event?.preventDefault(); let content=draft.trim(); if(!content||loading) return;
    const interpreted=command(content); if(interpreted===null) { setDraft(''); return; } content=interpreted;
    stopSpeech(); setError(''); setPartial('');
    const userMessage:Message={role:'user',content}; const next=[...messages,userMessage]; updateMessages(next); setDraft(''); setLoading(true);
    try {
      const attached=image?{data:await dataUrl(image),mime:image.type}:undefined;
      const response=await getJSON('/api/chat',{method:'POST',body:JSON.stringify({world,messages:next.map(({role,content})=>({role,content})),image:attached})});
      const answer:Message={role:'assistant',content:response.answer,spoken:response.spoken}; updateMessages([...next,answer]); setImage(null); setBudgetWarning(Boolean(response.budgetWarning)); void speak(response.spoken||response.answer);
    } catch(e) { setError(e instanceof Error?e.message:'Versturen is niet gelukt.'); updateMessages(next); }
    finally { setLoading(false); }
  }
  async function startListening() {
    if(listening) { stopListening(); return; }
    stopSpeech(); setError(''); setPartial(''); setListening(true);
    try {
      const {url,token}=await getJSON('/api/stt-session',{method:'POST',body:'{}'});
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      streamRef.current=media;
      const wsUrl=new URL(url); wsUrl.pathname='/stream'; wsUrl.searchParams.set('token',token); if(wsUrl.protocol==='https:') wsUrl.protocol='wss:'; else if(wsUrl.protocol==='http:') wsUrl.protocol='ws:';
      const socket=new WebSocket(wsUrl); socket.binaryType='arraybuffer'; socketRef.current=socket;
      socket.onmessage=(ev)=>{ try { const msg=JSON.parse(ev.data); if(msg.text){setPartial(msg.text); if(msg.final){const text=String(msg.text);const interpreted=command(text);if(interpreted!==null)setDraft(prev=>prev?`${prev} ${interpreted}`:interpreted);setPartial(''); if(!continuous) stopListening();}} if(msg.error)setError(msg.error); } catch {} };
      socket.onerror=()=>{setError('Google streaming viel weg; browser-spraakherkenning wordt geprobeerd.');stopListening();startBrowserSpeech();};
      socket.onopen=()=>{
        const ctx=new AudioContext({sampleRate:16000}); audioContextRef.current=ctx;
        const source=ctx.createMediaStreamSource(media); const processor=ctx.createScriptProcessor(4096,1,1); processorRef.current=processor;
        processor.onaudioprocess=(event)=>{ if(socket.readyState!==WebSocket.OPEN)return; const input=event.inputBuffer.getChannelData(0); const pcm=new Int16Array(input.length); for(let i=0;i<input.length;i++) pcm[i]=Math.max(-1,Math.min(1,input[i]))*32767; socket.send(pcm.buffer); };
        const silent=ctx.createGain();silent.gain.value=0;source.connect(processor);processor.connect(silent);silent.connect(ctx.destination);
      };
    } catch {
      setListening(false); startBrowserSpeech();
    }
  }
  function startBrowserSpeech() {
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){setListening(false);setError('Spraakherkenning is niet beschikbaar. Typ je vraag.');return;}
    try {
      setListening(true);
      const recognition=new Recognition(); recognition.lang='nl-NL'; recognition.interimResults=true; recognition.continuous=continuous;
      recognition.onresult=(event:any)=>{ let finalText=''; let interim=''; for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript;if(event.results[i].isFinal)finalText+=text;else interim+=text;} setPartial(interim); if(finalText){const interpreted=command(finalText);if(interpreted!==null)setDraft(prev=>prev?`${prev} ${interpreted}`:interpreted);setPartial('');if(!continuous)setListening(false);} };
      recognition.onerror=()=>{setListening(false);setError('Browser-spraakherkenning is gestopt. Typ of probeer opnieuw.');}; recognition.onend=()=>{if(!continuous)setListening(false);}; recognition.start(); (window as any).__lashulpRecognition=recognition;
    } catch { setListening(false);setError('Microfoontoegang is niet beschikbaar.'); }
  }
  function stopListening() {
    const recognition=(window as any).__lashulpRecognition; if(recognition){try{recognition.stop()}catch{};(window as any).__lashulpRecognition=null;}
    processorRef.current?.disconnect(); processorRef.current=null; audioContextRef.current?.close().catch(()=>{}); audioContextRef.current=null;
    streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null;
    if(socketRef.current){socketRef.current.onclose=null;socketRef.current.close();socketRef.current=null;}
    setListening(false);setPartial('');
  }
  async function loadItems(){ try{const d=await getJSON(`/api/inventory?world=${world}`);setItems(d.items||[])}catch(e){setError((e as Error).message)} }
  async function loadTrials(){ try{const d=await getJSON(`/api/trials?world=${world}`);setTrials(d.trials||[])}catch(e){setError((e as Error).message)} }
  function resetItem(){setEditId('');setForm({world,category:'Materiaal',name:'',spec:'',notes:'',available:true})}
  async function saveItem(event:FormEvent){event.preventDefault();try{await getJSON('/api/inventory',{method:editId?'PUT':'POST',body:JSON.stringify({...form,id:editId||undefined})});resetItem();await loadItems();setToast('Voorraad bijgewerkt')}catch(e){setError((e as Error).message)}}
  async function removeItem(id:string){if(!window.confirm('Dit voorraaditem verwijderen?'))return;try{await getJSON(`/api/inventory?id=${encodeURIComponent(id)}`,{method:'DELETE'});await loadItems()}catch(e){setError((e as Error).message)}}
  function editItem(item:Item){setEditId(item.id);setForm({world:item.world,category:item.category,name:item.name,spec:item.spec||'',notes:item.notes||'',available:Boolean(item.available)})}
  async function saveTrial(event:FormEvent){event.preventDefault();try{await getJSON('/api/trials',{method:'POST',body:JSON.stringify({...trialForm,world,settings:trialForm.settings||'Vul de gebruikte instellingen in'})});setToast('Proef opgeslagen als eigen referentie');setTrialForm({material:'',thickness:'',joint:'',fitup:'',result:'',settings:''});await loadTrials()}catch(e){setError((e as Error).message)}}
  function addPhoto(file?:File){if(!file)return;if(file.size>5*1024*1024){setError('De foto mag maximaal 5 MB zijn.');return;}if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Kies een JPG-, PNG- of WebP-foto.');return;}setImage(file);setError('')}

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">L</span><div><strong>Lashulp</strong><small>Praktische hulp aan de werkbank</small></div></div><div className="machine-pill"><span className="status-dot"/> {world==='tig'?'MagicWave 3000 AC/DC':'TransPuls Synergic 4000'}</div></header>
    <main className="main">
      <div className="world-switch" role="tablist" aria-label="Kies lasproces"><button className={world==='tig'?'selected':''} onClick={()=>{stopListening();setWorld('tig')}}>TIG <span>MagicWave</span></button><button className={world==='migmag'?'selected':''} onClick={()=>{stopListening();setWorld('migmag')}}>MIG/MAG <span>TransPuls</span></button></div>
      <nav className="tabs"><button className={tab==='advies'?'active':''} onClick={()=>setTab('advies')}>Advies</button><button className={tab==='beheer'?'active':''} onClick={()=>setTab('beheer')}>Werkplaatsbeheer</button><button className={tab==='proeven'?'active':''} onClick={()=>setTab('proeven')}>Mijn proeven</button><span className="shared-note">Gedeeld met collega's</span></nav>
      {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Melding sluiten">×</button></div>}
      {budgetWarning&&<div className="alert warning">De ingestelde dagelijkse AI-budgetwaarschuwing is bereikt. Controleer het verbruik in Cloudflare/ OpenAI.</div>}
      {tab==='advies'&&<section className="chat-card">
        <div className="chat-head"><div><h1>Waar werk je aan?</h1><p>{world==='tig'?'TIG · aluminium, RVS en staal':'MIG/MAG · controleer eerst het actieve proces'}</p></div><button className="quiet" onClick={()=>{updateMessages([firstMessage]);setDraft('');setImage(null)}}>Nieuwe klus</button></div>
        <div className="messages" aria-live="polite">{messages.map((m,i)=><article key={i} className={`message ${m.role}`}><div className="avatar">{m.role==='assistant'?'L':'J'}</div><div className="bubble"><div className="message-label">{m.role==='assistant'?'Lashulp':'Jij'}</div><p>{m.content}</p>{m.role==='assistant'&&m.spoken&&<button className="inline-action" onClick={()=>void speak(m.spoken!)}>↻ Herhaal gesproken antwoord</button>}</div></article>)}
          {partial&&<article className="message user"><div className="avatar">J</div><div className="bubble listening-text"><div className="message-label">Ik verstond</div><p>{partial}</p></div></article>}
          {loading&&<article className="message assistant"><div className="avatar">L</div><div className="bubble"><div className="message-label">Lashulp</div><p className="thinking"><i/><i/><i/> Advies wordt voorbereid…</p></div></article>}<div ref={bottomRef}/>
        </div>
        <form className="composer" onSubmit={sendMessage}>
          {image&&<div className="attachment">📷 {image.name}<button type="button" onClick={()=>setImage(null)}>Verwijder</button></div>}
          <textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void sendMessage()}}} placeholder="Typ je vraag of spreek…" rows={2} aria-label="Je vraag"/>
          <div className="composer-bottom"><div className="composer-tools"><button type="button" className="tool-button" onClick={()=>document.getElementById('photo-input')?.click()} aria-label="Voeg foto toe">＋ Foto</button><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>addPhoto(e.target.files?.[0])}/><label className="continuous"><input type="checkbox" checked={continuous} onChange={e=>setContinuous(e.target.checked)}/> Continu luisteren</label></div><div className="composer-actions"><button type="button" onClick={()=>busySpeak?stopSpeech():void speak([...messages].reverse().find(m=>m.role==='assistant')?.spoken||'')} className={`listen-button ${busySpeak?'speaking':''}`} aria-label={busySpeak?'Stop voorlezen':'Herhaal antwoord'}>{busySpeak?'■':'◖))'}</button><button type="button" onClick={()=>void startListening()} className={`mic-button ${listening?'recording':''}`} aria-pressed={listening}><span>{listening?'■':'●'}</span>{listening?'Stop':'Praten'}</button><button type="submit" className="send-button" disabled={!draft.trim()||loading}>Verstuur <span>↑</span></button></div></div>
          {listening&&<div className="live-status"><span className="record-dot"/>{partial?'Herkenning wordt bijgewerkt…':'Luistert — tik op Stop als je klaar bent'}</div>}
        </form>
        <div className="privacy-note">Lashulp bewaart gesprekken en foto’s niet. Deel geen persoonsgegevens; je vraag wordt door OpenAI verwerkt.</div>
      </section>}
      {tab==='beheer'&&<section className="admin-layout"><div className="section-heading"><div><h1>Werkplaatsbeheer</h1><p>Gedeelde voorraad en instellingen voor {world==='tig'?'TIG':'MIG/MAG'}.</p></div><span className="public-tag">Gedeeld</span></div>
        <form className="panel form-grid" onSubmit={saveItem}><div className="panel-title"><h2>{editId?'Voorraaditem aanpassen':'Voorraad toevoegen'}</h2><p>De Lashulp gebruikt deze lijsten als actuele voorraad.</p></div><label>Categorie<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categoryByWorld[world].map(c=><option key={c}>{c}</option>)}</select></label><label>Naam<input required maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Bijv. AlMg5"/></label><label>Diameter / specificatie<input value={form.spec} onChange={e=>setForm({...form,spec:e.target.value})} placeholder="Bijv. Ø 2,4 mm"/></label><label className="wide">Notities<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Legering, merk, bewezen instelling of aandachtspunt" rows={2}/></label><label className="check-row"><input type="checkbox" checked={form.available} onChange={e=>setForm({...form,available:e.target.checked})}/> Beschikbaar in voorraad</label><div className="form-actions"><button className="primary" type="submit">{editId?'Wijziging opslaan':'Toevoegen aan lijst'}</button>{editId&&<button type="button" className="quiet" onClick={resetItem}>Annuleren</button>}</div></form>
        <div className="inventory-list"><div className="list-title"><h2>Actuele lijst</h2><button className="quiet" onClick={()=>void loadItems()}>Vernieuwen</button></div>{items.length===0?<div className="empty panel">Nog geen items voor deze wereld. Voeg de werkplaatsvoorraad hierboven toe.</div>:items.map(item=><article className="inventory-item panel" key={item.id}><div className="inventory-info"><span className="eyebrow">{item.world==='shared'?'GEDEELD':item.category.toUpperCase()}</span><h3>{item.name} <small>{item.spec}</small></h3>{item.notes&&<p>{item.notes}</p>}<span className={`availability ${item.available?'':'unavailable'}`}>{item.available?'Op voorraad':'Niet beschikbaar'}</span></div><div className="item-actions"><button onClick={()=>editItem(item)}>Bewerk</button><button className="danger" onClick={()=>void removeItem(item.id)}>Verwijder</button></div></article>)}</div>
      </section>}
      {tab==='proeven'&&<section className="admin-layout"><div className="section-heading"><div><h1>Geslaagde proeven</h1><p>Bewaar wat in de praktijk werkte. De assistent toont dit als eigen referentie.</p></div></div><form className="panel form-grid" onSubmit={saveTrial}><div className="panel-title"><h2>Proef opslaan</h2><p>Vul de gebruikte klus en instellingen in.</p></div><label>Materiaal<input required value={trialForm.material} onChange={e=>setTrialForm({...trialForm,material:e.target.value})} placeholder="Bijv. 304 / AlMg5"/></label><label>Dikte<input required value={trialForm.thickness} onChange={e=>setTrialForm({...trialForm,thickness:e.target.value})} placeholder="Bijv. 2 mm"/></label><label>Verbinding<input required value={trialForm.joint} onChange={e=>setTrialForm({...trialForm,joint:e.target.value})} placeholder="Bijv. binnenhoek"/></label><label>Passing<input value={trialForm.fitup} onChange={e=>setTrialForm({...trialForm,fitup:e.target.value})} placeholder="Kier / nauwsluitend"/></label><label className="wide">Wat werkte / resultaat<textarea value={trialForm.result} onChange={e=>setTrialForm({...trialForm,result:e.target.value})} rows={2}/></label><label className="wide">Instellingen<textarea required value={trialForm.settings} onChange={e=>setTrialForm({...trialForm,settings:e.target.value})} rows={3} placeholder="Stroom, frequentie, balance, draad, proces…"/></label><div className="form-actions"><button className="primary">Proef bewaren</button></div></form>
        <div className="trial-list">{trials.length===0?<div className="panel empty">Nog geen proefreferenties opgeslagen voor {world==='tig'?'TIG':'MIG/MAG'}.</div>:trials.map(t=><article className="panel trial-card" key={t.id}><div className="trial-title"><span className="eyebrow">{new Date(t.created_at+'Z').toLocaleDateString('nl-NL')}</span><h2>{t.material} · {t.thickness} · {t.joint}</h2></div>{t.fitup&&<p><b>Passing:</b> {t.fitup}</p>}{t.result&&<p><b>Resultaat:</b> {t.result}</p>}<p className="settings"><b>Instellingen:</b> {t.settings}</p></article>)}</div>
      </section>}
    </main><footer><span>Lashulp · {world==='tig'?'TIG':'MIG/MAG'}</span><span>Startinstellingen zijn proefinstellingen. Praktijk boven theorie.</span></footer>{toast&&<div className="toast" role="status" onAnimationEnd={()=>setToast('')}>{toast}</div>}
  </div>
}
