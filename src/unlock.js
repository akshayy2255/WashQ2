const isz=(svg,n)=>svg.replace(/width="\d+" height="\d+"/,`width="${n}" height="${n}"`);
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
  if(q&&API.ok&&prefs.token){const b=myQrBookingFor(q);if(b)setTimeout(()=>startUnlock(b,q.toUpperCase()),500)}   // phone camera app scanned the sticker
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
  showModal(`<h2>${esc(u.name||'Signed in')}</h2><p>Room ${esc(u.room)} · each booking gets its own 4-digit unlock PIN.</p>
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

// ================= Booked-slot QR unlock flow =================
// A Reserve → Booking Confirmed ("Scan QR to Unlock")
// B Pre-unlock checklist
// C Scan Machine QR screen → "Open Camera & Scan" (getUserMedia + BarcodeDetector / jsQR), manual ID fallback
// D QR encodes ONLY the machine identifier (…?machine_id=WM-04#/machine/4)
// E Machine match check → red "Wrong Machine" → back to scanner
// F 4-digit booking PIN (generated at booking time, never in the QR)
// G Machine Unlocked ✓ / wrong PIN (3 tries → new code or re-book) / Booking Expired

// ---------- A: booking confirmation ----------
function bookingConfirmed(b){
  const m=M(b.mid),d=new Date(b.start);
  showModal(`<div class="ok-ic">${okSvg}</div><h2 style="justify-content:center">Booking Confirmed</h2>
    <div class="kv">
      <div><span>Machine</span><b>${esc(m.name)} · ${mcode(m.id)}</b></div>
      <div><span>Date</span><b>${d.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short'})}</b></div>
      <div><span>Time slot</span><b>${range(b).replace(' (tomorrow)','')}</b></div>
      <div><span>Wash</span><b>${durName(b.dur)} · ${b.dur} min</b></div>
      <div><span>Status</span><b><span class="badge free"><span class="dot"></span>Confirmed</span></b></div>
    </div>
    ${b.pin?`<div class="pin-card"><div><small>Your unlock PIN</small><div class="pin-big">${esc(b.pin)}</div></div><small>Enter this at the machine after scanning its QR. It's also saved in <b>My bookings</b>. Don't share it.</small></div>`:''}
    <p style="text-align:center;margin:14px 0 16px">Scan the QR code on your washing machine to unlock it.<br><small>Unlocking opens 5 min before your slot.</small></p>
    <button class="btn primary scan-cta" id="goScan">${isz(ic.scan,20)}Scan QR to Unlock</button>
    <div class="actions" style="justify-content:center;margin-top:10px"><button class="btn tonal" data-close>Done</button></div>`);
  $('[data-close]').onclick=closeModal;
  $('#goScan').onclick=()=>startUnlock(b);
}
const okSvg='<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const okAnim='<svg class="ok-anim" width="44" height="44" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23" fill="none"/><path fill="none" d="M15 27l7 7 15-16"/></svg>';

// ---------- B: checklist, then C ----------
function startUnlock(b,preScanned){
  if(!S.bookings.includes(b)){bookingExpiredModal(b);return}
  if(!API.ok){toast('The unlock service is offline — start the WashQ server (python3 server.py) to use QR unlock');return}
  if(!prefs.token){loginDialog(()=>startUnlock(b,preScanned),'Sign in to unlock');return}
  closeModal();
  checklistDialog(M(b.mid),()=>{closeModal();openScanner(b);if(preScanned)onScanned(preScanned)},closeModal);
}
function bookingExpiredModal(b){
  showModal(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 style="justify-content:center">Booking Expired</h2><p style="text-align:center">This booking is no longer valid — the 10-minute check-in window was missed or it was cancelled.</p>
    <div class="actions" style="justify-content:center"><button class="btn tonal" data-close>Close</button><button class="btn primary" id="rb">Book again</button></div>`);
  $('[data-close]').onclick=closeModal;$('#rb').onclick=()=>{closeModal();if(M(b.mid))bookDialog(b.mid)};
}

// ---------- D: QR parsing — machine identity only ----------
function parseMachineQR(text){
  const t=String(text||'').trim();let m;
  if((m=t.match(/machine_id=(WM-[A-C]?\d{2,4})/i)))return m[1].toUpperCase();
  if((m=t.match(/^(WM-[A-C]?\d{2,4})$/i)))return m[1].toUpperCase();
  if((m=t.match(/#\/machine\/(\d+)/)))return mcode(+m[1]);
  return null;
}

// ---------- C: Scan Machine QR screen ----------
let SC=null;
function openScanner(b){
  closeScanner(true);
  const el=document.createElement('div');el.className='scan';el.id='scan';
  el.innerHTML=`<video playsinline muted autoplay></video>
    <div class="scan-mask"><div class="scan-frame"><i></i><i></i><i></i><i></i><div class="scan-line"></div></div></div>
    <div class="scan-top"><button class="scan-ib" id="scX" aria-label="Close">${isz(ic.x,22)}</button><div class="scan-title">Scan Machine QR</div>
      <button class="scan-ib" id="scT" aria-label="Flashlight" style="visibility:hidden"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 6l2 5v9h8v-9zM6 6V2h12v4M12 13v2"/></svg></button></div>
    <div class="scan-bottom">
      <div class="scan-hint" id="scH">Stand in front of <b>${esc(M(b.mid).name)}</b> (${mcode(b.mid)}) and scan the QR sticker on it.</div>
      <div class="scan-err" id="scE" role="alert"></div>
      <button class="btn primary scan-open" id="scO">${isz(ic.scan,20)}Open Camera &amp; Scan</button>
      <button class="scan-manual" id="scM">Enter machine ID manually</button></div>
    <div class="scan-sheet" id="scS"></div>`;
  document.body.appendChild(el);document.body.style.overflow='hidden';
  SC={el,b,stream:null,run:false,torch:false,busy:false,started:0};
  $('#scX').onclick=()=>closeScanner();
  $('#scM').onclick=()=>manualEntry();
  $('#scO').onclick=()=>startCamera();
  ensureDecoder();   // load the QR decoder up-front so the first scan is instant
}
function closeScanner(instant){
  if(!SC)return;SC.run=false;if(SC.stream)SC.stream.getTracks().forEach(t=>t.stop());
  const e=SC.el;SC=null;document.body.style.overflow='';
  if(instant)e.remove();else{e.classList.add('out');setTimeout(()=>e.remove(),220)}
}
function scanErr(msg,keep){const e=$('#scE');if(!e)return;e.innerHTML=msg;e.classList.add('on');clearTimeout(scanErr.t);if(!keep)scanErr.t=setTimeout(()=>e.classList.remove('on'),3500)}
let decoderP=null;
function ensureDecoder(){
  if(!decoderP)decoderP=(async()=>{
    if('BarcodeDetector' in window){try{const f=await BarcodeDetector.getSupportedFormats();if(f.includes('qr_code'))return{type:'native',det:new BarcodeDetector({formats:['qr_code']})}}catch(e){}}
    if(!window.jsQR)await loadScript('vendor/jsqr.min.js');
    if(!window.jsQR)throw new Error('jsQR missing');
    return{type:'jsqr'};
  })().catch(e=>{decoderP=null;throw e});
  return decoderP;
}
function camDenied(){
  const s=SC;if(!s)return;
  s.el.classList.remove('live');$('#scO').style.display='none';
  sheet(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 style="justify-content:center">Camera blocked</h2>
    <p style="text-align:center">Camera access is needed to scan the machine QR — please allow camera permission.</p>
    <p style="text-align:center"><small>Tap the camera / lock icon in your browser's address bar, choose <b>Allow</b>, then tap Retry.</small></p>
    <div class="actions" style="justify-content:center;flex-wrap:wrap"><button class="btn tonal" id="cmM">Enter machine ID</button><button class="btn primary" id="cmR">Retry</button></div>`);
  $('#cmR').onclick=()=>{hideSheet();startCamera()};$('#cmM').onclick=()=>manualEntry();
}
function camUnavailable(reason){
  const s=SC;if(!s)return;$('#scO').style.display='';$('#scO').innerHTML=isz(ic.scan,20)+'Try camera again';
  scanErr(`${reason}<br>You can <b>enter the machine ID manually</b> for now.`,true);
}
async function startCamera(){
  const s=SC;if(!s)return;
  $('#scE').classList.remove('on');
  if(!window.isSecureContext)return camUnavailable('The camera needs a secure (https) connection.');
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return camUnavailable('This browser can’t open the camera.');
  const btn=$('#scO');btn.disabled=true;btn.innerHTML='<span class="spin sm"></span>Opening camera…';
  try{
    s.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  }catch(e){
    btn.disabled=false;btn.innerHTML=isz(ic.scan,20)+'Open Camera &amp; Scan';
    let denied=/NotAllowed|PermissionDenied|Security/.test(e.name)||/permission|denied|dismiss/i.test(e.message||'');
    if(!denied&&navigator.permissions)try{denied=(await navigator.permissions.query({name:'camera'})).state==='denied'}catch(_){}
    if(denied)return camDenied();
    return camUnavailable(e.name==='NotFoundError'||e.name==='OverconstrainedError'?'No camera was found on this device.':e.name==='NotReadableError'?'The camera is being used by another app.':'Couldn’t start the camera.');
  }
  if(!SC||SC!==s){s.stream.getTracks().forEach(t=>t.stop());return}
  btn.style.display='none';btn.disabled=false;
  const v=s.el.querySelector('video');v.srcObject=s.stream;try{await v.play()}catch(e){}
  s.el.classList.add('live');s.run=true;s.started=Date.now();
  $('#scH').innerHTML=`Point your camera at the QR code on <b>${esc(M(s.b.mid).name)}</b> — it scans automatically.`;
  const track=s.stream.getVideoTracks()[0],caps=track.getCapabilities?track.getCapabilities():{};
  if(caps.torch){const t=$('#scT');t.style.visibility='visible';t.onclick=async()=>{try{s.torch=!s.torch;await track.applyConstraints({advanced:[{torch:s.torch}]});t.classList.toggle('on',s.torch)}catch(e){scanErr('Flashlight isn’t available')}}}
  let dec;try{dec=await ensureDecoder()}catch(e){return camUnavailable('The QR decoder failed to load.')}
  const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  let last=0,hinted=false;
  const loop=async ts=>{
    if(!SC||SC!==s||!s.run)return;
    if(ts-last>110&&!s.busy&&v.readyState>=2){last=ts;let text=null;
      try{
        if(dec.type==='native'){const r=await dec.det.detect(v);if(r[0])text=r[0].rawValue}
        else{const vw=v.videoWidth,vh=v.videoHeight,side=Math.min(vw,vh)*.8,sc=Math.min(1,560/side);
          cv.width=cv.height=Math.round(side*sc);cx.drawImage(v,(vw-side)/2,(vh-side)/2,side,side,0,0,cv.width,cv.height);
          const r=jsQR(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'attemptBoth'});if(r)text=r.data}
      }catch(e){}
      if(text)onScanned(text);
      if(!hinted&&Date.now()-s.started>15000){hinted=true;$('#scH').innerHTML='Having trouble? Make sure the code is well lit and fills the frame — or enter the machine ID manually.'}
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
  SC.busy=true;if(navigator.vibrate)navigator.vibrate(60);
  // E(1): immediate client-side match check — no unlock, no password on mismatch
  if(code!==mcode(SC.b.mid)){wrongMachine(code);return}
  SC.el.classList.add('hit');beep(1);
  setTimeout(()=>verifyMachine(SC.b,code),300);
}
function manualEntry(){
  if(!SC)return;
  sheet(`<h2>Enter machine ID</h2><p>It’s printed under the QR code, e.g. ${mcode(SC.b.mid)}. Use this only if the camera isn’t working.</p>
    <form id="mf"><div class="field"><input id="mi" placeholder="${mcode(SC.b.mid)}" autocapitalize="characters" maxlength="8" required></div>
    <div class="actions"><button type="button" class="btn tonal" id="mc">Back to camera</button><button class="btn primary">Verify</button></div></form>`);
  setTimeout(()=>$('#mi')&&$('#mi').focus(),80);
  $('#mc').onclick=()=>hideSheet();
  $('#mf').onsubmit=e=>{e.preventDefault();const raw=$('#mi').value.trim().toUpperCase().replace(/^WM-?/,'');const mm=raw.match(/^([A-C])?(\d{1,4})$/);
    const code=mm?(mm[1]?'WM-'+mm[1]+mm[2].padStart(2,'0'):mcode(+mm[2])):null;
    if(!code){toast('Enter a valid machine ID like '+mcode(SC.b.mid));return}
    SC.busy=false;onScanned(code)};
}
function sheet(html){const s=$('#scS');if(!s)return;s.innerHTML=`<div class="dialog">${html}</div>`;s.classList.add('on')}
function hideSheet(){const s=$('#scS');if(s){s.classList.remove('on');s.innerHTML=''}if(SC){SC.busy=false;SC.el.classList.remove('hit','wrong')}}

// ---------- E: wrong machine → back to scanner ----------
function wrongMachine(code){
  const b=SC.b,m=M(b.mid);SC.el.classList.add('wrong');beep(2);
  sheet(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 class="err-t" style="justify-content:center">Wrong Machine</h2>
    <p style="text-align:center">You scanned <b>${esc(code)}</b>, but your booking is for <b>${esc(m?m.name:'')} (${mcode(b.mid)})</b>.<br>Go to the correct machine and scan its QR code.</p>
    <button class="btn primary scan-cta" id="wmB">Back to scanner</button>
    <div class="sub" style="text-align:center;font-size:12px;margin-top:10px">Returning to the scanner in <span id="wmT">4</span>s</div>`);
  let n=4;const t=setInterval(()=>{n--;const el=$('#wmT');if(!el){clearInterval(t);return}el.textContent=n;if(n<=0){clearInterval(t);back()}},1000);
  const back=()=>{clearInterval(t);hideSheet();if(SC&&!SC.stream)$('#scO').style.display=''};
  $('#wmB').onclick=back;
}

// ---------- E(2): server verification ----------
async function verifyMachine(b,code){
  if(!SC)return;
  sheet(`<div class="spin"></div><p style="text-align:center;margin:14px 0 4px">Verifying ${esc(code)} and your booking…</p>`);
  try{
    const r=await api('POST','/api/verify',{booking_id:b.sid,machine_id:code});
    if(SC&&SC.stream){SC.run=false;SC.stream.getTracks().forEach(t=>t.stop());SC.stream=null;SC.el.classList.remove('live')}
    pinStep(b,code,r);
  }catch(e){
    if(e.status===401&&e.code==='auth'){closeScanner();loginDialog(()=>startUnlock(b),'Sign in to unlock');return}
    if(e.code==='wrong_machine'){wrongMachine(code);return}
    if(e.code==='expired'||e.code==='used'||e.code==='no_booking')return expiredSheet(b,e);
    sheet(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 style="justify-content:center">Can’t unlock</h2><p style="text-align:center">${esc(e.message)}</p>
      <div class="actions" style="justify-content:center"><button class="btn tonal" id="eC">Close</button><button class="btn primary" id="eR">Scan again</button></div>`);
    $('#eC').onclick=()=>closeScanner();$('#eR').onclick=()=>hideSheet();
  }
}
function expiredSheet(b,e){
  const used=e&&e.code==='used';
  sheet(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 class="err-t" style="justify-content:center">${used?'Already used':'Booking Expired'}</h2>
    <p style="text-align:center">${used?'This booking has already been used to unlock the machine.':'This booking is no longer valid — the 10-minute check-in window was missed or it was cancelled.'}</p>
    <div class="actions" style="justify-content:center"><button class="btn tonal" id="exC">Close</button>${used?'':'<button class="btn primary" id="exB">Book again</button>'}</div>`);
  if(!used){S.bookings=S.bookings.filter(x=>x.id!==b.id);const m=M(b.mid);if(m&&m.hold&&m.hold.bookingId===b.id)m.hold=null;save();lastKey='';render()}
  $('#exC').onclick=()=>closeScanner();const bb=$('#exB');if(bb)bb.onclick=()=>{closeScanner();if(M(b.mid))bookDialog(b.mid)};
}

// ---------- F: 4-digit booking PIN ----------
function pinStep(b,code,v){
  const m=M(b.mid);let ticket=v.ticket,exp=Date.now()+v.expires_in*1000;
  sheet(`<div class="ok-ic">${okSvg}</div>
    <div style="text-align:center"><div class="sub" style="font-size:13px">Machine Verified</div><div class="vcode">${esc(code)}</div><p style="margin:0 0 16px">Your booking is valid.<br><small>${esc(m?m.name:v.booking.machine_name)} · ${range({start:v.booking.start,dur:v.booking.dur})}</small></p></div>
    <div id="pinArea"></div>
    <div class="sub" style="text-align:center;font-size:12px;margin-top:10px">Verification valid for <span id="ut">2:00</span> · <button type="button" class="link" id="ux">Cancel</button></div>`);
  $('#ux').onclick=()=>closeScanner();
  const tk=setInterval(()=>{const el=$('#ut');if(!el){clearInterval(tk);return}const s=Math.max(0,Math.ceil((exp-Date.now())/1000));el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
    if(!s){clearInterval(tk);$('#pinArea').innerHTML=`<div class="msg err">Verification expired. Please scan the machine QR again.</div><button class="btn primary scan-cta" id="rs">Scan again</button>`;$('#rs').onclick=()=>{closeScanner(true);openScanner(b)}}},500);
  const entry=(left,note)=>{
    $('#pinArea').innerHTML=`<label class="pin-lbl">Enter your 4-digit unlock PIN</label>
      <div class="otp-in" id="pb">${[0,1,2,3].map(i=>`<input type="password" inputmode="numeric" maxlength="1" aria-label="PIN digit ${i+1}" autocomplete="one-time-code">`).join('')}</div>
      <div class="msg ${note?'ok':''}" id="um">${note||''}</div>
      <button class="btn primary scan-cta" id="ub">${ic.lock}Unlock Machine</button>
      <div class="sub" style="text-align:center;font-size:12px;margin-top:8px">${left} attempt${left!==1?'s':''} · PIN shown when you booked (also in My bookings)</div>`;
    const boxes=[...document.querySelectorAll('#pb input')];
    boxes.forEach((x,i)=>{x.oninput=()=>{x.value=x.value.replace(/\D/g,'').slice(-1);if(x.value&&i<3)boxes[i+1].focus();if(boxes.every(y=>y.value))go()};
      x.onkeydown=e=>{if(e.key==='Backspace'&&!x.value&&i>0)boxes[i-1].focus();if(e.key==='Enter')go()};
      x.onpaste=e=>{const t=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,4);if(t){e.preventDefault();t.split('').forEach((c,j)=>boxes[j].value=c);if(t.length===4)go()}}});
    setTimeout(()=>boxes[0].focus(),120);
    let busy=false;
    async function go(){
      if(busy)return;const pin=boxes.map(x=>x.value).join(''),msg=$('#um'),btn=$('#ub');
      if(pin.length<4){msg.className='msg err';msg.textContent='Enter all 4 digits';return}
      busy=true;btn.disabled=true;btn.innerHTML='<span class="spin sm"></span>Unlocking…';msg.textContent='';
      try{await api('POST','/api/unlock',{ticket,pin});clearInterval(tk);unlocked(b,code)}
      catch(er){busy=false;btn.disabled=false;btn.innerHTML=ic.lock+'Unlock Machine';boxes.forEach(x=>x.value='');
        const pb=$('#pb');pb.classList.remove('err');void pb.offsetWidth;pb.classList.add('err');
        if(er.code==='pin_locked')return locked(er.message);
        if(er.code==='expired'||er.code==='used'){clearInterval(tk);return expiredSheet(b,er)}
        if(er.code==='ticket'){clearInterval(tk);msg.className='msg err';msg.innerHTML=esc(er.message)+' <button type="button" class="link" id="rs">Scan again</button>';$('#rs').onclick=()=>{closeScanner(true);openScanner(b)};return}
        msg.className='msg err';msg.textContent=er.message;boxes[0].focus()}
    }
    $('#ub').onclick=go;
  };
  const locked=message=>{
    $('#pinArea').innerHTML=`<div class="msg err" style="margin-bottom:12px">${esc(message)}</div>
      <div class="actions" style="justify-content:center;flex-wrap:wrap"><button class="btn tonal" id="rbk">Re-book</button><button class="btn primary" id="rgn">Generate new code</button></div>`;
    $('#rbk').onclick=()=>{closeScanner();if(M(b.mid))bookDialog(b.mid)};
    $('#rgn').onclick=async()=>{const x=$('#rgn');x.disabled=true;x.textContent='Generating…';
      try{const r=await api('POST','/api/bookings/'+b.sid+'/pin');b.pin=r.pin;save();lastKey='';render();entry(3,`New unlock PIN: <b class="pin-inline">${esc(r.pin)}</b> (saved in My bookings)`)}
      catch(er){x.disabled=false;x.textContent='Generate new code';if(er.code==='expired')return expiredSheet(b,er);toast(er.message)}};
  };
  if(v.pin_locked)locked('Too many incorrect attempts. Generate a new code or re-book to continue.');else entry(v.attempts_left??3);
}

// ---------- G: unlocked ----------
function unlocked(b,code){
  b.unlocked=true;
  const m=M(b.mid);
  if(m&&m.state==='free'){startWash(m,b.dur,b.name,b.id)}else{S.bookings=S.bookings.filter(x=>x.id!==b.id);if(m&&m.hold&&m.hold.bookingId===b.id)m.hold=null;save();lastKey='';render()}
  if(navigator.vibrate)navigator.vibrate([80,60,80]);beep(2);
  sheet(`<div class="ok-ic big">${okAnim}</div><h2 style="justify-content:center">Machine Unlocked ✓</h2>
    <p style="text-align:center">Your washing machine is ready to use.<br><small>${esc(code)} · ${durName(b.dur)} · ${b.dur} min timer started</small></p>
    <button class="btn primary scan-cta" id="ud">Done</button>`);
  $('#ud').onclick=()=>{closeScanner();location.hash='#/machine/'+b.mid};
}

// debug/test handle (read-only helpers; no secrets)
window.WQ={get S(){return S},set S(v){S=v},save,render:()=>{lastKey='';render()},startUnlock,openScanner,parseMachineQR,setMood};
