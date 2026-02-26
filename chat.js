/* =====================================================================
   RENDER FUNCTIONS — TRADE BLOTTER
   ===================================================================== */
let tradeDirection = '';
let blotterPage = 0;
const BLOTTER_PAGE_SIZE = 10;

function renderBlotterPage() {
  updateAccountBar();
  populateHubDropdown();
  updateMarginPreview();
  renderBlotterTable();
  renderNetPositions();
  drawPnlChart();
  try { initPnlCrosshair(); } catch(e) {}

  // Pre-fill entry price if clicked from chart
  if (STATE.clickedPrice !== null) {
    document.getElementById('tradeEntry').value = STATE.clickedPrice;
    document.getElementById('tradeFormHint').textContent = 'Entry price captured from chart: ' + STATE.clickedPrice;
    STATE.clickedPrice = null;
  }

  // Update spot ref
  const hub = document.getElementById('tradeHub').value;
  if (hub) document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
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

  // Also populate basis hub dropdown
  const basisSel = document.getElementById('tradeBasisHub');
  if (basisSel) basisSel.innerHTML = NG_HUBS.map(h => `<option value="${h.name}">${h.name}</option>`).join('');

  // Update spot reference
  const hub = sel.value;
  if (hub) document.getElementById('tradeSpot').value = getPrice(hub).toFixed(4);
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
}

function onTradeTypeChange() {
  const type = document.getElementById('tradeType').value;
  populateHubDropdown();

  // Show/hide conditional fields
  const condDiv = document.getElementById('conditionalFields');
  condDiv.style.display = 'none';
  condDiv.querySelectorAll('.form-group').forEach(fg => fg.style.display = 'none');

  if (['SPREAD','CRUDE_DIFF'].includes(type)) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-spread').forEach(fg => fg.style.display = 'flex');
    if (type === 'CRUDE_DIFF') condDiv.querySelectorAll('.cond-diff').forEach(fg => fg.style.display = 'flex');
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-option').forEach(fg => fg.style.display = 'flex');
  }
  if (type === 'BASIS_SWAP') {
    condDiv.style.display = 'block';
    condDiv.querySelectorAll('.cond-basis').forEach(fg => fg.style.display = 'flex');
  }
  updateMarginPreview();
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
  const isSpread = ['SPREAD', 'MULTILEG', 'CRUDE_DIFF'].includes(type);
  const spreadDiscount = isSpread ? 0.4 : 1.0; // 60% margin reduction for spreads
  let margin;
  if (isCrude) margin = (vol / 1000) * 5000;
  else if (type === 'BASIS_SWAP') margin = (vol / 10000) * 800;
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

  // Get spot price and validate entry price
  const spotPrice = getPrice(hub);
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

  // For MARKET orders, validate as before
  if (orderType === 'MARKET') {
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
    timestamp: new Date().toISOString()
  };

  // Market hours check for exchange trades
  const venue = trade.venue;
  const isExchange = venue && venue !== 'OTC';
  if (isExchange && !MARKET_OPEN) {
    return toast('Exchange is closed (' + MARKET_REASON + '). Use OTC or wait for market open.', 'error');
  }

  // OTC bilateral routing
  const cptyTrader = document.getElementById('tradeCpty').value;
  const isOtcBilateral = cptyTrader && cptyTrader.length > 0;

  // Conditional fields
  if (['SPREAD','CRUDE_DIFF'].includes(type)) {
    trade.nearMonth = document.getElementById('tradeNearMonth').value;
    trade.farMonth = document.getElementById('tradeFarMonth').value;
  }
  if (['OPTION_NG','OPTION_CL'].includes(type)) {
    trade.strike = document.getElementById('tradeStrike').value;
    trade.expiry = document.getElementById('tradeExpiry').value;
    trade.callPut = document.getElementById('tradeCallPut').value;
    trade.premium = document.getElementById('tradePremium').value;
  }
  if (type === 'BASIS_SWAP') {
    trade.basisHub = document.getElementById('tradeBasisHub').value;
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
    playSound('trade');
    const triggerLabel = orderType === 'LIMIT' ? `limit $${limitPrice.toFixed(3)}` : orderType === 'STOP' ? `stop $${stopPrice.toFixed(3)}` : `stop $${stopPrice.toFixed(3)} / limit $${limitPrice.toFixed(3)}`;
    toast(`${orderType} order placed: ${tradeDirection} ${volume} ${hub} (${triggerLabel}, ${tif})`, 'success');
    resetTradeForm();
    renderBlotterPage();
    return;
  }

  // MARKET order → immediate execution
  trade.entryPrice = currentPrice;

  // Try server submission
  if (STATE.connected && STATE.trader) {
    try {
      let url, body;
      if (isOtcBilateral) {
        url = API_BASE + '/api/trades/otc/' + STATE.trader.trader_name;
        body = JSON.stringify({...trade, counterparty: cptyTrader});
      } else {
        url = API_BASE + '/api/trades/' + STATE.trader.trader_name;
        body = JSON.stringify(trade);
      }
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      const d = await r.json();
      if (!d.success) { toast(d.error || 'Trade rejected by server', 'error'); return; }
      trade.id = d.trade_id;
      if (isOtcBilateral) {
        const cptyInfo = OTC_COUNTERPARTIES.find(c=>c.trader_name===cptyTrader);
        toast('OTC trade executed with ' + (cptyInfo?cptyInfo.display_name:cptyTrader) + '. Mirror position created.', 'success');
      }
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
  document.getElementById('tradeEntry').value = '';
  document.getElementById('tradeCpty').value = '';
  document.getElementById('tradeNotes').value = '';
  document.getElementById('tradeStop').value = '';
  document.getElementById('tradeTarget').value = '';
  document.getElementById('tradeLimitPrice').value = '';
  document.getElementById('tradeStopPrice').value = '';
  document.getElementById('tradeOrderType').value = 'MARKET';
  document.getElementById('tradeTIF').value = 'DAY';
  document.getElementById('tradeFormHint').textContent = '';
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

