const createModal=document.getElementById('createModal');
const mysteryModal=document.getElementById('mysteryModal');
const revealResponseModal=document.getElementById('revealResponseModal');
const chatApp=document.getElementById('chatApp');
const chatMessages=document.getElementById('chatMessages');
const chatInput=document.getElementById('chatInput');
const chatForm=document.getElementById('chatForm');
const revealBtn=document.getElementById('revealBtn');
const mysteryClock=document.getElementById('mysteryClock');
let partner={name:'Maya',role:'Fake Girlfriend',vibe:'Playful & flirty'};
let history=[];
let chatMode='ai';
let mysteryTimer=null;
let mysteryMatchTarget='';
let realtimeMatchId=null;
let realtimeUnsubscribe=null;
let revealCycleTimer=null;
let revealCountdownTimer=null;
let revealRequestPending=false;
let revealUnlocked=false;
let mysteryStartedAt=0;
let contextSyncTimer=null;

const replies={
'Playful & flirty':['Tell me more 👀','Okay, that made me smile.','You know I was waiting for you, right? 😌','Come on, tell me what happened today.'],
'Calm & caring':['I’m listening. Take your time.','That sounds like a lot. How are you feeling about it?','You don’t have to figure everything out at once.','I’m glad you told me.'],
'Funny & chaotic':['Okay 😂 that was not on my bingo card.','I have questions. Many questions.','Honestly? I respect the chaos.','Wait… we need to talk about this 😂'],
'Motivating & supportive':['You’ve got this. One step at a time.','I believe you can handle it.','What is one small thing you can finish today?','Proud of you for keeping going.']
};

function addMessage(text,type='received',save=true){
 const el=document.createElement('div');el.className='chat-bubble '+type;el.textContent=text;chatMessages.appendChild(el);chatMessages.scrollTop=chatMessages.scrollHeight;
 if(save){
  history.push({role:type==='sent'?'user':'assistant',content:text});
  syncMysteryContext();
 }
}

function syncMysteryContext(){
 if(chatMode!=='mystery' || realtimeMatchId || !window.FakePairRealtime?.updateContext) return;
 clearTimeout(contextSyncTimer);
 contextSyncTimer=setTimeout(()=>{
  window.FakePairRealtime.updateContext(history.slice(-40)).catch(e=>console.error('Context sync failed:',e));
 },150);
}

function showPreviousAIContext(context){
 if(!Array.isArray(context) || !context.length) return;
 const divider=document.createElement('div');
 divider.className='mystery-context-divider';
 divider.textContent='Earlier AI conversation';
 chatMessages.appendChild(divider);

 context.forEach(item=>{
  if(!item || !item.content) return;
  const el=document.createElement('div');
  el.className='chat-bubble '+(item.role==='user'?'context-user':'context-ai');
  el.textContent=item.content;
  chatMessages.appendChild(el);
 });
 chatMessages.scrollTop=chatMessages.scrollHeight;
 history=context.slice(-40).map(item=>({role:item.role,content:item.content}));
}

function formatClock(ms){
 const total=Math.max(0,Math.ceil(ms/1000));
 const m=Math.floor(total/60);
 const s=total%60;
 return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function clearRevealTimers(){
 if(revealCycleTimer){clearTimeout(revealCycleTimer);revealCycleTimer=null;}
 if(revealCountdownTimer){clearInterval(revealCountdownTimer);revealCountdownTimer=null;}
}

function startRevealCycle(startTime){
 clearRevealTimers();
 mysteryStartedAt=Number(startTime)||Date.now();
 revealUnlocked=false;
 revealRequestPending=false;
 revealBtn.hidden=true;
 mysteryClock.hidden=false;

 const unlockAt=mysteryStartedAt+10*60*1000;
 const tick=()=>{
  const remaining=unlockAt-Date.now();
  if(remaining<=0){
   mysteryClock.textContent='Reveal ready';
   revealUnlocked=true;
   revealBtn.hidden=false;
   if(revealCountdownTimer){clearInterval(revealCountdownTimer);revealCountdownTimer=null;}
   return;
  }
  mysteryClock.textContent=formatClock(remaining);
 };
 tick();
 revealCountdownTimer=setInterval(tick,1000);
 revealCycleTimer=setTimeout(()=>{
  revealUnlocked=true;
  revealBtn.hidden=false;
  mysteryClock.textContent='Reveal ready';
 },Math.max(0,unlockAt-Date.now()));
}

function resetRevealCycle(){ startRevealCycle(Date.now()); }

async function requestIdentityReveal(){
 if(!revealUnlocked || revealRequestPending) return;
 if(!realtimeMatchId || !window.FakePairRealtime?.requestReveal){
  revealRequestPending=true;
  revealBtn.hidden=true;
  mysteryClock.textContent='Mystery continues';
  addMessage('I don’t want to reveal that yet. 😉');
  revealRequestPending=false;
  resetRevealCycle();
  return;
 }
 try{
  revealRequestPending=true;
  revealBtn.disabled=true;
  revealBtn.textContent='Waiting…';
  const result=await window.FakePairRealtime.requestReveal();
  if(result?.requestId){
   document.getElementById('mysteryStatus').textContent='Mystery continues · waiting for a response…';
  }else{
   revealRequestPending=false;
   revealBtn.disabled=false;
   revealBtn.textContent='🔍 Reveal';
  }
 }catch(e){
  console.error('Reveal request failed:',e);
  revealRequestPending=false;
  revealBtn.disabled=false;
  revealBtn.textContent='🔍 Reveal';
  document.getElementById('mysteryStatus').textContent='Mystery continues';
 }
}

function handleRevealRequest(request){
 if(!request?.id || !revealResponseModal) return;
 if(!revealResponseModal.open){
  revealResponseModal.dataset.requestId=request.id;
  revealResponseModal.showModal();
 }
}

async function respondToReveal(reveal){
 const requestId=revealResponseModal?.dataset.requestId;
 if(!requestId || !window.FakePairRealtime?.respondReveal) return;
 try{
  await window.FakePairRealtime.respondReveal(requestId,reveal);
  revealResponseModal.close();
  if(reveal){
   addMessage('Okay. I’m revealing that I’m another anonymous adult user. 👤');
   document.getElementById('mysteryStatus').textContent='Mystery revealed';
  }else{
   addMessage('I’d rather keep the mystery for now. 😉');
   document.getElementById('mysteryStatus').textContent='Mystery continues';
  }
 }catch(e){
  console.error('Reveal response failed:',e);
 }
}

function handleRevealResult(result){
 if(!revealRequestPending) return;
 revealRequestPending=false;
 revealBtn.disabled=false;
 revealBtn.textContent='🔍 Reveal';
 if(result.revealed){
  revealBtn.hidden=true;
  mysteryClock.hidden=true;
  document.getElementById('mysteryStatus').textContent='Mystery revealed';
  addMessage('🔓 Mystery revealed: you were chatting with another anonymous adult user.');
  clearRevealTimers();
 }else{
  document.getElementById('mysteryStatus').textContent='Mystery continues · try again in 10 minutes';
  addMessage('They don’t want to reveal yet. The mystery continues. 😉');
  resetRevealCycle();
 }
}

function startChat(){
 chatMode='mystery';
 realtimeMatchId=null;
 mysteryMatchTarget=partner.role==='Fake Girlfriend'?'Fake Boyfriend':'Fake Girlfriend';
 document.querySelector('main').hidden=true;document.querySelector('footer').hidden=true;document.querySelector('.nav').hidden=true;chatApp.hidden=false;
 document.getElementById('chatName').textContent=partner.name;
 document.getElementById('chatType').textContent=partner.role+' · Mystery';
 document.getElementById('mysteryStatus').hidden=false;
 // Never expose the opposite role or matching state inside the chat.
 document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
 document.getElementById('chatDisclaimer').textContent='Mystery Mode · AI or another adult user · anonymous · reveal requests unlock every 10 minutes.';
 document.getElementById('chatAvatar').textContent=partner.name.charAt(0).toUpperCase();
 history=[];chatMessages.innerHTML='';
 addMessage('Mystery Mode is on. 🔮');
 setTimeout(()=>addMessage('Hey! I’m '+partner.name+'. 👋'),350);
 setTimeout(()=>addMessage('I’m your '+partner.role.toLowerCase()+'. How was your day?'),800);
 chatInput.focus();
 startRevealCycle(Date.now());
 startRealtimeMatching();
}

async function startRealtimeMatching(){
 const opts={
  partner,
  history,
  addMessage,
  setStatus:(s)=>document.getElementById('mysteryStatus').textContent='Mystery Mode · active',
  onContext:showPreviousAIContext,
  onMatched:(match)=>{
   realtimeMatchId=match.id;
   document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
   startRevealCycle(Number(match.createdAt)||Date.now());
  },
  onRevealRequest:handleRevealRequest,
  onRevealResult:handleRevealResult
 };
 try{
  let api=window.FakePairRealtime;
  if(!api && window.FakePairRealtimeReady) api=await window.FakePairRealtimeReady;
  if(!api){
   document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
   setTimeout(startRealtimeMatching,500);
   return;
  }
  await api.start(opts);
  // Keep the latest AI conversation available in the queue until a human matches.
  syncMysteryContext();
 }catch(e){
  console.error('FakePair realtime startup failed:',e);
  document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
 }
}

function leaveChat(){
 if(window.FakePairRealtime) window.FakePairRealtime.leave();
 if(mysteryTimer){clearTimeout(mysteryTimer);mysteryTimer=null;}
 clearRevealTimers();
 clearTimeout(contextSyncTimer);
 contextSyncTimer=null;
 mysteryMatchTarget='';realtimeMatchId=null;revealRequestPending=false;
 chatMode='ai';
 chatApp.hidden=true;document.querySelector('main').hidden=false;document.querySelector('footer').hidden=false;document.querySelector('.nav').hidden=false;
}

function localReply(text){
 const lower=text.toLowerCase();let reply;
 if(/^(hi|hello|hey|namaste|hii)/.test(lower))reply='Hey! 😊 I was hoping you would message.';
 else if(/sad|bad|upset|stress|tired|lonely/.test(lower))reply='I’m here with you. Want to tell me what’s been going on?';
 else if(/love|miss|cute|beautiful|handsome/.test(lower))reply='That’s sweet. I’m really enjoying our conversation too 💕';
 else if(/who are you|what are you|are you ai|are you an ai|are you artificial intelligence/.test(lower))reply='I’m '+partner.name+' — the '+partner.role.toLowerCase()+' you created. I’m an AI companion, and I’ll always be clear about that.';
 else {const list=replies[partner.vibe]||replies['Playful & flirty'];reply=list[Math.floor(Math.random()*list.length)];}
 return reply;
}

async function getAIReply(text){
 try{
  const endpoint=location.hostname.endsWith('.vercel.app')?'/api/chat':'api/chat.php';
  const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,partner:{...partner,mysteryMode:chatMode==='mystery'},history})});
  const data=await res.json().catch(()=>({}));
  if(res.ok && data.reply)return data.reply;
  // Never expose API, token, quota, HTTP, or backend details to the user.
  console.error('FakePair AI request failed:',res.status);
  return localReply(text);
 }catch(e){
  console.error('FakePair AI network error:',e);
  return localReply(text);
 }
}

async function sendMessage(text){
 if(chatMode==='mystery' && realtimeMatchId && window.FakePairRealtime){
  chatInput.value='';
  try{
   await window.FakePairRealtime.send(text);
  }catch(e){
   console.error('Mystery message send failed:',e);
   addMessage(localReply(text));
  }
  return;
 }
 addMessage(text,'sent');chatInput.value='';
 const typing=document.createElement('div');typing.className='chat-bubble received typing';typing.textContent=partner.name+' is typing…';chatMessages.appendChild(typing);chatMessages.scrollTop=chatMessages.scrollHeight;
 const reply=await getAIReply(text);typing.remove();
 if(chatMode==='mystery' && realtimeMatchId) return;
 addMessage(reply);
}

document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.open==='create'?createModal.showModal():mysteryModal.showModal()));
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.close==='create'?createModal.close():mysteryModal.close()));
document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));

document.getElementById('startDemo').addEventListener('click',()=>{
 const isGirl=document.querySelector('.choice.active').dataset.role==='girlfriend';
 partner={name:document.getElementById('partnerName').value.trim()||(isGirl?'Maya':'Arjun'),role:isGirl?'Fake Girlfriend':'Fake Boyfriend',vibe:document.getElementById('partnerVibe').value};
 createModal.close();startChat();
});

chatForm.addEventListener('submit',e=>{e.preventDefault();const text=chatInput.value.trim();if(text)sendMessage(text);});
document.getElementById('backHome').addEventListener('click',leaveChat);
revealBtn.addEventListener('click',requestIdentityReveal);
document.getElementById('closeRevealResponse').addEventListener('click',()=>revealResponseModal.close());
document.getElementById('keepMysteryBtn').addEventListener('click',()=>respondToReveal(false));
document.getElementById('revealHumanBtn').addEventListener('click',()=>respondToReveal(true));

document.getElementById('tryDemo').addEventListener('click',()=>{
 const consent=document.getElementById('mysteryConsent');
 if(!consent?.checked){consent?.focus();return;}
 mysteryModal.close();
 startMysteryMode();
});

function startMysteryMode(){startChat();}
