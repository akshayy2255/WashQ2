
// ================= Scan-first entry point (UPI-style "Scan QR") =================
// Dashboard tile + mobile FAB → full-screen scanner (same openScanner/startCamera/camDenied as the unlock flow)
// → valid machine QR: Free → existing Reserve → checklist → code flow · Busy/Done/Reserved → live status + Notify me
// → my booked machine → existing booking unlock (checklist → verify → PIN) · unknown QR → "Unrecognized QR code"
function quickScan(){
  if(typeof closeModal==='function')closeModal();
  openScanner(null);
}
// WM-04 → Block C #4 · WM-A04 → Block A #4 (switches block if needed). Returns machine or null.
function machineFromCode(code){
  const mm=String(code||'').toUpperCase().match(/^WM-([A-C])?(\d{2,4})$/);if(!mm)return null;
  const blk=mm[1]||'C',id=+mm[2];
  if(!BLOCKS[blk]||id<1||id>BLOCKS[blk].n)return null;
  if(blk!==BLOCK)switchBlock(blk);   // scanned a machine in another block → show that block
  return M(id)||null;
}
function unrecognizedQR(){
  if(!SC)return;SC.el.classList.add('wrong');beep(2);
  sheet(`<div class="bad-ic">${isz(ic.x,28)}</div><h2 class="err-t" style="justify-content:center">Unrecognized QR code</h2>
    <p style="text-align:center">This QR code isn’t a WashQ machine. Scan the QR sticker on the front of the washing machine.</p>
    <div class="actions" style="justify-content:center;flex-wrap:wrap"><button class="btn tonal" id="uqM">Enter machine ID</button><button class="btn primary" id="uqR">Retry</button></div>`);
  $('#uqR').onclick=()=>{lastBad=null;hideSheet()};$('#uqM').onclick=()=>manualEntry();
}
function quickScanned(code){
  const m=machineFromCode(code);
  if(!m){lastBad=null;return unrecognizedQR()}
  SC.el.classList.add('hit');beep(1);
  // I already have a booking on this machine → continue the booking unlock flow (checklist → verify → PIN)
  const mine=S.bookings.filter(b=>b.client===ME&&b.sid&&b.mid===m.id&&(b.state!=='upcoming'||b.start-Date.now()<5*60000)).sort((a,b)=>a.start-b.start)[0];
  if(mine){closeScanner(true);return startUnlock(mine,mcode(m.id))}
  const i=info(m);
  if(i.cls==='free'){closeScanner(true);toast(`${m.name} · ${mcode(m.id)} is free`);return reserveDialog(m.id)}
  if(i.cls==='hold'&&i.owner===ME){closeScanner(true);location.hash='#/machine/'+m.id;return}
  // not free → live status + Notify me
  const tone=i.cls==='busy'?'busy':i.cls==='done'?'done':'hold';
  const detail=i.cls==='busy'?`${m.user?esc(m.user)+' · ':''}${Math.round(i.pct)}% complete · free in about ${minsLeft(i.left)} min`
    :i.cls==='done'?`Cycle finished — waiting for ${m.user?esc(m.user):'the owner'} to collect. Auto-frees in ${fmt(Math.max(0,i.left))}.`
    :'Someone has reserved this machine and is unlocking it now.';
  const q=m.queue.length;
  sheet(`<div class="qs-head"><div class="qs-ic ${tone}">${isz(ic.scan,22)}</div><div><h2 style="margin:0">${esc(m.name)}</h2><small class="sub">${mcode(m.id)} · Block ${BLOCK}</small></div></div>
    <div class="qs-status"><span class="badge ${tone}"><span class="dot"></span><span id="qsL">${esc(i.label)}</span></span></div>
    <p class="qs-detail" id="qsD">${detail}</p>
    ${i.cls==='busy'?`<div class="progress"><i id="qsP" style="width:${i.pct}%"></i></div>`:''}
    <p class="qs-q">${q?`${q} ${q===1?'person':'people'} waiting`:'Nobody waiting yet'}${inQueue(m)?` · you’re #${qpos(m)}`:''}</p>
    <div class="actions" style="flex-wrap:wrap">
      <button class="btn tonal" id="qsX">Close</button>
      <button class="btn tonal" id="qsV">View machine</button>
      ${inQueue(m)?`<button class="btn tonal" disabled>✓ #${qpos(m)} in line</button>`:`<button class="btn primary" id="qsN">${ic.bell}Notify me</button>`}
    </div>`);
  const tick=setInterval(()=>{if(!$('#qsL')){clearInterval(tick);return}const j=info(m);$('#qsL').textContent=j.label;if($('#qsP'))$('#qsP').style.width=j.pct+'%';
    if(j.cls==='free'){clearInterval(tick);$('#qsD').innerHTML='<b>It’s free now!</b>';const n=$('#qsN');if(n){n.innerHTML=ic.lock+'Reserve &amp; Start';n.onclick=()=>{closeScanner(true);reserveDialog(m.id)}}}},1000);
  $('#qsX').onclick=()=>closeScanner();
  $('#qsV').onclick=()=>{closeScanner();location.hash='#/machine/'+m.id};
  const n=$('#qsN');if(n)n.onclick=()=>{closeScanner(true);actOn('queue',m.id)};
}
// fire an existing dashboard action (reuses the delegated [data-act] handlers — no duplicated logic)
function actOn(act,id){const t=document.createElement('button');t.hidden=true;t.dataset.act=act;t.dataset.id=id;document.body.appendChild(t);t.click();t.remove()}

// FAB: visible on phones on the dashboard; hidden while a modal/scanner is open
function syncFab(){
  const f=$('#scanFab');if(!f)return;
  const show=route==='home'&&!document.getElementById('scan')&&!$('#modal').innerHTML.trim();
  f.classList.toggle('on',show);
}
setInterval(syncFab,400);
