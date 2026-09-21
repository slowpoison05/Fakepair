const createModal=document.getElementById('createModal');
const mysteryModal=document.getElementById('mysteryModal');
const roles=[...document.querySelectorAll('.choice')];

document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{
  if(btn.dataset.open==='create'){mysteryModal.close();createModal.showModal();}
  else mysteryModal.showModal();
}));
document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>{
  if(btn.dataset.close==='create')createModal.close(); else mysteryModal.close();
}));
roles.forEach(btn=>btn.addEventListener('click',()=>{
  roles.forEach(x=>x.classList.remove('active'));btn.classList.add('active');
}));
document.getElementById('startDemo').addEventListener('click',()=>{
  const isGirl=document.querySelector('.choice.active').dataset.role==='girlfriend';
  const role=isGirl?'Fake Girlfriend':'Fake Boyfriend';
  const name=document.getElementById('partnerName').value.trim()||(isGirl?'Maya':'Arjun');
  const vibe=document.getElementById('partnerVibe').value;
  document.querySelector('.chat-top strong').textContent=name;
  document.querySelector('.chat-top small').textContent=role+' · AI';
  document.querySelector('.hero h1').innerHTML=(isGirl?'Fake girlfriend.':'Fake boyfriend.')+'<br><em>Meet '+name+'.</em><br>Maybe someone real.';
  document.querySelector('.hero-text').textContent=vibe+'. Your AI partner is ready. Mystery Mode can later introduce an anonymous adult participant who has opted in.';
  createModal.close();window.scrollTo({top:0,behavior:'smooth'});
});
document.getElementById('tryDemo').addEventListener('click',()=>{
  mysteryModal.close();createModal.showModal();
});
