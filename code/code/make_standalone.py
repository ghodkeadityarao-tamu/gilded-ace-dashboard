"""Inline data.js and app.js into one self-contained HTML file (Chart.js still loads from cdnjs)."""
from pathlib import Path
d = Path(__file__).resolve().parents[1] / "dashboard"
h = (d / "index.html").read_text()
h = h.replace('<script src="data.js"></script>', "<script>" + (d / "data.js").read_text() + "</script>")
h = h.replace('<script src="app.js"></script>', "<script>" + (d / "app.js").read_text() + "</script>")
(d / "dashboard-royale.html").write_text(h)
print("wrote", d / "dashboard-royale.html", round(len(h) / 1e6, 2), "MB")
