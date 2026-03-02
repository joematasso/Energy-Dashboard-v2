/* =====================================================================
   RENDER FUNCTIONS — TRADE BLOTTER
   ===================================================================== */
let tradeDirection = '';
let blotterPage = 0;
const BLOTTER_PAGE_SIZE = 10;

/* --- Click-to-show field info tooltips --- */
function toggleFieldTip(el) {
  const wasActive = el.classList.contains('active');
  // Close all open tips first
  document.querySelectorAll('.field-info.active').forEach(fi => fi.classList.remove('active'));
  if (!wasActive) el.classList.add('active');
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.field-info')) {
    document.querySelectorAll('.field-info.active').forEach(fi => fi.classList.remove('active'));
  }
});

/* --- Volume unit config per sector (defaults) --- */
const SECTOR_VOLUME = {
  ng:      { unit:'MMBtu',    placeholder:'10000', step:'1000', tip:'Volume in MMBtu (million British thermal units). Standard NYMEX lot: 10,000 MMBtu. Larger volume = more margin required.' },
  crude:   { unit:'BBL',      placeholder:'1000',  step:'100',  tip:'Volume in barrels (BBL). Standard NYMEX CL contract: 1,000 BBL per lot.' },
  power:   { unit:'MWh',      placeholder:'50',    step:'25',   tip:'Volume in megawatt-hours (MWh). Standard block: 50 MWh. On-peak vs off-peak hours affect total delivery.' },
  freight: { unit:'Lots',     placeholder:'5',     step:'1',    tip:'Number of lots. Each lot represents a standard cargo size for the route (e.g., Capesize = 150k MT).' },
  ag:      { unit:'Bushels',  placeholder:'5000',  step:'1000', tip:'Volume in bushels (corn/wheat/soy) or metric tonnes. Standard CBOT contract: 5,000 bushels.' },
  metals:  { unit:'Troy oz',  placeholder:'100',   step:'10',   tip:'Volume in troy ounces (gold/silver) or metric tonnes (base metals). Standard COMEX gold lot: 100 troy oz.' },
  ngls:    { unit:'Gallons',  placeholder:'42000', step:'1000', tip:'Volume in gallons or barrels. Standard NGL lot: 42,000 gallons (1,000 BBL). Priced per gallon.' },
  lng:     { unit:'MMBtu',    placeholder:'10000', step:'1000', tip:'Volume in MMBtu. LNG cargo trades may also reference TBtu or cargo lots (~3.4M MMBtu per standard cargo).' },
};

/* --- Trade-type-specific volume overrides (exchange contract specs) --- */
const TRADE_TYPE_VOLUME = {
  // NG
  PHYS_FIXED:   { unit:'MMBtu',    placeholder:'10000', step:'2500',  tip:'Physical fixed price gas. Standard daily volume: 2,500 MMBtu/day. Monthly: 10,000 MMBtu.' },
  PHYS_INDEX:   { unit:'MMBtu',    placeholder:'10000', step:'2500',  tip:'Physical index gas priced at first-of-month index. Standard: 10,000 MMBtu/month.' },
  BASIS_SWAP:   { unit:'MMBtu',    placeholder:'10000', step:'2500',  tip:'Basis swap: spread between two pricing points. Volume in MMBtu. Standard: 2,500 MMBtu/day.' },
  FIXED_FLOAT:  { unit:'MMBtu',    placeholder:'10000', step:'10000', tip:'Fixed/float swap. NYMEX NG contract: 10,000 MMBtu per lot. Enter in multiples of 10,000.' },
  BALMO:        { unit:'MMBtu',    placeholder:'2500',  step:'2500',  tip:'Balance of month. Volume = remaining days x daily quantity. Typical daily: 2,500 MMBtu.' },
  OPTION_NG:    { unit:'MMBtu',    placeholder:'10000', step:'10000', tip:'NG option. Each NYMEX contract = 10,000 MMBtu. Enter in multiples of 10,000.' },
  TAS:          null, // uses sector default
  SPREAD:       null, // uses sector default
  MULTILEG:     null,
  // Crude
  CRUDE_PHYS:   { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Physical crude. NYMEX CL contract = 1,000 BBL. Pipeline nominations typically in 1,000 BBL lots.' },
  CRUDE_SWAP:   { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Crude swap. Standard lot: 1,000 BBL (matches NYMEX CL). ICE Brent also 1,000 BBL.' },
  CRUDE_DIFF:   { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Crude differential (e.g., WTI-Brent). Volume in BBL. Standard: 1,000 BBL per lot.' },
  OPTION_CL:    { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Crude oil option. NYMEX CL option = 1,000 BBL per contract. Enter in multiples of 1,000.' },
  EFP:          { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Exchange for Physical. Swap a futures position for physical delivery. 1,000 BBL per lot.' },
  // Power
  // (uses sector defaults, plus specifics below)
  // Freight
  FREIGHT_FFA:  { unit:'Days',     placeholder:'30',    step:'1',     tip:'Freight Forward Agreement. Volume = number of days. Settlement based on Baltic route average.' },
  FREIGHT_PHYS: { unit:'MT',       placeholder:'150000',step:'25000', tip:'Physical freight charter. Volume in metric tonnes. Capesize ~150k MT, Panamax ~75k MT, Supramax ~55k MT.' },
  // Ag
  AG_FUTURES:   { unit:'Bushels',  placeholder:'5000',  step:'5000',  tip:'CBOT futures. Corn/Wheat/Soy = 5,000 bushels per contract. Enter in multiples of 5,000.' },
  AG_OPTION:    { unit:'Bushels',  placeholder:'5000',  step:'5000',  tip:'Ag options. Each CBOT option = 5,000 bushels. Premium quoted in cents/bushel.' },
  AG_SPREAD:    { unit:'Bushels',  placeholder:'5000',  step:'5000',  tip:'Ag calendar spread. Each leg = 5,000 bushels. Quoted as front-month minus back-month.' },
  // Metals
  METALS_FUTURES: { unit:'Troy oz', placeholder:'100',  step:'100',   tip:'COMEX gold = 100 troy oz. Silver = 5,000 troy oz. Copper = 25,000 lbs. Enter per-contract size.' },
  METALS_OPTION:  { unit:'Troy oz', placeholder:'100',  step:'100',   tip:'COMEX gold option = 100 troy oz per contract. Enter in multiples of 100.' },
  METALS_SPREAD:  { unit:'Troy oz', placeholder:'100',  step:'100',   tip:'Metals calendar spread. Each leg matches the futures contract size.' },
  // NGLs
  NGL_PHYS:     { unit:'Gallons',  placeholder:'42000', step:'42000', tip:'Physical NGL delivery. 1 lot = 42,000 gallons (1,000 BBL). Mont Belvieu is the primary hub.' },
  NGL_SWAP:     { unit:'Gallons',  placeholder:'42000', step:'42000', tip:'NGL swap. Standard lot: 42,000 gallons (1,000 BBL). Priced in cents/gallon.' },
  NGL_SPREAD:   { unit:'Gallons',  placeholder:'42000', step:'42000', tip:'NGL calendar spread. Each leg = 42,000 gallons (1,000 BBL).' },
  NGL_FRAC:     { unit:'BBL',      placeholder:'1000',  step:'1000',  tip:'Frac spread: NGL price vs. natural gas input cost. Volume in BBL of NGL output.' },
  // LNG
  LNG_DES:      { unit:'MMBtu',    placeholder:'3400000',step:'100000',tip:'LNG DES (Delivered Ex-Ship) cargo. Standard cargo ~3.4M MMBtu (~65,000 cbm LNG carrier).' },
  LNG_FOB:      { unit:'MMBtu',    placeholder:'3400000',step:'100000',tip:'LNG FOB (Free on Board) cargo. Standard cargo ~3.4M MMBtu. Buyer arranges shipping.' },
  LNG_SWAP:     { unit:'MMBtu',    placeholder:'10000', step:'10000', tip:'LNG swap (JKM, TTF, etc.). NYMEX/ICE LNG futures = 10,000 MMBtu per lot.' },
  LNG_SPREAD:   { unit:'MMBtu',    placeholder:'10000', step:'10000', tip:'LNG calendar spread. Each leg = 10,000 MMBtu.' },
  LNG_BASIS:    { unit:'MMBtu',    placeholder:'10000', step:'10000', tip:'LNG basis swap (e.g., JKM vs Henry Hub). Volume in MMBtu. Standard: 10,000 per lot.' },
};

function updateVolumeField(sector, tradeType) {
  // Trade-type-specific override takes priority, then fall back to sector default
  const cfg = (tradeType && TRADE_TYPE_VOLUME[tradeType]) || SECTOR_VOLUME[sector];
  const label = document.getElementById('volumeLabel');
  const input = document.getElementById('tradeVolume');
  const tip   = document.getElementById('volumeTip');
  if (cfg) {
    if (label) label.textContent = 'Volume (' + cfg.unit + ')';
    if (input) { input.placeholder = cfg.placeholder; input.step = cfg.step; }
    if (tip) tip.textContent = cfg.tip;
  } else {
    if (label) label.textContent = 'Volume';
    if (input) { input.placeholder = '10000'; input.step = '1'; }
    if (tip) tip.textContent = 'Number of units. Larger volume = more margin required.';
  }
}

function _updateSpotBadge(hubName) {
  const el = document.getElementById('tradeSpotBadge');
  if (!el) return;
  if (typeof isHubLive !== 'function' || typeof _liveHubSet === 'undefined' || _liveHubSet.size === 0) {
    el.style.display = 'none'; return;
  }
  if (isHubLive(hubName)) {
    el.textContent = 'LIVE'; el.style.display = 'inline';
    el.style.background = 'rgba(16,185,129,0.15)'; el.style.color = '#10b981';
    el.style.border = '1px solid rgba(16,185,129,0.3)';
  } else {
    el.textContent = 'EST'; el.style.display = 'inline';
    el.style.background = 'rgba(148,163,184,0.1)'; el.style.color = '#94a3b8';
    el.style.border = '1px solid rgba(148,163,184,0.2)';
  }
}

function renderBlotterPage() {
  updateAccountBar();
  populateHubDropdown();
  updateMarginPreview();
  renderBlotterTable();
  renderNetPositions();
  // Load OTC proposals
  if (typeof loadOtcProposals === 'function') loadOtcProposals();
  drawPnlChart();
  try { initPnlCrosshair(); } catch(e) {}
  // Show backdate field only when privileged AND user has enabled it in settings
  const bdGroup = document.getElementById('backdateGroup');
  if (bdGroup) bdGroup.style.display = (STATE.trader && STATE.trader.privileged && STATE.settings.dateOverride) ? '' : 'none';

  // Pre-fill entry price if clicked from chart
  if (STATE.clickedPrice !== null) {
    document.getElementById('tradeEntry').value = STATE.clickedPrice;
    document.getElementById('tradeFormHint').textContent = 'Entry price captured from chart: ' + STATE.clickedPrice;
    STATE.clickedPrice = null;
  }

  // Update spot ref — but NOT if backdating (historical price should persist)
  const bdActive = document.getElementById('tradeBackdate');
  if (!bdActive || !bdActive.value) {
    const hub = document.getElementById('tradeHub').value;
    if (hub) {
      document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
      _updateSpotBadge(hub);
    }
  }
}

function updateAccountBar() {
  const balance = STATE.settings.balance || 1000000;
  let realized = 0, unrealized = 0, wins = 0, losses = 0, openCount = 0;

  STATE.trades.forEach(t => {
    if (t.status === 'CLOSED') {
      const pnl = parseFloat(t.realizedPnl || 0);
      realized += pnl;
      if (pnl > 0) wins++; else if (pnl < 0) losses++;
    } else if (t.status === 'OPEN') {
      openCount++;
      const spot = getPrice(t.hub);
      const dir = t.direction === 'BUY' ? 1 : -1;
      const vol = parseFloat(t.volume || 0);
      const entry = parseFloat(t.entryPrice || 0);
      unrealized += (spot - entry) * vol * dir;
    }
  });

  const pendingCount = STATE.pendingOrders.length;
  const equity = balance + realized + unrealized;
  const usedMargin = STATE.trades.filter(t=>t.status==='OPEN').reduce((s,t)=>s+calcMargin(t),0);
  const buyingPower = equity - usedMargin;
  const wr = (wins+losses) > 0 ? ((wins/(wins+losses))*100).toFixed(1)+'%' : '—';

  const fmt = v => '$' + Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0});
  const sign = v => v >= 0 ? '' : '-';

  document.getElementById('acctBalance').textContent = fmt(equity);
  document.getElementById('acctBalance').style.color = '';

  const uel = document.getElementById('acctUnrealized');
  uel.textContent = sign(unrealized) + fmt(unrealized);
  uel.style.color = unrealized >= 0 ? 'var(--green)' : 'var(--red)';

  const rel = document.getElementById('acctRealized');
  rel.textContent = sign(realized) + fmt(realized);
  rel.style.color = realized >= 0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('acctBuyingPower').textContent = fmt(buyingPower);
  document.getElementById('acctBuyingPower').style.color = buyingPower > 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('acctOpenPos').textContent = openCount + (pendingCount ? ` (+${pendingCount})` : '');
  document.getElementById('acctWinRate').textContent = wr;
}

function populateHubDropdown() {
  const sel = document.getElementById('tradeHub');
  const type = document.getElementById('tradeType').value;
  const sector = document.getElementById('tradeSector') ? document.getElementById('tradeSector').value : '';
  const curVal = sel.value;

  // Sector dropdown is primary, trade type is fallback
  const SECTOR_HUB_MAP = { ng: NG_HUBS, crude: CRUDE_HUBS, power: POWER_HUBS, freight: FREIGHT_HUBS, ag: AG_HUBS, metals: METALS_HUBS, ngls: NGL_HUBS, lng: LNG_HUBS };
  let hubs;
  if (sector && SECTOR_HUB_MAP[sector]) {
    hubs = SECTOR_HUB_MAP[sector];
  } else if (type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL') hubs = CRUDE_HUBS;
  else if (type.startsWith('FREIGHT')) hubs = FREIGHT_HUBS;
  else if (type.startsWith('AG')) hubs = AG_HUBS;
  else if (type.startsWith('METALS')) hubs = METALS_HUBS;
  else if (type.startsWith('NGL')) hubs = NGL_HUBS;
  else if (type.startsWith('LNG')) hubs = LNG_HUBS;
  else hubs = NG_HUBS;

  sel.innerHTML = hubs.map(h => `<option value="${h.name}" ${h.name===curVal?'selected':''}>${h.name}</option>`).join('');

  // Also populate basis hub dropdown (same sector as primary hub)
  const basisSel = document.getElementById('tradeBasisHub');
  if (basisSel) basisSel.innerHTML = hubs.map(h => `<option value="${h.name}">${h.name}</option>`).join('');

  // Update spot reference — use historical price if backdating
  const hub = sel.value;
  if (hub) {
    const bdInput = document.getElementById('tradeBackdate');
    if (bdInput && bdInput.value) {
      onBackdateChange();
    } else {
      document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
      _updateSpotBadge(hub);
    }
  }
}

const SECTOR_TRADE_TYPES = {
  ng: [
    { value:'PHYS_FIXED', label:'Physical Fixed' },
    { value:'PHYS_INDEX', label:'Physical Index' },
    { value:'BASIS_SWAP', label:'Basis Swap' },
    { value:'FIXED_FLOAT', label:'Fixed/Float Swap' },
    { value:'SPREAD', label:'Calendar Spread' },
    { value:'BALMO', label:'Balance of Month' },
    { value:'OPTION_NG', label:'NG Option' },
    { value:'TAS', label:'Trade at Settlement' },
    { value:'MULTILEG', label:'Multi-Leg' },
  ],
  crude: [
    { value:'CRUDE_PHYS', label:'Crude Physical' },
    { value:'CRUDE_SWAP', label:'Crude Swap' },
    { value:'CRUDE_DIFF', label:'Crude Differential' },
    { value:'OPTION_CL', label:'Crude Option' },
    { value:'EFP', label:'Exchange for Physical' },
    { value:'TAS', label:'Trade at Settlement' },
  ],
  power: [
    { value:'PHYS_FIXED', label:'Power Fixed Price' },
    { value:'PHYS_INDEX', label:'Power Index' },
    { value:'FIXED_FLOAT', label:'Heat Rate Swap' },
    { value:'SPREAD', label:'Calendar Spread' },
    { value:'BALMO', label:'Balance of Month' },
    { value:'TAS', label:'Trade at Settlement' },
  ],
  freight: [
    { value:'FREIGHT_FFA', label:'Freight FFA' },
    { value:'FREIGHT_PHYS', label:'Freight Physical' },
  ],
  ag: [
    { value:'AG_FUTURES', label:'Ag Futures' },
    { value:'AG_OPTION', label:'Ag Option' },
    { value:'AG_SPREAD', label:'Ag Calendar Spread' },
  ],
  metals: [
    { value:'METALS_FUTURES', label:'Metals Futures' },
    { value:'METALS_OPTION', label:'Metals Option' },
    { value:'METALS_SPREAD', label:'Metals Calendar Spread' },
  ],
  ngls: [
    { value:'NGL_PHYS', label:'NGL Physical' },
    { value:'NGL_SWAP', label:'NGL Swap' },
    { value:'NGL_SPREAD', label:'NGL Calendar Spread' },
    { value:'NGL_FRAC', label:'Frac Spread' },
  ],
  lng: [
    { value:'LNG_DES', label:'LNG DES Cargo' },
    { value:'LNG_FOB', label:'LNG FOB Cargo' },
    { value:'LNG_SWAP', label:'LNG Swap' },
    { value:'LNG_SPREAD', label:'LNG Calendar Spread' },
    { value:'LNG_BASIS', label:'LNG Basis (JKM-HH)' },
  ]
};

const SECTOR_VENUES = {
  ng: [
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  crude: [
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  power: [
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME Globex' },
    { value:'BGC', label:'BGC Partners' },
    { value:'Tradition', label:'Tradition' },
    { value:'GFI', label:'GFI Group' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  freight: [
    { value:'BALTIC', label:'Baltic Exchange' },
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME ClearPort' },
    { value:'Clarksons', label:'Clarksons' },
    { value:'SSY', label:'Simpson Spence Young' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  ag: [
    { value:'CBOT', label:'CBOT' },
    { value:'ICE', label:'ICE Futures US' },
    { value:'CME', label:'CME Globex' },
    { value:'MGEX', label:'MGEX' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  metals: [
    { value:'COMEX', label:'COMEX' },
    { value:'NYMEX', label:'NYMEX' },
    { value:'LME', label:'LME' },
    { value:'SGX', label:'SGX' },
    { value:'SHFE', label:'Shanghai Futures' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  ngls: [
    { value:'OPIS', label:'OPIS (Mont Belvieu)' },
    { value:'NYMEX', label:'NYMEX' },
    { value:'ICE', label:'ICE' },
    { value:'CME', label:'CME ClearPort' },
    { value:'OTC', label:'OTC Bilateral' },
  ],
  lng: [
    { value:'ICE', label:'ICE Futures' },
    { value:'CME', label:'CME/NYMEX' },
    { value:'SGX', label:'SGX' },
    { value:'TOCOM', label:'TOCOM' },
    { value:'OTC', label:'OTC Bilateral' },
  ]
};

function populateVenueDropdown(sector) {
  const sel = document.getElementById('tradeVenue');
  if (!sel) return;
  const venues = SECTOR_VENUES[sector] || [{ value:'OTC', label:'OTC Bilateral' }];
  const curVal = sel.value;
  sel.innerHTML = venues.map(v => `<option value="${v.value}" ${v.value===curVal?'selected':''}>${v.label}</option>`).join('');
}

function onTradeSectorChange() {
  const sector = document.getElementById('tradeSector').value;
  const typeSel = document.getElementById('tradeType');
  if (!sector) {
    typeSel.innerHTML = '<option value="">Select sector first...</option>';
    return;
  }
  const types = SECTOR_TRADE_TYPES[sector] || [];
  typeSel.innerHTML = '<option value="">Select type...</option>' +
    types.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  // Auto-populate hub dropdown for this sector
  populateHubDropdown();
  // Auto-populate venue dropdown for this sector
  populateVenueDropdown(sector);
  // Update volume field units for this sector
  updateVolumeField(sector);
}

// Auto-incrementing confirmation reference per session
function genConfirmRef() {
  const d = new Date();
  const seq = String((STATE.confirmSeq = (STATE.confirmSeq || 0) + 1)).padStart(4, '0');
  return `ARM-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${seq}`;
}

// Quality options by sector for physical delivery
const QUALITY_OPTIONS = {
  ng:     ['Pipeline Quality (≥950 BTU/cf)', 'Rich Gas (>1050 BTU/cf)', 'Lean Gas (<950 BTU/cf)', 'LNG Grade', 'Sub-spec (waiver required)'],
  crude:  ['WTI Sweet (API 40°, <0.5%S)', 'Light Sweet (API 35-45°)', 'Medium Sour (API 25-35°, 1-2%S)', 'Heavy Sour (API <25°, >2%S)', 'Mars Sour Blend', 'WCS (API 20°, 3.5%S)', 'Bakken Light (API 42°, 0.2%S)'],
  power:  ['Firm On-Peak (6×16)', 'Firm Off-Peak', 'Firm Flat (7×24)', 'Non-Firm (LD)', 'Interruptible', 'Unit Contingent'],
  lng:    ['GIIGNL Spec (>1000 BTU/cf)', 'LNG Grade A', 'LNG Grade B', 'Regas Quality'],
  ngls:   ['HD-5 Propane (min 95% C3)', 'Commercial Propane', 'Propane-Butane Mix', 'Normal Butane (>95% nC4)', 'Isobutane (>95% iC4)', 'Natural Gasoline'],
  default:['Standard Grade', 'Premium Grade', 'Off-Spec (negotiated)'],
};

const PHYSICAL_TYPES = new Set(['CRUDE_PHYS','PHYS_FIXED','PHYS_INDEX','LNG_FOB','LNG_DES']);

function onSettlementChange() {
  const val = document.getElementById('tradeSettlement').value;
  const phys = document.getElementById('physicalFields');
  if (!phys) return;
  phys.style.display = val === 'PHYSICAL' ? 'block' : 'none';
  if (val === 'PHYSICAL') {
    // Populate quality dropdown based on current sector
    const sector = document.getElementById('tradeSector').value || 'default';
    const opts = QUALITY_OPTIONS[sector] || QUALITY_OPTIONS.default;
    const qSel = document.getElementById('tradeQuality');
    if (qSel) qSel.innerHTML = opts.map(o => `<option value="${o}">${o}</option>`).join('');
  }
}

function onTradeTypeChange() {
  const type = document.getElementById('tradeType').value;
  populateHubDropdown();

  // Auto-set settlement type based on trade type
  const settleEl = document.getElementById('tradeSettlement');
  if (settleEl) {
    settleEl.value = PHYSICAL_TYPES.has(type) ? 'PHYSICAL' : 'FINANCIAL';
    onSettlementChange();
  }

  // Show/hide conditional fields
  const condDiv = document.getElementById('conditionalFields');
  condDiv.style.display = 'none';
  condDiv.querySelectorAll('.form-group').forEach(fg => fg.style.display = 'none');
  condDiv.querySelectorAll('.cond-multileg').forEach(fg => fg.style.display = 'none');
  if (type !== 'MULTILEG') { const mr = document.getElementById('multilegRows'); if (mr) mr.innerHTML = ''; _multilegCount = 0; }

  const isSpreadType = ['SPREAD','CRUDE_DIFF','AG_SPREAD','METALS_SPREAD','NGL_SPREAD','LNG_SPREAD'].includes(type);
  const isBasisType = ['BASIS_SWAP','LNG_BASIS'].includes(type);
  if (isSpreadType) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-spread').forEach(fg => fg.style.display = 'flex');
    if (type === 'CRUDE_DIFF') condDiv.querySelectorAll('.cond-diff').forEach(fg => fg.style.display = 'flex');
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-option').forEach(fg => fg.style.display = 'flex');
  }
  if (isBasisType) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-basis').forEach(fg => fg.style.display = 'flex');
  }
  if (type === 'MULTILEG') {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-multileg').forEach(fg => fg.style.display = 'block');
    if (!document.querySelectorAll('#multilegRows .multileg-row').length) { addMultileg(); addMultileg(); }
  }
  // Update volume field for this specific trade type
  const sector = document.getElementById('tradeSector').value;
  updateVolumeField(sector, type);
  updateMarginPreview();
}

/* --- Multi-Leg builder --- */
let _multilegCount = 0;
function addMultileg() {
  _multilegCount++;
  const container = document.getElementById('multilegRows');
  if (!container) return;
  const sector = document.getElementById('tradeSector') ? document.getElementById('tradeSector').value : 'ng';
  const SECTOR_HUB_MAP = { ng: NG_HUBS, crude: CRUDE_HUBS, power: POWER_HUBS, freight: FREIGHT_HUBS, ag: AG_HUBS, metals: METALS_HUBS, ngls: NGL_HUBS, lng: LNG_HUBS };
  const hubs = SECTOR_HUB_MAP[sector] || NG_HUBS;
  const idx = _multilegCount;
  const row = document.createElement('div');
  row.className = 'multileg-row';
  row.dataset.idx = idx;
  row.style.cssText = 'display:grid;grid-template-columns:auto 1fr 80px 1fr auto;gap:6px;align-items:center;margin-bottom:6px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px';
  row.innerHTML = `<span style="font-size:11px;font-weight:700;color:var(--text-muted);min-width:32px">Leg ${container.children.length + 1}</span>`
    + `<select class="ml-hub" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:12px">${hubs.map(h => '<option value="' + h.name + '">' + h.name + '</option>').join('')}</select>`
    + `<select class="ml-dir" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:12px"><option value="BUY">BUY</option><option value="SELL">SELL</option></select>`
    + `<input type="month" class="ml-month" style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:4px 6px;color:var(--text);font-size:12px">`
    + `<button type="button" onclick="removeMultileg(this)" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;padding:2px 6px" title="Remove leg">&times;</button>`;
  container.appendChild(row);
  renumberMultilegs();
}
function removeMultileg(btn) {
  const row = btn.closest('.multileg-row');
  if (row) row.remove();
  renumberMultilegs();
}
function renumberMultilegs() {
  document.querySelectorAll('#multilegRows .multileg-row').forEach((row, i) => {
    const label = row.querySelector('span');
    if (label) label.textContent = 'Leg ' + (i + 1);
  });
}
function getMultilegs() {
  const legs = [];
  document.querySelectorAll('#multilegRows .multileg-row').forEach(row => {
    legs.push({
      hub: row.querySelector('.ml-hub').value,
      direction: row.querySelector('.ml-dir').value,
      deliveryMonth: row.querySelector('.ml-month').value
    });
  });
  return legs;
}

function setDirection(dir) {
  tradeDirection = dir;
  const buyBtn = document.getElementById('dirBuy');
  const sellBtn = document.getElementById('dirSell');
  const hint = document.getElementById('priceHint');
  if (dir === 'BUY') {
    buyBtn.style.background = 'var(--green)'; buyBtn.style.color = '#fff'; buyBtn.style.borderColor = 'var(--green)';
    sellBtn.style.background = 'var(--surface2)'; sellBtn.style.color = 'var(--text-dim)'; sellBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '(at or above spot for BUY)';
  } else if (dir === 'SELL') {
    sellBtn.style.background = 'var(--red)'; sellBtn.style.color = '#fff'; sellBtn.style.borderColor = 'var(--red)';
    buyBtn.style.background = 'var(--surface2)'; buyBtn.style.color = 'var(--text-dim)'; buyBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '(at or below spot for SELL)';
  } else {
    buyBtn.style.background = 'var(--surface2)'; buyBtn.style.color = 'var(--text-dim)'; buyBtn.style.borderColor = 'var(--border)';
    sellBtn.style.background = 'var(--surface2)'; sellBtn.style.color = 'var(--text-dim)'; sellBtn.style.borderColor = 'var(--border)';
    if(hint) hint.textContent = '';
  }
}

function calcMargin(t) {
  const vol = parseFloat(t.volume || 0);
  const type = t.type || '';
  const isCrude = type.startsWith('CRUDE') || type === 'EFP' || type === 'OPTION_CL';
  const isSpread = ['SPREAD','MULTILEG','CRUDE_DIFF','AG_SPREAD','METALS_SPREAD','NGL_SPREAD','LNG_SPREAD'].includes(type);
  const spreadDiscount = isSpread ? 0.4 : 1.0; // 60% margin reduction for spreads
  let margin;
  if (isCrude) margin = (vol / 1000) * 5000;
  else if (type === 'BASIS_SWAP' || type === 'LNG_BASIS') margin = (vol / 10000) * 800;
  else if (type === 'OPTION_NG') margin = (vol / 10000) * 1500 * 0.5;
  else if (type === 'OPTION_CL') margin = (vol / 1000) * 5000 * 0.5;
  else if (type.startsWith('FREIGHT')) margin = (vol / 1000) * 2000;
  else if (type.startsWith('NGL')) margin = (vol / 1000) * 1200;
  else if (type.startsWith('LNG')) margin = (vol / 10000) * 8000;
  else margin = (vol / 10000) * 1500;
  return margin * spreadDiscount;
}

function updateMarginPreview() {
  const type = document.getElementById('tradeType').value;
  const vol = parseFloat(document.getElementById('tradeVolume').value || 0);
  const mockTrade = { type, volume: vol };
  const reqMargin = calcMargin(mockTrade);

  const balance = STATE.settings.balance || 1000000;
  let realized = 0;
  STATE.trades.forEach(t => { if (t.status === 'CLOSED') realized += parseFloat(t.realizedPnl || 0); });
  const usedMargin = STATE.trades.filter(t=>t.status==='OPEN').reduce((s,t)=>s+calcMargin(t),0);
  const equity = balance + realized;
  const available = equity - usedMargin;

  document.getElementById('marginRequired').textContent = '$' + reqMargin.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('marginAvailable').textContent = '$' + available.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('marginAvailable').style.color = available > reqMargin ? 'var(--green)' : 'var(--red)';
  const util = equity > 0 ? (((usedMargin + reqMargin) / equity) * 100).toFixed(1) : '0.0';
  document.getElementById('marginUtil').textContent = util + '%';
}

// Listen for volume/type changes to update margin
document.getElementById('tradeVolume').addEventListener('input', updateMarginPreview);
document.getElementById('tradeHub').addEventListener('change', function() {
  const price = getPrice(this.value);
  document.getElementById('tradeSpot').value = price.toFixed(4);
  document.getElementById('tradeEntry').value = price.toFixed(4);
});

// Delivery month auto-fills entry price from forward curve
document.getElementById('tradeDelivery').addEventListener('change', function() {
  const hub = document.getElementById('tradeHub').value;
  if (!hub || !this.value) return;
  const fwd = STATE.forwardCurves[hub];
  if (!fwd || !fwd.length) return;
  const now = new Date();
  const target = new Date(this.value + '-01');
  const monthsAhead = (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth();
  if (monthsAhead >= 1 && monthsAhead <= fwd.length) {
    const fwdPrice = fwd[monthsAhead - 1].price;
    document.getElementById('tradeEntry').value = fwdPrice.toFixed(4);
    document.getElementById('tradeFormHint').textContent = 'Forward price for ' + target.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + ': $' + fwdPrice.toFixed(4);
  } else if (monthsAhead === 0) {
    const price = getPrice(hub);
    document.getElementById('tradeEntry').value = price.toFixed(4);
    document.getElementById('tradeFormHint').textContent = 'Prompt month (spot price)';
  }
});

async function submitTrade() {
  const type = document.getElementById('tradeType').value;
  const hub = document.getElementById('tradeHub').value;
  const volume = document.getElementById('tradeVolume').value;
  const orderType = document.getElementById('tradeOrderType').value;
  const tif = document.getElementById('tradeTIF').value;

  if (!type) return toast('Select a trade type', 'error');
  if (!tradeDirection) return toast('Select BUY or SELL', 'error');
  if (!hub) return toast('Select a hub', 'error');
  if (!volume || parseFloat(volume) <= 0) return toast('Enter a valid volume', 'error');

  // Get spot price — use historical price if backdating
  const backdateInput = document.getElementById('tradeBackdate');
  const isBackdating = STATE.trader && STATE.trader.privileged && STATE.settings.dateOverride && backdateInput && backdateInput.value;
  let spotPrice;
  if (isBackdating) {
    const displayedSpot = parseFloat(document.getElementById('tradeSpot').value);
    spotPrice = displayedSpot > 0 ? displayedSpot : getPrice(hub);
  } else {
    spotPrice = getPrice(hub);
  }
  const isBasisType = type === 'BASIS_SWAP';
  if (!isBasisType && (!spotPrice || spotPrice <= 0)) return toast('No market price available', 'error');
  const enteredPrice = parseFloat(document.getElementById('tradeEntry').value);
  const currentPrice = (enteredPrice && (isBasisType || enteredPrice > 0)) ? enteredPrice : spotPrice;

  // Order type specific validation
  const limitPrice = parseFloat(document.getElementById('tradeLimitPrice').value) || 0;
  const stopPrice = parseFloat(document.getElementById('tradeStopPrice').value) || 0;

  if (orderType === 'LIMIT' && !limitPrice) return toast('Limit price is required for limit orders', 'error');
  if (orderType === 'STOP' && !stopPrice) return toast('Stop trigger price is required for stop orders', 'error');
  if (orderType === 'STOP_LIMIT' && (!stopPrice || !limitPrice)) return toast('Both stop trigger and limit price required for stop-limit orders', 'error');

  // Validate limit price direction: LIMIT BUY should be below market, LIMIT SELL above
  if (orderType === 'LIMIT') {
    if (tradeDirection === 'BUY' && limitPrice >= spotPrice) return toast('Limit BUY price should be below current market ($' + spotPrice.toFixed(4) + ')', 'error');
    if (tradeDirection === 'SELL' && limitPrice <= spotPrice) return toast('Limit SELL price should be above current market ($' + spotPrice.toFixed(4) + ')', 'error');
  }
  if (orderType === 'STOP') {
    if (tradeDirection === 'BUY' && stopPrice <= spotPrice) return toast('Stop BUY trigger should be above current market', 'error');
    if (tradeDirection === 'SELL' && stopPrice >= spotPrice) return toast('Stop SELL trigger should be below current market', 'error');
  }

  // For MARKET orders, validate as before (backdated trades bypass)
  if (orderType === 'MARKET' && !isBackdating) {
    const isBasisTrade = type === 'BASIS_SWAP';
    if (!isBasisTrade && tradeDirection === 'BUY' && currentPrice < spotPrice) {
      return toast('BUY price must be at or above spot ($' + spotPrice.toFixed(4) + ')', 'error');
    }
    if (!isBasisTrade && tradeDirection === 'SELL' && currentPrice > spotPrice) {
      return toast('SELL price must be at or below spot ($' + spotPrice.toFixed(4) + ')', 'error');
    }
  }

  const trade = {
    type, direction: tradeDirection, hub,
    volume: parseFloat(volume), entryPrice: orderType === 'MARKET' ? currentPrice : (limitPrice || stopPrice || currentPrice),
    spotRef: spotPrice,
    sector: document.getElementById('tradeSector') ? document.getElementById('tradeSector').value : '',
    deliveryMonth: document.getElementById('tradeDelivery').value,
    counterparty: document.getElementById('tradeCpty').value,
    stopLoss: document.getElementById('tradeStop').value || null,
    targetExit: document.getElementById('tradeTarget').value || null,
    venue: document.getElementById('tradeVenue').value,
    notes: document.getElementById('tradeNotes').value,
    orderType: orderType,
    tif: tif,
    limitPrice: limitPrice || null,
    stopPrice: stopPrice || null,
    status: 'OPEN',
    timestamp: new Date().toISOString(),
    // Blotter accuracy fields
    confirmRef: genConfirmRef(),
    broker: document.getElementById('tradeBroker')?.value || '',
    settlementType: document.getElementById('tradeSettlement')?.value || 'FINANCIAL',
    commission: parseFloat(document.getElementById('tradeCommission')?.value) || 0,
    deliveryLoc: document.getElementById('tradeDelivLoc')?.value || '',
    quality: document.getElementById('tradeQuality')?.value || '',
    incoterms: document.getElementById('tradeIncoterms')?.value || '',
  };

  // Market hours check for exchange trades (privileged traders bypass)
  const venue = trade.venue;
  const isExchange = venue && venue !== 'OTC';
  const isPrivileged = STATE.trader && STATE.trader.privileged;
  if (isExchange && !MARKET_OPEN && !isPrivileged) {
    return toast('Exchange is closed (' + MARKET_REASON + '). Use OTC or wait for market open.', 'error');
  }

  // Backdate for privileged traders
  const backdateInput2 = document.getElementById('tradeBackdate');
  if (isPrivileged && backdateInput2 && backdateInput2.value) {
    trade.backdate = backdateInput2.value;
  }

  // OTC bilateral routing
  const cptyTrader = document.getElementById('tradeCpty').value;
  const isOtcBilateral = cptyTrader && cptyTrader.length > 0;

  // Conditional fields — spread legs
  if (['SPREAD','CRUDE_DIFF','AG_SPREAD','METALS_SPREAD','NGL_SPREAD','LNG_SPREAD'].includes(type)) {
    trade.nearMonth = document.getElementById('tradeNearMonth').value;
    trade.farMonth = document.getElementById('tradeFarMonth').value;
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    trade.strike = document.getElementById('tradeStrike').value;
    trade.expiry = document.getElementById('tradeExpiry').value;
    trade.callPut = document.getElementById('tradeCallPut').value;
    trade.premium = document.getElementById('tradePremium').value;
  }
  if (['BASIS_SWAP','LNG_BASIS'].includes(type)) {
    trade.basisHub = document.getElementById('tradeBasisHub').value;
  }
  if (type === 'MULTILEG') {
    const legs = getMultilegs();
    if (legs.length < 2) return toast('Multi-leg trade requires at least 2 legs', 'error');
    trade.legs = legs;
  }

  // NON-MARKET orders → queue as pending
  if (orderType !== 'MARKET') {
    const pendingOrder = {
      ...trade,
      _pendingId: 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    STATE.pendingOrders.push(pendingOrder);
    localStorage.setItem(traderStorageKey('pending_orders'), JSON.stringify(STATE.pendingOrders));
    // Persist to server (non-blocking) so order survives page refresh
    if (STATE.connected && STATE.trader) {
      fetch(API_BASE + '/api/pending-orders/' + STATE.trader.trader_name, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pendingOrder)
      }).then(r => r.json()).then(d => {
        if (d.success && d.id) {
          // Tag with server ID for later cancellation
          const o = STATE.pendingOrders.find(x => x._pendingId === pendingOrder._pendingId);
          if (o) { o._serverId = d.id; localStorage.setItem(traderStorageKey('pending_orders'), JSON.stringify(STATE.pendingOrders)); }
        }
      }).catch(() => {});
    }
    playSound('trade');
    const triggerLabel = orderType === 'LIMIT' ? `limit $${limitPrice.toFixed(3)}` : orderType === 'STOP' ? `stop $${stopPrice.toFixed(3)}` : `stop $${stopPrice.toFixed(3)} / limit $${limitPrice.toFixed(3)}`;
    toast(`${orderType} order placed: ${tradeDirection} ${volume} ${hub} (${triggerLabel}, ${tif})`, 'success');
    resetTradeForm();
    renderBlotterPage();
    return;
  }

  // MARKET order → immediate execution
  trade.entryPrice = currentPrice;

  // OTC bilateral → send proposal instead of auto-executing
  if (isOtcBilateral && STATE.connected && STATE.trader) {
    try {
      const url = API_BASE + '/api/trades/otc/' + STATE.trader.trader_name;
      const body = JSON.stringify({...trade, counterparty: cptyTrader, proposalMessage: ''});
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const d = await r.json();
      if (!d.success) { toast(d.error || 'OTC proposal rejected', 'error'); return; }
      const cptyInfo = OTC_COUNTERPARTIES.find(c=>c.trader_name===cptyTrader);
      toast('OTC proposal sent to ' + (cptyInfo?cptyInfo.display_name:cptyTrader) + '. Waiting for acceptance.', 'success');
      playSound('trade');
      resetTradeForm();
      renderBlotterPage();
      return;
    } catch(e) { toast('Failed to send OTC proposal', 'error'); return; }
  }

  // Exchange/non-OTC → direct submission
  if (STATE.connected && STATE.trader) {
    try {
      const url = API_BASE + '/api/trades/' + STATE.trader.trader_name;
      const body = JSON.stringify(trade);
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      const d = await r.json();
      if (!d.success) { toast(d.error || 'Trade rejected by server', 'error'); return; }
      trade.id = d.trade_id;
    } catch { /* fallback to local */ }
  }

  // Store locally
  if (!trade.id) trade.id = Date.now();
  STATE.trades.unshift(trade);
  localStorage.setItem(traderStorageKey('trades'), JSON.stringify(STATE.trades));

  playSound('trade');
  toast('Trade submitted: ' + tradeDirection + ' ' + volume + ' ' + hub, 'success');
  resetTradeForm();
  renderBlotterPage();
}

function resetTradeForm() {
  document.getElementById('tradeSector').value = '';
  document.getElementById('tradeType').innerHTML = '<option value="">Select sector first...</option>';
  document.getElementById('tradeType').value = '';
  document.getElementById('tradeVenue').innerHTML = '<option value="OTC">OTC Bilateral</option>';
  document.getElementById('tradeVolume').value = '';
  updateVolumeField(''); // Reset volume label/placeholder to default
  document.getElementById('tradeEntry').value = '';
  document.getElementById('tradeCpty').value = '';
  const cptyHint = document.getElementById('cptyHint');
  if (cptyHint) cptyHint.textContent = '';
  document.getElementById('tradeNotes').value = '';
  document.getElementById('tradeStop').value = '';
  document.getElementById('tradeTarget').value = '';
  document.getElementById('tradeLimitPrice').value = '';
  document.getElementById('tradeStopPrice').value = '';
  document.getElementById('tradeOrderType').value = 'MARKET';
  document.getElementById('tradeTIF').value = 'DAY';
  document.getElementById('tradeFormHint').textContent = '';
  const bdInput = document.getElementById('tradeBackdate');
  if (bdInput) bdInput.value = '';
  // Clear multileg builder
  const mlRows = document.getElementById('multilegRows');
  if (mlRows) mlRows.innerHTML = '';
  _multilegCount = 0;
  const mlBuilder = document.getElementById('multilegBuilder');
  if (mlBuilder) mlBuilder.style.display = 'none';
  onOrderTypeChange();
  tradeDirection = '';
  setDirection('');
  document.getElementById('dirBuy').style.background = 'var(--surface2)';
  document.getElementById('dirBuy').style.color = 'var(--text-dim)';
  document.getElementById('dirBuy').style.borderColor = 'var(--border)';
  document.getElementById('dirSell').style.background = 'var(--surface2)';
  document.getElementById('dirSell').style.color = 'var(--text-dim)';
  document.getElementById('dirSell').style.borderColor = 'var(--border)';
}

function onBackdateChange() {
  const bdInput = document.getElementById('tradeBackdate');
  const hub = document.getElementById('tradeHub').value;
  const spotEl = document.getElementById('tradeSpot');
  const entryEl = document.getElementById('tradeEntry');
  const badgeEl = document.getElementById('tradeSpotBadge');
  const hintEl = document.getElementById('tradeFormHint');
  if (!bdInput || !bdInput.value || !hub) {
    // Reset to live price
    if (hub && spotEl) spotEl.value = getPrice(hub).toFixed(4);
    if (badgeEl) { badgeEl.textContent = 'LIVE'; badgeEl.style.color = '#10b981'; badgeEl.style.background = 'rgba(16,185,129,0.15)'; badgeEl.style.border = '1px solid rgba(16,185,129,0.3)'; }
    if (hintEl) hintEl.textContent = '';
    return;
  }
  // Look up historical price for the selected date
  const targetDate = new Date(bdInput.value);
  const daily = typeof _historicalDaily !== 'undefined' ? _historicalDaily[hub] : null;
  if (daily && daily.length > 0) {
    const now = new Date();
    const diffMs = now.getTime() - targetDate.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    const tradingDays = Math.round(diffDays * 5 / 7);
    const idx = daily.length - 1 - tradingDays;
    if (idx >= 0 && idx < daily.length) {
      const histPrice = daily[idx].toFixed(4);
      spotEl.value = histPrice;
      if (entryEl) entryEl.value = histPrice;
      if (badgeEl) { badgeEl.textContent = 'HIST'; badgeEl.style.color = 'var(--amber)'; badgeEl.style.background = 'rgba(245,158,11,0.1)'; badgeEl.style.border = '1px solid rgba(245,158,11,0.3)'; }
      if (hintEl) hintEl.textContent = 'Entry price set to historical close for ' + bdInput.value;
      return;
    }
  }
  // Fallback: estimate from current price with random walk backwards
  const current = getPrice(hub);
  const hubObj = typeof findHub === 'function' ? findHub(hub) : null;
  const vol = hubObj ? hubObj.vol : 0.002;
  const daysDiff = Math.round((new Date().getTime() - targetDate.getTime()) / 86400000);
  const drift = (Math.random() - 0.5) * vol * Math.sqrt(daysDiff) * current;
  const estimated = Math.max(current * 0.7, current - drift);
  const estPrice = estimated.toFixed(4);
  spotEl.value = estPrice;
  if (entryEl) entryEl.value = estPrice;
  if (badgeEl) { badgeEl.textContent = 'EST'; badgeEl.style.color = '#94a3b8'; badgeEl.style.background = 'rgba(148,163,184,0.1)'; badgeEl.style.border = '1px solid rgba(148,163,184,0.2)'; }
  if (hintEl) hintEl.textContent = 'Entry price estimated for ' + bdInput.value;
}

function toggleBlotterHelp() {
  const panel = document.getElementById('blotterHelpPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
