# Slot Floor Review (Dashboard Royale)

Interactive dashboard for the TAMU Datathon "Dashboard Royale" challenge: should The Gilded Ace replace its 10 lowest-earning slot machines? The casino and its data are fictional and synthetic.

**Live dashboard:** open `index.html` in a browser, or use the GitHub Pages link for this repository. It needs internet to load Chart.js and fonts. Nothing else is required, and nothing runs on a server.

## What is in this repository
| File | Purpose |
|---|---|
| `index.html` | The dashboard (single self-contained file, data included) |
| `code/build_data.py` | Reads the challenge data, fits both models, writes the numbers the dashboard uses |
| `code/make_standalone.py` | Packs the page and its data into one HTML file |
| `code/make_appendix.py` | Writes the Claims & Evidence appendix from `code/results.json` (the appendix itself is submitted on Devpost) |
| `code/results.json` | Every headline number, as produced by `build_data.py` |
| `requirements.txt` | Python packages (Python 3.11 or newer) |

## Data
The challenge tables are not included here. Get them from the challenge repository (https://github.com/tamu-datathon-org/dashboard-royale). Some of its source tables have unresolved redistribution terms, so they are deliberately not republished.

## Rebuild the numbers (optional)
1. Clone the challenge repository.
2. Copy this repository's `code/` folder to `submission/code/` inside that clone, and `requirements.txt` to `submission/requirements.txt`.
3. From the clone's root:
```
python -m venv .venv && .venv/bin/pip install -r submission/requirements.txt
.venv/bin/python submission/code/build_data.py
.venv/bin/python submission/code/make_standalone.py
.venv/bin/python submission/code/make_appendix.py
```
The page is rebuilt at `submission/dashboard/dashboard-royale.html`.

## AI use
Claude (Anthropic) assisted with the code and drafting. The full disclosure is in the appendix submitted on Devpost.
