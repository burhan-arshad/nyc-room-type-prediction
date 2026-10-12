"use strict";

// ---- Configuration: the only place the backend URL is set ----
const API_BASE_URL = "https://nyc-room-type-prediction-1-btb1.onrender.com";

// name, label, kind (t text, f decimal, i integer), hint, constraints
const FIELDS = [
  ["neighbourhood_group", "Borough", "t", "Pick from the list", { list: "dl-group" }],
  ["neighbourhood", "Neighbourhood", "t", "Suggestions follow the borough", { list: "dl-hood" }],
  ["latitude", "Latitude", "f", "−90 to 90", { min: -90, max: 90 }],
  ["longitude", "Longitude", "f", "−180 to 180", { min: -180, max: 180 }],
  ["price", "Price per night", "f", "Greater than 0", { min: 0, gt0: 1 }],
  ["minimum_nights", "Minimum nights", "i", "Whole number, 1 to 365", { min: 1, max: 365 }],
  ["availability_365", "Days available a year", "i", "Whole number, 0 to 365", { min: 0, max: 365 }],
  ["number_of_reviews", "Number of reviews", "i", "Whole number, 0 or more", { min: 0 }],
  ["reviews_per_month", "Reviews per month", "f", "0 or more", { min: 0 }],
  ["calculated_host_listings_count", "Host's listings", "i", "Whole number, 0 or more", { min: 0 }],
];
// Demo presets: sample inputs only, never model output.
const DEMO = { neighbourhood_group: "Manhattan", neighbourhood: "Midtown", latitude: 40.7549, longitude: -73.984, price: 150,
  minimum_nights: 2, availability_365: 200, number_of_reviews: 45, reviews_per_month: 1.5, calculated_host_listings_count: 3 };

// Boroughs and neighbourhoods from the NYC Airbnb 2019 dataset (suggestions only; any text is accepted).
const NYC = {
  "Bronx": "Allerton|City Island|Claremont Village|Clason Point|Co-op City|Concourse|Concourse Village|Eastchester|Edenwald|Fieldston|Fordham|High Bridge|Hunts Point|Kingsbridge|Longwood|Melrose|Morris Heights|Morris Park|Mott Haven|Mount Eden|Mount Hope|North Riverdale|Norwood|Parkchester|Pelham Bay|Pelham Gardens|Port Morris|Riverdale|Schuylerville|Soundview|Spuyten Duyvil|Throgs Neck|Tremont|Unionport|University Heights|Wakefield|West Farms|Williamsbridge|Woodlawn",
  "Brooklyn": "Bath Beach|Bay Ridge|Bedford-Stuyvesant|Bensonhurst|Bergen Beach|Boerum Hill|Borough Park|Brighton Beach|Brooklyn Heights|Brownsville|Bushwick|Canarsie|Carroll Gardens|Clinton Hill|Cobble Hill|Columbia St|Coney Island|Crown Heights|Cypress Hills|Downtown Brooklyn|DUMBO|Dyker Heights|East Flatbush|East New York|Flatbush|Flatlands|Fort Greene|Fort Hamilton|Gowanus|Gravesend|Greenpoint|Greenwood Heights|Kensington|Manhattan Beach|Marine Park|Midwood|Mill Basin|Navy Yard|Park Slope|Prospect Heights|Prospect-Lefferts Gardens|Red Hook|Sea Gate|Sheepshead Bay|South Slope|Sunset Park|Vinegar Hill|Williamsburg|Windsor Terrace",
  "Manhattan": "Battery Park City|Chelsea|Chinatown|Civic Center|East Harlem|East Village|Financial District|Flatiron District|Gramercy|Greenwich Village|Harlem|Hell's Kitchen|Inwood|Kips Bay|Little Italy|Lower East Side|Marble Hill|Midtown|Morningside Heights|Murray Hill|NoHo|Nolita|Roosevelt Island|SoHo|Stuyvesant Town|Theater District|Tribeca|Two Bridges|Upper East Side|Upper West Side|Washington Heights|West Village",
  "Queens": "Arverne|Astoria|Bay Terrace|Bayside|Belle Harbor|Bellerose|Breezy Point|Briarwood|Cambria Heights|Clearview|College Point|Corona|Douglaston|East Elmhurst|Edgemere|Elmhurst|Far Rockaway|Flushing|Forest Hills|Fresh Meadows|Glen Oaks|Glendale|Hollis|Holliswood|Howard Beach|Jackson Heights|Jamaica|Jamaica Estates|Jamaica Hills|Kew Gardens|Kew Gardens Hills|Laurelton|Little Neck|Long Island City|Maspeth|Middle Village|Neponsit|Ozone Park|Queens Village|Rego Park|Richmond Hill|Ridgewood|Rockaway Beach|Rosedale|Springfield Gardens|St. Albans|Sunnyside|Whitestone|Woodhaven|Woodside",
  "Staten Island": "Arden Heights|Arrochar|Bay Terrace|Bull's Head|Castleton Corners|Clifton|Concord|Dongan Hills|Eltingville|Emerson Hill|Fort Wadsworth|Graniteville|Grant City|Grasmere|Great Kills|Grymes Hill|Huguenot|Jersey Street|Lighthouse Hill|Mariners Harbor|Midland Beach|New Brighton|New Dorp|New Springville|Oakwood|Port Richmond|Prince's Bay|Randall Manor|Richmondtown|Rosebank|Rossville|Shore Acres|Silver Lake|South Beach|St. George|Stapleton|Todt Hill|Tompkinsville|Tottenville|West Brighton|Westerleigh|Willowbrook|Woodrow",
};
const HOODS = Object.fromEntries(Object.entries(NYC).map(([g, s]) => [g, s.split("|")]));

const $ = (id) => document.getElementById(id);
const form = $("predictor");
const el = (name) => form.elements[name];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const controllers = new Set();
let busy = false, lastResult = null, run = 0;

/* ---------- Build the form ---------- */
function buildFields() {
  const box = $("fields");
  for (const [name, label, kind, hint, c] of FIELDS) {
    const wrap = document.createElement("div"); wrap.className = "f";
    const lab = document.createElement("label"); lab.htmlFor = name; lab.textContent = label;
    const input = document.createElement("input");
    Object.assign(input, { id: name, name, required: true, autocomplete: "off" });
    input.type = kind === "t" ? "text" : "number";
    if (kind !== "t") { input.step = kind === "i" ? "1" : "any"; input.inputMode = kind === "i" ? "numeric" : "decimal"; }
    if (c.min !== undefined) input.min = c.min;
    if (c.max !== undefined) input.max = c.max;
    if (c.list) input.setAttribute("list", c.list);
    input.dataset.kind = kind; if (c.gt0) input.dataset.gt0 = "1";
    input.setAttribute("aria-describedby", name + "-h " + name + "-e");
    const small = document.createElement("small"); small.id = name + "-h"; small.textContent = hint;
    const err = document.createElement("span"); err.className = "err"; err.id = name + "-e"; err.setAttribute("aria-live", "polite");
    wrap.append(lab, input, small, err); box.appendChild(wrap);
  }
}

/* ---------- API ---------- */
const baseUrl = () => API_BASE_URL.replace(/\/+$/, "");
const apiConfigured = () => /^https?:\/\//i.test(API_BASE_URL);
async function request(path, options = {}, timeoutMs = 20000) {
  const c = new AbortController(); controllers.add(c);
  const t = setTimeout(() => c.abort(), timeoutMs);
  try { return await fetch(baseUrl() + path, { ...options, signal: c.signal }); }
  finally { clearTimeout(t); controllers.delete(c); }
}
function setStatus(state, text) { $("status").dataset.state = state; $("status-text").textContent = text; }
async function checkApi() {
  setStatus("checking", "Checking API");
  if (!apiConfigured()) return setStatus("unavailable", "API URL not set");
  try {
    const res = await request("/", { method: "GET" }, 10000);
    if (!res.ok) throw new Error();
    setStatus("connected", "API connected");
  } catch { setStatus("unavailable", "API unavailable"); }
}

/* ---------- Validation ---------- */
function errorFor(i) {
  const v = i.value.trim();
  if (!v) return "This field is required.";
  if (i.dataset.kind === "t") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Enter a valid number.";
  if (i.dataset.kind === "i" && !Number.isInteger(n)) return "Enter a whole number.";
  if (i.dataset.gt0 && n <= 0) return "Enter a value greater than 0.";
  if (i.min !== "" && n < Number(i.min)) return "Must be at least " + i.min + ".";
  if (i.max !== "" && n > Number(i.max)) return "Must be at most " + i.max + ".";
  return "";
}
function validateField(i) {
  const m = errorFor(i);
  $(i.id + "-e").textContent = m;
  if (m) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid");
  return !m;
}
function buildPayload() {
  const p = {};
  for (const [name, , kind] of FIELDS) p[name] = kind === "t" ? el(name).value.trim() : Number(el(name).value);
  return p;
}
function say(text, bad) { $("msg").textContent = text; $("msg").classList.toggle("bad", !!bad); }

/* ---------- Response validation (never silently corrected) ---------- */
function parsePrediction(d) {
  if (!d || typeof d !== "object") throw new Error("The response was not an object.");
  const { Predicted_room_type: label, Classes: classes, Probability: probs } = d;
  if (typeof label !== "string" || !label) throw new Error("Missing Predicted_room_type.");
  if (!Array.isArray(classes) || !classes.length || !classes.every((c) => typeof c === "string")) throw new Error("Missing or invalid Classes.");
  if (!Array.isArray(probs)) throw new Error("Missing Probability.");
  if (classes.length !== probs.length) throw new Error("Classes and Probability differ in length.");
  if (!probs.every((p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1)) throw new Error("Probabilities must be finite numbers from 0 to 1.");
  if (!classes.includes(label)) throw new Error("Predicted class is not in Classes.");
  return { label, classes, probs };
}

/* ---------- Submit ---------- */
async function onSubmit(e) {
  e.preventDefault();
  if (busy) return;
  const inputs = FIELDS.map(([n]) => el(n));
  const ok = inputs.map(validateField);
  if (ok.includes(false)) { inputs[ok.indexOf(false)].focus(); return say("Fix the highlighted fields, then predict again.", true); }
  if (!apiConfigured()) return say("The API URL is not configured. Set API_BASE_URL in script.js.", true);
  setBusy(true); say("Sending listing to the model…");
  try {
    let res;
    try {
      res = await request("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildPayload()) });
    } catch (err) {
      throw new Error(err.name === "AbortError" ? "The request timed out. The server may be waking up; try again."
        : "Could not reach the API. Check your connection, the API URL, and the backend's CORS settings.");
    }
    if (res.status === 422) throw new Error("The server rejected the input (422). Check each value against its range.");
    if (res.status >= 500) throw new Error("The server hit an error (" + res.status + "). Try again shortly.");
    if (!res.ok) throw new Error("Unexpected response from the server (HTTP " + res.status + ").");
    let data;
    try { data = await res.json(); } catch { throw new Error("The server returned invalid JSON."); }
    let parsed;
    try { parsed = parsePrediction(data); } catch (err) { throw new Error("Unexpected response format: " + err.message); }
    lastResult = parsed; renderResult(parsed); say("Prediction complete: " + parsed.label + ".");
  } catch (err) { say(err.message, true); }
  finally { setBusy(false); }
}
function setBusy(on) {
  busy = on; $("submit").disabled = on; $("submit").setAttribute("aria-busy", String(on));
  $("submit-label").textContent = on ? "Predicting…" : "Predict Room Type";
}

/* ---------- Result ---------- */
const pct = (p) => (p * 100).toFixed(1) + "%";
function renderResult({ label, classes, probs }) {
  const my = ++run;
  $("result-h").textContent = label;
  const list = $("bars"); list.replaceChildren();
  classes.forEach((c, i) => {
    const li = document.createElement("li"); if (c === label) li.className = "top";
    const name = document.createElement("span"); name.className = "name"; name.textContent = c;
    const track = document.createElement("span"); track.className = "track";
    track.setAttribute("role", "img"); track.setAttribute("aria-label", c + " " + pct(probs[i]));
    track.appendChild(document.createElement("i"));
    const val = document.createElement("span"); val.className = "val"; val.textContent = pct(probs[i]);
    li.append(name, track, val); list.appendChild(li);
  });
  const box = $("result"); box.hidden = false;
  box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); box.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (my !== run) return;
    list.querySelectorAll("li").forEach((li, i) => {
      const fill = li.querySelector("i"), val = li.querySelector(".val");
      fill.style.transitionDelay = i * 100 + "ms"; fill.style.transform = "scaleX(" + probs[i] + ")";
      if (!reduced) countUp(val, probs[i], i * 100, my);
    });
  }));
}
function countUp(node, target, delay, my) {
  node.textContent = pct(0);
  const t0 = performance.now() + delay;
  const tick = (t) => {
    if (my !== run) return;
    const k = Math.min(Math.max((t - t0) / 900, 0), 1);
    node.textContent = pct(k === 1 ? target : target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function copyResults() {
  if (!lastResult) return;
  const { label, classes, probs } = lastResult;
  const text = "Predicted room type: " + label + "\nModel class probabilities:\n" + classes.map((c, i) => "- " + c + ": " + pct(probs[i])).join("\n");
  try { await navigator.clipboard.writeText(text); say("Results copied to the clipboard."); }
  catch { say("Copy failed. Your browser blocked clipboard access; copy the results manually.", true); }
}

/* ---------- Suggestions ---------- */
const lc = (s) => s.trim().toLowerCase();
const keyFor = (g) => Object.keys(HOODS).find((k) => lc(k) === lc(g)) || "";
const inGroup = (k, h) => !!k && HOODS[k].some((n) => lc(n) === lc(h));
function fillList(id, items) {
  $(id).replaceChildren(...items.map((v) => Object.assign(document.createElement("option"), { value: v })));
}
function syncSuggestions() {
  const k = keyFor(el("neighbourhood_group").value);
  fillList("dl-hood", (k ? HOODS[k] : Object.values(HOODS).flat()).slice().sort());
}
function autoPair(commit) {
  const grp = el("neighbourhood_group"), hood = el("neighbourhood");
  if (!hood.value.trim() || inGroup(keyFor(grp.value), hood.value)) return;
  const match = Object.keys(HOODS).find((k) => inGroup(k, hood.value));
  if (match && (commit || !grp.value.trim())) {
    if (commit) hood.value = HOODS[match].find((n) => lc(n) === lc(hood.value));
    grp.value = match; validateField(grp); syncSuggestions();
  }
}
function setupSuggestions() {
  fillList("dl-group", Object.keys(HOODS)); syncSuggestions();
  const grp = el("neighbourhood_group"), hood = el("neighbourhood");
  grp.addEventListener("input", syncSuggestions);
  grp.addEventListener("change", () => { const k = keyFor(grp.value); if (k) grp.value = k; syncSuggestions(); });
  hood.addEventListener("input", () => autoPair(false));
  hood.addEventListener("change", () => autoPair(true));
}

/* ---------- Actions ---------- */
function loadDemo() {
  for (const [n] of FIELDS) { el(n).value = DEMO[n]; validateField(el(n)); }
  syncSuggestions(); $("demo-flag").hidden = false; say("");
}
function clearForm() {
  form.reset();
  form.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
  form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
  $("demo-flag").hidden = true; $("result").hidden = true; run++; lastResult = null;
  syncSuggestions(); say(""); el("neighbourhood_group").focus();
}
function predictAgain() {
  $("result").hidden = true; run++;
  form.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  el("neighbourhood_group").focus({ preventScroll: true });
}

/* ---------- Decorative skyline: lit windows twinkle ---------- */
function drawSkyline() {
  const svg = $("sky"), NS = "http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox", "0 0 1200 160"); svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const add = (cls, x, y, w, h, delay) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("class", cls); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h);
    if (delay !== undefined) r.style.animationDelay = delay + "s";
    svg.appendChild(r);
  };
  for (let x = 0; x < 1200;) {
    const w = 40 + Math.floor(rnd() * 50), h = 50 + Math.floor(rnd() * 100), y = 160 - h;
    add("b", x, y, w - 4, h);
    for (let wy = y + 10; wy < 150; wy += 14)
      for (let wx = x + 8; wx < x + w - 14; wx += 12)
        if (rnd() < 0.28) add("l", wx, wy, 4, 6, (rnd() * 4).toFixed(2));
    x += w;
  }
}

/* ---------- Reveal on scroll ---------- */
function setupReveal() {
  const t = document.querySelectorAll(".rv");
  if (!("IntersectionObserver" in window)) return t.forEach((n) => n.classList.add("in"));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.2 });
  t.forEach((n) => io.observe(n));
  addEventListener("pagehide", () => io.disconnect(), { once: true });
}

/* ---------- Init ---------- */
function init() {
  $("year").textContent = new Date().getFullYear();
  buildFields(); setupSuggestions(); drawSkyline(); setupReveal(); checkApi();
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", (e) => { $("demo-flag").hidden = true; if (e.target.getAttribute("aria-invalid")) validateField(e.target); });
  form.addEventListener("focusout", (e) => { if (e.target.matches("input") && e.target.value) validateField(e.target); });
  $("demo").addEventListener("click", loadDemo);
  $("clear").addEventListener("click", clearForm);
  $("again").addEventListener("click", predictAgain);
  $("copy").addEventListener("click", copyResults);
  addEventListener("pagehide", () => controllers.forEach((c) => c.abort()), { once: true });
}
init();
