// ===========================
// VinylRoll - script.js (v11)
// ===========================
const STORAGE_KEY = "vinylroll_v11";
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// UI
const tabs = $$(".tab");
const search = $("#search");
const sortByEl = $("#sortBy");
const sortDirEl = $("#sortDir");
const listEl = $("#list");
const addSection = $("#add");
const randomSection = $("#random");
const controlsBar = $("#controls");
const artistsList = $("#artistsList");
const fetchAllBtn = $("#fetchAllBtn");

// Modale + toast
const modal = $("#editModal");
const modalBackdrop = modal.querySelector(".modal-backdrop");
const toast = $("#toast");

// Champs édition
const editArtist = $("#editArtist");
const editAlbum = $("#editAlbum");
const editYear = $("#editYear");
const editState = $("#editState");
const editType = $("#editType");
const editLimitedWrap = $("#editLimitedWrap");
const editLimitedDetail = $("#editLimitedDetail");
const editComment = $("#editComment");

// Émojis actions
const searchBtn = $("#searchBtn");
const generateBtn = $("#generateBtn");
const deleteBtn = $("#deleteBtn");
const cancelBtn = $("#cancelBtn");
const saveBtn = $("#saveBtn");

// Import fichiers
const importJsonInput = $("#importFile");
const importDiscogsInput = $("#importDiscogsFile");

let editingId = null;

const state = {
  items: [],
  tab: "library",
  search: "",
  sortBy: "artist",
  sortDir: "asc"
};

// -------- Toast util --------
let toastTimer = null;
function showToast(msg, ms = 1800) {
  if (!toast) { alert(msg); return; }
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), ms);
}

// -------- Persistence --------
function load() { try { state.items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { state.items = []; } }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
function getItem(id) { return state.items.find(x => x.id === id); }
function updateItem(id, patch) {
  const idx = state.items.findIndex(x => x.id === id);
  if (idx === -1) return;
  state.items[idx] = { ...state.items[idx], ...patch };
  save(); render();
}

// -------- Tabs --------
function setTab(id) {
  state.tab = id;
  tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  addSection.classList.toggle("hidden", id !== "add");
  randomSection.classList.toggle("hidden", id !== "random");
  controlsBar.classList.toggle("hidden", id === "add" || id === "random");
  render();
}
tabs.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

// -------- Add item --------
$("#addBtn").onclick = async () => {
  const artist = $("#artist").value.trim();
  const album = $("#album").value.trim();
  if (!artist || !album) { alert("Artiste et album, c’est pas optionnel."); return; }

  const yearRaw = $("#year").value.trim();
  const year = yearRaw ? parseInt(yearRaw, 10) : null;
  const type = $("#type").value;
  const limitedDetail = $("#limitedDetail").value.trim();
  const stateSel = $("#state").value;
  const comment = $("#comment").value.trim();

  const it = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    artist, album,
    year: Number.isFinite(year) ? year : null,
    type,
    limitedDetail: type === "limited" ? (limitedDetail || null) : null,
    state: stateSel,
    comment: comment || null,
    coverUrl: null
  };

  state.items.unshift(it);
  save(); populateArtistsDatalist();

  try {
    const ok = await fetchCover(it.id);
    if (!ok) await generateAndStorePlaceholder(it.id);
  } catch { await generateAndStorePlaceholder(it.id); }

  // reset
  $("#artist").value = ""; $("#album").value = ""; $("#year").value = "";
  $("#limitedDetail").value = ""; $("#comment").value = "";
  $("#type").value = "standard"; $("#state").value = "owned";

  setTab(stateSel === "wishlist" ? "wishlist" : (stateSel === "preorder" ? "preorder" : "library"));
};

// -------- Export --------
$("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "vinylroll.json"; a.click();
  URL.revokeObjectURL(url);
};

// -------- Normalisation --------
function normalizeText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && !Number.isFinite(v)) return "";
  const s = String(v).trim();
  return s.toLowerCase() === "nan" ? "" : s;
}
function normalizeYear(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; }
function normalizeState(v) {
  const s = normalizeText(v).toLowerCase();
  const preorderAliases = ["preorder","précommande","precommande","pre-order","pre order","pre-commande"];
  const wishlistAliases = ["wishlist","souhait","liste de souhaits","wish"];
  const ownedAliases = ["owned","acquis","acheté","achete","own"];
  if (preorderAliases.includes(s)) return "preorder";
  if (wishlistAliases.includes(s)) return "wishlist";
  if (ownedAliases.includes(s)) return "owned";
  return s ? "owned" : "wishlist";
}

// -------- Détection de doublons --------
function findDuplicate(artist, album) {
  const norm = s => (s || "").trim().toLowerCase();
  return state.items.find(it => norm(it.artist) === norm(artist) && norm(it.album) === norm(album));
}

async function handleImportRecords(newRecs) {
  for (const rec of newRecs) {
    const dup = findDuplicate(rec.artist, rec.album);
    if (dup) {
      // prompt simple et efficace: 1 Remplacer, 2 Doubler, 3 Passer
      const choice = prompt(
        `Doublon trouvé:\n${dup.artist} — ${dup.album}\n\n1 = Remplacer\n2 = Doubler\n3 = Passer`,
        "1"
      );
      if (choice === "1") {
        rec.id = dup.id;
        const idx = state.items.findIndex(x => x.id === dup.id);
        state.items[idx] = rec;
      } else if (choice === "2") {
        rec.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        state.items.push(rec);
      } else {
        continue; // passer
      }
    } else {
      rec.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      state.items.push(rec);
    }
  }
  save(); populateArtistsDatalist(); render();
  showPostImportTabHint();
}

// -------- Import JSON --------
importJsonInput.onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("Format invalide");

    const cleaned = arr.map(x => {
      const artist = normalizeText(x.artist);
      const album  = normalizeText(x.album);
      if (!artist || !album) return null;
      const type = normalizeText(x.type) === "limited" ? "limited" : "standard";
      const stateVal = normalizeState(x.state);
      return {
        id: x.id || null,
        artist, album,
        year: normalizeYear(x.year),
        type,
        limitedDetail: type === "limited" ? (normalizeText(x.limitedDetail) || null) : null,
        state: stateVal,
        comment: normalizeText(x.comment) || null,
        coverUrl: normalizeText(x.coverUrl) || null
      };
    }).filter(Boolean);

    await handleImportRecords(cleaned);
    showToast(`Import JSON: ${cleaned.length} entrées traitées.`);
  } catch {
    alert("Fichier JSON invalide.");
  } finally { e.target.value = ""; }
};

// -------- Import CSV Discogs --------
function parseCSV(text) {
  const rows = [];
  let cur = []; let cell = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i+1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(cell); cell = ""; }
      else if (ch === '\r') { /* ignore */ }
      else if (ch === '\n') { cur.push(cell); rows.push(cur); cur = []; cell = ""; }
      else { cell += ch; }
    }
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur); }
  return rows;
}

const LIMIT_KEYWORDS = [
  "limited","ltd","deluxe","colored","coloured","colour","marbled",
  "splatter","picture disc","pic disc","numbered","indie","exclusive",
  "rsd","record store day","box set","boxset","special edition"
];

function detectYearFromRow(obj) {
  for (const key of ["Released","Year","Released Year"]) {
    if (key in obj && obj[key]) {
      const m = String(obj[key]).match(/\b(19|20)\d{2}\b/);
      if (m) return parseInt(m[0], 10);
    }
  }
  return null;
}
function detectTypeAndDetail(fmt, notes) {
  const blob = `${fmt || ""} ${notes || ""}`.toLowerCase();
  if (LIMIT_KEYWORDS.some(k => blob.includes(k))) {
    const detail = (fmt || "").replace(/\s+/g, " ").trim();
    return { type: "limited", detail: detail || null };
    }
  return { type: "standard", detail: null };
}

function mapDiscogsRow(obj) {
  const artist = normalizeText(obj["Artist"] ?? obj["Artists"]);
  const album  = normalizeText(obj["Title"] ?? obj["Release Title"]);
  if (!artist || !album) return null;
  const notes = normalizeText(obj["Notes"]);
  const fmt   = normalizeText(obj["Format"]);
  const { type, detail } = detectTypeAndDetail(fmt, notes);
  let state = "owned";
  const folder = normalizeText(obj["Folder"] ?? obj["Collection Folder"]).toLowerCase();
  if (["wantlist","wishlist"].includes(folder)) state = "wishlist";

  return {
    id: null,
    artist,
    album,
    year: detectYearFromRow(obj),
    type,
    limitedDetail: detail,
    state,
    comment: notes || null,
    coverUrl: null
  };
}

importDiscogsInput.onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("CSV vide.");
    const headers = rows[0];
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length === 1 && r[0].trim() === "") continue;
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ""; });
      const mapped = mapDiscogsRow(obj);
      if (mapped) out.push(mapped);
    }
    await handleImportRecords(out);
    showToast(`Import Discogs: ${out.length} entrées traitées.`);
  } catch {
    alert("CSV Discogs invalide ou non reconnu.");
  } finally { e.target.value = ""; }
};

function showPostImportTabHint() {
  const hasOwned = state.items.some(it => it.state === "owned");
  const hasWL = state.items.some(it => it.state === "wishlist");
  const hasPO = state.items.some(it => it.state === "preorder");
  if (!hasOwned && !hasWL && hasPO) setTab("preorder");
  else if (!hasOwned && hasWL && !hasPO) setTab("wishlist");
  else setTab("library");
}

// -------- Wipe --------
$("#wipeBtn").onclick = () => {
  if (confirm("Tout effacer? C’est irréversible, comme une rayure profonde.")) {
    state.items = []; save(); populateArtistsDatalist(); render();
  }
};

// -------- Search + Sort --------
search.oninput = () => { state.search = search.value.toLowerCase(); render(); };
sortByEl.onchange = () => { state.sortBy = sortByEl.value; render(); };
sortDirEl.onchange = () => { state.sortDir = sortDirEl.value; render(); };

function compare(a, b, by) {
  const dir = state.sortDir === "asc" ? 1 : -1;
  const S = s => (s ?? "").toString().toLowerCase();
  if (by === "year") {
    const ay = a.year ?? -Infinity, byy = b.year ?? -Infinity;
    if (ay === byy) return (S(a.artist).localeCompare(S(b.artist))) * dir;
    return (ay < byy ? -1 : 1) * dir;
  }
  if (by === "artist") return S(a.artist).localeCompare(S(b.artist)) * dir || S(a.album).localeCompare(S(b.album)) * dir;
  if (by === "album")  return S(a.album).localeCompare(S(b.album)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  if (by === "state")  return S(a.state).localeCompare(S(b.state)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  if (by === "type")   return S(a.type).localeCompare(S(b.type)) * dir || S(a.artist).localeCompare(S(b.artist)) * dir;
  return 0;
}

// -------- Render --------
function render() {
  sortByEl.value = state.sortBy;
  sortDirEl.value = state.sortDir;

  const q = state.search.trim().toLowerCase();
  let items = state.items.filter(it => {
    if (state.tab === "library"  && it.state !== "owned")    return false;
    if (state.tab === "wishlist" && it.state !== "wishlist") return false;
    if (state.tab === "preorder" && it.state !== "preorder") return false;
    if (!q) return true;
    return it.artist.toLowerCase().includes(q)
        || it.album.toLowerCase().includes(q)
        || (it.limitedDetail || "").toLowerCase().includes(q)
        || (it.comment || "").toLowerCase().includes(q);
  });

  items.sort((a, b) => compare(a, b, state.sortBy));

  listEl.innerHTML = (state.tab === "library" || state.tab === "wishlist" || state.tab === "preorder")
    ? items.map(renderCard).join("")
    : "";

  if (state.tab === "random") {
    const owned = state.items.filter(x => x.state === "owned");
    if (owned.length === 0) {
      $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle en « owned » pour brasser la roulette.</span>`;
    }
  }
}

function renderCard(it) {
  const editionLine = it.type === "limited"
    ? `Édition limitée${it.limitedDetail ? ": " + escapeHtml(it.limitedDetail) : ""}`
    : `Standard`;

  const cover = it.coverUrl
    ? `<img class="cover" src="${escapeAttr(it.coverUrl)}" alt="Cover ${escapeAttr(it.album)}">`
    : `<div class="cover" aria-label="Sans cover"></div>`;

  return `
    <div class="card" data-id="${it.id}" onclick="openEditor('${it.id}')">
      <div class="item">
        ${cover}
        <div class="meta">
          <div class="row-top">${escapeHtml(it.artist)} — ${escapeHtml(it.album)}${it.year ? ` (${it.year})` : ""}</div>
          <div class="row-mid">${editionLine} • ${it.state}</div>
          <div class="row-bottom ${it.comment ? "" : "hidden"}">${escapeHtml(it.comment || "")}</div>
        </div>
      </div>
    </div>
  `;
}

// -------- Modale --------
function openModal() { modal.classList.remove("hidden"); document.body.style.overflow = "hidden"; }
function closeModal() { modal.classList.add("hidden"); document.body.style.overflow = ""; editingId = null; }
modalBackdrop.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);

window.openEditor = (id) => {
  const it = getItem(id); if (!it) return;
  editingId = id;
  editArtist.value = it.artist;
  editAlbum.value = it.album;
  editYear.value = it.year ?? "";
  editState.value = it.state;
  editType.value = it.type;
  editLimitedDetail.value = it.limitedDetail || "";
  editComment.value = it.comment || "";
  editLimitedWrap.style.display = it.type === "limited" ? "block" : "none";
  openModal();
};

editType.onchange = () => {
  if (editType.value === "standard") {
    const wasLimited = getItem(editingId)?.type === "limited";
    if (wasLimited) {
      const ok = confirm("Passer de « édition limitée » à « standard » va retirer le détail limité. Continuer?");
      if (!ok) { editType.value = "limited"; return; }
      editLimitedDetail.value = "";
    }
  }
  editLimitedWrap.style.display = editType.value === "limited" ? "block" : "none";
};

deleteBtn.onclick = () => {
  if (!editingId) return;
  if (!confirm("Supprimer ce vinyle?")) return;
  state.items = state.items.filter(x => x.id !== editingId);
  save(); populateArtistsDatalist(); render(); closeModal();
  showToast("Supprimé.");
};

saveBtn.onclick = (e) => {
  e.preventDefault();
  if (!editingId) return;
  const artist = editArtist.value.trim();
  const album  = editAlbum.value.trim();
  if (!artist || !album) { alert("Artiste et album, c’est pas optionnel."); return; }
  const year = editYear.value.trim() ? parseInt(editYear.value.trim(), 10) : null;

  const patch = {
    artist, album,
    year: Number.isFinite(year) ? year : null,
    state: editState.value,
    type: editType.value,
    limitedDetail: editType.value === "limited" ? (editLimitedDetail.value.trim() || null) : null,
    comment: editComment.value.trim() || null
  };
  updateItem(editingId, patch);
  populateArtistsDatalist();
  closeModal();
  showToast("Modifications enregistrées.");
};

// -------- COVERS --------
async function fetchCover(id) {
  const it = getItem(id);
  if (!it) return false;
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", `${it.artist} ${it.album}`);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "1");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.results || data.results.length === 0) return false;
    let art = data.results[0].artworkUrl100;
    if (art) art = art.replace("100x100bb.jpg", "512x512bb.jpg").replace("100x100bb.png", "512x512bb.png");
    updateItem(id, { coverUrl: art || null });
    return !!art;
  } catch { return false; }
}

function hashStr(s) { let h = 2166136261 >>> 0; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);} return h>>>0; }
function hsl(n) { return `hsl(${n % 360} 70% 45%)`; }

async function generateAndStorePlaceholder(id, size = 512) {
  const it = getItem(id); if (!it) return false;
  const text = `${it.artist} — ${it.album}`;
  const h = hashStr(text);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0,0,size,size);
  g.addColorStop(0, hsl(h%360)); g.addColorStop(1, hsl((h>>8)%360));
  ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
  const cx=size/2, cy=size/2, r=size*0.42;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle="rgba(0,0,0,0.85)"; ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,0.05)"; ctx.lineWidth=2;
  for(let i=1;i<=6;i++){ ctx.beginPath(); ctx.arc(cx,cy,r-i*8,0,Math.PI*2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx,cy,size*0.16,0,Math.PI*2); ctx.fillStyle="#fafafa"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,size*0.02,0,Math.PI*2); ctx.fillStyle="#111"; ctx.fill();
  ctx.fillStyle="#111";
  ctx.font=`bold ${Math.floor(size*0.10)}px -apple-system,system-ui,Segoe UI,sans-serif`;
  ctx.textAlign="center"; ctx.textBaseline="middle";
  const initials = (it.artist.split(/\s+/).slice(0,2).map(s=>s[0]).join("") + "/" + it.album.split(/\s+/).slice(0,2).map(s=>s[0]).join("")).toUpperCase();
  ctx.fillText(initials, cx, cy);
  const url = c.toDataURL("image/png");
  updateItem(id, { coverUrl: url });
  return true;
}

searchBtn.onclick = async () => {
  if (!editingId) return;
  const ok = await fetchCover(editingId);
  showToast(ok ? "Jaquette trouvée." : "Aucune jaquette trouvée.");
};

generateBtn.onclick = async () => {
  if (!editingId) return;
  await generateAndStorePlaceholder(editingId);
  showToast("Jaquette générée.");
};

// -------- Random --------
$("#randomBtn").onclick = () => {
  const owned = state.items.filter(it => it.state === "owned");
  if (owned.length === 0) {
    $("#pick").innerHTML = `<span class="muted">Ajoute au moins un vinyle possédé pour brasser la roulette.</span>`;
    return;
  }
  const p = owned[Math.floor(Math.random() * owned.length)];
  const editionLine = p.type === "limited"
    ? `Édition limitée${p.limitedDetail ? ": " + escapeHtml(p.limitedDetail) : ""}`
    : `Standard`;

  const cover = p.coverUrl
    ? `<img class="random-cover" src="${escapeAttr(p.coverUrl)}" alt="Cover ${escapeAttr(p.album)}" loading="lazy">`
    : `<div class="random-cover" aria-label="Sans cover"></div>`;

  $("#pick").innerHTML = `
    <div class="random-wrap">
      ${cover}
      <div>
        <div class="row-top">${escapeHtml(p.artist)} — ${escapeHtml(p.album)}${p.year ? ` (${p.year})` : ""}</div>
        <div class="row-mid" style="margin-top:6px;">${editionLine}</div>
        ${p.comment ? `<div class="muted" style="margin-top:6px;">${escapeHtml(p.comment)}</div>` : ""}
      </div>
    </div>
  `;
};

// -------- Datalist --------
function populateArtistsDatalist() {
  const names = Array.from(new Set(state.items.map(x => x.artist).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  artistsList.innerHTML = names.map(n => `<option value="${escapeAttr(n)}"></option>`).join("");
}

// -------- Utils + SW --------
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(() => {}); });
}

// boot
load();
populateArtistsDatalist();
render();
setTab("library");
