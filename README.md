# Slot Floor Review (Dashboard Royale)

Dashboard and code for the TAMU Datathon "Dashboard Royale" challenge: should The Gilded Ace replace its 10 lowest-earning slot machines? The casino and its data are fictional and synthetic.

## Links
- **Dashboard (public):** https://ghodkeadityarao-tamu.github.io/gilded-ace-dashboard/
- **Code repository:** https://github.com/ghodkeadityarao-tamu/gilded-ace-dashboard
- **Video:** [paste YouTube link]

## Open the dashboard
- **Link:** open the dashboard link above. Test it in a private browser window.
- **Or the file:** open `index.html` in any modern browser (Chrome, Edge, Firefox or Safari). Nothing to install. It needs an internet connection to load the chart library and fonts.
- **Or serve it locally:** in this folder run `python3 -m http.server 8000`, then open http://localhost:8000/index.html

Nothing runs on a server: the page is one static file with the numbers already built in.

## Files
| File | Purpose |
|---|---|
| `index.html` | The finished dashboard (single file, data included) |
| `dashboard_source/index.html`, `dashboard_source/app.js` | Readable source of the dashboard page |
| `build_data.py` | Reads the challenge data, fits both models, writes the numbers the dashboard uses |
| `make_standalone.py` | Packs the page and its data into one HTML file |
| `make_appendix.py` | Writes the Claims & Evidence appendix from `results.json` |
| `results.json` | Every headline number, as produced by `build_data.py` |
| `requirements.txt` | Python packages (Python 3.11 or newer) |

## Data
The challenge tables are not included. Get them from the challenge repository (https://github.com/tamu-datathon-org/dashboard-royale). Some of its source tables have unresolved redistribution terms, so they are deliberately not republished here.

## Rebuild the numbers (optional)
1. Clone the challenge repository.
2. In that clone, create `submission/code/` and copy `build_data.py`, `make_standalone.py`, `make_appendix.py` and `results.json` into it. Copy `requirements.txt` to `submission/requirements.txt`, and the two files in `dashboard_source/` to `submission/dashboard/`.
3. From the clone's root:
```
python -m venv .venv && .venv/bin/pip install -r submission/requirements.txt
.venv/bin/python submission/code/build_data.py
.venv/bin/python submission/code/make_standalone.py
.venv/bin/python submission/code/make_appendix.py
```
The page is rebuilt at `submission/dashboard/dashboard-royale.html`.

## AI use
Claude (Anthropic) assisted with the code and drafting. The full disclosure is in the appendix PDF submitted on Devpost.
