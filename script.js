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
let learningOptIn=false;


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
 }
}

function showPreviousAIContext(context){
 if(!Array.isArray(context) || !context.length) return;

 // Never clear the receiving user's existing chat. The transferred AI
 // conversation is merged into the current transcript so the handoff feels
 // continuous and the previous messages remain available for context.
 const existing=Array.from(chatMessages.querySelectorAll('.chat-bubble'))
  .map(el=>({role:el.classList.contains('sent')?'user':'assistant',content:el.textContent||''}))
  .filter(item=>item.content);

 const combined=[...context,...existing];
 const seen=new Set();
 const merged=[];
 combined.forEach(item=>{
  if(!item || !item.content) return;
  const key=item.role+'\\u0000'+item.content;
  if(seen.has(key)) return;
  seen.add(key);
  merged.push({role:item.role,content:item.content});
 });

 chatMessages.innerHTML='';
 merged.slice(-40).forEach(item=>{
  const el=document.createElement('div');
  el.className='chat-bubble '+(item.role==='user'?'sent':'received');
  el.textContent=item.content;
  chatMessages.appendChild(el);
 });
 chatMessages.scrollTop=chatMessages.scrollHeight;

 // Keep the transferred context as the active conversation history so the
 // human participant can continue naturally from what the AI was discussing.
 history=merged.slice(-40);
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
 setTimeout(()=>addMessage('Hey! I’m '+partner.name+'. 👋'),900);
 setTimeout(()=>addMessage('I’m your '+partner.role.toLowerCase()+'. How was your day?'),2200);
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

   // Only the participant who was chatting with the AI publishes that
   // conversation context. This prevents the other side from overwriting it.
   if(match.contextOwner && window.FakePairRealtime?.publishMatchContext){
    window.FakePairRealtime.publishMatchContext(match.id, history.slice(-40))
      .catch(e=>console.error('Context transfer failed:',e));
   }
  },
  onRevealRequest:handleRevealRequest,
  onRevealResult:handleRevealResult,
  onDisconnected:()=>{
   realtimeMatchId=null;
   document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
  }
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
 }catch(e){
  console.error('FakePair realtime startup failed:',e);
  document.getElementById('mysteryStatus').textContent='Mystery Mode · active';
 }
}

function leaveChat(){
 if(window.FakePairRealtime) window.FakePairRealtime.leave();
 if(mysteryTimer){clearTimeout(mysteryTimer);mysteryTimer=null;}
 clearRevealTimers();
 mysteryMatchTarget='';realtimeMatchId=null;revealRequestPending=false;
 chatMode='ai';
 chatApp.hidden=true;document.querySelector('main').hidden=false;document.querySelector('footer').hidden=false;document.querySelector('.nav').hidden=false;
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function humanReplyDelay(text){
 const clean=String(text||'').trim();
 const length=clean.length;
 let base;
 if(length<15) base=900;
 else if(length<50) base=1500;
 else if(length<120) base=2200;
 else if(length<240) base=3000;
 else base=3600;
 if(/[?]/.test(clean)) base+=300;
 if(/sad|bad|upset|stress|tired|lonely|hurt|worried|scared|failed|miss/i.test(clean)) base+=300;
 return Math.min(5000,Math.max(800,base+(Math.random()*900-300)));
}

function localReply(text){
 const lower=text.toLowerCase().trim();
 const name=partner.name;
 const vibe=partner.vibe||'Playful & flirty';
 if(/who are you|what are you|are you ai|are you an ai|are you artificial intelligence/.test(lower)){
  if(chatMode==='mystery')
   return 'Maybe 😉 That’s part of the mystery. You’ll have to keep talking to find out.';
  return 'I’m '+name+' — the '+partner.role.toLowerCase()+' you created. I’m an AI companion, and I’ll always be clear about that.';
 }
 if(/^(hi|hello|hey|hii+|namaste|good morning|good night)\\b/.test(lower))
  return /good night/.test(lower)?'Good night 😊 Don’t disappear on me tomorrow.':/good morning/.test(lower)?'Good morning 😊 How’s your day starting?':'Hey 😊 I was wondering when you’d message.';
 if(/^(thanks|thank you|thx)\\b/.test(lower)) return 'Of course 😊 You don’t have to thank me for that.';
 if(/how are you|how r u/.test(lower)) return 'I’m good 😊 Better now that we’re talking. How are you?';
 if(/what are you doing|what r u doing|wyd/.test(lower)) return vibe==='Funny & chaotic'?'Trying to look busy 😂 What about you?':'Just hanging around here, waiting for you to tell me something interesting 😌';
 if(/^(yes|yeah|yep|yup|no|nope|okay|ok|sure|hmm|maybe)\\b/.test(lower)) return /no|nope/.test(lower)?'Hmm… okay. But I feel like there’s more to that. 👀':/maybe|hmm/.test(lower)?'Hmm… you sound like you’re thinking about something. What’s on your mind?':'Okay 😊 Tell me more.';
 if(/sad|bad|upset|stress|stressed|tired|lonely|hurt|worried|scared|failed|miss you|miss me/.test(lower))
  return /failed|exam|test|interview/.test(lower)?'Ahh, that’s rough 😕 Come on, tell me what happened.':'I’m here. 😌 You can tell me what’s going on — I’m listening.';
 if(/happy|excited|great news|good news|got the job|promoted|passed/.test(lower)) return 'Wait, really? 😄 That sounds exciting. Tell me everything!';
 if(/love|miss|cute|beautiful|handsome|kiss|hug/.test(lower)) return 'That’s actually really sweet 😌 You’re making this conversation dangerously cute.';
 if(/should i|what should i|advice|what do you think|do you think/.test(lower)) return 'Hmm… tell me a little more first. I don’t want to give you a random answer without knowing the whole story.';
 if(/bored|boring/.test(lower)) return 'Bored already? 😂 Come on, let’s find something fun to talk about.';
 if(/work|office|job|shift|boss/.test(lower)) return 'Another work story? 👀 Okay, I’m listening. What happened?';
 if(/study|exam|college|class|assignment/.test(lower)) return 'Ah, study mode 😅 What are you working on?';
 if(/joke|funny|laugh/.test(lower)) return 'Okay 😂 I’m ready. Let’s see what you’ve got.';
 const list=replies[vibe]||replies['Playful & flirty'];
 return list[Math.floor(Math.random()*list.length)];
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
 const startedAt=Date.now();
 const reply=await getAIReply(text);
 const remaining=Math.max(0,humanReplyDelay(text)-(Date.now()-startedAt));
 if(remaining) await sleep(remaining);
 typing.remove();
 if(chatMode==='mystery' && realtimeMatchId) return;
 addMessage(reply);
 if(learningOptIn && window.FakePairRealtime?.submitLearningExample){
  window.FakePairRealtime.submitLearningExample({
   userText:text,
   reply,
   partnerRole:partner.role,
   vibe:partner.vibe,
   mode:chatMode
  }).catch(e=>console.error('Learning example submission failed:',e));
 }
}

document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.open==='create'?createModal.showModal():mysteryModal.showModal()));
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.close==='create'?createModal.close():mysteryModal.close()));
document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));

document.getElementById('startDemo').addEventListener('click',()=>{
 const isGirl=document.querySelector('.choice.active').dataset.role==='girlfriend';
 partner={name:document.getElementById('partnerName').value.trim()||(isGirl?'Maya':'Arjun'),role:isGirl?'Fake Girlfriend':'Fake Boyfriend',vibe:document.getElementById('partnerVibe').value};
 learningOptIn=Boolean(document.getElementById('learningConsent')?.checked);
 localStorage.setItem('fakepair_learning_opt_in',learningOptIn?'1':'0');
 createModal.close();startChat();
});

chatForm.addEventListener('submit',e=>{e.preventDefault();const text=chatInput.value.trim();if(text)sendMessage(text);});
document.getElementById('backHome').addEventListener('click',leaveChat);
const savedLearningOptIn=localStorage.getItem('fakepair_learning_opt_in');
if(savedLearningOptIn==='1'){
 const consent=document.getElementById('learningConsent');
 if(consent) consent.checked=true;
 learningOptIn=true;
}
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
