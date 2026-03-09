/* =====================================================================
   CustomSelect — shadcn/jolly-ui style dropdown for vanilla JS
   Converts native <select> elements into styled custom dropdowns.
   ===================================================================== */

(function () {
  'use strict';

  const CHEVRON_SVG = '<svg class="cs-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const CHECK_SVG  = '<svg class="cs-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  const SEARCH_THRESHOLD = 8; // show search input when >= N options

  // Track all instances for cleanup
  const instances = new Map();

  /** Upgrade a native <select> to a custom styled dropdown */
  function create(selectEl, opts) {
    if (!selectEl || selectEl.tagName !== 'SELECT') return null;

    // Already upgraded? Refresh instead.
    if (instances.has(selectEl)) {
      refresh(selectEl);
      return instances.get(selectEl);
    }

    opts = Object.assign({ size: '', searchable: null }, opts || {});

    // Build wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'cs-wrapper' + (opts.size ? ' cs-' + opts.size : '');

    // Build trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    if (selectEl.id) trigger.setAttribute('aria-controls', selectEl.id + '-listbox');

    const valueSpan = document.createElement('span');
    valueSpan.className = 'cs-value';
    trigger.appendChild(valueSpan);
    trigger.insertAdjacentHTML('beforeend', CHEVRON_SVG);

    // Transfer inline width from select to wrapper
    if (selectEl.style.width) {
      wrapper.style.width = selectEl.style.width;
    }

    // Insert wrapper, hide original
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    wrapper.appendChild(trigger);
    selectEl.classList.add('cs-hidden');

    // State
    const state = {
      open: false,
      popover: null,
      focusIdx: -1,
      items: [],
      searchInput: null,
    };

    const inst = { selectEl, wrapper, trigger, valueSpan, state, opts };
    instances.set(selectEl, inst);

    // Set initial display value
    syncValue(inst);

    // Event: click trigger
    trigger.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (selectEl.disabled) return;
      state.open ? close(inst) : open(inst);
    });

    // Event: keyboard on trigger
    trigger.addEventListener('keydown', function (e) {
      handleTriggerKey(e, inst);
    });

    return inst;
  }

  /** Sync displayed value from the native select */
  function syncValue(inst) {
    const sel = inst.selectEl;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || opt.value === '' || opt.disabled) {
      inst.valueSpan.textContent = opt ? opt.textContent : '';
      inst.valueSpan.classList.add('cs-placeholder');
    } else {
      inst.valueSpan.textContent = opt.textContent;
      inst.valueSpan.classList.remove('cs-placeholder');
    }
  }

  /** Open the dropdown popover */
  function open(inst) {
    if (inst.state.open) return;
    // Close any other open instance first
    instances.forEach(function (other) {
      if (other !== inst && other.state.open) close(other);
    });

    inst.state.open = true;
    inst.trigger.classList.add('cs-open');
    inst.trigger.setAttribute('aria-expanded', 'true');

    const popover = document.createElement('div');
    popover.className = 'cs-popover';
    popover.setAttribute('role', 'listbox');
    if (inst.selectEl.id) popover.id = inst.selectEl.id + '-listbox';

    const options = inst.selectEl.options;
    const showSearch = inst.opts.searchable === true ||
      (inst.opts.searchable !== false && options.length >= SEARCH_THRESHOLD);

    if (showSearch) {
      const search = document.createElement('input');
      search.className = 'cs-search';
      search.placeholder = 'Search...';
      search.setAttribute('autocomplete', 'off');
      search.addEventListener('input', function () {
        filterItems(inst, search.value);
      });
      search.addEventListener('keydown', function (e) {
        handleListKey(e, inst);
      });
      popover.appendChild(search);
      inst.state.searchInput = search;
    } else {
      inst.state.searchInput = null;
    }

    // Build items
    inst.state.items = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      // Skip disabled placeholder options
      if (opt.value === '' && i === 0) continue;
      const item = buildItem(opt, inst);
      popover.appendChild(item);
      inst.state.items.push({ el: item, value: opt.value, text: opt.textContent, optIndex: i });
    }

    inst.state.popover = popover;
    inst.wrapper.appendChild(popover);

    // Focus search or popover
    if (inst.state.searchInput) {
      inst.state.searchInput.focus();
    } else {
      popover.tabIndex = -1;
      popover.focus();
    }

    // Set initial focus on selected item
    const selIdx = inst.state.items.findIndex(function (it) {
      return it.value === inst.selectEl.value;
    });
    inst.state.focusIdx = selIdx >= 0 ? selIdx : 0;
    updateFocus(inst);

    // Popover keyboard
    popover.addEventListener('keydown', function (e) {
      handleListKey(e, inst);
    });

    // Close on outside click (next tick)
    requestAnimationFrame(function () {
      document.addEventListener('mousedown', inst._outsideClick = function (e) {
        if (!inst.wrapper.contains(e.target)) close(inst);
      });
    });
  }

  /** Close the dropdown popover */
  function close(inst) {
    if (!inst.state.open) return;
    inst.state.open = false;
    inst.trigger.classList.remove('cs-open');
    inst.trigger.setAttribute('aria-expanded', 'false');
    if (inst.state.popover && inst.state.popover.parentNode) {
      inst.state.popover.parentNode.removeChild(inst.state.popover);
    }
    inst.state.popover = null;
    inst.state.items = [];
    inst.state.focusIdx = -1;
    inst.state.searchInput = null;
    if (inst._outsideClick) {
      document.removeEventListener('mousedown', inst._outsideClick);
      inst._outsideClick = null;
    }
    inst.trigger.focus();
  }

  /** Build a single option item element */
  function buildItem(opt, inst) {
    const item = document.createElement('div');
    item.className = 'cs-item';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
    item.setAttribute('data-value', opt.value);
    item.innerHTML = CHECK_SVG + '<span>' + escHtml(opt.textContent) + '</span>';

    item.addEventListener('mouseenter', function () {
      const idx = inst.state.items.findIndex(function (it) { return it.el === item; });
      inst.state.focusIdx = idx;
      updateFocus(inst);
    });

    item.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      selectItem(inst, opt.value);
    });

    return item;
  }

  /** Select a value, update native select, fire change event */
  function selectItem(inst, value) {
    inst.selectEl.value = value;
    syncValue(inst);
    close(inst);

    // Fire native change event
    const evt = new Event('change', { bubbles: true });
    inst.selectEl.dispatchEvent(evt);

    // Also call inline onchange if present
    if (typeof inst.selectEl.onchange === 'function') {
      inst.selectEl.onchange(evt);
    }
  }

  /** Filter items by search text */
  function filterItems(inst, query) {
    const q = query.toLowerCase().trim();
    let visibleCount = 0;
    inst.state.items.forEach(function (item) {
      const match = !q || item.text.toLowerCase().indexOf(q) !== -1;
      item.el.style.display = match ? '' : 'none';
      if (match) visibleCount++;
    });

    // Remove old empty message
    const pop = inst.state.popover;
    const oldEmpty = pop.querySelector('.cs-empty');
    if (oldEmpty) oldEmpty.remove();

    if (visibleCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'cs-empty';
      empty.textContent = 'No results';
      pop.appendChild(empty);
    }

    // Reset focus
    const visible = inst.state.items.filter(function (it) { return it.el.style.display !== 'none'; });
    inst.state.focusIdx = visible.length > 0 ? inst.state.items.indexOf(visible[0]) : -1;
    updateFocus(inst);
  }

  /** Update visual focus indicator */
  function updateFocus(inst) {
    inst.state.items.forEach(function (item, i) {
      if (i === inst.state.focusIdx) {
        item.el.classList.add('cs-focused');
        item.el.scrollIntoView({ block: 'nearest' });
      } else {
        item.el.classList.remove('cs-focused');
      }
    });
  }

  /** Handle keyboard on trigger */
  function handleTriggerKey(e, inst) {
    switch (e.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (!inst.state.open) open(inst);
        break;
      case 'Escape':
        if (inst.state.open) { e.preventDefault(); close(inst); }
        break;
    }
  }

  /** Handle keyboard inside the open listbox */
  function handleListKey(e, inst) {
    const visible = inst.state.items.filter(function (it) { return it.el.style.display !== 'none'; });
    if (!visible.length && e.key !== 'Escape') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveNextVisible(inst, 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveNextVisible(inst, -1);
        break;
      case 'Home':
        e.preventDefault();
        inst.state.focusIdx = inst.state.items.indexOf(visible[0]);
        updateFocus(inst);
        break;
      case 'End':
        e.preventDefault();
        inst.state.focusIdx = inst.state.items.indexOf(visible[visible.length - 1]);
        updateFocus(inst);
        break;
      case 'Enter':
        e.preventDefault();
        if (inst.state.focusIdx >= 0 && inst.state.items[inst.state.focusIdx]) {
          selectItem(inst, inst.state.items[inst.state.focusIdx].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close(inst);
        break;
      case 'Tab':
        close(inst);
        break;
    }
  }

  /** Move focus to next/prev visible item */
  function moveNextVisible(inst, dir) {
    const visible = inst.state.items.filter(function (it) { return it.el.style.display !== 'none'; });
    if (!visible.length) return;
    const curVisIdx = visible.findIndex(function (it) { return inst.state.items.indexOf(it) === inst.state.focusIdx; });
    let next = curVisIdx + dir;
    if (next < 0) next = visible.length - 1;
    if (next >= visible.length) next = 0;
    inst.state.focusIdx = inst.state.items.indexOf(visible[next]);
    updateFocus(inst);
  }

  /** Refresh items when native select options change dynamically */
  function refresh(selectEl) {
    const inst = instances.get(selectEl);
    if (!inst) return;
    syncValue(inst);
    // If open, rebuild the popover
    if (inst.state.open) {
      close(inst);
      open(inst);
    }
  }

  /** Destroy and revert to native select */
  function destroy(selectEl) {
    const inst = instances.get(selectEl);
    if (!inst) return;
    if (inst.state.open) close(inst);
    selectEl.classList.remove('cs-hidden');
    if (inst.trigger.parentNode) inst.trigger.parentNode.removeChild(inst.trigger);
    // Move select out of wrapper
    if (inst.wrapper.parentNode) {
      inst.wrapper.parentNode.insertBefore(selectEl, inst.wrapper);
      inst.wrapper.parentNode.removeChild(inst.wrapper);
    }
    instances.delete(selectEl);
  }

  /** Upgrade all selects matching a CSS selector */
  function upgradeAll(selector, opts) {
    document.querySelectorAll(selector || 'select').forEach(function (sel) {
      create(sel, opts);
    });
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Public API
  window.CustomSelect = {
    create: create,
    refresh: refresh,
    destroy: destroy,
    upgradeAll: upgradeAll,
  };
})();
