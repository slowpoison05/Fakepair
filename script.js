const createModal=document.getElementById('createModal');
const mysteryModal=document.getElementById('mysteryModal');
const chatApp=document.getElementById('chatApp');
const chatMessages=document.getElementById('chatMessages');
const chatInput=document.getElementById('chatInput');
const chatForm=document.getElementById('chatForm');
let partner={name:'Maya',role:'Fake Girlfriend',vibe:'Playful & flirty'};
let history=[];
let chatMode='ai';
let mysteryTimer=null;
let mysteryMatchTarget='';
let realtimeMatchId=null;
let realtimeUnsubscribe=null;
const replies={
'Playful & flirty':['Tell me more 👀','Okay, that made me smile.','You know I was waiting for you, right? 😌','Come on, tell me what happened today.'],
'Calm & caring':['I’m listening. Take your time.','That sounds like a lot. How are you feeling about it?','You don’t have to figure everything out at once.','I’m glad you told me.'],
'Funny & chaotic':['Okay 😂 that was not on my bingo card.','I have questions. Many questions.','Honestly? I respect the chaos.','Wait… we need to talk about this 😂'],
'Motivating & supportive':['You’ve got this. One step at a time.','I believe you can handle it.','What is one small thing you can finish today?','Proud of you for keeping going.']
};
function addMessage(text,type='received',save=true){
 const el=document.createElement('div');el.className='chat-bubble '+type;el.textContent=text;chatMessages.appendChild(el);chatMessages.scrollTop=chatMessages.scrollHeight;
 if(save)history.push({role:type==='sent'?'user':'assistant',content:text});
}
function startChat(){
 chatMode='mystery';
 mysteryMatchTarget = partner.role === 'Fake Girlfriend' ? 'Fake Boyfriend' : 'Fake Girlfriend';
 document.querySelector('main').hidden=true;document.querySelector('footer').hidden=true;document.querySelector('.nav').hidden=true;chatApp.hidden=false;
 document.getElementById('chatName').textContent=partner.name;document.getElementById('chatType').textContent=partner.role+' · Mystery';
 document.getElementById('mysteryStatus').hidden=false;
 document.getElementById('mysteryStatus').textContent='Mystery Mode · looking for someone seeking '+mysteryMatchTarget;
 document.getElementById('chatDisclaimer').textContent='Mystery Mode · AI or another adult user · anonymous · leave anytime.';document.getElementById('chatAvatar').textContent=partner.name.charAt(0).toUpperCase();
 history=[];chatMessages.innerHTML='';addMessage('Mystery Mode is on. 🔮');setTimeout(()=>addMessage('Hey! I’m '+partner.name+'. 👋'),350);setTimeout(()=>addMessage('I’m your '+partner.role.toLowerCase()+'. How was your day?'),800);chatInput.focus();
 startRealtimeMatching();
}
async function startRealtimeMatching(){
 const opts={partner,history,addMessage,setStatus:(s)=>document.getElementById('mysteryStatus').textContent=s,onMatched:(match)=>{realtimeMatchId=match.id;}};
 try{
  let api=window.FakePairRealtime;
  if(!api && window.FakePairRealtimeReady) api=await window.FakePairRealtimeReady;
  if(!api){
   document.getElementById('mysteryStatus').textContent='Connecting to Mystery Mode…';
   setTimeout(startRealtimeMatching,500);
   return;
  }
  await api.start(opts);
 }catch(e){
  console.error('FakePair realtime startup failed:',e);
  document.getElementById('mysteryStatus').textContent='Realtime connection error: '+(e?.message||'Firebase unavailable');
 }
}
function leaveChat(){
 if(window.FakePairRealtime) window.FakePairRealtime.leave();
 if(mysteryTimer){clearTimeout(mysteryTimer);mysteryTimer=null;}
 mysteryMatchTarget='';
 chatMode='ai';
 chatApp.hidden=true;document.querySelector('main').hidden=false;document.querySelector('footer').hidden=false;document.querySelector('.nav').hidden=false;}
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

  console.error('FakePair AI request failed:',res.status,data);

  // Only use local replies when the AI backend is unavailable.
  // Show a useful diagnostic instead of silently making it look like AI replied.
  const detail=data.details||data.error||('HTTP '+res.status);
  return 'AI connection issue: '+detail;
 }catch(e){
  console.error('FakePair AI network error:',e);
  return 'AI connection issue: '+(e?.message||'Unable to reach the AI server.');
 }
}
async function sendMessage(text){
 if(chatMode==='mystery' && realtimeMatchId && window.FakePairRealtime){
  chatInput.value='';
  await window.FakePairRealtime.send(text);
  return;
 }
 addMessage(text,'sent');chatInput.value='';
 const typing=document.createElement('div');typing.className='chat-bubble received typing';typing.textContent=partner.name+' is typing…';chatMessages.appendChild(typing);chatMessages.scrollTop=chatMessages.scrollHeight;
 const reply=await getAIReply(text);typing.remove();addMessage(reply);
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
document.getElementById('tryDemo').addEventListener('click',()=>{
 const consent=document.getElementById('mysteryConsent');
 if(!consent?.checked){
  consent?.focus();
  return;
 }
 mysteryModal.close();
 startMysteryMode();
});

function startMysteryMode(){
 chatMode='mystery';
 // Cross-role matching: someone seeking a girlfriend is matched with
 // someone seeking a boyfriend, and vice versa.
 mysteryMatchTarget = partner.role === 'Fake Girlfriend' ? 'Fake Boyfriend' : 'Fake Girlfriend';
 document.querySelector('main').hidden=true;document.querySelector('footer').hidden=true;document.querySelector('.nav').hidden=true;chatApp.hidden=false;
 document.getElementById('chatName').textContent=partner.name;
 document.getElementById('chatType').textContent=partner.role+' · Mystery';
 document.getElementById('chatAvatar').textContent=partner.name.charAt(0).toUpperCase();
 document.getElementById('mysteryStatus').hidden=false;
 document.getElementById('mysteryStatus').textContent='Searching for someone seeking '+mysteryMatchTarget+'…';
 document.getElementById('chatDisclaimer').textContent='Mystery Mode · AI or another adult user · anonymous · leave anytime.';
 history=[];chatMessages.innerHTML='';
 addMessage('Mystery Mode is on. 🔮');
 setTimeout(()=>addMessage('I’ll keep the conversation going while FakePair looks for another participating adult.'),350);
 mysteryTimer=setTimeout(()=>{
  document.getElementById('mysteryStatus').textContent='No cross-role match yet · continuing with AI';
  addMessage('No human match is available right now, so I’m continuing with AI. You can keep chatting or leave Mystery Mode.');
 },6500);
 chatInput.focus();
}
