/* =====================================================================
   NEWS
   ===================================================================== */
const SIM_NEWS = {
  ng: [
    { source:'Simulated', headline:'Henry Hub Prices Surge on Colder Weather Forecast', description:'Extended cold pattern expected across Eastern US pushes gas futures higher.', time:'2h ago' },
    { source:'Simulated', headline:'Freeport LNG Export Terminal Reaches Full Capacity', description:'Gulf Coast LNG demand continues to tighten domestic supply.', time:'4h ago' },
    { source:'Simulated', headline:'EIA Reports Larger-Than-Expected Storage Draw', description:'Working gas dropped 120 Bcf, well above the 5-year average draw.', time:'6h ago' },
    { source:'Simulated', headline:'Permian Basin Flaring Regulations Tighten', description:'New rules could reduce associated gas production in the Waha corridor.', time:'8h ago' },
    { source:'Simulated', headline:'Algonquin Basis Explodes on Pipeline Constraints', description:'Northeast basis blows out as Algonquin capacity maxes out during cold snap.', time:'10h ago' },
    { source:'Simulated', headline:'Dawn Hub Storage Nears Operational Minimums', description:'Canadian storage at Dawn approaches critically low levels ahead of spring.', time:'12h ago' }
  ],
  crude: [
    { source:'Simulated', headline:'OPEC+ Agrees to Extend Production Cuts', description:'Cartel maintains supply discipline, supporting Brent above $80.', time:'2h ago' },
    { source:'Simulated', headline:'US Crude Inventories Fall for 5th Straight Week', description:'EIA reports 4.2M barrel draw at Cushing hub.', time:'5h ago' },
    { source:'Simulated', headline:'WCS Discount Widens on Pipeline Bottleneck', description:'Canadian heavy crude struggles to reach Gulf Coast refiners.', time:'7h ago' },
    { source:'Simulated', headline:'Mars Sour Premium Strengthens on Refinery Demand', description:'Gulf Coast sour crude demand rises ahead of maintenance season.', time:'9h ago' },
    { source:'Simulated', headline:'Brent-WTI Spread Narrows to $3 on Export Growth', description:'Rising US exports tighten the transatlantic arbitrage.', time:'11h ago' },
    { source:'Simulated', headline:'Bakken Production Hits Record Despite Takeaway Limits', description:'North Dakota output surpasses 1.3 million barrels per day.', time:'14h ago' }
  ],
  power: [
    { source:'Simulated', headline:'ERCOT Issues Conservation Alert Amid Heat Wave', description:'Texas grid operator warns of tight reserves as temps hit 105°F.', time:'1h ago' },
    { source:'Simulated', headline:'PJM Capacity Auction Clears at Record Prices', description:'Rising demand and retirements push capacity prices to new highs.', time:'4h ago' },
    { source:'Simulated', headline:'CAISO Curtails 5GW of Solar During Midday Peak', description:'California oversupply leads to negative prices during afternoon hours.', time:'6h ago' },
    { source:'Simulated', headline:'NYISO Zone J Spikes to $200/MWh on Transmission Outage', description:'NYC zone prices soar as key transmission line goes offline.', time:'8h ago' },
    { source:'Simulated', headline:'MISO Wind Generation Sets New Record', description:'Wind output across Midwest surpasses 25GW, depressing on-peak prices.', time:'10h ago' },
    { source:'Simulated', headline:'NEPOOL Winter Readiness Report Raises Concerns', description:'New England ISO flags potential fuel security issues for upcoming winter.', time:'13h ago' }
  ],
  freight: [
    { source:'Simulated', headline:'Baltic Dry Index Surges on Iron Ore Demand', description:'Chinese steel production ramp-up drives capesize rates higher.', time:'2h ago' },
    { source:'Simulated', headline:'VLCC Rates Spike on Red Sea Rerouting', description:'Tankers avoiding Suez Canal add ton-miles, tightening supply.', time:'4h ago' },
    { source:'Simulated', headline:'Panamax Rates Firm on South American Grain Season', description:'Brazilian soybean exports boost Pacific and Atlantic rates.', time:'6h ago' },
    { source:'Simulated', headline:'LNG Spot Freight Eases as Newbuilds Enter Fleet', description:'New vessel deliveries add tonnage, pressuring spot charter rates.', time:'8h ago' },
    { source:'Simulated', headline:'Suezmax Market Tightens on West African Crude Exports', description:'Rising WAF crude demand boosts dirty tanker rates.', time:'10h ago' },
    { source:'Simulated', headline:'Dry Bulk Scrapping Accelerates as Emissions Rules Loom', description:'Older vessels exit fleet ahead of CII regulations, supporting rates.', time:'12h ago' }
  ],
  ag: [
    { source:'Simulated', headline:'USDA WASDE Report Cuts Corn Yield Estimate', description:'Drought conditions across the Corn Belt reduce expected output by 3%.', time:'1h ago' },
    { source:'Simulated', headline:'Soybean Exports to China Surge to Record Pace', description:'Brazilian port congestion shifts buying to US Gulf terminals.', time:'3h ago' },
    { source:'Simulated', headline:'Wheat Futures Rally on Black Sea Export Uncertainty', description:'Geopolitical tensions threaten Ukrainian grain corridor shipments.', time:'5h ago' },
    { source:'Simulated', headline:'Coffee C Prices Hit 2-Year High on Brazilian Frost Risk', description:'Cold front approaching Minas Gerais raises supply concerns.', time:'7h ago' },
    { source:'Simulated', headline:'Live Cattle Futures Firm on Strong Packer Demand', description:'Tight cattle supplies support cash market premiums.', time:'9h ago' },
    { source:'Simulated', headline:'Cocoa Prices Surge as West Africa Crop Falls Short', description:'Ghana and Ivory Coast report lowest production in a decade.', time:'11h ago' }
  ],
  metals: [
    { source:'Simulated', headline:'Gold Breaks Above $2,350 on Safe-Haven Demand', description:'Central bank buying and geopolitical tensions drive bullion higher.', time:'1h ago' },
    { source:'Simulated', headline:'Copper Rallies on China Stimulus Expectations', description:'Beijing infrastructure spending signals boost demand outlook.', time:'3h ago' },
    { source:'Simulated', headline:'Silver Outperforms Gold as Industrial Demand Grows', description:'Solar panel manufacturing drives record silver consumption.', time:'5h ago' },
    { source:'Simulated', headline:'Aluminum Prices Drop on LME Warehouse Surplus', description:'Rising inventories in Asian warehouses weigh on spot premiums.', time:'7h ago' },
    { source:'Simulated', headline:'Iron Ore Tumbles on Weak Chinese Steel Margins', description:'Steelmakers cut production as margins turn negative.', time:'9h ago' },
    { source:'Simulated', headline:'Nickel Volatility Spikes Amid Indonesian Export Policy Shift', description:'Jakarta signals potential export tax changes for nickel ore.', time:'11h ago' }
  ],
  ngls: [
    { source:'Simulated', headline:'Mont Belvieu Propane Strengthens on Export Demand', description:'Enterprise TEPPCO terminal loadings hit seasonal highs, tightening Gulf Coast supply.', time:'1h ago' },
    { source:'Simulated', headline:'Ethane Rejection Rises as Gas-NGL Spread Narrows', description:'Processors leaving ethane in the gas stream as recovery margins compress.', time:'3h ago' },
    { source:'Simulated', headline:'Frac Spread Widens on Higher NGL Prices, Weaker Gas', description:'Processing economics improve as NGL basket outpaces Henry Hub input cost.', time:'5h ago' },
    { source:'Simulated', headline:'Enterprise Products Expands Mont Belvieu Fractionation', description:'New 150,000 bpd unit to come online Q3, adding NGL processing capacity.', time:'7h ago' },
    { source:'Simulated', headline:'Natural Gasoline Premium Surges on Blending Demand', description:'C5+ prices rise as refiners increase gasoline blending component purchases.', time:'9h ago' },
    { source:'Simulated', headline:'Asian Propane Imports Reach Record, Lifting US Gulf Prices', description:'LPG export cargoes from Houston ship channel fully booked through month-end.', time:'11h ago' }
  ],
  lng: [
    { source:'Simulated', headline:'JKM Surges as Northeast Asia Cold Snap Drives Spot Buying', description:'Japanese and Korean utilities scramble for spot cargoes, pushing Asia LNG to 3-month highs.', time:'1h ago' },
    { source:'Simulated', headline:'Sabine Pass Declares Force Majeure on Train 2', description:'Unplanned outage at Cheniere facility removes 0.7 Bcf/d of export capacity.', time:'3h ago' },
    { source:'Simulated', headline:'TTF Drops as European Storage Hits 85% Ahead of Schedule', description:'Mild autumn weather and strong LNG imports leave EU well-positioned for winter.', time:'5h ago' },
    { source:'Simulated', headline:'Mozambique LNG Final Investment Decision Expected Q1', description:'TotalEnergies signals restart of Mozambique project, adding future supply.', time:'7h ago' },
    { source:'Simulated', headline:'US LNG Exports Hit Record 14 Bcf/d in November', description:'Golden Pass and Plaquemines Phase 1 commissioning cargoes boost total loadings.', time:'9h ago' },
    { source:'Simulated', headline:'Qatar Expands North Field East with New Long-Term Offtake Deals', description:'QatarEnergy signs 27-year supply agreements with Asian buyers at Brent-linked pricing.', time:'11h ago' }
  ]
};

let liveNews = {};

let newsExpanded = {};

function renderNews(sector, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const articles = liveNews[sector] || SIM_NEWS[sector] || [];
  const expanded = newsExpanded[sector] || false;
  const visible = expanded ? articles : articles.slice(0, 5);
  const remaining = articles.length - 5;

  // Store articles for click handler
  if (!window._newsArticles) window._newsArticles = {};
  window._newsArticles[sector] = articles;

  let html = visible.map((a, i) =>
    `<div class="news-card" onclick="openNewsBySector('${sector}',${i})">
      <div class="news-source">${escapeHtml(a.source)}</div>
      <div class="news-headline">${escapeHtml(a.headline)}</div>
      <div class="news-desc">${escapeHtml(a.description || '')}</div>
      <div class="news-time">${escapeHtml(a.time)}</div>
    </div>`
  ).join('');

  if (!expanded && remaining > 0) {
    html += `<button class="news-show-more" onclick="expandNews('${sector}','${containerId}')">
      Show More Headlines<span class="news-count-badge">+${remaining}</span>
    </button>`;
  } else if (expanded && articles.length > 5) {
    html += `<button class="news-show-more" onclick="collapseNews('${sector}','${containerId}')" style="color:var(--text-muted)">
      Show Less
    </button>`;
  }

  container.innerHTML = html;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function openNewsBySector(sector, idx) {
  const articles = (window._newsArticles || {})[sector] || liveNews[sector] || SIM_NEWS[sector] || [];
  const a = articles[idx];
  if (!a) return;
  openNewsModalSafe(a.headline, a.description, a.url);
}

function expandNews(sector, containerId) {
  newsExpanded[sector] = true;
  renderNews(sector, containerId);
}

function collapseNews(sector, containerId) {
  newsExpanded[sector] = false;
  renderNews(sector, containerId);
  // Scroll back up to the news section
  document.getElementById(containerId)?.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* =====================================================================
   NEWS TICKER BAR
   ===================================================================== */
const SECTOR_TAGS = {
  ng:      { label:'NG',  cls:'ng' },
  crude:   { label:'CL',  cls:'crude' },
  power:   { label:'PWR', cls:'power' },
  freight: { label:'FRT', cls:'freight' },
  ag:      { label:'AG',  cls:'ag' },
  metals:  { label:'MTL', cls:'metals' },
  ngls:    { label:'NGL', cls:'ng' },
  lng:     { label:'LNG', cls:'crude' },
};

function renderNewsTicker() {
  const inner = document.getElementById('newsTickerInner');
  if (!inner) return;

  // Collect headlines from all sectors
  const allItems = [];
  const sectors = ['ng','crude','power','freight','ag','metals','ngls','lng'];
  for (const sec of sectors) {
    const articles = liveNews[sec] || SIM_NEWS[sec] || [];
    for (const a of articles.slice(0, 4)) {
      allItems.push({ sector: sec, ...a });
    }
  }

  // Interleave: round-robin across sectors so it doesn't cluster
  const bySector = {};
  for (const item of allItems) {
    if (!bySector[item.sector]) bySector[item.sector] = [];
    bySector[item.sector].push(item);
  }
  const interleaved = [];
  const queues = sectors.map(s => bySector[s] || []);
  let maxLen = Math.max(...queues.map(q => q.length));
  for (let i = 0; i < maxLen; i++) {
    for (const q of queues) {
      if (i < q.length) interleaved.push(q[i]);
    }
  }

  // Store interleaved for click handler
  window._tickerArticles = interleaved;

  const buildHTML = (items, offset) => items.map((item, i) => {
    const tag = SECTOR_TAGS[item.sector] || { label:'?', cls:'' };
    const idx = (offset || 0) + i;
    return `<span class="news-tick" onclick="openTickerNews(${idx % interleaved.length})"><span class="news-tick-tag ${tag.cls}">${tag.label}</span>${escapeHtml(item.headline)}<span class="news-tick-src">${escapeHtml(item.time)}</span></span><span class="news-tick-sep">◆</span>`;
  }).join('');

  // Duplicate content for seamless looping
  const segment = buildHTML(interleaved, 0);
  inner.innerHTML = segment + buildHTML(interleaved, 0);

  // Calculate speed: measure actual content width, target ~60px/sec
  requestAnimationFrame(() => {
    const contentWidth = inner.scrollWidth / 2; // half because we duplicated
    const speed = 60; // pixels per second — comfortable reading pace
    const duration = Math.max(30, contentWidth / speed);
    inner.style.animation = `newsScroll ${duration}s linear infinite`;
  });
}

function openTickerNews(idx) {
  const items = window._tickerArticles || [];
  const a = items[idx];
  if (!a) return;
  openNewsModalSafe(a.headline, a.description, a.url);
}

function openNewsModalSafe(headline, desc, url) {
  const modal = document.getElementById('modalContent');
  modal.innerHTML = '';
  const h = document.createElement('h3');
  h.textContent = headline || '';
  modal.appendChild(h);
  const p = document.createElement('p');
  p.textContent = desc || '';
  modal.appendChild(p);
  if (url) {
    const lp = document.createElement('p');
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.style.color = 'var(--accent)';
    a.textContent = 'Read full article →';
    lp.appendChild(a);
    modal.appendChild(lp);
  }
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  actions.innerHTML = '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
  modal.appendChild(actions);
  document.getElementById('modalOverlay').classList.add('active');
}

// Keep legacy function for backward compat
function openNewsModal(headline, desc, url) {
  openNewsModalSafe(headline, desc, url);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('active'); }

/* =====================================================================
   ECONOMIC CALENDAR
   ===================================================================== */
const CALENDAR_EVENTS = {
  ng: [
    { name:'EIA Natural Gas Storage Report', impact:'HIGH', dayOfWeek:4, recurring:true },
    { name:'NOAA 6-10 Day Forecast', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'FERC Monthly Gas Report', impact:'MEDIUM', monthDay:15 },
    { name:'LNG Export Terminal Maintenance Window', impact:'HIGH', monthDay:20 },
    { name:'NYMEX NG Options Expiry', impact:'HIGH', monthDay:25 },
  ],
  crude: [
    { name:'EIA Weekly Petroleum Status', impact:'HIGH', dayOfWeek:3, recurring:true },
    { name:'API Weekly Crude Stocks', impact:'MEDIUM', dayOfWeek:2, recurring:true },
    { name:'OPEC+ Monthly Meeting', impact:'HIGH', monthDay:5 },
    { name:'Baker Hughes Rig Count', impact:'MEDIUM', dayOfWeek:5, recurring:true },
    { name:'NYMEX CL Options Expiry', impact:'HIGH', monthDay:20 },
  ],
  power: [
    { name:'ERCOT Seasonal Assessment', impact:'HIGH', monthDay:10 },
    { name:'PJM Capacity Auction Results', impact:'HIGH', monthDay:22 },
    { name:'CAISO Renewables Forecast Update', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'FERC Monthly Energy Review', impact:'MEDIUM', monthDay:18 },
    { name:'EPA Emissions Rule Comment Deadline', impact:'HIGH', monthDay:28 },
  ],
  freight: [
    { name:'Baltic Exchange Weekly Summary', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'Shanghai Shipping Exchange Index', impact:'MEDIUM', dayOfWeek:1, recurring:true },
    { name:'IMO CII Rating Review', impact:'HIGH', monthDay:21 },
    { name:'Chinese PMI Release', impact:'HIGH', monthDay:1 },
    { name:'BIMCO Market Report', impact:'MEDIUM', monthDay:14 },
  ],
  ag: [
    { name:'USDA WASDE Report', impact:'HIGH', monthDay:12 },
    { name:'USDA Crop Progress Report', impact:'HIGH', dayOfWeek:1, recurring:true },
    { name:'USDA Export Sales Report', impact:'MEDIUM', dayOfWeek:4, recurring:true },
    { name:'CBOT Grain Options Expiry', impact:'HIGH', monthDay:22 },
    { name:'USDA Cattle on Feed Report', impact:'MEDIUM', monthDay:20 },
    { name:'ICE Coffee First Notice Day', impact:'HIGH', monthDay:26 },
  ],
  metals: [
    { name:'FOMC Rate Decision', impact:'HIGH', monthDay:14 },
    { name:'US Non-Farm Payrolls', impact:'HIGH', monthDay:3 },
    { name:'Chinese Manufacturing PMI', impact:'HIGH', monthDay:1 },
    { name:'COMEX Gold Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'LME Week Conference', impact:'MEDIUM', monthDay:28 },
    { name:'World Gold Council Demand Report', impact:'MEDIUM', monthDay:18 },
  ],
  ngls: [
    { name:'EIA Weekly Petroleum Status (NGL Stocks)', impact:'HIGH', dayOfWeek:3, recurring:true },
    { name:'Mont Belvieu OPIS Settlement', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'Enterprise Products Fractionation Report', impact:'MEDIUM', monthDay:10 },
    { name:'NYMEX Propane Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'EIA Monthly NGL Production Report', impact:'MEDIUM', monthDay:28 },
    { name:'US LPG Export Loadings Update', impact:'MEDIUM', dayOfWeek:2, recurring:true },
  ],
  lng: [
    { name:'DOE LNG Monthly Export Report', impact:'HIGH', monthDay:15 },
    { name:'Platts JKM Settlement', impact:'HIGH', dayOfWeek:5, recurring:true },
    { name:'GIIGNL Annual Report Release', impact:'MEDIUM', monthDay:20 },
    { name:'ICE TTF Options Expiry', impact:'HIGH', monthDay:25 },
    { name:'EIA Natural Gas Monthly (LNG Exports)', impact:'HIGH', monthDay:28 },
    { name:'Asian Spot Tender Deadline Window', impact:'MEDIUM', dayOfWeek:3, recurring:true },
  ]
};

function renderCalendar(containerId, sector) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const events = CALENDAR_EVENTS[sector] || [];
  const now = new Date();

  const items = events.map(ev => {
    let daysAway;
    if (ev.recurring && ev.dayOfWeek !== undefined) {
      const today = now.getDay();
      daysAway = (ev.dayOfWeek - today + 7) % 7;
      if (daysAway === 0) daysAway = 0; // today
    } else if (ev.monthDay !== undefined) {
      // Anchor to a specific day of the month — if passed, show next month
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), ev.monthDay);
      if (thisMonth >= now) {
        daysAway = Math.ceil((thisMonth - now) / 86400000);
      } else {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, ev.monthDay);
        daysAway = Math.ceil((nextMonth - now) / 86400000);
      }
    } else {
      daysAway = ev.daysAway || 0;
    }
    const evDate = new Date(now.getTime() + daysAway * 86400000);
    return { ...ev, daysAway, date: evDate };
  }).sort((a, b) => a.daysAway - b.daysAway);

  container.innerHTML = items.map(ev => {
    const dateStr = ev.date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    const daysLabel = ev.daysAway === 0 ? 'Today' : ev.daysAway === 1 ? 'Tomorrow' : ev.daysAway + 'd away';
    return `<div class="cal-item">
      <span class="cal-date">${dateStr}</span>
      <span class="cal-name">${ev.name}</span>
      <span class="cal-impact ${ev.impact.toLowerCase()}">${ev.impact}</span>
      <span class="cal-days">${daysLabel}</span>
    </div>`;
  }).join('');
}

/* =====================================================================
   EIA DATA FETCHING
   ===================================================================== */
let eiaLoaded = { ng: false, crude: false };

async function fetchEiaData() {
  // Helper to show error in EIA widget
  function showEiaError(ids, msg) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.textContent = '—'; el.title = msg; }
    }
  }

  // Natural Gas Storage
  try {
    const ngResp = await fetch('/api/eia/ng_storage');
    const ngJson = await ngResp.json();
    if (ngJson.success && ngJson.data && ngJson.data.data && ngJson.data.data.length >= 2) {
      const rows = ngJson.data.data;
      const latest = rows[0];
      const prev = rows[1];
      const val = parseFloat(latest.value);
      const prevVal = parseFloat(prev.value);
      const change = val - prevVal;
      document.getElementById('ngEiaStorage').textContent = val.toLocaleString() + ' Bcf';
      const changeEl = document.getElementById('ngEiaChange');
      changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(0) + ' Bcf';
      changeEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('ngEiaDate').textContent = latest.period;
      if (rows.length >= 52) {
        const avg52 = rows.slice(0, 52).reduce((s, r) => s + parseFloat(r.value || 0), 0) / 52;
        const diff = val - avg52;
        const pct = ((diff / avg52) * 100).toFixed(1);
        const avgEl = document.getElementById('ngEia5yr');
        avgEl.textContent = (diff >= 0 ? '+' : '') + pct + '%';
        avgEl.style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
      }
      eiaLoaded.ng = true;
    } else if (ngJson.error) {
      console.warn('EIA NG error:', ngJson.error);
      showEiaError(['ngEiaStorage'], ngJson.error.includes('not configured') ? 'API key not set' : 'Error');
    }
  } catch (e) { console.warn('EIA NG fetch failed:', e); }

  // Crude Inventory
  try {
    const crudeResp = await fetch('/api/eia/crude_inventory');
    const crudeJson = await crudeResp.json();
    if (crudeJson.success && crudeJson.data && crudeJson.data.data && crudeJson.data.data.length >= 2) {
      const rows = crudeJson.data.data;
      const latest = rows[0];
      const prev = rows[1];
      const val = parseFloat(latest.value);
      const prevVal = parseFloat(prev.value);
      const change = val - prevVal;
      document.getElementById('crudeEiaInv').textContent = (val / 1000).toFixed(1) + 'M bbl';
      const changeEl = document.getElementById('crudeEiaChange');
      changeEl.textContent = (change >= 0 ? '+' : '') + (change / 1000).toFixed(1) + 'M bbl';
      changeEl.style.color = change <= 0 ? 'var(--green)' : 'var(--red)';
      document.getElementById('crudeEiaDate').textContent = latest.period;
      eiaLoaded.crude = true;
    } else if (crudeJson.error) {
      console.warn('EIA crude error:', crudeJson.error);
    }
  } catch (e) { console.warn('EIA crude fetch failed:', e); }

  // Cushing Stocks
  try {
    const cushResp = await fetch('/api/eia/crude_cushing');
    const cushJson = await cushResp.json();
    if (cushJson.success && cushJson.data && cushJson.data.data && cushJson.data.data.length >= 1) {
      const val = parseFloat(cushJson.data.data[0].value);
      document.getElementById('crudeEiaCushing').textContent = (val / 1000).toFixed(1) + 'M bbl';
    }
  } catch (e) { console.warn('EIA Cushing fetch failed:', e); }

  // If nothing loaded, log debug hint
  if (!eiaLoaded.ng && !eiaLoaded.crude) {
    console.info('%c EIA data not loading? Visit /api/eia-debug in your browser to diagnose.', 'color: #f59e0b; font-weight: bold;');
  }
}

/* =====================================================================
   CFTC COMMITMENT OF TRADERS
   ===================================================================== */
let cotLoaded = { ng: false, crude: false };

async function fetchCotData() {
  for (const commodity of ['ng', 'crude']) {
    const container = document.getElementById(commodity + 'CotContent');
    if (!container) continue;
    try {
      const resp = await fetch(`/api/cot/${commodity}`);
      const json = await resp.json();
      if (json.success && json.data && json.data.data && json.data.data.length >= 2) {
        renderCotWidget(container, json.data.data, commodity);
        cotLoaded[commodity] = true;
      } else {
        container.innerHTML = '<div class="cot-loading" style="color:var(--text-muted)">COT data unavailable</div>';
      }
    } catch (e) {
      console.warn(`COT ${commodity} fetch failed:`, e);
      container.innerHTML = '<div class="cot-loading" style="color:var(--text-muted)">COT data unavailable</div>';
    }
  }
}

function renderCotWidget(container, data, commodity) {
  const latest = data[0];
  const prev = data[1];
  const oi = latest.oi || 1;

  const categories = [
    { label: 'Prod/Merchant', long: latest.prod_long, short: latest.prod_short, pLong: prev.prod_long, pShort: prev.prod_short },
    { label: 'Swap Dealers', long: latest.swap_long, short: latest.swap_short, pLong: prev.swap_long, pShort: prev.swap_short },
    { label: 'Money Mgrs', long: latest.mm_long, short: latest.mm_short, pLong: prev.mm_long, pShort: prev.mm_short },
    { label: 'Other Rptbl', long: latest.other_long, short: latest.other_short, pLong: prev.other_long, pShort: prev.other_short },
    { label: 'Non-Reportable', long: latest.nonrept_long, short: latest.nonrept_short, pLong: prev.nonrept_long, pShort: prev.nonrept_short },
  ];

  const maxPos = Math.max(...categories.map(c => Math.max(c.long, c.short)), 1);

  let html = '';
  for (const cat of categories) {
    const lPct = (cat.long / maxPos * 100).toFixed(1);
    const sPct = (cat.short / maxPos * 100).toFixed(1);
    const net = cat.long - cat.short;
    const prevNet = cat.pLong - cat.pShort;
    const netChg = net - prevNet;
    html += `<div class="cot-row">
      <span class="cot-label">${cat.label}</span>
      <div class="cot-bar-wrap" title="Long: ${cat.long.toLocaleString()} | Short: ${cat.short.toLocaleString()}">
        <div class="cot-bar-long" style="width:${lPct}%"></div>
      </div>
      <div class="cot-bar-wrap" title="Short: ${cat.short.toLocaleString()}">
        <div class="cot-bar-short" style="width:${sPct}%"></div>
      </div>
      <span class="cot-val" style="color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':''}${(net/1000).toFixed(1)}K <span style="font-size:9px;color:var(--text-muted)">${netChg>=0?'▲':'▼'}${Math.abs(netChg/1000).toFixed(1)}K</span></span>
    </div>`;
  }

  // Summary stats
  const mmNet = latest.mm_long - latest.mm_short;
  const prevMmNet = prev.mm_long - prev.mm_short;
  const mmChg = mmNet - prevMmNet;
  const prodNet = latest.prod_long - latest.prod_short;

  html += `<div class="cot-summary">
    <div class="eia-item"><div class="eia-label">Report Date</div><div class="eia-value" style="font-size:13px">${latest.date}</div></div>
    <div class="eia-item"><div class="eia-label">Open Interest</div><div class="eia-value" style="font-size:13px">${(oi/1000).toFixed(0)}K</div></div>
    <div class="eia-item"><div class="eia-label">Money Mgr Net</div><div class="eia-value" style="font-size:13px;color:${mmNet>=0?'var(--green)':'var(--red)'}">${(mmNet/1000).toFixed(1)}K</div></div>
    <div class="eia-item"><div class="eia-label">MM Net Δ (wk)</div><div class="eia-value" style="font-size:13px;color:${mmChg>=0?'var(--green)':'var(--red)'}">${mmChg>=0?'+':''}${(mmChg/1000).toFixed(1)}K</div></div>
  </div>`;

  html += `<div style="margin-top:8px;font-size:10px;color:var(--text-muted);display:flex;gap:16px;align-items:center">
    <span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;vertical-align:middle"></span> Long</span>
    <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;vertical-align:middle"></span> Short</span>
    <span style="margin-left:auto">Net = Long − Short | Source: CFTC Disaggregated</span>
  </div>`;

  container.innerHTML = html;
}

