const createModal=document.getElementById('createModal');
const mysteryModal=document.getElementById('mysteryModal');
const chatApp=document.getElementById('chatApp');
const chatMessages=document.getElementById('chatMessages');
const chatInput=document.getElementById('chatInput');
const chatForm=document.getElementById('chatForm');
let partner={name:'Maya',role:'Fake Girlfriend',vibe:'Playful & flirty'};
const replies={
'Playful & flirty':['Tell me more 👀','Okay, that made me smile.','You know I was waiting for you, right? 😌','Come on, tell me what happened today.'],
'Calm & caring':['I’m listening. Take your time.','That sounds like a lot. How are you feeling about it?','You don’t have to figure everything out at once.','I’m glad you told me.'],
'Funny & chaotic':['Okay 😂 that was not on my bingo card.','I have questions. Many questions.','Honestly? I respect the chaos.','Wait… we need to talk about this 😂'],
'Motivating & supportive':['You’ve got this. One step at a time.','I believe you can handle it.','What is one small thing you can finish today?','Proud of you for keeping going.']
};
function addMessage(text,type='received'){
 const el=document.createElement('div');el.className='chat-bubble '+type;el.textContent=text;chatMessages.appendChild(el);chatMessages.scrollTop=chatMessages.scrollHeight;
}
function startChat(){
 document.querySelector('main').hidden=true;document.querySelector('footer').hidden=true;document.querySelector('.nav').hidden=true;chatApp.hidden=false;
 document.getElementById('chatName').textContent=partner.name;document.getElementById('chatType').textContent=partner.role+' · AI';document.getElementById('chatAvatar').textContent=partner.name.charAt(0).toUpperCase();
 chatMessages.innerHTML='';addMessage('Hey! '+partner.name+' is here. 👋');setTimeout(()=>addMessage('So… how was your day?'),500);chatInput.focus();
}
function leaveChat(){chatApp.hidden=true;document.querySelector('main').hidden=false;document.querySelector('footer').hidden=false;document.querySelector('.nav').hidden=false;}
function aiReply(text){
 const lower=text.toLowerCase();let reply;
 if(/hello|hi|hey|namaste/.test(lower))reply='Hey! 😊 I was hoping you would message.';
 else if(/sad|bad|upset|stress|tired/.test(lower))reply='I’m here. Want to tell me what’s bothering you?';
 else if(/love|miss/.test(lower))reply='That’s sweet. I’m enjoying this conversation too 💕';
 else {const list=replies[partner.vibe]||replies['Playful & flirty'];reply=list[Math.floor(Math.random()*list.length)];}
 setTimeout(()=>addMessage(reply),650);
}
document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.open==='create'?createModal.showModal():mysteryModal.showModal()));
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.close==='create'?createModal.close():mysteryModal.close()));
document.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));
document.getElementById('startDemo').addEventListener('click',()=>{
 const isGirl=document.querySelector('.choice.active').dataset.role==='girlfriend';
 partner={name:document.getElementById('partnerName').value.trim()||(isGirl?'Maya':'Arjun'),role:isGirl?'Fake Girlfriend':'Fake Boyfriend',vibe:document.getElementById('partnerVibe').value};
 createModal.close();startChat();
});
chatForm.addEventListener('submit',e=>{e.preventDefault();const text=chatInput.value.trim();if(!text)return;addMessage(text,'sent');chatInput.value='';aiReply(text);});
document.getElementById('backHome').addEventListener('click',leaveChat);
document.getElementById('mysteryBtn').addEventListener('click',()=>mysteryModal.showModal());
document.getElementById('tryDemo').addEventListener('click',()=>{mysteryModal.close();createModal.showModal();});
