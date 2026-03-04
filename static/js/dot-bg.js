/**
 * Animated dot-matrix background canvas.
 * Usage: place <canvas id="dotBgCanvas"></canvas> as first child of body or a container.
 * Call initDotBg(options) after DOM ready.
 *
 * Options:
 *   colors     - array of [r,g,b] arrays (0-255), default from CSS --accent
 *   totalSize  - grid cell size in px (default 20)
 *   dotSize    - dot size in px (default 4)
 *   opacity    - base max opacity multiplier (default 0.12)
 *   speed      - animation speed multiplier (default 0.5)
 *   canvasId   - canvas element id (default 'dotBgCanvas')
 */
function initDotBg(opts) {
  opts = opts || {};
  var canvasId = opts.canvasId || 'dotBgCanvas';
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var totalSize = opts.totalSize || 20;
  var dotSize = opts.dotSize || 4;
  var baseOpacity = opts.opacity || 0.12;
  var speed = opts.speed || 0.5;
  var dots = [];
  var animStart = performance.now();
  var animId;
  var isVisible = true;

  // Default colors: parse from CSS --accent or use gold fallback
  var colors = opts.colors;
  if (!colors) {
    var cs = getComputedStyle(document.documentElement);
    var accent = cs.getPropertyValue('--accent').trim();
    if (accent) {
      var parsed = parseColor(accent);
      if (parsed) {
        colors = [parsed, darken(parsed, 0.6), darken(parsed, 0.3)];
      }
    }
    if (!colors) {
      colors = [[212, 160, 83], [170, 128, 66], [140, 105, 55]];
    }
  }

  function parseColor(str) {
    if (str.charAt(0) === '#') {
      var hex = str.slice(1);
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
    }
    var m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }

  function darken(c, factor) {
    return [Math.round(c[0]*factor), Math.round(c[1]*factor), Math.round(c[2]*factor)];
  }

  function pseudoRandom(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
    buildDots();
  }

  function buildDots() {
    dots = [];
    var w = window.innerWidth;
    var h = window.innerHeight;
    var cols = Math.ceil(w / totalSize);
    var rows = Math.ceil(h / totalSize);
    var cx = cols / 2, cy = rows / 2;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        var rnd = pseudoRandom(c, r);
        dots.push({
          x: c * totalSize,
          y: r * totalSize,
          delay: dist * 0.012 + rnd * 0.2,
          baseAlpha: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.5, 0.6, 0.4, 0.35][Math.floor(rnd * 10)],
          colorIdx: Math.floor(pseudoRandom(c + 42, r + 17) * colors.length)
        });
      }
    }
  }

  function draw() {
    if (!isVisible) return;
    var elapsed = (performance.now() - animStart) / 1000;
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      var t = elapsed * speed - d.delay;
      if (t < 0) continue;
      var fade = Math.min(1, t * 2);
      var flicker = 0.6 + 0.4 * Math.sin(elapsed * 1.5 + d.delay * 8);
      var alpha = d.baseAlpha * baseOpacity * fade * flicker;
      var c = colors[d.colorIdx];
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
      ctx.fillRect(d.x, d.y, dotSize, dotSize);
    }

    animId = requestAnimationFrame(draw);
  }

  // Pause when tab is hidden
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      isVisible = false;
      cancelAnimationFrame(animId);
    } else {
      isVisible = true;
      animStart = performance.now();
      draw();
    }
  });

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      resize();
    }, 150);
  });

  resize();
  draw();
}
