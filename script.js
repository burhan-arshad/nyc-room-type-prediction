"use strict";

// ---- Configuration: the only place the backend URL is set ----
const API_BASE_URL = "YOUR_DEPLOYED_FASTAPI_URL";

const FIELDS = [
  "neighbourhood_group", "neighbourhood", "latitude", "longitude", "price",
  "minimum_nights", "number_of_reviews", "reviews_per_month",
  "calculated_host_listings_count", "availability_365",
];
const TEXT_FIELDS = new Set(["neighbourhood_group", "neighbourhood"]);

// Demo presets: sample inputs only, never model output.
const DEMO = {
  neighbourhood_group: "Manhattan", neighbourhood: "Midtown", latitude: 40.7549,
  longitude: -73.984, price: 150, minimum_nights: 2, number_of_reviews: 45,
  reviews_per_month: 1.5, calculated_host_listings_count: 3, availability_365: 200,
};

const $ = (id) => document.getElementById(id);
const form = $("form"), submitBtn = $("submit"), formMsg = $("form-msg");
const controllers = new Set();
let busy = false, lastResult = null, resultRun = 0;

const baseUrl = () => API_BASE_URL.replace(/\/+$/, "");
const apiConfigured = () => /^https?:\/\//i.test(API_BASE_URL);

/* ---------- Fetch with timeout and cleanup ---------- */
async function request(path, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  controllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(baseUrl() + path, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    controllers.delete(controller);
  }
}

/* ---------- API status (real health check) ---------- */
async function checkApi() {
  setStatus("checking", "Checking API");
  if (!apiConfigured()) return setStatus("unavailable", "API URL not set");
  try {
    const res = await request("/", { method: "GET" }, 10000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    setStatus("connected", "API connected");
  } catch {
    setStatus("unavailable", "API unavailable");
  }
}
function setStatus(state, text) {
  $("status").dataset.state = state;
  $("status-text").textContent = text;
}

/* ---------- Validation ---------- */
function errorFor(input) {
  const v = input.value.trim(), name = input.name;
  if (!v) return "This field is required.";
  if (TEXT_FIELDS.has(name)) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Enter a valid number.";
  if (input.hasAttribute("data-int") && !Number.isInteger(n)) return "Enter a whole number.";
  if (input.hasAttribute("data-gt0") && n <= 0) return "Enter a value greater than 0.";
  if (input.min !== "" && n < Number(input.min)) return "Must be at least " + input.min + ".";
  if (input.max !== "" && n > Number(input.max)) return "Must be at most " + input.max + ".";
  return "";
}
function validateField(input) {
  const msg = errorFor(input);
  $(input.id + "-e").textContent = msg;
  if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  return !msg;
}
function buildPayload() {
  const payload = {};
  for (const name of FIELDS) {
    const v = form.elements[name].value.trim();
    payload[name] = TEXT_FIELDS.has(name) ? v : Number(v);
  }
  return payload;
}

/* ---------- Listing sheet ---------- */
function updateSheet() {
  document.querySelectorAll("#sheet [data-k]").forEach((el) => {
    el.textContent = form.elements[el.dataset.k].value.trim();
  });
  const lat = form.elements.latitude.value.trim(), lon = form.elements.longitude.value.trim();
  $("coords").textContent = lat || lon ? (lat || "—") + ", " + (lon || "—") : "";
}

/* ---------- Messages ---------- */
function say(text, bad) {
  formMsg.textContent = text;
  formMsg.classList.toggle("bad", !!bad);
}

/* ---------- Response validation (no silent correction) ---------- */
function parsePrediction(data) {
  if (!data || typeof data !== "object") throw new Error("The response was not an object.");
  const { Predicted_room_type: label, Classes: classes, Probability: probs } = data;
  if (typeof label !== "string" || !label) throw new Error("Missing Predicted_room_type.");
  if (!Array.isArray(classes) || !classes.length) throw new Error("Missing Classes.");
  if (!Array.isArray(probs)) throw new Error("Missing Probability.");
  if (classes.length !== probs.length) throw new Error("Classes and Probability differ in length.");
  if (!classes.every((c) => typeof c === "string")) throw new Error("Classes must be strings.");
  if (!probs.every((p) => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1))
    throw new Error("Probabilities must be finite numbers from 0 to 1.");
  if (!classes.includes(label)) throw new Error("Predicted class is not in Classes.");
  return { label, classes, probs };
}

/* ---------- Submit ---------- */
async function onSubmit(e) {
  e.preventDefault();
  if (busy) return;
  const inputs = FIELDS.map((n) => form.elements[n]);
  const results = inputs.map(validateField);
  if (results.includes(false)) {
    inputs[results.indexOf(false)].focus();
    return say("Fix the highlighted fields, then predict again.", true);
  }
  if (!apiConfigured()) return say("The API URL is not configured. Set API_BASE_URL in script.js.", true);

  setBusy(true);
  say("Sending listing to the model…");
  try {
    let res;
    try {
      res = await request("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
    } catch (err) {
      throw new Error(err.name === "AbortError"
        ? "The request timed out. The server may be waking up; try again."
        : "Could not reach the API. Check your connection, the API URL, and the backend's CORS settings.");
    }
    if (res.status === 422) throw new Error("The server rejected the input (422). Check each value against its range.");
    if (res.status >= 500) throw new Error("The server hit an error (" + res.status + "). Try again shortly.");
    if (!res.ok) throw new Error("Unexpected response from the server (HTTP " + res.status + ").");
    let data;
    try { data = await res.json(); } catch { throw new Error("The server returned invalid JSON."); }
    let parsed;
    try { parsed = parsePrediction(data); } catch (err) { throw new Error("Unexpected response format: " + err.message); }
    lastResult = parsed;
    renderResult(parsed);
    say("Prediction complete: " + parsed.label + ".");
  } catch (err) {
    say(err.message, true);
  } finally {
    setBusy(false);
  }
}
function setBusy(on) {
  busy = on;
  submitBtn.disabled = on;
  submitBtn.setAttribute("aria-busy", String(on));
  $("submit-label").textContent = on ? "Predicting…" : "Predict Room Type";
}

/* ---------- Result ---------- */
const pct = (p) => (p * 100).toFixed(1) + "%";
function renderResult({ label, classes, probs }) {
  const run = ++resultRun;
  $("result-h").textContent = label;
  const list = $("bars");
  list.replaceChildren();
  const fills = classes.map((c, i) => {
    const li = document.createElement("li");
    if (c === label) li.className = "top";
    const name = document.createElement("span"); name.className = "name"; name.textContent = c;
    const track = document.createElement("span"); track.className = "track";
    track.setAttribute("role", "img"); track.setAttribute("aria-label", c + " " + pct(probs[i]));
    const fill = document.createElement("i"); track.appendChild(fill);
    const val = document.createElement("span"); val.className = "val"; val.textContent = pct(probs[i]);
    li.append(name, track, val);
    list.appendChild(li);
    return fill;
  });
  const box = $("result");
  box.hidden = false;
  box.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  box.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (run !== resultRun) return;
    fills.forEach((f, i) => { f.style.transitionDelay = i * 90 + "ms"; f.style.transform = "scaleX(" + probs[i] + ")"; });
    list.querySelectorAll(".val").forEach((el, i) => countUp(el, probs[i], i * 90, run));
  }));
}
function countUp(el, target, delay, run) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.textContent = pct(0);
  const t0 = performance.now() + delay;
  const tick = (t) => {
    if (run !== resultRun) return;
    const k = Math.min(Math.max((t - t0) / 900, 0), 1);
    el.textContent = pct(k === 1 ? target : target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function copyResults() {
  if (!lastResult) return;
  const { label, classes, probs } = lastResult;
  const text = "Predicted room type: " + label + "\nModel class probabilities:\n" +
    classes.map((c, i) => "- " + c + ": " + pct(probs[i])).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    say("Results copied to the clipboard.");
  } catch {
    say("Copy failed. Your browser blocked clipboard access; select the results and copy manually.", true);
  }
}

/* ---------- Form actions ---------- */
function loadDemo() {
  for (const n of FIELDS) { form.elements[n].value = DEMO[n]; validateField(form.elements[n]); }
  syncSuggestions();
  $("demo-flag").hidden = false;
  updateSheet();
  say("Demo preset loaded. These are sample inputs, not model output.");
}
function clearForm() {
  form.reset();
  document.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
  form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
  $("demo-flag").hidden = true;
  $("result").hidden = true;
  resultRun++; lastResult = null;
  syncSuggestions(); updateSheet(); say("");
  form.elements.neighbourhood_group.focus();
}
function predictAgain() {
  $("result").hidden = true;
  resultRun++;
  $("predictor").scrollIntoView({ behavior: "smooth" });
  form.elements.neighbourhood_group.focus({ preventScroll: true });
}

/* ---------- Navigation ---------- */
function setupNav() {
  const burger = $("burger"), menu = $("menu");
  const set = (open) => { burger.setAttribute("aria-expanded", String(open)); menu.classList.toggle("open", open); };
  burger.addEventListener("click", () => set(burger.getAttribute("aria-expanded") !== "true"));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}

/* ---------- Reveal on scroll (selected blocks only) ---------- */
function setupReveal() {
  const targets = document.querySelectorAll(".sec-head, .flow, .stack, .sheet");
  targets.forEach((t) => t.classList.add("rv"));
  if (!("IntersectionObserver" in window)) return targets.forEach((t) => t.classList.add("in"));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: 0.12 });
  targets.forEach((t) => io.observe(t));
  window.addEventListener("pagehide", () => io.disconnect(), { once: true });
}

/* ---------- Suggestions (NYC Airbnb 2019 boroughs and neighbourhoods) ---------- */
const NYC = {"Bronx": "Allerton|City Island|Claremont Village|Clason Point|Co-op City|Concourse|Concourse Village|Eastchester|Edenwald|Fieldston|Fordham|High Bridge|Hunts Point|Kingsbridge|Longwood|Melrose|Morris Heights|Morris Park|Mott Haven|Mount Eden|Mount Hope|North Riverdale|Norwood|Parkchester|Pelham Bay|Pelham Gardens|Port Morris|Riverdale|Schuylerville|Soundview|Spuyten Duyvil|Throgs Neck|Tremont|Unionport|University Heights|Wakefield|West Farms|Williamsbridge|Woodlawn", "Brooklyn": "Bath Beach|Bay Ridge|Bedford-Stuyvesant|Bensonhurst|Bergen Beach|Boerum Hill|Borough Park|Brighton Beach|Brooklyn Heights|Brownsville|Bushwick|Canarsie|Carroll Gardens|Clinton Hill|Cobble Hill|Columbia St|Coney Island|Crown Heights|Cypress Hills|Downtown Brooklyn|DUMBO|Dyker Heights|East Flatbush|East New York|Flatbush|Flatlands|Fort Greene|Fort Hamilton|Gowanus|Gravesend|Greenpoint|Greenwood Heights|Kensington|Manhattan Beach|Marine Park|Midwood|Mill Basin|Navy Yard|Park Slope|Prospect Heights|Prospect-Lefferts Gardens|Red Hook|Sea Gate|Sheepshead Bay|South Slope|Sunset Park|Vinegar Hill|Williamsburg|Windsor Terrace", "Manhattan": "Battery Park City|Chelsea|Chinatown|Civic Center|East Harlem|East Village|Financial District|Flatiron District|Gramercy|Greenwich Village|Harlem|Hell's Kitchen|Inwood|Kips Bay|Little Italy|Lower East Side|Marble Hill|Midtown|Morningside Heights|Murray Hill|NoHo|Nolita|Roosevelt Island|SoHo|Stuyvesant Town|Theater District|Tribeca|Two Bridges|Upper East Side|Upper West Side|Washington Heights|West Village", "Queens": "Arverne|Astoria|Bay Terrace|Bayside|Belle Harbor|Bellerose|Breezy Point|Briarwood|Cambria Heights|Clearview|College Point|Corona|Douglaston|East Elmhurst|Edgemere|Elmhurst|Far Rockaway|Flushing|Forest Hills|Fresh Meadows|Glen Oaks|Glendale|Hollis|Holliswood|Howard Beach|Jackson Heights|Jamaica|Jamaica Estates|Jamaica Hills|Kew Gardens|Kew Gardens Hills|Laurelton|Little Neck|Long Island City|Maspeth|Middle Village|Neponsit|Ozone Park|Queens Village|Rego Park|Richmond Hill|Ridgewood|Rockaway Beach|Rosedale|Springfield Gardens|St. Albans|Sunnyside|Whitestone|Woodhaven|Woodside", "Staten Island": "Arden Heights|Arrochar|Bay Terrace|Bull's Head|Castleton Corners|Clifton|Concord|Dongan Hills|Eltingville|Emerson Hill|Fort Wadsworth|Graniteville|Grant City|Grasmere|Great Kills|Grymes Hill|Huguenot|Jersey Street|Lighthouse Hill|Mariners Harbor|Midland Beach|New Brighton|New Dorp|New Springville|Oakwood|Port Richmond|Prince's Bay|Randall Manor|Richmondtown|Rosebank|Rossville|Shore Acres|Silver Lake|South Beach|St. George|Stapleton|Todt Hill|Tompkinsville|Tottenville|West Brighton|Westerleigh|Willowbrook|Woodrow"};
const HOODS = Object.fromEntries(Object.entries(NYC).map(([g, s]) => [g, s.split("|")]));
const lc = (s) => s.trim().toLowerCase();
const keyFor = (g) => Object.keys(HOODS).find((k) => lc(k) === lc(g)) || "";
const inGroup = (key, hood) => !!key && HOODS[key].some((n) => lc(n) === lc(hood));
function fillList(id, items) {
  $(id).replaceChildren(...items.map((v) => { const o = document.createElement("option"); o.value = v; return o; }));
}
function syncSuggestions() {
  const key = keyFor(form.elements.neighbourhood_group.value);
  fillList("dl-hood", (key ? HOODS[key] : Object.values(HOODS).flat()).slice().sort());
}
function autoPair(commit) {
  const grp = form.elements.neighbourhood_group, hood = form.elements.neighbourhood.value;
  const cur = keyFor(grp.value);
  if (!hood.trim() || inGroup(cur, hood)) return;
  const match = Object.keys(HOODS).find((k) => inGroup(k, hood));
  if (match && (commit || !grp.value.trim())) {
    grp.value = match; validateField(grp); syncSuggestions(); updateSheet();
  }
}
function setupSuggestions() {
  fillList("dl-group", Object.keys(HOODS));
  syncSuggestions();
  const grp = form.elements.neighbourhood_group;
  grp.addEventListener("input", syncSuggestions);
  grp.addEventListener("change", () => { const k = keyFor(grp.value); if (k) grp.value = k; syncSuggestions(); updateSheet(); });
  form.elements.neighbourhood.addEventListener("input", () => autoPair(false));
  form.elements.neighbourhood.addEventListener("change", () => {
    const hood = form.elements.neighbourhood, key = Object.keys(HOODS).find((k) => inGroup(k, hood.value));
    if (key) { const own = HOODS[key].find((n) => lc(n) === lc(hood.value)); hood.value = own; }
    autoPair(true); updateSheet();
  });
}

/* ---------- Scroll progress and header ---------- */
function setupScroll() {
  const bar = document.querySelector(".bar"), prog = $("progress");
  let last = scrollY, queued = false;
  addEventListener("scroll", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      prog.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
      const open = $("burger").getAttribute("aria-expanded") === "true";
      bar.classList.toggle("hide", y > last && y > 240 && !open);
      last = y; queued = false;
    });
  }, { passive: true });
}

/* ---------- Init ---------- */
function init() {
  $("year").textContent = new Date().getFullYear();
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", (e) => {
    updateSheet();
    if (e.target.getAttribute("aria-invalid")) validateField(e.target);
    $("demo-flag").hidden = true;
  });
  form.addEventListener("focusout", (e) => { if (e.target.matches("input") && e.target.value) validateField(e.target); });
  $("demo").addEventListener("click", loadDemo);
  $("clear").addEventListener("click", clearForm);
  $("again").addEventListener("click", predictAgain);
  $("copy").addEventListener("click", copyResults);
  setupNav(); setupReveal(); setupSuggestions(); setupScroll(); updateSheet(); checkApi();
  window.addEventListener("pagehide", () => controllers.forEach((c) => c.abort()), { once: true });
}
init();
