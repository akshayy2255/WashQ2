// ================= Backend-authorised QR unlock =================
// Booking → Booking Confirmation → Scan Machine QR → Machine Verification → Enter Password → Unlocking → Machine Unlocked
const API={ok:false};
async function api(method,path,body){
  const h={'Content-Type':'application/json'};if(prefs.token)h.Authorization='Bearer '+prefs.token;
  let r;try{r=await fetch(path.replace(/^\//,''),{method,headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'})}
  catch(e){const er=new Error('Can’t reach the WashQ server. Check your connection.');er.status=0;throw er}
  let d={};try{d=await r.json()}catch(e){}
  if(!r.ok){const er=new Error(d.message||'Something went wrong');er.status=r.status;er.code=d.error;
    if(r.status===401&&d.error==='auth'){prefs.token=null;prefs.user=null;savePrefs();renderAcct()}throw er}
  return d;
}
async function initApi(){
  try{const r=await fetch('api/health',{cache:'no-store'});API.ok=r.ok&&(await r.json()).ok}catch(e){API.ok=false}
  if(API.ok&&prefs.token){try{prefs.user=(await api('GET','/api/me')).user;savePrefs()}catch(e){}}
  renderAcct();
  // camera-app scan of the machine sticker: ?machine_id=WM-04 → open scanner flow for my booking on that machine
  const q=new URLSearchParams(location.search).get('machine_id');
  if(q&&API.ok){const b=myQrBookingFor(q);if(b)setTimeout(()=>verifyMachine(b,q.toUpperCase()),500)}
}
const myQrBookingFor=code=>S.bookings.filter(b=>b.client===ME&&b.sid&&M(b.mid)&&mcode(b.mid)===code.toUpperCase()).sort((a,b)=>a.start-b.start)[0];

// ---------- account ----------
function renderAcct(){
  const b=$('#acctBtn');if(!b)return;b.style.display=API.ok?'':'none';
  const u=prefs.token&&prefs.user;
  b.innerHTML=u?`<span class="avatar">${esc((u.name||u.room).slice(0,2).toUpperCase())}</span>`
    :'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  b.onclick=()=>u?acctDialog():loginDialog(null);
}
function acctDialog(){
  const u=prefs.user||{};
  showModal(`<h2>${esc(u.name||'Signed in')}</h2><p>Room ${esc(u.room)} · your password is used to unlock machines for your bookings.</p>
    <div class="actions"><button class="btn tonal" data-close>Close</button><button class="btn primary" id="lo">Sign out</button></div>`);
  $('[data-close]').onclick=closeModal;
  $('#lo').onclick=async()=>{try{await api('POST','/api/logout')}catch(e){}prefs.token=null;prefs.user=null;savePrefs();renderAcct();closeModal();toast('Signed out')};
}
function loginDialog(then,title){
  showModal(`<form id="lf"><h2>${esc(title||'Sign in')}</h2><p>Use your room number and password. New room? An account is created automatically.</p>
    <div class="row"><div class="field" style="flex:1"><label>Room</label><input id="lr" maxlength="10" placeholder="B-204" autocomplete="username" value="${esc(prefs.room||'')}" required></div>
    <div class="field" style="flex:1.3"><label>Name (optional)</label><input id="ln" maxlength="24" placeholder="Aarav" value="${esc(prefs.name||'')}"></div></div>
    <div class="field"><label>Password</label><input id="lp" type="password" minlength="4" autocomplete="current-password" placeholder="At least 4 characters" required></div>
    <div class="msg err" id="lm"></div>
    <div class="actions"><button type="button" class="btn tonal" data-close>Cancel</button><button class="btn primary" id="lb">Sign in</button></div></form>`);
  $('[data-close]').onclick=closeModal;
  $('#lf').onsubmit=async e=>{e.preventDefault();const btn=$('#lb');btn.disabled=true;btn.textContent='Signing in…';
    try{const r=await api('POST','/api/login',{room:$('#lr').value,name:$('#ln').value,password:$('#lp').value});
      prefs.token=r.token;prefs.user=r.user;prefs.room=r.user.room;if(r.user.name)prefs.name=r.user.name;savePrefs();renderAcct();
      toast(r.created?`Account created for room ${r.user.room}`:`Signed in as ${r.user.room}`);closeModal();then&&then()}
    catch(er){$('#lm').textContent=er.message;btn.disabled=false;btn.textContent='Sign in'}};
}

// ---------- booking confirmation ----------
function bookingConfirmed(b){
  const m=M(b.mid),d=new Date(b.start);
  showModal(`<div class="ok-ic">${okSvg}</div><h2 style="text-align:center">Booking Confirmed</h2>
    <div class="kv">
      <div><span>Machine</span><b>${esc(m.name)} · ${mcode(m.id)}</b></div>
      <div><span>Date</span><b>${d.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})}</b></div>
      <div><span>Time</span><b>${range(b).replace(' (tomorrow)','')}</b></div>
      <div><span>Wash</span><b>${durName(b.dur)} · ${b.dur} min</b></div>
      <div><span>Status</span><b><span class="badge free"><span class="dot"></span>Confirmed</span></b></div>
    </div>
    <p style="text-align:center;margin:14px 0 18px">Scan the QR code on your washing machine to unlock it.<br><small>Unlocking opens ${5} min before your slot.</small></p>
    <button class="btn primary scan-cta" id="goScan">${ic.scan.replace(/16/g,'20')}Scan Machine QR</button>
    <div class="actions" style="justify-content:center;margin-top:10px"><button class="btn tonal" data-close>Done</button></div>`);
  $('[data-close]').onclick=closeModal;
  $('#goScan').onclick=()=>{closeModal();openScanner(b)};
}
const okSvg='<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

// ---------- QR parsing: machine identity only ----------
function parseMachineQR(text){
  const t=String(text||'').trim();let m;
  if((m=t.match(/machine_id=(WM-[A-C]?\d{2,4})/i)))return m[1].toUpperCase();
  if((m=t.match(/^(WM-[A-C]?\d{2,4})$/i)))return m[1].toUpperCase();
  if((m=t.match(/#\/machine\/(\d+)/)))return mcode(+m[1]);
  return null;
}

// ---------- full-screen scanner ----------
let SC=null;
function openScanner(b){
  if(!API.ok){toast('The unlock service is offline — start the WashQ server to use QR unlock');return}
  if(!prefs.token){loginDialog(()=>openScanner(b),'Sign in to unlock');return}
  closeModal();closeScanner();
  const el=document.createElement('div');el.className='scan';el.id='scan';
  el.innerHTML=`<video playsinline muted autoplay></video>
    <div class="scan-mask"><div class="scan-frame"><i></i><i></i><i></i><i></i><div class="scan-line"></div></div></div>
    <div class="scan-top"><button class="scan-ib" id="scX" aria-label="Close">${ic.x.replace(/18/g,'22')}</button><div class="scan-title">Scan Machine QR</div>
      <button class="scan-ib" id="scT" aria-label="Flashlight" style="visibility:hidden"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 6l2 5v9h8v-9zM6 6V2h12v4M12 13v2"/></svg></button></div>
    <div class="scan-bottom"><div class="scan-hint" id="scH">Point your camera at the QR code on <b>${esc(M(b.mid).name)}</b> (${mcode(b.mid)})</div>
      <div class="scan-err" id="scE" role="alert"></div>
      <button class="scan-manual" id="scM">Enter machine ID manually</button></div>
    <div class="scan-sheet" id="scS"></div>`;
  document.body.appendChild(el);document.body.style.overflow='hidden';
  SC={el,b,stream:null,run:true,torch:false,busy:false,started:Date.now()};
  $('#scX').onclick=closeScanner;
  $('#scM').onclick=()=>manualEntry();
  startCamera();
}
function closeScanner(){
  if(!SC)return;SC.run=false;if(SC.stream)SC.stream.getTracks().forEach(t=>t.stop());
  SC.el.classList.add('out');const e=SC.el;setTimeout(()=>e.remove(),220);document.body.style.overflow='';SC=null;
}
function scanErr(msg,keep){const e=$('#scE');if(!e)return;e.textContent=msg;e.classList.add('on');clearTimeout(scanErr.t);if(!keep)scanErr.t=setTimeout(()=>e.classList.remove('on'),3500)}
async function startCamera(){
  const s=SC;
  if(!window.isSecureContext){scanErr('The camera needs a secure (https) connection. Enter the machine ID manually instead.',true);return}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){scanErr('This browser can’t open the camera. Enter the machine ID manually instead.',true);return}
  try{
    s.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){
    scanErr(e.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings, or enter the machine ID manually.'
      :e.name==='NotFoundError'?'No camera found on this device. Enter the machine ID manually.':'Couldn’t start the camera ('+e.name+').',true);return}
  if(!SC||SC!==s){s.stream.getTracks().forEach(t=>t.stop());return}
  const v=s.el.querySelector('video');v.srcObject=s.stream;try{await v.play()}catch(e){}
  s.el.classList.add('live');
  const track=s.stream.getVideoTracks()[0],caps=track.getCapabilities?track.getCapabilities():{};
  if(caps.torch){const t=$('#scT');t.style.visibility='visible';t.onclick=async()=>{try{s.torch=!s.torch;await track.applyConstraints({advanced:[{torch:s.torch}]});t.classList.toggle('on',s.torch)}catch(e){scanErr('Flashlight isn’t available')}}}
  let detector=null;
  if('BarcodeDetector' in window){try{const f=await BarcodeDetector.getSupportedFormats();if(f.includes('qr_code'))detector=new BarcodeDetector({formats:['qr_code']})}catch(e){}}
  if(!detector&&!window.jsQR){try{await loadScript('vendor/jsqr.min.js')}catch(e){scanErr('QR decoder failed to load. Enter the machine ID manually.',true);return}}
  const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  let last=0,hinted=false;
  const loop=async ts=>{
    if(!SC||SC!==s||!s.run)return;
    if(ts-last>110&&!s.busy&&v.readyState>=2){last=ts;
      let text=null;
      try{
        if(detector){const r=await detector.detect(v);if(r[0])text=r[0].rawValue}
        else{const vw=v.videoWidth,vh=v.videoHeight,side=Math.min(vw,vh)*.8,sc=Math.min(1,560/side);
          cv.width=cv.height=Math.round(side*sc);cx.drawImage(v,(vw-side)/2,(vh-side)/2,side,side,0,0,cv.width,cv.height);
          const r=jsQR(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'dontInvert'});if(r)text=r.data}
      }catch(e){}
      if(text)onScanned(text);
      if(!hinted&&Date.now()-s.started>15000){hinted=true;$('#scH').innerHTML='Having trouble? Make sure the code is well lit and fills the frame.'}
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s)})}
let lastBad='';
function onScanned(text){
  if(!SC||SC.busy)return;
  const code=parseMachineQR(text);
  if(!code){if(lastBad!==text){lastBad=text;scanErr('This QR code isn’t a WashQ machine code. Scan the sticker on the washing machine.')}return}
  SC.busy=true;SC.el.classList.add('hit');if(navigator.vibrate)navigator.vibrate(60);beep(1);
  setTimeout(()=>verifyMachine(SC.b,code),350);
}
function manualEntry(){
  if(!SC)return;
  sheet(`<h2>Enter machine ID</h2><p>It’s printed under the QR code, e.g. ${mcode(SC.b.mid)}.</p>
    <form id="mf"><div class="field"><input id="mi" placeholder="WM-04" autocapitalize="characters" maxlength="8" required></div>
    <div class="actions"><button type="button" class="btn tonal" id="mc">Back to camera</button><button class="btn primary">Verify</button></div></form>`);
  setTimeout(()=>$('#mi')&&$('#mi').focus(),80);
  $('#mc').onclick=()=>hideSheet();
  $('#mf').onsubmit=e=>{e.preventDefault();const raw=$('#mi').value.trim().toUpperCase().replace(/^WM-?/,'');const mm=raw.match(/^([A-C])?(\d{1,4})$/);const code=mm?(mm[1]?'WM-'+mm[1]+mm[2].padStart(2,'0'):mcode(+mm[2])):null;
    if(!code){toast('Enter a valid machine ID like WM-04');return}SC.busy=true;verifyMachine(SC.b,code)};
}
function sheet(html){const s=$('#scS');if(!s)return;s.innerHTML=`<div class="dialog">${html}</div>`;s.classList.add('on')}
function hideSheet(){const s=$('#scS');if(s){s.classList.remove('on');s.innerHTML=''}if(SC){SC.busy=false;SC.el.classList.remove('hit')}}

// ---------- verification → password → unlock ----------
async function verifyMachine(b,code){
  if(!SC){openScanner(b);if(!SC)return;SC.busy=true}
  sheet(`<div class="spin"></div><p style="text-align:center;margin:14px 0 4px">Verifying ${esc(code)}…</p>`);
  try{
    const r=await api('POST','/api/verify',{booking_id:b.sid,machine_id:code});
    if(SC&&SC.stream){SC.stream.getTracks().forEach(t=>t.stop());SC.el.classList.remove('live')}
    passwordStep(b,code,r);
  }catch(e){
    if(e.status===401&&e.code==='auth'){closeScanner();loginDialog(()=>openScanner(b),'Sign in to unlock');return}
    sheet(`<div class="bad-ic">${ic.x.replace(/18/g,'28')}</div><h2 style="text-align:center">Can’t unlock</h2><p style="text-align:center">${esc(e.message)}</p>
      <div class="actions" style="justify-content:center"><button class="btn tonal" id="eC">Close</button><button class="btn primary" id="eR">Scan again</button></div>`);
    $('#eC').onclick=closeScanner;$('#eR').onclick=()=>hideSheet();
  }
}
function passwordStep(b,code,v){
  const m=M(b.mid);let ticket=v.ticket,exp=Date.now()+v.expires_in*1000;
  sheet(`<div class="ok-ic">${okSvg}</div>
    <div style="text-align:center"><div class="sub" style="font-size:13px">Machine Verified</div><div class="vcode">${esc(code)}</div><p style="margin:0 0 18px">Your booking is valid.<br><small>${esc(m?m.name:v.booking.machine_name)} · ${range({start:v.booking.start,dur:v.booking.dur})}</small></p></div>
    <form id="uf"><div class="field"><label>Enter Password</label><input id="up" type="password" autocomplete="current-password" placeholder="Your WashQ password" required></div>
    <div class="msg" id="um"></div>
    <button class="btn primary scan-cta" id="ub">${ic.lock}Unlock Machine</button>
    <div class="sub" style="text-align:center;font-size:12px;margin-top:10px">Verification valid for <span id="ut">2:00</span> · <button type="button" class="link" id="ux">Cancel</button></div></form>`);
  setTimeout(()=>$('#up')&&$('#up').focus(),120);
  $('#ux').onclick=closeScanner;
  const tk=setInterval(()=>{const el=$('#ut');if(!el){clearInterval(tk);return}const s=Math.max(0,Math.ceil((exp-Date.now())/1000));el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');if(!s){clearInterval(tk);$('#um').className='msg err';$('#um').textContent='Verification expired. Please scan the machine QR again.';$('#ub').disabled=true}},500);
  $('#uf').onsubmit=async e=>{e.preventDefault();const btn=$('#ub'),msg=$('#um');
    btn.disabled=true;btn.innerHTML='<span class="spin sm"></span>Unlocking…';msg.textContent='';
    try{
      await api('POST','/api/unlock',{ticket,password:$('#up').value});
      clearInterval(tk);unlocked(b,code);
    }catch(er){
      btn.disabled=false;btn.innerHTML=ic.lock+'Unlock Machine';$('#up').value='';$('#up').focus();
      msg.className='msg err';msg.textContent=er.message;
      const f=$('#uf');f.classList.remove('shake');void f.offsetWidth;f.classList.add('shake');
      if(er.code==='ticket'||er.code==='locked'||er.code==='expired'||er.code==='used'){btn.disabled=true;
        if(er.code==='ticket'){msg.insertAdjacentHTML('beforeend',' <button type="button" class="link" id="rs">Scan again</button>');$('#rs').onclick=()=>{closeScanner();openScanner(b)}}}
    }};
}
function unlocked(b,code){
  b.unlocked=true;
  const m=M(b.mid);
  if(m&&m.state==='free'){startWash(m,b.dur,b.name,b.id)}else{S.bookings=S.bookings.filter(x=>x.id!==b.id);if(m&&m.hold&&m.hold.bookingId===b.id)m.hold=null;save();lastKey='';render()}
  if(navigator.vibrate)navigator.vibrate([80,60,80]);beep(2);
  sheet(`<div class="ok-ic big">${okSvg}</div><h2 style="text-align:center">Machine Unlocked ✓</h2>
    <p style="text-align:center">Your washing machine is ready to use.<br><small>${esc(code)} · ${durName(b.dur)} · ${b.dur} min timer started</small></p>
    <button class="btn primary scan-cta" id="ud">Done</button>`);
  $('#ud').onclick=()=>{closeScanner();location.hash='#/machine/'+b.mid};
}
