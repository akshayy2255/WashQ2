
// ================= Account / profile (uses existing /api/login · /api/me · /api/logout · /api/bookings) =================
// Session = bearer token from /api/login (30-day server session), kept in prefs.token and re-validated with /api/me on load.
// Class/Year has no backend field, so it's a device-local profile extra (prefs.cls) — no new auth logic.
const personSvg='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const initials=u=>{const n=(u&&u.name||'').trim();if(n){const p=n.split(/\s+/);return((p[0][0]||'')+(p.length>1?p[p.length-1][0]:(p[0][1]||''))).toUpperCase()}return(u&&u.room||'?').replace(/[^A-Z0-9]/gi,'').slice(0,2).toUpperCase()};
const signedIn=()=>!!(prefs.token&&prefs.user);

function renderAcct(){
  const b=$('#acctBtn');if(!b)return;b.style.display='';
  const u=signedIn()?prefs.user:null;
  b.innerHTML=u?`<span class="avatar">${esc(initials(u))}</span>`:personSvg;
  b.classList.toggle('in',!!u);
  b.setAttribute('aria-label',u?`Account: ${u.name||u.room}`:'Sign in');b.title=u?`${u.name||'Signed in'} · ${u.room}`:'Sign in';
  b.setAttribute('aria-expanded','false');
  b.onclick=e=>{e.stopPropagation();if(u)toggleAcctPanel();else loginDialog(null)};
  if(!u)closeAcctPanel(true);
}

// ---------- logged out: login / create account ----------
function loginDialog(then,title){
  closeAcctPanel(true);
  const off=!API.ok;
  showModal(`<form id="lf" class="acct-form"><div class="acct-hero">${personSvg.replace(/20/g,'26')}</div>
    <h2 style="justify-content:center">${esc(title||'Sign in to WashQ')}</h2>
    <p style="text-align:center">Book slots, get your unlock PIN and see your washes.</p>
    <div class="field"><label for="ln">Name</label><input id="ln" maxlength="24" placeholder="e.g. Aarav Sharma" autocomplete="name" value="${esc(prefs.name||'')}"></div>
    <div class="row"><div class="field" style="flex:1"><label for="lr">Room number</label><input id="lr" maxlength="10" placeholder="B-204" autocomplete="username" autocapitalize="characters" value="${esc(prefs.room||'')}" required></div>
    <div class="field" style="flex:1"><label for="lc">Class / Year <span class="opt-l">(optional)</span></label><input id="lc" maxlength="24" placeholder="2nd yr · CSE" value="${esc(prefs.cls||'')}"></div></div>
    <div class="field"><label for="lp">Password</label><input id="lp" type="password" minlength="4" autocomplete="current-password" placeholder="At least 4 characters" required></div>
    <div class="acct-note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg><span><b>New here?</b> Your account is created automatically the first time you sign in with your room number. Pick a password (4+ characters) and use it next time.</span></div>
    ${off?'<div class="msg err">The WashQ server isn’t reachable right now, so sign-in is unavailable. You can still use the live board.</div>':''}
    <div class="msg err" id="lm"></div>
    <div class="actions"><button type="button" class="btn tonal" data-close>Cancel</button><button class="btn primary" id="lb" ${off?'disabled':''}>Sign in</button></div></form>`);
  $('[data-close]').onclick=closeModal;
  setTimeout(()=>{const f=$(prefs.room?'#lp':'#ln');f&&f.focus()},80);
  $('#lf').onsubmit=async e=>{e.preventDefault();const btn=$('#lb'),msg=$('#lm');btn.disabled=true;btn.innerHTML='<span class="spin sm"></span>Signing in…';msg.textContent='';
    try{
      // exact /api/login contract: {room, password, name} → {token, user:{id,room,name}, created}
      const r=await api('POST','/api/login',{room:$('#lr').value,name:$('#ln').value.trim(),password:$('#lp').value});
      prefs.token=r.token;prefs.user=r.user;prefs.room=r.user.room;if(r.user.name)prefs.name=r.user.name;prefs.cls=$('#lc').value.trim();savePrefs();
      renderAcct();closeModal();lastKey='';render();
      toast(r.created?`Welcome, ${r.user.name||r.user.room}! Account created for room ${r.user.room}`:`Signed in as ${r.user.name||r.user.room}`);
      then&&then();
    }catch(er){msg.textContent=er.message;btn.disabled=false;btn.textContent='Sign in';if(er.code==='bad_login'){$('#lp').value='';$('#lp').focus()}}};
}

// ---------- logged in: account panel (dropdown on desktop, bottom sheet on phones) ----------
function toggleAcctPanel(){$('#acctPanel')?closeAcctPanel():openAcctPanel()}
function closeAcctPanel(instant){
  const p=$('#acctPanel'),s=$('#acctScrim');if(!p)return;
  document.body.classList.remove('acct-open');const btn=$('#acctBtn');if(btn)btn.setAttribute('aria-expanded','false');
  p.classList.remove('on');s&&s.classList.remove('on');
  const rm=()=>{p.remove();s&&s.remove()};instant?rm():setTimeout(rm,200);
}
function washStats(){
  // washes I started on this device (log entries tagged with my client id), across all blocks, this calendar month
  const d=new Date(),from=new Date(d.getFullYear(),d.getMonth(),1).getTime();let n=0,min=0;
  Object.keys(BLOCKS).forEach(k=>{const st=k===BLOCK?S:loadBlock(k);(st.log||[]).forEach(e=>{if(e.u===ME&&e.t>=from){n++;min+=e.d}})});
  return{n,min};
}
function openAcctPanel(){
  closeAcctPanel(true);closeModal();
  const u=prefs.user,st=washStats();
  const scrim=document.createElement('div');scrim.className='acct-scrim';scrim.id='acctScrim';
  const p=document.createElement('div');p.className='acct-panel';p.id='acctPanel';p.setAttribute('role','dialog');p.setAttribute('aria-label','Your account');
  p.innerHTML=`<div class="ap-grab"></div>
    <div class="ap-head"><span class="avatar lg">${esc(initials(u))}</span><div class="ap-id"><b>${esc(u.name||'Student')}</b><small>Room ${esc(u.room)}${prefs.cls?' · '+esc(prefs.cls):''}</small></div>
      <button class="icon-btn ap-x" id="apX" aria-label="Close">${ic.x}</button></div>
    <div class="ap-stats">
      <div><b>${st.n}</b><small>wash${st.n===1?'':'es'} this month</small></div>
      <div><b>${st.min}</b><small>minutes washed</small></div>
      <div><b id="apBk">–</b><small>bookings this month</small></div>
    </div>
    <div class="ap-sec"><div class="ap-h">Class / Year</div>
      <div class="ap-cls"><input id="apCls" maxlength="24" placeholder="Add class / year (optional)" value="${esc(prefs.cls||'')}" aria-label="Class or year"><button class="btn tonal" id="apClsS">Save</button></div></div>
    <div class="ap-sec"><div class="ap-h">My bookings</div><div id="apList" class="ap-list"><div class="ap-empty"><span class="spin sm"></span> Loading…</div></div></div>
    <button class="btn tonal ap-out" id="apOut">Log out</button>`;
  document.body.append(scrim,p);document.body.classList.add('acct-open');$('#acctBtn').setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>{scrim.classList.add('on');p.classList.add('on')});
  // desktop: anchor under the header's right edge
  const hb=document.querySelector('header').getBoundingClientRect();p.style.setProperty('--ap-top',(hb.bottom+8)+'px');
  scrim.onclick=()=>closeAcctPanel();$('#apX').onclick=()=>closeAcctPanel();
  $('#apClsS').onclick=()=>{prefs.cls=$('#apCls').value.trim();savePrefs();$('.ap-id small').textContent=`Room ${u.room}${prefs.cls?' · '+prefs.cls:''}`;toast('Profile saved')};
  $('#apOut').onclick=async()=>{const b=$('#apOut');b.disabled=true;b.textContent='Logging out…';
    try{await api('POST','/api/logout')}catch(e){}
    prefs.token=null;prefs.user=null;savePrefs();closeAcctPanel();renderAcct();lastKey='';render();toast('Logged out')};
  p.addEventListener('keydown',e=>{if(e.key==='Escape')closeAcctPanel()});
  loadMyBookings();
}
async function loadMyBookings(){
  const box=$('#apList');if(!box)return;
  try{
    const r=await api('GET','/api/bookings'),now=Date.now(),d=new Date(),from=new Date(d.getFullYear(),d.getMonth(),1).getTime();
    if($('#apBk'))$('#apBk').textContent=r.bookings.filter(b=>b.created>=from).length;
    // active / upcoming = confirmed, not yet used, and still inside the check-in window (start + 10 min)
    const act=r.bookings.filter(b=>b.status==='confirmed'&&!b.used&&now<=b.start+CONFIRM*60000);
    if(!$('#apList'))return;
    if(!act.length){box.innerHTML=`<div class="ap-empty">No upcoming bookings. Tap <b>Scan QR</b> at a free machine or book a slot from any machine card.</div>`;return}
    box.innerHTML=act.map(b=>{
      const loc=S.bookings.find(x=>x.sid===b.id),live=b.start<=now;
      const blk=(b.machine_id.match(/^WM-([A-C])/)||[,'C'])[1];
      return`<button class="ap-bk" data-sid="${esc(b.id)}"><span class="ap-bk-ic">${ic.cal}</span><span class="ap-bk-t"><b>${esc(b.machine_name)} · <span class="nw">${esc(b.machine_id)}</span></b>
        <small>${new Date(b.start).toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})} · ${range({start:b.start,dur:b.dur}).replace(' (tomorrow)','')} · Block ${blk}${loc&&loc.pin?` · PIN <b class="pin-inline">${esc(loc.pin)}</b>`:''}</small></span>
        <span class="badge ${live?'done':'free'}"><span class="dot"></span>${live?'Check in now':'Upcoming'}</span></button>`}).join('');
    box.querySelectorAll('.ap-bk').forEach(el=>el.onclick=()=>{
      const loc=S.bookings.find(x=>x.sid===el.dataset.sid);closeAcctPanel(true);
      if(loc){if(BLOCK!==loc.blk&&loc.blk)switchBlock(loc.blk);location.hash='#/machine/'+loc.mid}
      else toast('This booking was made on another device — open WashQ there to see its PIN');
    });
  }catch(e){if($('#apList'))box.innerHTML=`<div class="ap-empty">${e.status===401?'Session expired — please sign in again.':esc(e.message)}</div>`;if(e.status===401)closeAcctPanel()}
}
window.addEventListener('hashchange',()=>closeAcctPanel(true));
