// ================= v6 features =================
// Icons all use the same style: 24px viewBox, 2px stroke, round caps, no fill.
const svgI=(d,sz=14)=>`<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
Object.assign(ic,{
  wrench:svgI('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',17),
  alert:svgI('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',12),
  pulse:svgI('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',12),
  users:svgI('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9"/>',20),
  leaf:svgI('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',20),
  trophy:svgI('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',18),
  check:svgI('<path d="M20 6 9 17l-5-5"/>',14),
  info:svgI('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',14)
});

// ---------- block switcher ----------
function initBlockSel(){
  const sel=$('#blockSel');sel.value=BLOCK;
  sel.onchange=()=>{
    const b=sel.value;if(b===BLOCK)return;
    save();BLOCK=b;prefs.block=b;savePrefs();S=loadBlock(b);save();
    closeModal();if(typeof closeScanner==='function')closeScanner();
    if(route==='machine'&&!M(param))location.hash='#/';
    $('#banners').dataset.k='x';lastKey='';render();pollSensor();
    toast(`Showing Block ${b} · ${S.machines.length} machines`);
  };
}

// ---------- report issue / maintenance ----------
const ISSUES=['Not draining','Won’t start','Making unusual noise','Door won’t lock','Other'];
const openReports=m=>(S.reports||[]).filter(r=>r.mid===m.id&&!r.cleared);
function reportDialog(id){
  const m=M(id);
  showModal(`<form id="rf"><h2>Report an issue</h2><p>${esc(m.name)} · ${mcode(m.id)} — the warden will see this in the maintenance log.</p>
    <div class="field"><label>What’s wrong?</label><select id="ri">${ISSUES.map(i=>`<option>${i}</option>`).join('')}</select></div>
    <div class="field"><label>Details (optional)</label><textarea id="rd" rows="3" maxlength="200" placeholder="e.g. Water left in the drum after the cycle"></textarea></div>
    <div class="msg err" id="msg"></div>
    <div class="actions"><button type="button" class="btn tonal" data-close>Cancel</button><button class="btn primary">Submit report</button></div></form>`);
  $('[data-close]').onclick=closeModal;
  $('#rf').onsubmit=e=>{e.preventDefault();
    const issue=$('#ri').value,details=$('#rd').value.trim();
    if(issue==='Other'&&!details){$('#msg').textContent='Please describe the issue.';$('#rd').focus();return}
    S.reports.push({id:'r'+Date.now().toString(36),mid:id,issue,details,t:Date.now(),by:who()||'Anonymous student',cleared:false});
    save();closeModal();lastKey='';render();toast(`Thanks — ${m.name} has been reported`)};
}
function maintenanceSection(){
  const rs=(S.reports||[]).slice().sort((a,b)=>(a.cleared-b.cleared)||(b.t-a.t));
  const open=rs.filter(r=>!r.cleared).length;
  const ago=t=>{const m=Math.round((Date.now()-t)/60000);return m<60?`${Math.max(1,m)} min ago`:m<1440?`${Math.round(m/60)} h ago`:`${Math.round(m/1440)} d ago`};
  return`<details class="sect" open><summary><span class="sum-t">${ic.wrench}Maintenance log <span class="count ${open?'warn':''}">${open} open</span></span></summary><div class="inner">
    ${rs.length?`<div class="blist">${rs.map(r=>{const m=M(r.mid);return`<div class="bitem ${r.cleared?'muted':''}"><div><b>${esc(m?m.name:'Deleted machine')}</b> · ${esc(r.issue)}${r.details?`<small class="wrap">“${esc(r.details)}”</small>`:''}<small>${esc(r.by)} · ${ago(r.t)}${r.cleared?' · resolved':''}</small></div>
      ${r.cleared?`<span class="tag ok">${ic.check}Resolved</span>`:`<button class="btn tonal sm" data-act="resolve" data-rid="${r.id}">Mark resolved</button>`}</div>`}).join('')}</div>`
      :'<div class="sub">No issues reported. 🎉</div>'}
  </div></details>`;
}

// ---------- predictive maintenance: health score ----------
// Mock model: 100 − wear from heavy use this week − open reports − recently fixed issues − per-machine age factor.
// A live sensor reporting normal readings (Machine 1) adds confidence and keeps the score high.
function health(m){
  const wk=Date.now()-7*864e5;
  const cycles=S.log.filter(l=>l.m===m.id&&l.t>=wk).length;
  const open=openReports(m).length,fixed=(S.reports||[]).filter(r=>r.mid===m.id&&r.cleared&&(r.clearedAt||r.t)>=wk).length;
  const age=((m.id*37+BLOCK.charCodeAt(0)*11)%9);
  let score=100-Math.max(0,cycles-18)*1.4-open*22-fixed*6-age;
  if(m.sensor)score=Math.max(score+10,88);
  score=Math.round(Math.max(12,Math.min(100,score)));
  const cls=score>=80?'good':score>=60?'fair':'bad';
  return{score,cls,label:cls==='good'?'Good':cls==='fair'?'Fair':'Needs check',cycles,open,fixed};
}
function healthSection(){
  const list=S.machines.map(m=>({m,h:health(m)})).sort((a,b)=>a.h.score-b.h.score);
  return`<details class="sect" open><summary><span class="sum-t">${ic.pulse.replace(/12/g,'17')}Predictive maintenance · Machine health</span></summary><div class="inner">
    <p class="sub" style="font-size:13px;margin:0 0 12px">Estimated from cycles run this week, reported issues and sensor data. Lowest scores first — check these machines before they break down.</p>
    <div class="hlist">${list.map(({m,h})=>`<div class="hrow"><div class="hname"><b>${esc(m.name)}</b><small>${h.cycles} cycles this week${h.open?` · ${h.open} open issue${h.open>1?'s':''}`:''}${m.sensor?' · live sensor ✓':''}</small></div>
      <div class="hbar"><i class="h-${h.cls}" style="width:${h.score}%"></i></div><span class="hval h-${h.cls}">${h.score}%</span><span class="tag health h-${h.cls}">${h.label}</span></div>`).join('')}</div>
  </div></details>`;
}

// ---------- green impact (estimate) ----------
// Assumption: ~30% of washes would otherwise involve a wasted trip (machine busy) or a machine idling
// with finished laundry. Each avoided trip/idle ≈ 2.7 L water (re-rinse / partial re-runs) and ≈ 0.095 kWh.
const GREEN={share:.30,water:2.7,kwh:.095};
function greenStats(){
  const wk=Date.now()-7*864e5,washes=S.log.filter(l=>l.t>=wk).length,trips=Math.round(washes*GREEN.share);
  return{washes,trips,water:Math.round(trips*GREEN.water/10)*10,kwh:Math.round(trips*GREEN.kwh)};
}
function greenCard(){
  const g=greenStats();
  return`<button class="green-card" data-act="green" title="How is this estimated?">${ic.leaf}<span><b>≈${g.water} L water &amp; ${g.kwh} kWh saved this week</b><small>Estimate · fewer unnecessary trips and less idle running</small></span>${ic.info}</button>`;
}
function greenInfo(){
  const g=greenStats();
  showModal(`<h2>${ic.leaf} Green impact (estimate)</h2><p>How WashQ reduces waste in Block ${BLOCK}:</p>
    <div class="kv">
      <div><span>Washes this week</span><b>${g.washes}</b></div>
      <div><span>Unnecessary trips / idle runs avoided (≈${GREEN.share*100}%)</span><b>${g.trips}</b></div>
      <div><span>Water per avoided trip</span><b>≈${GREEN.water} L</b></div>
      <div><span>Electricity per avoided trip</span><b>≈${GREEN.kwh} kWh</b></div>
      <div><span>Estimated savings</span><b>≈${g.water} L · ${g.kwh} kWh</b></div>
    </div>
    <p style="margin-top:14px"><small>A simple model for illustration, not a measurement: live availability, queues and bookings mean fewer empty trips and machines sitting idle with finished loads.</small></p>
    <div class="actions"><button class="btn primary" data-close>Got it</button></div>`);
  $('[data-close]').onclick=closeModal;
}

// ---------- detergent / load checklist (before OTP) ----------
function checklistDialog(m,next){
  const items=[['Detergent added','Right amount in the drawer'],['Pockets checked','No coins, pens or tissues'],['Load balanced','Not over-filled, spread evenly']];
  showModal(`<h2>Quick check before you start</h2><p>Takes two seconds and helps avoid re-washes and stuck machines.</p>
    <div class="opts checks">${items.map(([t,d],i)=>`<label class="opt"><input type="checkbox" ${prefs.checks&&prefs.checks[i]?'checked':''}><div><b>${t}</b><small>${d}</small></div></label>`).join('')}</div>
    <div class="actions"><button class="btn tonal" data-act="release" data-id="${m.id}">Cancel</button><button class="btn primary" id="ckGo">${ic.check}Got it, continue</button></div>`);
  $('#ckGo').onclick=()=>{prefs.checks=[...document.querySelectorAll('.checks input')].map(c=>c.checked);savePrefs();next()};
  setTimeout(()=>$('#ckGo')&&$('#ckGo').focus(),60);
}

// ---------- share-a-load matching (simulated + cross-tab) ----------
function findShareMatch(m){
  const now=Date.now(),W=20*60000;
  S.sharePool=(S.sharePool||[]).filter(p=>now-p.t<W&&p.client!==ME);
  const cand=S.sharePool[0];
  S.sharePool.push({client:ME,name:who()||'A student',t:now,mid:m.id});save();
  if(!cand)return;
  const [first,room]=String(cand.name).split('·').map(x=>x.trim());
  prefs.shareMatch={first:first||'Someone',room:room||'nearby',t:now,until:now+15*60000,block:BLOCK};savePrefs();
}

// ---------- leaderboard ----------
function leaderboard(){
  const o=BLOCKS[BLOCK].o,U=i=>MOCK_USERS[(i+o)%MOCK_USERS.length];
  const rows=[[U(0),11,'⚡ Fastest Collector','Avg pickup 3 min after cycle ends'],[U(3),9,'🌱 Eco Streak','6 off-peak washes in a row'],[U(6),8,'🎯 Always On Time','Checked in to every booking'],[U(8),7,'🤝 Load Sharer','Shared 3 loads this week']];
  return`<details class="sect lb" ${prefs.lbOpen?'open':''} ontoggle="window.__lb(this.open)"><summary><span class="sum-t">${ic.trophy}This week’s top users</span></summary><div class="inner"><div class="lb-list">
    ${rows.map(([n,w,b,d],i)=>{const [nm,rm]=n.split('·').map(x=>x.trim());return`<div class="lb-row"><span class="rank r${i+1}">${i+1}</span><div class="grow"><b>${esc(nm)}</b> <small>${esc(rm)}</small><small class="lb-d">${d}</small></div><span class="lb-badge">${b}</span><span class="lb-w">${w} washes</span></div>`}).join('')}
  </div></div></details>`;
}
window.__lb=o=>{prefs.lbOpen=o;savePrefs()};
