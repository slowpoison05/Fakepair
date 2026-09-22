import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, push, set, onValue, onDisconnect, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvdT2J831GjXtzqApPqYguOLaGLHzW-Ho",
  authDomain: "fakepair.firebaseapp.com",
  databaseURL: "https://fakepair-default-rtdb.firebaseio.com",
  projectId: "fakepair",
  storageBucket: "fakepair.firebasestorage.app",
  messagingSenderId: "719898123313",
  appId: "1:719898123313:web:a3275193cfbb66c77ac910",
  measurementId: "G-C66P0NC61V"
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);
const sessionId=crypto.randomUUID();
let queueRef=null,matchRef=null,messagesRef=null,matchId=null,partnerRole=null,unsubs=[];

function targetRole(role){return role==="Fake Girlfriend"?"Fake Boyfriend":"Fake Girlfriend";}
function status(fn,s){if(fn)fn(s);}
async function findMatch(role){
 const wanted=targetRole(role);
 const candidateRef=ref(db,"mysteryQueue");
 let found=null;
 const snap=await new Promise(resolve=>onValue(candidateRef,resolve,{onlyOnce:true}));
 snap.forEach(child=>{
  const v=child.val();
  if(!found && child.key!==sessionId && v?.status==="waiting" && v?.lookingFor===role) found={id:child.key,value:v};
 });
 return found;
}
async function claim(candidate,role){
 const a=ref(db,"mysteryMatches/"+candidate.id);
 const tx=await runTransaction(a,current=>{
  if(current!==null)return;
  return {userA:candidate.id,userB:sessionId,roleA:candidate.value.partnerRole,roleB:role,status:"active",createdAt:serverTimestamp()};
 });
 return tx.committed;
}
async function start(opts){
 partnerRole=opts.partner.role;
 const wanted=targetRole(partnerRole);
 queueRef=ref(db,"mysteryQueue/"+sessionId);
 await set(queueRef,{status:"waiting",partnerRole,lookingFor:wanted,joinedAt:serverTimestamp()});
 onDisconnect(queueRef).remove();
 status(opts.setStatus,"Mystery Mode · looking for "+wanted+"…");

 const candidate=await findMatch(partnerRole);
 if(candidate && await claim(candidate,partnerRole)){
   matchId=candidate.id;
   await set(ref(db,"mysteryQueue/"+sessionId+"/status"),"matched");
   await set(ref(db,"mysteryQueue/"+candidate.id+"/status"),"matched");
 } else {
   const statusRef=ref(db,"mysteryQueue/"+sessionId+"/matchId");
   onValue(statusRef,s=>{
     const id=s.val();
     if(id && !matchId){matchId=id;connectMatch(id,opts);}
   });
   return;
 }
 connectMatch(matchId,opts);
}
function connectMatch(id,opts){
 matchRef=ref(db,"mysteryMatches/"+id);
 messagesRef=ref(db,"mysteryChats/"+id+"/messages");
 status(opts.setStatus,"Mystery connection active");
 onValue(messagesRef,s=>{
  s.forEach(child=>{
   const v=child.val();
   if(v && v.sender!==sessionId && !document.querySelector('[data-msg-id="'+child.key+'"]')){
    const el=document.createElement("div");
    el.className="chat-bubble received";el.dataset.msgId=child.key;el.textContent=v.text;
    document.getElementById("chatMessages").appendChild(el);
    document.getElementById("chatMessages").scrollTop=document.getElementById("chatMessages").scrollHeight;
   }
  });
 });
}
async function send(text){
 if(!matchId)return;
 const r=push(ref(db,"mysteryChats/"+matchId+"/messages"));
 await set(r,{sender:sessionId,text,createdAt:serverTimestamp()});
 const el=document.createElement("div");el.className="chat-bubble sent";el.textContent=text;el.dataset.msgId=r.key;
 document.getElementById("chatMessages").appendChild(el);
 document.getElementById("chatMessages").scrollTop=document.getElementById("chatMessages").scrollHeight;
}
async function leave(){
 if(queueRef) await set(queueRef,null).catch(()=>{});
}
window.FakePairRealtime={start,send,leave};
