# static/

Everything the browser loads. Flask serves this folder directly — any file here is accessible via its path (e.g., `/styles.css`, `/js/state.js`).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main single-page app — traders use this for everything (trading, charts, positions, leaderboard, chat) |
| `admin.html` | Admin dashboard — standalone page with all JS/CSS inline, no shared dependencies |
| `styles.css` | Global stylesheet for `index.html` — dark theme, responsive layout, all component styles |
| `manifest.json` | PWA manifest for mobile install support |
| `icon.svg` | App icon used by the PWA manifest |

## Subdirectories

- `js/` — All JavaScript modules (see [js/README.md](js/README.md))
- `js/maps/` — SVG map data and rendering (see [js/maps/README.md](js/maps/README.md))
