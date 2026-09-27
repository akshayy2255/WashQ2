
// ================= Notification center (bell) =================
// Every live notify() (cycle complete, queue turn, confirm window, slot released, sensor) also lands here.
// Stored per device in localStorage; seeded once with demo items (no sound for those).
const NKEY='washq.notes';
const NIC={
  done:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2.5" width="16" height="19" rx="2.5"/><circle cx="12" cy="13.5" r="4.5"/><path d="M7.5 6h.01M10.5 6h3"/></svg>',
  queue:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  confirm:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  released:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4"/></svg>',
  report:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>'
};
NIC.test=NIC.confirm;
const bellSvg='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

let NOTES=(()=>{try{return JSON.parse(localStorage.getItem(NKEY))}catch(e){return null}})();
if(!NOTES||!Array.isArray(NOTES.items)){
  // first run: demo notifications with varied ages; 2 unread → badge "2". Silent (not live events).
  const n=Date.now(),mn=60000;
  NOTES={items:[
    {type:'done',title:'Machine 5 is ready!',body:'Your wash finished 3 min ago — please collect.',mid:5,blk:'C',t:n-3*mn,read:false},
    {type:'queue',title:'It’s your turn',body:'Machine 2 is now free, you were next in queue.',mid:2,blk:'C',t:n-10*mn,read:false},
    {type:'confirm',title:'Confirm your booking',body:'Machine 7, 4:30–5:00 PM slot. Confirm within 10 min.',mid:7,blk:'C',t:n-25*mn,read:true},
    {type:'released',title:'Slot released',body:'Your Machine 9 booking was released after no confirmation.',mid:9,blk:'C',t:n-60*mn,read:true},
    {type:'report',title:'Machine 4 reported',body:'Someone flagged “Won’t start” — avoid until checked.',mid:4,blk:'C',t:n-120*mn,read:true}
  ].map((x,i)=>({id:'n'+(n-i).toString(36),...x})),demo:true};
  localStorage.setItem(NKEY,JSON.stringify(NOTES));
}
const saveNotes=()=>{NOTES.items=NOTES.items.slice(0,60);localStorage.setItem(NKEY,JSON.stringify(NOTES))};
const unread=()=>NOTES.items.filter(x=>!x.read).length;

// called for every LIVE event (from notify) → list + badge + bell wiggle (sound is the existing beep in notify)
function pushNote(type,title,body,mid,sound){
  if(sound)beep(1);   // notify() already plays the existing alert beep; direct callers opt in
  NOTES.items.unshift({id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),type:NIC[type]?type:'confirm',title,body,mid:mid||null,blk:BLOCK,t:Date.now(),read:false});
  saveNotes();renderBell(true);
  if($('#ntPanel'))renderNoteList();
}
function renderBell(wiggle){
  const b=$('#bellBtn');if(!b)return;const n=unread();
  b.innerHTML=bellSvg+(n?`<span class="nt-badge" aria-hidden="true">${n>99?'99+':n}</span>`:'');
  b.setAttribute('aria-label',n?`Notifications, ${n} unread`:'Notifications');b.title=b.getAttribute('aria-label');
  if(wiggle){b.classList.remove('ring');void b.offsetWidth;b.classList.add('ring');setTimeout(()=>b.classList.remove('ring'),450)}
}
function ago(t){
  const s=Math.max(0,Math.round((Date.now()-t)/1000));
  if(s<45)return'just now';const m=Math.round(s/60);if(m<60)return m+' min ago';
  const h=Math.round(m/60);if(h<24)return h+(h===1?' hr ago':' hrs ago');
  const d=Math.round(h/24);return d===1?'yesterday':d+' days ago';
}
function renderNoteList(){
  const box=$('#ntList');if(!box)return;const items=NOTES.items.slice().sort((a,b)=>b.t-a.t);
  $('#ntHead').textContent=unread()?`${unread()} unread`:'All caught up';
  $('#ntAll').disabled=!unread();$('#ntClr').disabled=!items.length;
  box.innerHTML=items.length?items.map(x=>`<button class="nt-item ${x.read?'':'unread'}" data-nid="${x.id}">
      <span class="nt-ic t-${x.type}">${NIC[x.type]||NIC.confirm}</span>
      <span class="nt-t"><b>${esc(x.title)}</b><span>${esc(x.body)}</span><small>${ago(x.t)}${x.blk&&x.blk!==BLOCK?' · Block '+x.blk:''}</small></span>
      ${x.read?'':'<span class="nt-dot" aria-label="Unread"></span>'}</button>`).join('')
    :`<div class="nt-empty">${bellSvg.replace(/20/g,'30')}<b>No notifications</b><span>Cycle-complete alerts, queue turns and booking reminders will show up here.</span></div>`;
  box.querySelectorAll('.nt-item').forEach(el=>el.onclick=()=>{
    const x=NOTES.items.find(i=>i.id===el.dataset.nid);if(!x)return;
    if(!x.read){x.read=true;saveNotes();renderBell();el.classList.remove('unread');const d=el.querySelector('.nt-dot');d&&d.remove();$('#ntHead').textContent=unread()?`${unread()} unread`:'All caught up';$('#ntAll').disabled=!unread()}
    else if(x.mid){closeNotes(true);if(x.blk&&x.blk!==BLOCK)switchBlock(x.blk);if(M(x.mid))location.hash='#/machine/'+x.mid}
  });
}
function closeNotes(instant){
  const p=$('#ntPanel'),s=$('#ntScrim');if(!p)return;clearInterval(closeNotes.t);
  document.body.classList.remove('acct-open');const b=$('#bellBtn');b&&b.setAttribute('aria-expanded','false');
  p.classList.remove('on');s&&s.classList.remove('on');const rm=()=>{p.remove();s&&s.remove()};instant?rm():setTimeout(rm,200);
}
function openNotes(){
  if(typeof closeAcctPanel==='function')closeAcctPanel(true);closeNotes(true);closeModal();
  const s=document.createElement('div');s.className='acct-scrim';s.id='ntScrim';
  const p=document.createElement('div');p.className='acct-panel nt-panel';p.id='ntPanel';p.setAttribute('role','dialog');p.setAttribute('aria-label','Notifications');
  p.innerHTML=`<div class="ap-grab"></div>
    <div class="nt-top"><div><b>Notifications</b><small id="ntHead"></small></div><button class="icon-btn ap-x" id="ntX" aria-label="Close">${ic.x}</button></div>
    <div class="nt-bar"><button class="link" id="ntAll">Mark all as read</button><button class="link nt-clr" id="ntClr">Clear all</button></div>
    <div class="nt-list" id="ntList"></div>`;
  document.body.append(s,p);document.body.classList.add('acct-open');$('#bellBtn').setAttribute('aria-expanded','true');
  p.style.setProperty('--ap-top',(document.querySelector('header').getBoundingClientRect().bottom+8)+'px');
  requestAnimationFrame(()=>{s.classList.add('on');p.classList.add('on')});
  renderNoteList();
  s.onclick=()=>closeNotes();$('#ntX').onclick=()=>closeNotes();
  p.addEventListener('keydown',e=>{if(e.key==='Escape')closeNotes()});
  $('#ntAll').onclick=()=>{NOTES.items.forEach(x=>x.read=true);saveNotes();renderBell();renderNoteList()};
  $('#ntClr').onclick=()=>{if(!NOTES.items.length)return;NOTES.items=[];saveNotes();renderBell();renderNoteList();toast('Notifications cleared')};
  closeNotes.t=setInterval(()=>{if(!$('#ntPanel'))return clearInterval(closeNotes.t);$('#ntList').querySelectorAll('.nt-item').forEach(el=>{const x=NOTES.items.find(i=>i.id===el.dataset.nid);if(x)el.querySelector('small').firstChild.textContent=ago(x.t)+(x.blk&&x.blk!==BLOCK?' · Block '+x.blk:'')})},30000);
}
function initBell(){
  const b=$('#bellBtn');if(!b)return;renderBell();
  b.onclick=e=>{e.stopPropagation();$('#ntPanel')?closeNotes():openNotes()};
  window.addEventListener('hashchange',()=>closeNotes(true));
  // other tabs/devices sharing storage: keep the badge in sync
  window.addEventListener('storage',e=>{if(e.key===NKEY){try{NOTES=JSON.parse(e.newValue)||{items:[]}}catch(_){}renderBell();renderNoteList()}});
}
initBell();
