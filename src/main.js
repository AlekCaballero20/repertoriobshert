import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDNOAvVFucipVRWno8GJqYreGlBeAWIeH0",
  authDomain: "repertorio-b-shert.firebaseapp.com",
  projectId: "repertorio-b-shert",
  storageBucket: "repertorio-b-shert.firebasestorage.app",
  messagingSenderId: "456656823483",
  appId: "1:456656823483:web:b41b72833481d8a0bb359e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);
const storage = getStorage(app);

const BAND_ID = "bshert";
const appRoot = document.querySelector("#app");

const state = {
  user: null,
  loading: true,
  route: "dashboard",
  songs: [],
  events: [],
  selectedSongId: null,
  selectedSongTab: "resumen",
  selectedEventId: null,
  liveEventId: null,
  liveIndex: 0,
  liveFont: 24,
  liveView: "all",
  liveScrollSpeed: 1,
  filters: {
    search: "",
    status: "",
    type: "",
    tag: ""
  },
  modal: null,
  toasts: [],
  unsubscribers: []
};

let scrollTimer = null;

const statusMap = {
  idea: "Idea",
  montaje: "En montaje",
  repasar: "Necesita repaso",
  lista: "Lista",
  pausada: "En pausa",
  descartada: "Descartada"
};

const readinessMap = {
  verde: "Verde",
  amarilla: "Amarilla",
  roja: "Roja"
};

const eventTypes = [
  "Matrimonio",
  "Ceremonia",
  "Cóctel",
  "Cena",
  "Evento empresarial",
  "Concierto íntimo",
  "Serenata",
  "Ensayo",
  "Otro"
];

const defaultSong = {
  title: "",
  artist: "",
  type: "cover",
  genre: "",
  language: "Español",
  duration: "",
  bpm: "",
  keyOriginal: "",
  keyBshert: "",
  capo: "",
  leadVoice: "",
  instruments: "Voz, guitarra",
  difficulty: "Media",
  status: "idea",
  readiness: "amarilla",
  moodTags: "",
  eventTags: "",
  lyrics: "",
  chords: "",
  notes: "",
  soul: "",
  instrumentParts: "",
  referenceLinks: ""
};

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const arrayToInput = (value) => Array.isArray(value) ? value.join(", ") : (value || "");

const formatDate = (value) => {
  if (!value) return "Sin fecha";
  if (typeof value === "string") return value;
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString("es-CO");
  return "Sin fecha";
};

const formatDurationTotal = (setlist = []) => {
  const minutes = setlist.reduce((total, item) => {
    const song = getSong(item.songId);
    const raw = item.duration || song?.duration || "";
    const match = String(raw).match(/(\d+)/);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  if (!minutes) return "Duración sin calcular";
  return `${minutes} min aprox.`;
};

const getSong = (id) => state.songs.find((song) => song.id === id);
const getEvent = (id) => state.events.find((event) => event.id === id);

const bandDoc = () => doc(db, "bands", BAND_ID);
const songsCol = () => collection(db, "bands", BAND_ID, "songs");
const songDoc = (id) => doc(db, "bands", BAND_ID, "songs", id);
const eventsCol = () => collection(db, "bands", BAND_ID, "events");
const eventDoc = (id) => doc(db, "bands", BAND_ID, "events", id);

function setRoute(route) {
  state.route = route;
  state.modal = null;
  if (route !== "live") stopAutoScroll();
  render();
}

function toast(message, type = "info") {
  const id = crypto.randomUUID();
  state.toasts.push({ id, message, type });
  renderToasts();
  setTimeout(() => {
    state.toasts = state.toasts.filter((item) => item.id !== id);
    renderToasts();
  }, 4200);
}

function renderToasts() {
  const old = document.querySelector(".toast-wrap");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.className = "toast-wrap";
  wrap.innerHTML = state.toasts.map((item) => `
    <div class="toast ${item.type === "error" ? "error" : ""}">${escapeHtml(item.message)}</div>
  `).join("");
  document.body.appendChild(wrap);
}

async function ensureBand() {
  await setDoc(bandDoc(), {
    name: "B'shert",
    slug: BAND_ID,
    members: arrayUnion({
      uid: state.user.uid,
      email: state.user.email,
      name: state.user.displayName || state.user.email
    }),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function startListeners() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];

  const songsQuery = query(songsCol(), orderBy("updatedAt", "desc"));
  const eventsQuery = query(eventsCol(), orderBy("date", "desc"));

  state.unsubscribers.push(onSnapshot(songsQuery, (snapshot) => {
    state.songs = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (!state.selectedSongId && state.songs.length) state.selectedSongId = state.songs[0].id;
    render();
  }, (error) => {
    console.error(error);
    toast("No pude cargar las canciones. Revisa Firestore y sus reglas, porque claro, la burocracia digital también canta.", "error");
  }));

  state.unsubscribers.push(onSnapshot(eventsQuery, (snapshot) => {
    state.events = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    if (!state.selectedEventId && state.events.length) state.selectedEventId = state.events[0].id;
    if (!state.liveEventId && state.events.length) state.liveEventId = state.events[0].id;
    render();
  }, (error) => {
    console.error(error);
    toast("No pude cargar los eventos. Firestore está haciendo de villano secundario.", "error");
  }));
}

async function login() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    toast("No se pudo iniciar sesión con Google.", "error");
  }
}

async function logout() {
  try {
    await signOut(auth);
    stopAutoScroll();
  } catch (error) {
    console.error(error);
    toast("No se pudo cerrar sesión. Qué poético, ni irse deja fácil.", "error");
  }
}

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  state.loading = false;
  if (user) {
    await ensureBand();
    await startListeners();
  } else {
    state.unsubscribers.forEach((unsubscribe) => unsubscribe());
    state.unsubscribers = [];
    state.songs = [];
    state.events = [];
    render();
  }
});

function render() {
  if (state.loading) {
    appRoot.innerHTML = `<div class="login-view"><div class="card pad">Cargando B'shert Setbook...</div></div>`;
    return;
  }

  if (!state.user) {
    appRoot.innerHTML = renderLogin();
    bindGlobalEvents();
    renderToasts();
    return;
  }

  appRoot.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderPage()}
      </main>
    </div>
    ${renderModal()}
  `;

  bindGlobalEvents();
  renderToasts();
}

function renderLogin() {
  return `
    <section class="login-view">
      <div class="login-card">
        <div class="login-hero">
          <div class="logo-row">
            <div class="logo-mark">♪</div>
            <div>
              <p class="eyebrow">Repertorio vivo</p>
              <h2 class="brand-title">B'shert Setbook</h2>
            </div>
          </div>
          <h1>Su música, menos perdida en la niebla.</h1>
          <p>
            Organicen canciones propias, covers, letras, acordes, partituras, notas, archivos,
            setlists y una vista limpia para tocar en vivo sin depender de la memoria humana,
            esa aplicación sin soporte técnico.
          </p>
          <button class="btn primary" data-action="login">Entrar con Google</button>
        </div>
        <aside class="login-side">
          <p class="eyebrow">Incluye</p>
          <ul>
            <li>🎵 <span>Biblioteca de canciones con filtros por evento, mood, tonalidad y estado.</span></li>
            <li>📎 <span>Archivos por canción: PDFs, imágenes, audios, links y notas.</span></li>
            <li>🎤 <span>Partes por instrumento, arreglos, comentarios y alma de la canción.</span></li>
            <li>🎚️ <span>Setlists con duración aproximada y modo en vivo con scroll.</span></li>
          </ul>
          <small>Login privado con Firebase Authentication.</small>
        </aside>
      </div>
    </section>
  `;
}

function renderSidebar() {
  const navItems = [
    ["dashboard", "Inicio", state.songs.length],
    ["songs", "Repertorio", state.songs.length],
    ["events", "Eventos y setlists", state.events.length],
    ["live", "Modo en vivo", "▶"],
    ["settings", "Ajustes", "⚙"]
  ];

  return `
    <aside class="sidebar">
      <section class="brand-card">
        <div class="logo-row">
          <div class="logo-mark">♪</div>
          <div>
            <h1 class="brand-title">B'shert</h1>
            <p class="brand-subtitle">Setbook musical</p>
          </div>
        </div>
        <nav class="nav">
          ${navItems.map(([route, label, count]) => `
            <button class="nav-button ${state.route === route ? "active" : ""}" data-action="route" data-route="${route}">
              <span>${label}</span>
              <span class="nav-count">${count}</span>
            </button>
          `).join("")}
        </nav>
      </section>
      <section class="user-panel">
        <p class="user-name">${escapeHtml(state.user.displayName || "Usuario")}</p>
        <p class="user-email">${escapeHtml(state.user.email)}</p>
        <div style="height: 12px"></div>
        <button class="btn small ghost" data-action="logout">Cerrar sesión</button>
      </section>
    </aside>
  `;
}

function renderPage() {
  if (state.route === "songs") return renderSongsPage();
  if (state.route === "events") return renderEventsPage();
  if (state.route === "live") return renderLivePage();
  if (state.route === "settings") return renderSettingsPage();
  return renderDashboard();
}

function pageHeader(eyebrow, title, description, actions = "") {
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-description">${escapeHtml(description)}</p>
      </div>
      <div class="actions">${actions}</div>
    </header>
  `;
}

function renderDashboard() {
  const ready = state.songs.filter((song) => song.status === "lista").length;
  const own = state.songs.filter((song) => song.type === "propia").length;
  const needsReview = state.songs.filter((song) => song.status === "repasar" || song.readiness === "roja").length;
  const nextEvent = [...state.events]
    .filter((event) => event.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];

  return `
    ${pageHeader(
      "Inicio",
      "Centro musical de B'shert",
      "Una vista rápida para saber qué tienen listo, qué necesita cariño y qué setlist pueden abrir sin ponerse a escarbar chats como arqueólogos del WhatsApp.",
      `<button class="btn primary" data-action="open-song-modal">+ Nueva canción</button>
       <button class="btn brand" data-action="open-event-modal">+ Nuevo evento</button>`
    )}

    <section class="grid four">
      <article class="card pad stats-card">
        <span class="stat-label">Canciones</span>
        <strong class="stat-number">${state.songs.length}</strong>
      </article>
      <article class="card pad stats-card">
        <span class="stat-label">Listas para tocar</span>
        <strong class="stat-number">${ready}</strong>
      </article>
      <article class="card pad stats-card">
        <span class="stat-label">Propias</span>
        <strong class="stat-number">${own}</strong>
      </article>
      <article class="card pad stats-card">
        <span class="stat-label">Necesitan repaso</span>
        <strong class="stat-number">${needsReview}</strong>
      </article>
    </section>

    <section class="grid two" style="margin-top: 18px;">
      <article class="card pad">
        <div class="section-title" style="margin-top: 0;">
          <h2>Próximo evento</h2>
          <button class="btn small" data-action="route" data-route="events">Ver eventos</button>
        </div>
        ${nextEvent ? `
          <h3>${escapeHtml(nextEvent.name)}</h3>
          <p class="page-description">${escapeHtml(nextEvent.eventType || "Evento")} · ${escapeHtml(nextEvent.date || "Sin fecha")} · ${formatDurationTotal(nextEvent.setlist || [])}</p>
          <div class="song-meta">
            ${(nextEvent.setlist || []).slice(0, 6).map((item) => `<span class="pill">${escapeHtml(getSong(item.songId)?.title || "Canción")}</span>`).join("")}
          </div>
        ` : renderEmpty("Sin eventos todavía", "Creen un evento y armen un setlist. La improvisación es linda hasta que alguien pregunta '¿y ahora cuál sigue?'.")}
      </article>
      <article class="card pad">
        <div class="section-title" style="margin-top: 0;">
          <h2>Canciones para revisar</h2>
          <button class="btn small" data-action="route" data-route="songs">Abrir repertorio</button>
        </div>
        ${state.songs.filter((song) => song.status === "repasar" || song.readiness === "roja").slice(0, 5).length ? `
          <div class="list">
            ${state.songs.filter((song) => song.status === "repasar" || song.readiness === "roja").slice(0, 5).map(renderSmallSongItem).join("")}
          </div>
        ` : renderEmpty("Nada crítico", "Por ahora ninguna canción está marcada como incendio musical. Sospechoso, pero agradable.")}
      </article>
    </section>

    <section class="card pad" style="margin-top: 18px;">
      <div class="section-title" style="margin-top: 0;">
        <h2>Últimas canciones</h2>
        <button class="btn small" data-action="open-seed-modal">Cargar ejemplos</button>
      </div>
      ${state.songs.length ? `<div class="song-grid">${state.songs.slice(0, 6).map(renderSongCard).join("")}</div>` : renderEmpty("Repertorio vacío", "Agreguen canciones propias, covers, arreglos y notas. La app no adivina repertorio todavía, tampoco exageremos.")}
    </section>
  `;
}

function renderSongsPage() {
  const filtered = filteredSongs();
  const allTags = [...new Set(state.songs.flatMap((song) => [...(song.moodTags || []), ...(song.eventTags || [])]))].sort();
  const selected = getSong(state.selectedSongId) || filtered[0] || state.songs[0];

  return `
    ${pageHeader(
      "Repertorio",
      "Canciones, arreglos y recursos",
      "La biblioteca principal: letras, acordes, archivos, partes por instrumento y esa bendita información que uno cree recordar hasta que prende el micrófono.",
      `<button class="btn primary" data-action="open-song-modal">+ Nueva canción</button>`
    )}

    <section class="toolbar">
      <div class="filters">
        <input class="input" style="min-width: 260px;" data-action="filter" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Buscar canción, artista, tag..." />
        <select class="select" style="width: 170px;" data-action="filter" data-filter="status">
          <option value="">Todos los estados</option>
          ${Object.entries(statusMap).map(([key, label]) => `<option value="${key}" ${state.filters.status === key ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <select class="select" style="width: 160px;" data-action="filter" data-filter="type">
          <option value="">Propias y covers</option>
          <option value="propia" ${state.filters.type === "propia" ? "selected" : ""}>Propias</option>
          <option value="cover" ${state.filters.type === "cover" ? "selected" : ""}>Covers</option>
        </select>
        <select class="select" style="width: 190px;" data-action="filter" data-filter="tag">
          <option value="">Todos los tags</option>
          ${allTags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.filters.tag === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}
        </select>
        <button class="btn" data-action="apply-filters">Aplicar</button>
      </div>
      <button class="btn" data-action="clear-filters">Limpiar filtros</button>
    </section>

    ${filtered.length ? `
      <div class="detail-layout">
        <section>
          <div class="song-grid">${filtered.map(renderSongCard).join("")}</div>
        </section>
        <aside>${selected ? renderSongDetail(selected) : ""}</aside>
      </div>
    ` : renderEmpty("No hay canciones con esos filtros", "Cambien los filtros o agreguen canciones nuevas. La app no puede inventarse el repertorio, aunque ganas no le faltan.")}
  `;
}

function renderSongCard(song) {
  const readinessClass = song.readiness === "verde" ? "green" : song.readiness === "roja" ? "red" : "yellow";
  return `
    <button class="song-card" data-action="select-song" data-song-id="${song.id}">
      <div>
        <div class="song-meta" style="margin-bottom: 12px;">
          <span class="pill dark">${song.type === "propia" ? "Propia" : "Cover"}</span>
          <span class="pill ${readinessClass}">${escapeHtml(readinessMap[song.readiness] || "Amarilla")}</span>
        </div>
        <h3>${escapeHtml(song.title || "Sin título")}</h3>
        <p class="artist">${escapeHtml(song.artist || "Sin artista")}</p>
      </div>
      <p class="artist">${escapeHtml(song.notes ? song.notes.slice(0, 110) : "Sin notas todavía.")}${song.notes?.length > 110 ? "..." : ""}</p>
      <div class="song-meta">
        ${song.keyBshert ? `<span class="pill">Tono ${escapeHtml(song.keyBshert)}</span>` : ""}
        ${song.duration ? `<span class="pill">${escapeHtml(song.duration)}</span>` : ""}
        ${song.status ? `<span class="pill">${escapeHtml(statusMap[song.status] || song.status)}</span>` : ""}
      </div>
    </button>
  `;
}

function renderSmallSongItem(song) {
  return `
    <div class="list-item">
      <div class="list-item-main">
        <p class="list-item-title">${escapeHtml(song.title || "Sin título")}</p>
        <p class="list-item-subtitle">${escapeHtml(song.artist || "Sin artista")} · ${escapeHtml(statusMap[song.status] || "Sin estado")}</p>
      </div>
      <button class="btn small" data-action="go-song" data-song-id="${song.id}">Abrir</button>
    </div>
  `;
}

function renderSongDetail(song) {
  const tabs = [
    ["resumen", "Resumen"],
    ["letra", "Letra/Acordes"],
    ["instrumentos", "Instrumentos"],
    ["archivos", "Archivos"],
    ["alma", "Alma"]
  ];

  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">${escapeHtml(song.title || "Sin título")}</h2>
          <p class="artist">${escapeHtml(song.artist || "Sin artista")} · ${escapeHtml(song.genre || "Sin género")}</p>
        </div>
        <div class="actions">
          <button class="btn small" data-action="edit-song" data-song-id="${song.id}">Editar</button>
          <button class="btn small danger" data-action="delete-song" data-song-id="${song.id}">Borrar</button>
        </div>
      </div>
      <div class="tabs">
        ${tabs.map(([tab, label]) => `
          <button class="tab-btn ${state.selectedSongTab === tab ? "active" : ""}" data-action="song-tab" data-tab="${tab}">${label}</button>
        `).join("")}
      </div>
      <div class="card-body">${renderSongTab(song)}</div>
    </article>
  `;
}

function renderSongTab(song) {
  if (state.selectedSongTab === "letra") {
    return `
      <div class="section-title" style="margin-top: 0;">
        <h3>Letra y acordes</h3>
        <button class="btn small" data-action="edit-song" data-song-id="${song.id}">Editar texto</button>
      </div>
      <div class="lyrics-view">${escapeHtml(song.chords || song.lyrics || "Sin letra ni acordes todavía.")}</div>
      ${song.lyrics && song.chords ? `
        <div class="section-title"><h3>Solo letra</h3></div>
        <div class="lyrics-view">${escapeHtml(song.lyrics)}</div>
      ` : ""}
    `;
  }

  if (state.selectedSongTab === "instrumentos") {
    return `
      <div class="section-title" style="margin-top: 0;">
        <h3>Partes por instrumento</h3>
        <button class="btn small" data-action="edit-song" data-song-id="${song.id}">Editar partes</button>
      </div>
      <div class="lyrics-view">${escapeHtml(song.instrumentParts || "Ejemplo:\nVoz Cata: entra suave en verso 1.\nGuitarra Alek: arpegio en intro, rasgueo en coro.\nCorte: silencio antes del último coro.")}</div>
      <div class="song-meta" style="margin-top: 14px;">
        ${asArray(song.instruments).map((instrument) => `<span class="pill">${escapeHtml(instrument)}</span>`).join("")}
      </div>
    `;
  }

  if (state.selectedSongTab === "archivos") {
    return renderResources(song);
  }

  if (state.selectedSongTab === "alma") {
    return `
      <div class="section-title" style="margin-top: 0;"><h3>Alma de la canción</h3></div>
      <div class="lyrics-view">${escapeHtml(song.soul || "¿De qué habla esta canción? ¿Qué imagen la representa? ¿Qué emoción no se debe perder al tocarla? Este espacio es para eso, no para que se vuelva otra nota perdida.")}</div>
      <div class="section-title"><h3>Notas interpretativas</h3></div>
      <div class="lyrics-view">${escapeHtml(song.notes || "Sin notas interpretativas todavía.")}</div>
    `;
  }

  return `
    <div class="grid two">
      ${renderInfo("Estado", statusMap[song.status] || "Sin estado")}
      ${renderInfo("Preparación", readinessMap[song.readiness] || "Sin color")}
      ${renderInfo("Tonalidad original", song.keyOriginal || "Sin dato")}
      ${renderInfo("Tonalidad B'shert", song.keyBshert || "Sin dato")}
      ${renderInfo("Capo", song.capo || "No definido")}
      ${renderInfo("BPM", song.bpm || "Sin dato")}
      ${renderInfo("Duración", song.duration || "Sin dato")}
      ${renderInfo("Voz principal", song.leadVoice || "Sin dato")}
    </div>
    <div class="section-title"><h3>Tags</h3></div>
    <div class="song-meta">
      ${[...(song.moodTags || []), ...(song.eventTags || [])].map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("") || `<span class="pill">Sin tags</span>`}
    </div>
    <div class="section-title"><h3>Links de referencia</h3></div>
    ${renderLinks(song.referenceLinks || [])}
  `;
}

function renderInfo(label, value) {
  return `
    <div class="card pad" style="box-shadow:none;">
      <span class="label">${escapeHtml(label)}</span>
      <p style="margin: 8px 0 0; font-weight: 900;">${escapeHtml(value)}</p>
    </div>
  `;
}

function renderLinks(links = []) {
  const clean = asArray(links);
  if (!clean.length) return `<p class="page-description">Sin links todavía.</p>`;
  return `<div class="list">${clean.map((link) => `
    <div class="list-item">
      <a class="resource-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>
    </div>
  `).join("")}</div>`;
}

function renderResources(song) {
  const resources = song.resources || [];
  return `
    <div class="section-title" style="margin-top: 0;">
      <h3>Archivos y recursos</h3>
    </div>
    <div class="upload-box">
      <div class="form-grid">
        <div class="form-field">
          <label class="label">Tipo de recurso</label>
          <select class="select" id="resource-type">
            <option value="partitura">Partitura</option>
            <option value="tab">Tab</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="imagen">Imagen</option>
            <option value="documento">Documento</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="form-field">
          <label class="label">Archivo</label>
          <input class="input" id="resource-file" type="file" />
        </div>
        <div class="form-field full">
          <button class="btn primary" data-action="upload-resource" data-song-id="${song.id}">Subir archivo</button>
          <p class="help">También pueden pegar links en la ficha de la canción. Los archivos van a Firebase Storage.</p>
        </div>
      </div>
    </div>
    <div style="height: 14px"></div>
    ${resources.length ? `
      <div class="list">
        ${resources.map((resource) => `
          <div class="list-item">
            <div class="list-item-main">
              <p class="list-item-title">${escapeHtml(resource.name || "Archivo")}</p>
              <p class="list-item-subtitle">${escapeHtml(resource.type || "Recurso")} · ${formatDate(resource.createdAt)}</p>
              <a class="resource-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Abrir recurso</a>
            </div>
            <button class="btn small danger" data-action="remove-resource" data-song-id="${song.id}" data-resource-id="${escapeHtml(resource.id)}">Quitar</button>
          </div>
        `).join("")}
      </div>
    ` : renderEmpty("Sin archivos", "Suban partituras, tabs, audios, imágenes o PDFs. Sí, por fin todo en un solo sitio, milagro administrativo.")}
  `;
}

function renderEventsPage() {
  const selected = getEvent(state.selectedEventId) || state.events[0];
  return `
    ${pageHeader(
      "Eventos",
      "Setlists para tocar sin entrar en pánico",
      "Creen eventos, ordenen canciones, calculen duración aproximada y abran el modo en vivo. La dignidad escénica agradece.",
      `<button class="btn primary" data-action="open-event-modal">+ Nuevo evento</button>
       <button class="btn" data-action="print-page">Imprimir setlist</button>`
    )}

    ${state.events.length ? `
      <section class="event-layout">
        <aside class="card pad">
          <h2 style="margin-top:0;">Eventos</h2>
          <div class="list">
            ${state.events.map((event) => `
              <button class="list-item" style="text-align:left;" data-action="select-event" data-event-id="${event.id}">
                <div class="list-item-main">
                  <p class="list-item-title">${escapeHtml(event.name)}</p>
                  <p class="list-item-subtitle">${escapeHtml(event.date || "Sin fecha")} · ${escapeHtml(event.eventType || "Evento")}</p>
                </div>
                <span class="pill">${(event.setlist || []).length}</span>
              </button>
            `).join("")}
          </div>
        </aside>
        <section>${selected ? renderEventDetail(selected) : ""}</section>
      </section>
    ` : renderEmpty("Todavía no hay eventos", "Creen el primer evento y agreguen canciones. El caos también puede tener agenda.")}
  `;
}

function renderEventDetail(event) {
  const setlist = event.setlist || [];
  const availableSongs = state.songs.filter((song) => !setlist.some((item) => item.songId === song.id));
  return `
    <article class="card pad">
      <div class="section-title" style="margin-top: 0;">
        <div>
          <h2>${escapeHtml(event.name || "Evento")}</h2>
          <p class="page-description">${escapeHtml(event.eventType || "Evento")} · ${escapeHtml(event.date || "Sin fecha")} · ${formatDurationTotal(setlist)}</p>
        </div>
        <div class="actions no-print">
          <button class="btn small" data-action="edit-event" data-event-id="${event.id}">Editar</button>
          <button class="btn small brand" data-action="go-live" data-event-id="${event.id}">Abrir en vivo</button>
          <button class="btn small danger" data-action="delete-event" data-event-id="${event.id}">Borrar</button>
        </div>
      </div>

      <div class="upload-box no-print">
        <div class="form-grid">
          <div class="form-field">
            <label class="label">Agregar canción al setlist</label>
            <select class="select" id="add-song-select">
              <option value="">Seleccionar canción</option>
              ${availableSongs.map((song) => `<option value="${song.id}">${escapeHtml(song.title)} · ${escapeHtml(song.artist || "")}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label class="label">Nota rápida para este evento</label>
            <input class="input" id="add-song-note" placeholder="Ej: versión corta, tono G, entra Cata..." />
          </div>
          <div class="form-field full">
            <button class="btn primary" data-action="add-song-setlist" data-event-id="${event.id}">Agregar al setlist</button>
          </div>
        </div>
      </div>

      <div class="section-title">
        <h3>Setlist</h3>
        <span class="pill dark">${formatDurationTotal(setlist)}</span>
      </div>
      ${setlist.length ? `
        <div class="list">
          ${setlist.map((item, index) => renderSetlistItem(event, item, index)).join("")}
        </div>
      ` : renderEmpty("Setlist vacío", "Agreguen canciones. Un evento sin setlist es una conversación incómoda con instrumentos.")}

      ${event.notes ? `
        <div class="section-title"><h3>Notas del evento</h3></div>
        <div class="lyrics-view">${escapeHtml(event.notes)}</div>
      ` : ""}
    </article>
  `;
}

function renderSetlistItem(event, item, index) {
  const song = getSong(item.songId);
  return `
    <div class="setlist-item">
      <div class="setlist-order">${index + 1}</div>
      <div class="list-item-main">
        <p class="list-item-title">${escapeHtml(song?.title || "Canción eliminada")}</p>
        <p class="list-item-subtitle">
          ${escapeHtml(song?.artist || "Sin artista")} · ${escapeHtml(item.customKey || song?.keyBshert || "Sin tono")} · ${escapeHtml(item.note || "Sin nota")}
        </p>
      </div>
      <div class="actions no-print">
        <button class="btn small square" title="Subir" data-action="move-setlist" data-event-id="${event.id}" data-item-id="${item.id}" data-dir="up">↑</button>
        <button class="btn small square" title="Bajar" data-action="move-setlist" data-event-id="${event.id}" data-item-id="${item.id}" data-dir="down">↓</button>
        <button class="btn small danger" data-action="remove-setlist" data-event-id="${event.id}" data-item-id="${item.id}">Quitar</button>
      </div>
    </div>
  `;
}

function renderLivePage() {
  const event = getEvent(state.liveEventId) || state.events[0];
  const setlist = event?.setlist || [];
  const currentItem = setlist[state.liveIndex] || setlist[0];
  const currentSong = currentItem ? getSong(currentItem.songId) : null;

  return `
    ${pageHeader(
      "Modo en vivo",
      "Atril digital",
      "Vista grande, limpia y rápida para tocar. Porque buscar PDFs mientras alguien aplaude es una pequeña forma de terror contemporáneo.",
      `<select class="select" style="width: 260px;" data-action="live-event-select">
        ${state.events.map((item) => `<option value="${item.id}" ${event?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
       </select>`
    )}

    ${event && setlist.length ? `
      <section class="live-shell">
        <aside class="live-sidebar">
          ${setlist.map((item, index) => {
            const song = getSong(item.songId);
            return `
              <button class="live-song-button ${index === state.liveIndex ? "active" : ""}" data-action="live-index" data-index="${index}">
                <strong>${index + 1}. ${escapeHtml(song?.title || "Canción")}</strong><br>
                <small>${escapeHtml(song?.keyBshert || item.customKey || "Sin tono")} · ${escapeHtml(item.note || song?.artist || "")}</small>
              </button>
            `;
          }).join("")}
        </aside>
        <main class="live-main">
          <div class="live-controls no-print">
            <div class="actions">
              <button class="btn small" data-action="live-prev">← Anterior</button>
              <button class="btn small" data-action="live-next">Siguiente →</button>
              <button class="btn small" data-action="toggle-scroll">Auto-scroll</button>
              <button class="btn small" data-action="fullscreen">Pantalla completa</button>
            </div>
            <div class="actions">
              <select class="select" style="width: 170px;" data-action="live-view">
                <option value="all" ${state.liveView === "all" ? "selected" : ""}>Todo</option>
                <option value="chords" ${state.liveView === "chords" ? "selected" : ""}>Acordes</option>
                <option value="lyrics" ${state.liveView === "lyrics" ? "selected" : ""}>Letra</option>
                <option value="notes" ${state.liveView === "notes" ? "selected" : ""}>Notas</option>
                <option value="parts" ${state.liveView === "parts" ? "selected" : ""}>Instrumentos</option>
              </select>
              <button class="btn small square" data-action="live-font" data-dir="down">A-</button>
              <button class="btn small square" data-action="live-font" data-dir="up">A+</button>
            </div>
          </div>
          <div class="live-content" id="live-content" style="--live-font: ${state.liveFont}px;">
            ${currentSong ? renderLiveSong(currentSong, currentItem, event) : renderEmpty("Sin canción", "El setlist tiene algo raro. Seguro fue culpa de un botón, jamás de nosotros.")}
          </div>
        </main>
      </section>
    ` : renderEmpty("No hay setlist para abrir", "Creen un evento con canciones primero. El modo en vivo no toca solo, por ahora.")}
  `;
}

function renderLiveSong(song, item, event) {
  const content = [];
  if (state.liveView === "all" || state.liveView === "chords") content.push(song.chords || "");
  if (state.liveView === "lyrics") content.push(song.lyrics || song.chords || "");
  if (state.liveView === "notes") content.push(song.notes || "Sin notas.");
  if (state.liveView === "parts") content.push(song.instrumentParts || "Sin partes por instrumento.");
  if (state.liveView === "all") {
    if (song.instrumentParts) content.push(`\n--- Instrumentos ---\n${song.instrumentParts}`);
    if (song.notes || item.note) content.push(`\n--- Notas ---\n${item.note || ""}\n${song.notes || ""}`);
  }
  const finalContent = content.filter(Boolean).join("\n\n") || "Sin contenido para esta vista.";

  return `
    <h2>${escapeHtml(song.title)}</h2>
    <p class="live-meta">
      ${escapeHtml(event.name)} · ${escapeHtml(song.artist || "Sin artista")} · Tono: ${escapeHtml(item.customKey || song.keyBshert || "sin definir")} · ${escapeHtml(song.duration || "sin duración")}
    </p>
    <div class="live-lyrics">${escapeHtml(finalContent)}</div>
  `;
}

function renderSettingsPage() {
  return `
    ${pageHeader(
      "Ajustes",
      "Configuración y despliegue",
      "Aquí están los datos útiles para publicar y proteger la app. Lo emocionante de la seguridad: si se ignora, luego sí se vuelve emocionante, pero mal.",
      `<button class="btn" data-action="open-seed-modal">Cargar canciones ejemplo</button>`
    )}
    <section class="grid two">
      <article class="card pad">
        <h2 style="margin-top:0;">Firebase usado</h2>
        <div class="list">
          <div class="list-item"><span>Auth</span><strong>Google Login</strong></div>
          <div class="list-item"><span>Base de datos</span><strong>Cloud Firestore</strong></div>
          <div class="list-item"><span>Archivos</span><strong>Cloud Storage</strong></div>
          <div class="list-item"><span>Hosting</span><strong>Firebase Hosting</strong></div>
        </div>
      </article>
      <article class="card pad">
        <h2 style="margin-top:0;">Atajos modo en vivo</h2>
        <p><span class="kbd">←</span> canción anterior</p>
        <p><span class="kbd">→</span> canción siguiente</p>
        <p><span class="kbd">+</span> agrandar texto</p>
        <p><span class="kbd">-</span> reducir texto</p>
      </article>
      <article class="card pad">
        <h2 style="margin-top:0;">Reglas incluidas</h2>
        <p class="page-description">El ZIP trae <strong>firestore.rules</strong> y <strong>storage.rules</strong> en modo privado para usuarios autenticados. Para producción conviene restringir por miembros de banda.</p>
      </article>
      <article class="card pad">
        <h2 style="margin-top:0;">Estructura de datos</h2>
        <pre class="lyrics-view" style="min-height:auto;">bands/bshert/songs\nbands/bshert/events\nStorage: bands/bshert/songs/{songId}/...</pre>
      </article>
    </section>
  `;
}

function renderEmpty(title, description) {
  return `
    <div class="empty">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>
  `;
}

function filteredSongs() {
  const term = state.filters.search.trim().toLowerCase();
  return state.songs.filter((song) => {
    const combined = [
      song.title,
      song.artist,
      song.genre,
      song.language,
      song.keyBshert,
      song.notes,
      ...(song.moodTags || []),
      ...(song.eventTags || [])
    ].join(" ").toLowerCase();

    if (term && !combined.includes(term)) return false;
    if (state.filters.status && song.status !== state.filters.status) return false;
    if (state.filters.type && song.type !== state.filters.type) return false;
    if (state.filters.tag && ![...(song.moodTags || []), ...(song.eventTags || [])].includes(state.filters.tag)) return false;
    return true;
  });
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal.type === "song") return renderSongModal(state.modal.songId);
  if (state.modal.type === "event") return renderEventModal(state.modal.eventId);
  if (state.modal.type === "seed") return renderSeedModal();
  return "";
}

function renderSongModal(songId) {
  const song = songId ? getSong(songId) : null;
  const data = { ...defaultSong, ...(song || {}) };
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" data-modal="true">
        <header class="modal-header">
          <h2>${song ? "Editar canción" : "Nueva canción"}</h2>
          <button class="btn small" data-action="close-modal">Cerrar</button>
        </header>
        <form class="modal-body" data-action="save-song" data-song-id="${songId || ""}">
          <div class="form-grid">
            ${inputField("title", "Título", data.title, "Ej: ¿Y cuándo es el regreso?")}
            ${inputField("artist", "Artista / autor", data.artist, "B'shert, Coldplay, Natalia Lafourcade...")}
            ${selectField("type", "Tipo", data.type, [["propia", "Propia"], ["cover", "Cover"], ["adaptacion", "Adaptación"], ["instrumental", "Instrumental"]])}
            ${selectField("status", "Estado", data.status, Object.entries(statusMap))}
            ${selectField("readiness", "Semáforo", data.readiness, Object.entries(readinessMap))}
            ${inputField("genre", "Género", data.genre, "Vals, pop, balada, bolero...")}
            ${inputField("language", "Idioma", data.language, "Español")}
            ${inputField("duration", "Duración", data.duration, "4 min")}
            ${inputField("bpm", "BPM", data.bpm, "72")}
            ${inputField("keyOriginal", "Tonalidad original", data.keyOriginal, "D")}
            ${inputField("keyBshert", "Tonalidad B'shert", data.keyBshert, "Re mayor")}
            ${inputField("capo", "Capo", data.capo, "Capo 2")}
            ${inputField("leadVoice", "Voz principal", data.leadVoice, "Alek / Cata / Dúo")}
            ${inputField("difficulty", "Dificultad", data.difficulty, "Fácil / Media / Alta")}
            ${inputField("instruments", "Instrumentos", arrayToInput(data.instruments), "Voz, guitarra, piano")}
            ${inputField("moodTags", "Mood tags", arrayToInput(data.moodTags), "Romántica, íntima, nostálgica")}
            ${inputField("eventTags", "Tags de evento", arrayToInput(data.eventTags), "Matrimonio, cóctel, ceremonia")}
            ${inputField("referenceLinks", "Links de referencia", arrayToInput(data.referenceLinks), "Un link por coma")}
            ${textareaField("lyrics", "Letra", data.lyrics, "Pegar letra aquí...")}
            ${textareaField("chords", "Letra con acordes / cifrado", data.chords, "[Intro]\nD  A  Bm  G...")}
            ${textareaField("instrumentParts", "Partes por instrumento", data.instrumentParts, "Voz Cata:\nGuitarra Alek:\nPiano:")}
            ${textareaField("notes", "Notas técnicas / interpretación", data.notes, "Entradas, cortes, energía, dinámica...")}
            ${textareaField("soul", "Alma de la canción", data.soul, "Historia, emoción, imagen, intención...")}
          </div>
          <div class="actions" style="margin-top: 18px; justify-content: flex-end;">
            <button class="btn" type="button" data-action="close-modal">Cancelar</button>
            <button class="btn primary" type="submit">Guardar canción</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderEventModal(eventId) {
  const event = eventId ? getEvent(eventId) : null;
  const data = {
    name: "",
    eventType: "Matrimonio",
    date: "",
    location: "",
    client: "",
    durationTarget: "",
    notes: "",
    ...(event || {})
  };
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" data-modal="true">
        <header class="modal-header">
          <h2>${event ? "Editar evento" : "Nuevo evento"}</h2>
          <button class="btn small" data-action="close-modal">Cerrar</button>
        </header>
        <form class="modal-body" data-action="save-event" data-event-id="${eventId || ""}">
          <div class="form-grid">
            ${inputField("name", "Nombre del evento", data.name, "Matrimonio Laura y Daniel")}
            ${selectField("eventType", "Tipo de evento", data.eventType, eventTypes.map((item) => [item, item]))}
            ${inputField("date", "Fecha", data.date, "2026-08-15", "date")}
            ${inputField("location", "Lugar", data.location, "Bogotá")}
            ${inputField("client", "Cliente / contacto", data.client, "Nombre")}
            ${inputField("durationTarget", "Duración objetivo", data.durationTarget, "90 min")}
            ${textareaField("notes", "Notas del evento", data.notes, "Momentos, canciones obligatorias, restricciones, logística...")}
          </div>
          <div class="actions" style="margin-top: 18px; justify-content: flex-end;">
            <button class="btn" type="button" data-action="close-modal">Cancelar</button>
            <button class="btn primary" type="submit">Guardar evento</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderSeedModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" data-modal="true">
        <header class="modal-header">
          <h2>Cargar ejemplos</h2>
          <button class="btn small" data-action="close-modal">Cerrar</button>
        </header>
        <div class="modal-body">
          <p class="page-description" style="margin-top:0;">Esto crea canciones y un evento de prueba para que vean cómo funciona la app. Después pueden borrar todo, como cuando uno organiza la vida por dos minutos.</p>
          <div class="actions" style="justify-content:flex-start; margin-top: 16px;">
            <button class="btn primary" data-action="seed-data">Crear datos de ejemplo</button>
            <button class="btn" data-action="close-modal">Cancelar</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function inputField(name, label, value = "", placeholder = "", type = "text") {
  return `
    <div class="form-field">
      <label class="label" for="${name}">${label}</label>
      <input class="input" id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />
    </div>
  `;
}

function selectField(name, label, value = "", options = []) {
  return `
    <div class="form-field">
      <label class="label" for="${name}">${label}</label>
      <select class="select" id="${name}" name="${name}">
        ${options.map(([key, optionLabel]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </div>
  `;
}

function textareaField(name, label, value = "", placeholder = "") {
  return `
    <div class="form-field full">
      <label class="label" for="${name}">${label}</label>
      <textarea class="textarea mono" id="${name}" name="${name}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function bindGlobalEvents() {
  appRoot.onclick = handleClick;
  appRoot.onchange = handleChange;
  appRoot.oninput = handleInput;
  appRoot.onsubmit = handleSubmit;
}

function handleClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;

  if (action === "close-modal" && event.target.closest("[data-modal]") && event.target.classList.contains("modal-backdrop")) return;
  if (action === "close-modal" && event.target.closest("[data-modal]") && !event.target.matches("button")) return;

  const actions = {
    login,
    logout,
    route: () => setRoute(actionEl.dataset.route),
    "open-song-modal": () => openModal("song"),
    "open-event-modal": () => openModal("event"),
    "open-seed-modal": () => openModal("seed"),
    "close-modal": () => closeModal(),
    "select-song": () => selectSong(actionEl.dataset.songId),
    "go-song": () => goSong(actionEl.dataset.songId),
    "edit-song": () => openModal("song", { songId: actionEl.dataset.songId }),
    "delete-song": () => deleteSong(actionEl.dataset.songId),
    "song-tab": () => { state.selectedSongTab = actionEl.dataset.tab; render(); },
    "upload-resource": () => uploadResource(actionEl.dataset.songId),
    "remove-resource": () => removeResource(actionEl.dataset.songId, actionEl.dataset.resourceId),
    "apply-filters": () => render(),
    "clear-filters": () => clearFilters(),
    "select-event": () => { state.selectedEventId = actionEl.dataset.eventId; render(); },
    "edit-event": () => openModal("event", { eventId: actionEl.dataset.eventId }),
    "delete-event": () => deleteEvent(actionEl.dataset.eventId),
    "add-song-setlist": () => addSongToSetlist(actionEl.dataset.eventId),
    "remove-setlist": () => removeFromSetlist(actionEl.dataset.eventId, actionEl.dataset.itemId),
    "move-setlist": () => moveSetlistItem(actionEl.dataset.eventId, actionEl.dataset.itemId, actionEl.dataset.dir),
    "go-live": () => { state.liveEventId = actionEl.dataset.eventId; state.liveIndex = 0; setRoute("live"); },
    "live-index": () => { state.liveIndex = Number(actionEl.dataset.index); render(); },
    "live-prev": livePrev,
    "live-next": liveNext,
    "toggle-scroll": toggleAutoScroll,
    fullscreen: goFullscreen,
    "live-font": () => changeLiveFont(actionEl.dataset.dir),
    "print-page": () => window.print(),
    "seed-data": seedData
  };

  if (actions[action]) {
    event.preventDefault();
    actions[action]();
  }
}

function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;
  if (action === "filter") {
    state.filters[target.dataset.filter] = target.value;
    render();
  }
  if (action === "live-event-select") {
    state.liveEventId = target.value;
    state.liveIndex = 0;
    render();
  }
  if (action === "live-view") {
    state.liveView = target.value;
    render();
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === "filter") {
    state.filters[target.dataset.filter] = target.value;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("form[data-action]");
  if (!form) return;
  event.preventDefault();

  if (form.dataset.action === "save-song") await saveSong(form, form.dataset.songId);
  if (form.dataset.action === "save-event") await saveEvent(form, form.dataset.eventId);
}

function openModal(type, payload = {}) {
  state.modal = { type, ...payload };
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function selectSong(songId) {
  state.selectedSongId = songId;
  render();
}

function goSong(songId) {
  state.selectedSongId = songId;
  state.route = "songs";
  render();
}

function clearFilters() {
  state.filters = { search: "", status: "", type: "", tag: "" };
  render();
}

async function saveSong(form, songId) {
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    title: data.title.trim() || "Sin título",
    artist: data.artist.trim(),
    type: data.type,
    genre: data.genre.trim(),
    language: data.language.trim(),
    duration: data.duration.trim(),
    bpm: data.bpm.trim(),
    keyOriginal: data.keyOriginal.trim(),
    keyBshert: data.keyBshert.trim(),
    capo: data.capo.trim(),
    leadVoice: data.leadVoice.trim(),
    instruments: asArray(data.instruments),
    difficulty: data.difficulty.trim(),
    status: data.status,
    readiness: data.readiness,
    moodTags: asArray(data.moodTags),
    eventTags: asArray(data.eventTags),
    lyrics: data.lyrics.trim(),
    chords: data.chords.trim(),
    notes: data.notes.trim(),
    soul: data.soul.trim(),
    instrumentParts: data.instrumentParts.trim(),
    referenceLinks: asArray(data.referenceLinks),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  };

  try {
    if (songId) {
      await updateDoc(songDoc(songId), payload);
      toast("Canción actualizada.");
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = state.user.email;
      payload.resources = [];
      const created = await addDoc(songsCol(), payload);
      state.selectedSongId = created.id;
      toast("Canción creada.");
    }
    closeModal();
  } catch (error) {
    console.error(error);
    toast("No pude guardar la canción. Revisa Firestore y las reglas.", "error");
  }
}

async function deleteSong(songId) {
  const song = getSong(songId);
  if (!song) return;
  if (!confirm(`¿Borrar "${song.title}"? Esto no borra archivos ya subidos si existen referencias externas.`)) return;
  try {
    await deleteDoc(songDoc(songId));
    state.selectedSongId = state.songs.find((item) => item.id !== songId)?.id || null;
    toast("Canción borrada.");
  } catch (error) {
    console.error(error);
    toast("No pude borrar la canción.", "error");
  }
}

async function uploadResource(songId) {
  const song = getSong(songId);
  const fileInput = document.querySelector("#resource-file");
  const typeInput = document.querySelector("#resource-type");
  const file = fileInput?.files?.[0];
  if (!song || !file) {
    toast("Selecciona un archivo primero. El botón no lee mentes, tragedia.", "error");
    return;
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `bands/${BAND_ID}/songs/${songId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);

  try {
    toast("Subiendo archivo...");
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "application/octet-stream"
    });

    await new Promise((resolve, reject) => {
      task.on("state_changed", null, reject, resolve);
    });

    const url = await getDownloadURL(storageRef);
    const resource = {
      id: crypto.randomUUID(),
      type: typeInput?.value || "otro",
      name: file.name,
      size: file.size,
      contentType: file.type,
      path,
      url,
      createdAt: new Date().toISOString(),
      createdBy: state.user.email
    };

    await updateDoc(songDoc(songId), {
      resources: arrayUnion(resource),
      updatedAt: serverTimestamp()
    });
    toast("Archivo subido y vinculado a la canción.");
  } catch (error) {
    console.error(error);
    toast("No pude subir el archivo. Revisa Storage, permisos y que el archivo no supere 25 MB.", "error");
  }
}

async function removeResource(songId, resourceId) {
  const song = getSong(songId);
  const resource = song?.resources?.find((item) => item.id === resourceId);
  if (!song || !resource) return;
  if (!confirm(`¿Quitar "${resource.name}" de la canción?`)) return;

  try {
    await updateDoc(songDoc(songId), {
      resources: arrayRemove(resource),
      updatedAt: serverTimestamp()
    });
    if (resource.path) {
      deleteObject(ref(storage, resource.path)).catch(() => {
        console.warn("No se pudo borrar el archivo físico. La referencia sí fue retirada.");
      });
    }
    toast("Recurso quitado.");
  } catch (error) {
    console.error(error);
    toast("No pude quitar el recurso.", "error");
  }
}

async function saveEvent(form, eventId) {
  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    name: data.name.trim() || "Evento sin nombre",
    eventType: data.eventType,
    date: data.date,
    location: data.location.trim(),
    client: data.client.trim(),
    durationTarget: data.durationTarget.trim(),
    notes: data.notes.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: state.user.email
  };

  try {
    if (eventId) {
      await updateDoc(eventDoc(eventId), payload);
      toast("Evento actualizado.");
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = state.user.email;
      payload.setlist = [];
      const created = await addDoc(eventsCol(), payload);
      state.selectedEventId = created.id;
      state.liveEventId = created.id;
      toast("Evento creado.");
    }
    closeModal();
  } catch (error) {
    console.error(error);
    toast("No pude guardar el evento.", "error");
  }
}

async function deleteEvent(eventId) {
  const event = getEvent(eventId);
  if (!event) return;
  if (!confirm(`¿Borrar el evento "${event.name}"?`)) return;
  try {
    await deleteDoc(eventDoc(eventId));
    state.selectedEventId = state.events.find((item) => item.id !== eventId)?.id || null;
    if (state.liveEventId === eventId) state.liveEventId = null;
    toast("Evento borrado.");
  } catch (error) {
    console.error(error);
    toast("No pude borrar el evento.", "error");
  }
}

async function addSongToSetlist(eventId) {
  const event = getEvent(eventId);
  const select = document.querySelector("#add-song-select");
  const note = document.querySelector("#add-song-note")?.value || "";
  const songId = select?.value;
  if (!event || !songId) {
    toast("Selecciona una canción para agregar.", "error");
    return;
  }

  const song = getSong(songId);
  const item = {
    id: crypto.randomUUID(),
    songId,
    customKey: song?.keyBshert || "",
    duration: song?.duration || "",
    note: note.trim()
  };

  try {
    await updateDoc(eventDoc(eventId), {
      setlist: [...(event.setlist || []), item],
      updatedAt: serverTimestamp()
    });
    toast("Canción agregada al setlist.");
  } catch (error) {
    console.error(error);
    toast("No pude agregar la canción al setlist.", "error");
  }
}

async function removeFromSetlist(eventId, itemId) {
  const event = getEvent(eventId);
  if (!event) return;
  const setlist = (event.setlist || []).filter((item) => item.id !== itemId);
  try {
    await updateDoc(eventDoc(eventId), { setlist, updatedAt: serverTimestamp() });
    toast("Canción retirada del setlist.");
  } catch (error) {
    console.error(error);
    toast("No pude actualizar el setlist.", "error");
  }
}

async function moveSetlistItem(eventId, itemId, direction) {
  const event = getEvent(eventId);
  if (!event) return;
  const setlist = [...(event.setlist || [])];
  const index = setlist.findIndex((item) => item.id === itemId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= setlist.length) return;
  [setlist[index], setlist[target]] = [setlist[target], setlist[index]];

  try {
    await updateDoc(eventDoc(eventId), { setlist, updatedAt: serverTimestamp() });
  } catch (error) {
    console.error(error);
    toast("No pude mover la canción.", "error");
  }
}

function livePrev() {
  const event = getEvent(state.liveEventId);
  const total = event?.setlist?.length || 0;
  if (!total) return;
  state.liveIndex = Math.max(0, state.liveIndex - 1);
  render();
}

function liveNext() {
  const event = getEvent(state.liveEventId);
  const total = event?.setlist?.length || 0;
  if (!total) return;
  state.liveIndex = Math.min(total - 1, state.liveIndex + 1);
  render();
}

function changeLiveFont(direction) {
  const delta = direction === "up" ? 2 : -2;
  state.liveFont = Math.max(16, Math.min(48, state.liveFont + delta));
  render();
}

function toggleAutoScroll() {
  if (scrollTimer) {
    stopAutoScroll();
    toast("Auto-scroll detenido.");
    return;
  }
  scrollTimer = setInterval(() => {
    const box = document.querySelector("#live-content");
    if (!box) return;
    box.scrollBy({ top: state.liveScrollSpeed, behavior: "smooth" });
  }, 120);
  toast("Auto-scroll activado.");
}

function stopAutoScroll() {
  if (scrollTimer) clearInterval(scrollTimer);
  scrollTimer = null;
}

function goFullscreen() {
  const shell = document.querySelector(".live-shell") || document.documentElement;
  if (!document.fullscreenElement) shell.requestFullscreen?.();
  else document.exitFullscreen?.();
}

async function seedData() {
  const samples = [
    {
      title: "¿Y cuándo es el regreso?",
      artist: "B'shert",
      type: "propia",
      genre: "Vals",
      language: "Español",
      duration: "4 min",
      bpm: "72",
      keyOriginal: "D",
      keyBshert: "Re mayor",
      capo: "Sin capo",
      leadVoice: "Dúo",
      instruments: ["Voz", "Guitarra", "Piano"],
      difficulty: "Media",
      status: "montaje",
      readiness: "amarilla",
      moodTags: ["Nostalgia", "Aceptación", "Íntima"],
      eventTags: ["Concierto íntimo", "Canciones propias"],
      lyrics: "¿Y cuándo es el regreso?\nSi la casa aún pregunta por tu voz...",
      chords: "[Intro]\nD  A  Bm  G\n\n[Verso]\nD              A\n¿Y cuándo es el regreso?\nBm             G\nSi la casa aún pregunta por tu voz...",
      notes: "Mantener tono de aceptación, dolor suave y nostalgia. No volverla dramática de más.",
      soul: "Una canción sobre la ausencia que sigue conversando con la casa.",
      instrumentParts: "Voz Alek: frase principal con aire.\nVoz Cata: segunda voz en respuestas.\nGuitarra: arpegio constante.\nPiano: notas largas, no invadir.",
      referenceLinks: [],
      resources: []
    },
    {
      title: "Perfect",
      artist: "Ed Sheeran",
      type: "cover",
      genre: "Pop balada",
      language: "Inglés",
      duration: "4 min",
      bpm: "95",
      keyOriginal: "Ab",
      keyBshert: "G",
      capo: "Capo 1 si se toca como G para sonar Ab",
      leadVoice: "Dúo",
      instruments: ["Voz", "Guitarra"],
      difficulty: "Media",
      status: "lista",
      readiness: "verde",
      moodTags: ["Romántica", "Suave", "Ceremonia"],
      eventTags: ["Matrimonio", "Cena", "Ceremonia"],
      lyrics: "Pegar aquí la letra autorizada o apuntes propios.",
      chords: "[Versión de trabajo]\nG  Em  C  D\n\nNotas: mantener pulso estable y dinámica suave.",
      notes: "Funciona para entrada o momento romántico. Cuidar pronunciación y no correr.",
      soul: "Canción cálida, directa y luminosa.",
      instrumentParts: "Guitarra: arpegio en versos, rasgueo suave en coro.\nVoz: segunda voz en último coro.",
      referenceLinks: [],
      resources: []
    },
    {
      title: "Bésame Mucho",
      artist: "Consuelo Velázquez",
      type: "cover",
      genre: "Bolero",
      language: "Español",
      duration: "3 min",
      bpm: "86",
      keyOriginal: "Dm",
      keyBshert: "Em",
      capo: "Sin capo",
      leadVoice: "Cata",
      instruments: ["Voz", "Guitarra", "Piano"],
      difficulty: "Alta",
      status: "repasar",
      readiness: "roja",
      moodTags: ["Romántica", "Elegante", "Nostálgica"],
      eventTags: ["Cena", "Cóctel", "Serenata"],
      lyrics: "Pegar aquí la letra autorizada o apuntes propios.",
      chords: "Em  Am  B7  Em\n\nRevisar modulaciones y cierre.",
      notes: "Necesita repaso de cortes y final. No entrar en modo bolero telenovela excesiva, gracias.",
      soul: "Elegancia, cercanía, tensión bonita.",
      instrumentParts: "Piano: marcar armonía con mucho espacio.\nGuitarra: rasgueo bolero suave.\nVoz: fraseo libre pero no perder tempo.",
      referenceLinks: [],
      resources: []
    }
  ];

  try {
    const createdIds = [];
    for (const sample of samples) {
      const docRef = await addDoc(songsCol(), {
        ...sample,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: state.user.email,
        updatedBy: state.user.email
      });
      createdIds.push(docRef.id);
    }

    await addDoc(eventsCol(), {
      name: "Setlist demo B'shert",
      eventType: "Concierto íntimo",
      date: new Date().toISOString().slice(0, 10),
      location: "Bogotá",
      client: "Demo interno",
      durationTarget: "30 min",
      notes: "Evento de prueba para validar el modo en vivo.",
      setlist: createdIds.map((id, index) => ({
        id: crypto.randomUUID(),
        songId: id,
        customKey: samples[index].keyBshert,
        duration: samples[index].duration,
        note: index === 0 ? "Abrir suave" : ""
      })),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: state.user.email,
      updatedBy: state.user.email
    });

    closeModal();
    toast("Datos de ejemplo creados.");
  } catch (error) {
    console.error(error);
    toast("No pude crear los ejemplos. Firestore volvió a ponerse intenso.", "error");
  }
}

document.addEventListener("keydown", (event) => {
  if (state.route !== "live") return;
  if (event.key === "ArrowRight") liveNext();
  if (event.key === "ArrowLeft") livePrev();
  if (event.key === "+") changeLiveFont("up");
  if (event.key === "-") changeLiveFont("down");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      console.info("Service worker no registrado. No es grave para desarrollo local.");
    });
  });
}

render();
