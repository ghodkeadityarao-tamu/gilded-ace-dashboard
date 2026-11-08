# Submission: Slot Floor Review (Dashboard Royale)

## Open the dashboard
- **Single file:** open `dashboard/dashboard-royale.html` in any modern browser. It needs internet to load Chart.js and fonts. No other software.
- **Or serve it:** `cd dashboard && python3 -m http.server 8000`, then open http://localhost:8000/index.html

## Files
- `WRITEUP.md`: the write-up (under 400 words)
- `APPENDIX.md`: Claims & Evidence table, priced actions, AI-use disclosure
- `VIDEO_SCRIPT.md`: script for the 2-minute walkthrough
- `code/build_data.py`: reads `data/*.parquet`; fits both models; writes `dashboard/data.js` and `code/results.json`
- `code/make_standalone.py`: inlines everything into `dashboard-royale.html`
- `code/make_appendix.py`: writes `APPENDIX.md` from `results.json`
- `dashboard/index.html`, `dashboard/app.js`: the dashboard source
- `requirements.txt`: Python packages (Python 3.11+)

## Rebuild
```
python -m venv .venv && .venv/bin/pip install -r submission/requirements.txt
.venv/bin/python submission/code/build_data.py
.venv/bin/python submission/code/make_standalone.py
.venv/bin/python submission/code/make_appendix.py
```
