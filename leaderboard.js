/* =====================================================================
   RENDER FUNCTIONS — LEADERBOARD
   ===================================================================== */

function setLbTab(tab) {
  lbTab = tab;
  document.getElementById('lbIndividual').style.display = tab==='individual'?'block':'none';
  document.getElementById('lbMyTeam').style.display = tab==='myteam'?'block':'none';
  document.getElementById('lbRankings').style.display = tab==='rankings'?'block':'none';
  document.getElementById('lbTabIndiv').className = 'btn btn-sm '+(tab==='individual'?'btn-primary':'btn-ghost');
  document.getElementById('lbTabTeam').className = 'btn btn-sm '+(tab==='myteam'?'btn-primary':'btn-ghost');
  document.getElementById('lbTabRank').className = 'btn btn-sm '+(tab==='rankings'?'btn-primary':'btn-ghost');
  renderLeaderboardPage();
}

function renderLeaderboardPage() {
  // Gather current hub prices for server-side unrealized P&L calculation
  const prices = {};
  for (const hubs of Object.values(ALL_HUB_SETS)) {
    hubs.forEach(h => { prices[h.name] = getPrice(h.name); });
  }
  const pricesParam = encodeURIComponent(JSON.stringify(prices));
  const lbRangeMap={'1W':7,'1M':30,'3M':90,'ALL':365};
  const days = lbRangeMap[STATE.lbRange] || 30;
  // Fetch leaderboard + snapshots in parallel
  Promise.all([
    fetch('/api/leaderboard?prices=' + pricesParam).then(r=>r.json()),
    fetch('/api/leaderboard/all-snapshots?days=' + days).then(r=>r.json()).catch(()=>({success:false}))
  ]).then(([lbData, snapData]) => {
    window._lbSnapshots = (snapData.success && snapData.snapshots) ? snapData.snapshots : {};
    if(lbData.success && lbData.leaderboard && lbData.leaderboard.length > 0) {
      renderLeaderboardData(lbData.leaderboard, true);
    } else {
      renderLeaderboardData(null, false);
    }
  }).catch(()=>renderLeaderboardData(null, false));
}

function renderLeaderboardData(serverData, isLive) {
  const indicator = document.getElementById('lbLiveIndicator');
  if(indicator){
    if(isLive){indicator.textContent='● LIVE';indicator.style.color='var(--green)';indicator.style.background='rgba(16,185,129,0.1)';}
    else{indicator.textContent='● SIMULATED';indicator.style.color='var(--amber)';indicator.style.background='rgba(245,158,11,0.1)';}
  }
  const balance = STATE.settings.balance||1000000;
  let realized=0,wins=0,losses=0,grossWins=0,grossLosses=0;
  STATE.trades.forEach(t=>{if(t.status==='CLOSED'){const pnl=parseFloat(t.realizedPnl||0);realized+=pnl;if(pnl>0){wins++;grossWins+=pnl;}else if(pnl<0){losses++;grossLosses+=Math.abs(pnl);}}});
  const equity=balance+realized;
  const myRet=((equity-balance)/balance)*100;
  const myWR=(wins+losses)>0?((wins/(wins+losses))*100):0;
  const myPF=grossLosses>0?(grossWins/grossLosses):(grossWins>0?999:0);
  const myName=STATE.trader?STATE.trader.display_name:'You';
  const myRealName=STATE.trader?STATE.trader.real_name:'';
  const myFirm=STATE.trader?STATE.trader.firm:'';
  const myPhoto=getTraderPhoto()||'';
  const myTraderName=STATE.trader?STATE.trader.trader_name:'';
  let entries = [];
  if (serverData && isLive) {
    entries = serverData.map(s => ({name:s.display_name,realName:s.real_name||s.display_name,firm:s.firm,ret:s.return_pct,winRate:s.win_rate,pf:s.profit_factor,trades:s.trade_count,equity:s.equity,photo:s.photo_url||'',isMe:s.trader_name===myTraderName,team:s.team||null,traderName:s.trader_name,lastSeen:s.last_seen||null}));
    const myIdx=entries.findIndex(e=>e.isMe);
    if(myIdx>=0){entries[myIdx].ret=parseFloat(myRet.toFixed(2));entries[myIdx].winRate=parseFloat(myWR.toFixed(1));entries[myIdx].pf=parseFloat(myPF.toFixed(2));entries[myIdx].trades=STATE.trades.length;entries[myIdx].equity=equity;entries[myIdx].photo=myPhoto||entries[myIdx].photo;}
    // Keep STATE.trader in sync with server (team assignments, etc.)
    if(myIdx>=0 && STATE.trader){
      STATE.trader.team = entries[myIdx].team || null;
      STATE.trader.firm = entries[myIdx].firm || STATE.trader.firm;
      localStorage.setItem('ng_trader', JSON.stringify(STATE.trader));
    }
  } else {
    entries = SIM_PEERS.map(p => ({...p, isMe:false, equity:balance*(1+p.ret/100)}));
    entries.push({name:myName,realName:myRealName,firm:myFirm,ret:parseFloat(myRet.toFixed(2)),winRate:parseFloat(myWR.toFixed(1)),pf:parseFloat(myPF.toFixed(2)),trades:STATE.trades.length,isMe:true,equity:equity,photo:myPhoto});
  }
  entries.sort((a,b)=>b.ret-a.ret);
  entries.forEach((e,i)=>e.rank=i+1);
  if (lbTab === 'individual') {
    const body = document.getElementById('lbBody');
    body.innerHTML = entries.map((e,i) => {
      const initials = e.name.split(' ').map(w=>w[0]).join('').toUpperCase();
      const bgColor = e.isMe?'var(--accent)':'var(--text-muted)';
      const avatar = e.photo ? `<div class="lb-avatar"><img src="${e.photo}"></div>` : `<div class="lb-avatar" style="background:${bgColor}">${initials}</div>`;
      const highlight = e.isMe ? 'lb-highlight' : '';
      const retColor = e.ret>=0?'green':'red';
      const teamDot = e.team ? `<span class="lb-team-dot" style="background:${e.team.color||'var(--accent)'}"></span>` : '';
      const isOnline = e.isMe || (e.lastSeen && (Date.now() - new Date(e.lastSeen+'Z').getTime()) < 120000);
      const onlineDot = `<span style="width:7px;height:7px;border-radius:50%;background:${isOnline?'var(--green)':'var(--text-muted)'};display:inline-block;flex-shrink:0;margin-right:2px" title="${isOnline?'Online':'Offline'}"></span>`;
      // Build sparkline from real snapshots
      const snaps = (window._lbSnapshots || {})[e.traderName] || [];
      const sparkData = snaps.length >= 2 ? snaps.map(s=>s.equity) : [e.equity, e.equity];
      return `<tr class="${highlight} lb-clickable" onclick="openLbProfile(${i})"><td style="font-weight:700">${e.rank}</td><td><div style="display:flex;align-items:center;gap:8px">${avatar}<div><div style="font-weight:600">${onlineDot}${teamDot}${e.name}</div><div style="font-size:11px;color:var(--text-muted)">${e.firm}</div></div></div></td><td class="mono ${retColor}" style="font-weight:700">${e.ret>=0?'+':''}${e.ret.toFixed(1)}%</td><td class="mono">$${e.equity.toLocaleString(undefined,{maximumFractionDigits:0})}</td><td class="mono">${e.winRate.toFixed(0)}%</td><td class="mono">${e.pf.toFixed(2)}</td><td class="mono">${e.trades}</td><td>${sparklineSVG(sparkData,e.ret>=0?'#10b981':'#ef4444',60,20)}</td></tr>`;
    }).join('');
    window._lbEntries = entries;
    const myEntry = entries.find(e=>e.isMe);
    const totalCount = entries.length;
    const myRank = myEntry ? myEntry.rank : totalCount;
    const metrics = [
      {label:'Return %', value:(myRet>=0?'+':'')+myRet.toFixed(1)+'%', pct:Math.round(((totalCount-myRank+1)/totalCount)*100)},
      {label:'Win Rate', value:myWR.toFixed(1)+'%', pct:Math.round((entries.filter(e=>myWR>=e.winRate).length/totalCount)*100)},
      {label:'Profit Factor', value:myPF.toFixed(2), pct:Math.round((entries.filter(e=>myPF>=e.pf).length/totalCount)*100)},
      {label:'# Trades', value:STATE.trades.length.toString(), pct:Math.round((entries.filter(e=>STATE.trades.length>=e.trades).length/totalCount)*100)},
    ];
    document.getElementById('percentileContainer').innerHTML = metrics.map(m => `<div class="pct-row"><span class="pct-label">${m.label}</span><span class="pct-value">${m.value}</span><div class="pct-bar-wrap"><div class="pct-bar" style="width:${m.pct}%"></div></div><span class="pct-rank">Top ${100-m.pct}%</span></div>`).join('');
    drawLbEquityCurve(entries, myEntry);
    const lbCanvas = document.getElementById('lbEquityChart');
    if (lbCanvas) { lbCanvas._lbRedraw = () => drawLbEquityCurve(entries, myEntry); }
    try { initLbCrosshair(); } catch(e) {}
  }
  if (lbTab === 'myteam') {
    const myEntry = entries.find(e=>e.isMe);
    const myTeam = myEntry ? myEntry.team : null;
    const teamEl = document.getElementById('myTeamContent');
    if (myTeam) {
      const tm = entries.filter(e=>e.team&&e.team.name===myTeam.name).sort((a,b)=>b.ret-a.ret);
      const tp = tm.reduce((s,e)=>s+(e.equity-balance),0);
      teamEl.innerHTML = `<div style="margin-bottom:12px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:700"><span style="width:12px;height:12px;border-radius:50%;background:${myTeam.color}"></span>${myTeam.name}</span><span style="margin-left:16px;color:var(--text-dim)">${tm.length} members</span></div><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Trader</th><th>Return %</th><th>Equity</th><th>Trades</th></tr></thead><tbody>${tm.map((e,i)=>{const rc=e.ret>=0?'green':'red';return `<tr${e.isMe?' class="lb-highlight"':''}><td style="font-weight:700">${i+1}</td><td style="font-weight:600">${e.name}</td><td class="mono ${rc}">${e.ret>=0?'+':''}${e.ret.toFixed(1)}%</td><td class="mono">$${e.equity.toLocaleString(undefined,{maximumFractionDigits:0})}</td><td class="mono">${e.trades}</td></tr>`;}).join('')}</tbody></table></div><div style="margin-top:12px;font-size:14px">Team Combined P&L: <strong style="color:${tp>=0?'var(--green)':'var(--red)'}">${tp>=0?'+':'-'}$${Math.abs(tp).toLocaleString(undefined,{maximumFractionDigits:0})}</strong></div>`;
    } else { teamEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">You are not assigned to a team</p>'; }
    // Draw team equity chart
    if (myTeam) {
      const tm2 = entries.filter(e=>e.team&&e.team.name===myTeam.name);
      setTimeout(()=>drawTeamEquityChart(tm2),50);
    }
  }
  if (lbTab === 'rankings') {
    const teamMap = {};
    entries.forEach(e=>{if(e.team){if(!teamMap[e.team.name])teamMap[e.team.name]={name:e.team.name,color:e.team.color,members:[],totalPnl:0};teamMap[e.team.name].members.push(e);teamMap[e.team.name].totalPnl+=(e.equity-balance);}});
    const tl = Object.values(teamMap).sort((a,b)=>b.totalPnl-a.totalPnl);
    const tb = document.getElementById('lbTeamRankBody');
    if(!tl.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">No teams found</td></tr>';}
    else{tb.innerHTML=tl.map((t,i)=>{const ar=t.members.reduce((s,m)=>s+m.ret,0)/t.members.length;const best=t.members.sort((a,b)=>b.ret-a.ret)[0];const pc=t.totalPnl>=0?'green':'red';return `<tr><td style="font-weight:700">${i+1}</td><td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${t.color}"></span>${t.name}</span></td><td>${t.members.length}</td><td class="mono ${pc}">${t.totalPnl>=0?'+':'-'}$${Math.abs(t.totalPnl).toLocaleString(undefined,{maximumFractionDigits:0})}</td><td class="mono">${ar>=0?'+':''}${ar.toFixed(1)}%</td><td>${best?best.name:'\u2014'}</td></tr>`;}).join('');}
    // Draw team bar chart
    setTimeout(()=>drawTeamBarChart(tl),50);
  }
}

// Assign consistent colors to entries
const CHART_COLORS = ['#22d3ee','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6','#e11d48','#a855f7','#eab308','#0ea5e9'];
window._lbChartVisible = {};
window._teamChartVisible = {};
window._teamRankChartVisible = {};

function getEquityData(traderName, balance, currentEquity) {
  // Use real snapshots if available, otherwise just show current point
  const snaps = (window._lbSnapshots || {})[traderName] || [];
  if (snaps.length >= 2) {
    return { data: snaps.map(s => s.equity), dates: snaps.map(s => s.date) };
  }
  // No history — flat line
  const now = new Date().toISOString();
  return { data: [balance, currentEquity], dates: [now, now] };
}

function drawMultiLineChart(canvasId, lines, steps) {
  const canvas=document.getElementById(canvasId);
  if(!canvas||!canvas.parentElement)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const rect=canvas.parentElement.getBoundingClientRect();
  if(!rect||!rect.width)return;
  const dpr=window.devicePixelRatio||1;
  const H=280;canvas.width=rect.width*dpr;canvas.height=H*dpr;
  canvas.style.width=rect.width+'px';canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);
  const W=rect.width;
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  ctx.fillStyle=isLight?'#ffffff':getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0,0,W,H);
  const padL=75,padR=20,padT=20,padB=45,cW=W-padL-padR,cH=H-padT-padB;
  const activeLines=lines.filter(l=>l.active);
  if(!activeLines.length)return;
  const allVals=activeLines.flatMap(l=>l.data);
  const min=Math.min(...allVals)*0.999,max=Math.max(...allVals)*1.001,range=max-min||1;
  // Grid
  const gridColor=isLight?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.06)';
  ctx.strokeStyle=gridColor;ctx.lineWidth=0.5;
  for(let i=0;i<=4;i++){const y=padT+(i/4)*cH;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(padL+cW,y);ctx.stroke();}
  // Lines
  activeLines.forEach(l=>{
    ctx.beginPath();
    const len = l.data.length;
    const xSteps = Math.max(len - 1, 1);
    l.data.forEach((v,i)=>{const x=padL+(i/xSteps)*cW;const y=padT+(1-(v-min)/range)*cH;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
    ctx.strokeStyle=l.color;ctx.lineWidth=l.bold?2.5:1.5;
    if(l.dashed)ctx.setLineDash([6,4]);else ctx.setLineDash([]);
    ctx.stroke();ctx.setLineDash([]);
  });
  // Y labels
  const tc=isLight?'#475569':'#94a3b8';
  ctx.fillStyle=tc;ctx.font='11px IBM Plex Mono';ctx.textAlign='right';
  for(let i=0;i<=4;i++){const val=min+(range*i/4);const y=padT+(1-i/4)*cH;ctx.fillText('$'+(val/1000).toFixed(0)+'k',padL-8,y+4);}
  // X dates
  ctx.font='10px IBM Plex Mono';ctx.textAlign='center';
  const firstLineWithDates = activeLines.find(l => l.dates && l.dates.length >= 2);
  for(let i=0;i<6;i++){
    const frac=i/5;
    const x=padL+frac*cW;
    if(firstLineWithDates) {
      const idx = Math.min(Math.floor(frac * (firstLineWithDates.dates.length-1)), firstLineWithDates.dates.length-1);
      const d = new Date(firstLineWithDates.dates[idx]);
      if(!isNaN(d)) ctx.fillText(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),x,H-padB+20);
    } else {
      const now=new Date();
      const d=new Date(now.getTime()-(5-i)*86400000);
      ctx.fillText(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}),x,H-padB+20);
    }
  }
}

function renderChips(chipId, items, visibleMap, redrawFn) {
  const container=document.getElementById(chipId);
  if(!container)return;
  container.innerHTML=items.map((item,i)=>{
    const active=visibleMap[item.key]!==false;
    return `<span class="toggle-chip ${active?'active':'inactive'}" data-key="${item.key}" onclick="toggleChip('${chipId}','${item.key}')"><span class="chip-dot" style="background:${item.color}"></span>${item.label}</span>`;
  }).join('');
  window['_chipRedraw_'+chipId]=redrawFn;
}

function toggleChip(chipId, key) {
  const map=chipId==='lbChips'?window._lbChartVisible:chipId==='teamChips'?window._teamChartVisible:window._teamRankChartVisible;
  map[key]=map[key]===false?true:false;
  const chip=document.querySelector(`#${chipId} .toggle-chip[data-key="${key}"]`);
  if(chip){chip.classList.toggle('active');chip.classList.toggle('inactive');}
  const fn=window['_chipRedraw_'+chipId];
  if(fn)fn();
}

function drawLbEquityCurve(entries, myEntry) {
  const balance=STATE.settings.balance||1000000;
  // Build lines for each entry (limit to top 12 + you)
  let sorted=[...entries].sort((a,b)=>b.ret-a.ret);
  // Ensure "me" is always included
  const topN=sorted.filter(e=>!e.isMe).slice(0,11);
  if(myEntry&&!topN.find(e=>e.isMe))topN.push(myEntry);
  else if(!myEntry){}
  const displayed=myEntry?[...topN.filter(e=>!e.isMe),myEntry].sort((a,b)=>b.ret-a.ret):topN;
  // Init visibility
  displayed.forEach((e,i)=>{
    const key=e.traderName||e.name;
    if(window._lbChartVisible[key]===undefined){
      // Default: show top 5 + you
      window._lbChartVisible[key]=(i<5||e.isMe);
    }
  });
  const lines=displayed.map((e,i)=>{
    const key=e.traderName||e.name;
    const color=e.isMe?'#22d3ee':CHART_COLORS[(i+1)%CHART_COLORS.length];
    const eq = getEquityData(key, balance, e.equity);
    return {
      key,label:e.name,color,bold:e.isMe,dashed:false,
      data:eq.data, dates:eq.dates,
      active:window._lbChartVisible[key]!==false
    };
  });
  drawMultiLineChart('lbEquityChart',lines,Math.max(...lines.map(l=>l.data.length),2));
  renderChips('lbChips',lines.map(l=>({key:l.key,label:l.label,color:l.color})),window._lbChartVisible,()=>drawLbEquityCurve(entries,myEntry));
}

function drawTeamEquityChart(teamMembers) {
  const balance=STATE.settings.balance||1000000;
  if(!teamMembers||!teamMembers.length)return;
  teamMembers.forEach((e,i)=>{
    const key=e.traderName||e.name;
    if(window._teamChartVisible[key]===undefined)window._teamChartVisible[key]=true;
  });
  const avgEquity=teamMembers.reduce((s,e)=>s+e.equity,0)/teamMembers.length;
  const lines=teamMembers.map((e,i)=>{
    const key=e.traderName||e.name;
    const color=e.isMe?'#22d3ee':CHART_COLORS[(i+1)%CHART_COLORS.length];
    const eq = getEquityData(key, balance, e.equity);
    return {key,label:e.name,color,bold:e.isMe,dashed:false,data:eq.data,dates:eq.dates,active:window._teamChartVisible[key]!==false};
  });
  // Add team average dashed line
  const avgEq = getEquityData('_teamavg', balance, avgEquity);
  lines.push({key:'_teamavg',label:'Team Avg',color:'#94a3b8',bold:false,dashed:true,data:avgEq.data,dates:avgEq.dates,active:window._teamChartVisible['_teamavg']!==false});
  if(window._teamChartVisible['_teamavg']===undefined)window._teamChartVisible['_teamavg']=true;
  drawMultiLineChart('teamEquityChart',lines,Math.max(...lines.map(l=>l.data.length),2));
  renderChips('teamChips',lines.map(l=>({key:l.key,label:l.label,color:l.color})),window._teamChartVisible,()=>drawTeamEquityChart(teamMembers));
}

function drawTeamBarChart(teams) {
  const canvas=document.getElementById('teamBarChart');
  if(!canvas||!canvas.parentElement||!teams.length)return;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const rect=canvas.parentElement.getBoundingClientRect();
  if(!rect||!rect.width)return;
  teams.forEach((t,i)=>{
    const key=t.name;
    if(window._teamRankChartVisible[key]===undefined)window._teamRankChartVisible[key]=true;
  });
  const activeTeams=teams.filter(t=>window._teamRankChartVisible[t.name]!==false);
  const dpr=window.devicePixelRatio||1;
  const barH=32,gap=8,padL=120,padR=80,padT=10;
  const H=Math.max(150,activeTeams.length*(barH+gap)+padT+20);
  canvas.width=rect.width*dpr;canvas.height=H*dpr;
  canvas.style.width=rect.width+'px';canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);
  const W=rect.width;
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  ctx.fillStyle=isLight?'#ffffff':getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  ctx.fillRect(0,0,W,H);
  if(!activeTeams.length){ctx.fillStyle='#475569';ctx.font='13px IBM Plex Sans';ctx.textAlign='center';ctx.fillText('No teams visible',W/2,H/2);return;}
  const maxVal=Math.max(...activeTeams.map(t=>Math.abs(t.totalPnl)),1);
  const cW=W-padL-padR;
  const zeroX=padL+cW/2;
  // Zero line
  ctx.strokeStyle=isLight?'rgba(0,0,0,0.15)':'rgba(255,255,255,0.15)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(zeroX,padT);ctx.lineTo(zeroX,H-10);ctx.stroke();
  activeTeams.forEach((t,i)=>{
    const y=padT+i*(barH+gap);
    const barW=(t.totalPnl/maxVal)*(cW/2);
    const x=t.totalPnl>=0?zeroX:zeroX+barW;
    const w=Math.abs(barW);
    ctx.fillStyle=t.color||'var(--accent)';
    ctx.globalAlpha=0.85;
    ctx.fillRect(x,y,w,barH);
    ctx.globalAlpha=1;
    // Label left
    ctx.fillStyle=isLight?'#1e293b':'#e2e8f0';ctx.font='12px IBM Plex Sans';ctx.textAlign='right';
    ctx.fillText(t.name,padL-8,y+barH/2+4);
    // Value right
    const valColor=t.totalPnl>=0?'#10b981':'#ef4444';
    ctx.fillStyle=valColor;ctx.font='12px IBM Plex Mono';ctx.textAlign='left';
    const sign=t.totalPnl>=0?'+':'-';
    ctx.fillText(sign+'$'+Math.abs(t.totalPnl).toLocaleString(undefined,{maximumFractionDigits:0}),x+w+6,y+barH/2+4);
  });
  renderChips('teamRankChips',teams.map(t=>({key:t.name,label:t.name,color:t.color})),window._teamRankChartVisible,()=>drawTeamBarChart(teams));
}

function initLbCrosshair() {
  // Simplified — no crosshair for multi-line (too noisy)
}

function openMobileTicket() {
  const ticket = document.getElementById('mobileTicket');
  ticket.style.display = 'block';
  const sel = document.getElementById('mobType');
  if (!sel.options.length) {
    const types = ['PHYS_FIXED','PHYS_INDEX','BASIS_SWAP','FIXED_FLOAT','SPREAD','CRUDE_PHYS','CRUDE_SWAP','FREIGHT_FFA','FREIGHT_PHYS','AG_FUTURES','AG_OPTION','AG_SPREAD','METALS_FUTURES','METALS_OPTION','METALS_SPREAD'];
    sel.innerHTML = types.map(t=>`<option value="${t}">${t}</option>`).join('');
    onMobTypeChange();
  }
}

function closeMobileTicket() { document.getElementById('mobileTicket').style.display='none'; }

function onMobTypeChange() {
  const type = document.getElementById('mobType').value;
  let hubs;
  if (type.startsWith('CRUDE')) hubs=CRUDE_HUBS;
  else if (type.startsWith('FREIGHT')) hubs=FREIGHT_HUBS;
  else if (type.startsWith('AG')) hubs=AG_HUBS;
  else if (type.startsWith('METALS')) hubs=METALS_HUBS;
  else hubs=NG_HUBS;
  document.getElementById('mobHub').innerHTML = hubs.map(h=>`<option value="${h.name}">${h.name}</option>`).join('');
  updateMobEntryPrice();
}
function updateMobEntryPrice() {
  const hub = document.getElementById('mobHub').value;
  if (hub) document.getElementById('mobEntry').value = getPrice(hub).toFixed(4);
}
document.getElementById('mobHub').addEventListener('change', updateMobEntryPrice);

function setMobDir(dir) {
  mobDir=dir;
  const b=document.getElementById('mobBuy'),s=document.getElementById('mobSell'),h=document.getElementById('mobPriceHint');
  if(dir==='BUY'){b.style.background='var(--green)';b.style.color='#fff';b.style.borderColor='var(--green)';s.style.background='var(--surface2)';s.style.color='var(--text-dim)';s.style.borderColor='var(--border)';if(h)h.textContent='(≥ spot for BUY)';}
  else{s.style.background='var(--red)';s.style.color='#fff';s.style.borderColor='var(--red)';b.style.background='var(--surface2)';b.style.color='var(--text-dim)';b.style.borderColor='var(--border)';if(h)h.textContent='(≤ spot for SELL)';}
}

function submitMobileTrade() {
  const type=document.getElementById('mobType').value;
  const hub=document.getElementById('mobHub').value;
  const vol=document.getElementById('mobVolume').value;
  if(!mobDir)return toast('Select BUY or SELL','error');
  if(!vol||parseFloat(vol)<=0)return toast('Enter volume','error');
  const spotPrice=getPrice(hub);
  if(!spotPrice||spotPrice<=0)return toast('No market price available','error');
  const entered=parseFloat(document.getElementById('mobEntry').value);
  const currentPrice=(entered&&entered>0)?entered:spotPrice;
  if(mobDir==='BUY'&&currentPrice<spotPrice)return toast('BUY price must be ≥ spot ($'+spotPrice.toFixed(4)+')','error');
  if(mobDir==='SELL'&&currentPrice>spotPrice)return toast('SELL price must be ≤ spot ($'+spotPrice.toFixed(4)+')','error');
  const trade={type,direction:mobDir,hub,volume:parseFloat(vol),entryPrice:currentPrice,spotRef:spotPrice,venue:'OTC',status:'OPEN',timestamp:new Date().toISOString(),id:Date.now()};
  STATE.trades.unshift(trade);
  localStorage.setItem(traderStorageKey('trades'),JSON.stringify(STATE.trades));
  playSound('trade');
  toast(mobDir+' '+vol+' '+hub+' @ '+currentPrice.toFixed(4),'success');
  closeMobileTicket();
  document.getElementById('mobVolume').value='';
  document.getElementById('mobEntry').value='';
  mobDir='';
}

