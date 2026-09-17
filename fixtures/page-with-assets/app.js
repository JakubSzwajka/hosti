fetch("data/2026.json")
  .then((r) => r.json())
  .then((d) => { document.getElementById("out").textContent = d.runs + " runs"; });
