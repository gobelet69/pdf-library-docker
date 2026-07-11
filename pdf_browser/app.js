const DEFAULT_GRAPH_OPTIONS = {
  showFolders: true,
  showPdfs: true,
  showUnsorted: true,
  warningsOnly: false,
  showLabels: true,
  folderColors: true,
  nodeSize: 1,
  linkThickness: 0.8,
  textThreshold: 0.7,
  animate: true,
  centerForce: 0.55,
  repelForce: 90,
  linkForce: 0.7,
  linkDistance: 58,
};

const GRID_BATCH_SIZE = 80;
const INITIAL_THUMBNAIL_BATCH_SIZE = 6;
const DAILY_FIVE_STORAGE_KEY = "pdfLibrary.dailyFive.v2";
const DAILY_FIVE_HISTORY_KEY = "pdfLibrary.dailyFiveHistory.v2";

const state = {
  library: null,
  folder: "",
  metadataFilter: "",
  readFilter: "",
  attributeFilter: "",
  sortMode: "date_desc",
  query: "",
  selected: null,
  mode: "grid",
  triageIndex: 0,
  triageDestination: "",
  renameIndexPosition: 0,
  moveQueue: [],
  processingQueue: false,
  pendingMoves: 0,
  cleanupReport: null,
  cleanupLoading: false,
  contentSearch: null,
  contentSearchLoading: false,
  searchIndexing: false,
  searchIndexProgress: "",
  searchIndexPercent: 0,
  searchIndexMessage: "",
  renameIndex: null,
  renameIndexLoading: false,
  previewQueue: [],
  previewProcessing: false,
  previewTotal: 0,
  dragDepth: 0,
  dragActive: false,
  importing: false,
  importingUrl: false,
  urlImportPercent: 0,
  urlImportProgressTimer: null,
  captureCandidate: null,
  captureQueue: [],
  captureQueueIndex: 0,
  captureImporting: false,
  renameSuggestionCache: new Map(),
  graphFocusPath: "",
  graphOptions: { ...DEFAULT_GRAPH_OPTIONS },
  graphRenderer: null,
  graphSearch: "",
  graphPanelHidden: false,
  detailsAnchor: null,
  collapsedFolders: new Set(),
  readerPath: "",
  readerObjectUrl: "",
  readerLoadToken: 0,
  readerSidebarOpen: true,
  readerSaving: false,
  gridRenderLimit: GRID_BATCH_SIZE,
  gridObserver: null,
  thumbnailObserver: null,
  dailyFive: null,
  dailyFiveHistory: readJsonStorage(DAILY_FIVE_HISTORY_KEY, {}),
};

const el = {
  rootLabel: document.querySelector("#rootLabel"),
  allCount: document.querySelector("#allCount"),
  unsortedCount: document.querySelector("#unsortedCount"),
  quickTriageBtn: document.querySelector("#quickTriageBtn"),
  quickTriageCount: document.querySelector("#quickTriageCount"),
  quickRenameBtn: document.querySelector("#quickRenameBtn"),
  quickRenameCount: document.querySelector("#quickRenameCount"),
  cleanupBtn: document.querySelector("#cleanupBtn"),
  cleanupCount: document.querySelector("#cleanupCount"),
  graphBtn: document.querySelector("#graphBtn"),
  graphCount: document.querySelector("#graphCount"),
  folderTree: document.querySelector("#folderTree"),
  viewTitle: document.querySelector("#viewTitle"),
  viewMeta: document.querySelector("#viewMeta"),
  search: document.querySelector("#search"),
  sortSelect: document.querySelector("#sortSelect"),
  readFilter: document.querySelector("#readFilter"),
  attributeFilter: document.querySelector("#attributeFilter"),
  urlImportBtn: document.querySelector("#urlImportBtn"),
  urlImportPanel: document.querySelector("#urlImportPanel"),
  urlImportEyebrow: document.querySelector("#urlImportEyebrow"),
  urlImportTitle: document.querySelector("#urlImportTitle"),
  urlImportClose: document.querySelector("#urlImportClose"),
  urlImportInput: document.querySelector("#urlImportInput"),
  urlImportFilename: document.querySelector("#urlImportFilename"),
  urlImportSubmit: document.querySelector("#urlImportSubmit"),
  captureInbox: document.querySelector("#captureInbox"),
  captureProgress: document.querySelector("#captureProgress"),
  captureTitle: document.querySelector("#captureTitle"),
  captureCancel: document.querySelector("#captureCancel"),
  captureSource: document.querySelector("#captureSource"),
  captureFilename: document.querySelector("#captureFilename"),
  captureSuggestions: document.querySelector("#captureSuggestions"),
  captureDestination: document.querySelector("#captureDestination"),
  captureNewFolder: document.querySelector("#captureNewFolder"),
  captureCreateFolder: document.querySelector("#captureCreateFolder"),
  captureTags: document.querySelector("#captureTags"),
  captureNote: document.querySelector("#captureNote"),
  captureDuplicates: document.querySelector("#captureDuplicates"),
  captureSkip: document.querySelector("#captureSkip"),
  captureImport: document.querySelector("#captureImport"),
  rebuildSearchBtn: document.querySelector("#rebuildSearchBtn"),
  dropOverlay: document.querySelector("#dropOverlay"),
  triagePanel: document.querySelector("#triagePanel"),
  destinationSelect: document.querySelector("#destinationSelect"),
  newFolderInput: document.querySelector("#newFolderInput"),
  createFolderBtn: document.querySelector("#createFolderBtn"),
  moveBtn: document.querySelector("#moveBtn"),
  quickTriage: document.querySelector("#quickTriage"),
  triagePreview: document.querySelector("#triagePreview"),
  triageProgress: document.querySelector("#triageProgress"),
  triageTitle: document.querySelector("#triageTitle"),
  triageFilename: document.querySelector("#triageFilename"),
  triageDestinationButtons: document.querySelector("#triageDestinationButtons"),
  triageNewFolder: document.querySelector("#triageNewFolder"),
  triageCreateFolder: document.querySelector("#triageCreateFolder"),
  triageMove: document.querySelector("#triageMove"),
  triageSkip: document.querySelector("#triageSkip"),
  triageOpen: document.querySelector("#triageOpen"),
  triagePrevious: document.querySelector("#triagePrevious"),
  triageNext: document.querySelector("#triageNext"),
  quickRename: document.querySelector("#quickRename"),
  renamePreview: document.querySelector("#renamePreview"),
  renameProgress: document.querySelector("#renameProgress"),
  renameTitle: document.querySelector("#renameTitle"),
  renameFilename: document.querySelector("#renameFilename"),
  renameSuggestions: document.querySelector("#renameSuggestions"),
  renameApply: document.querySelector("#renameApply"),
  renameSkip: document.querySelector("#renameSkip"),
  renameOpen: document.querySelector("#renameOpen"),
  renamePrevious: document.querySelector("#renamePrevious"),
  renameNext: document.querySelector("#renameNext"),
  cleanupView: document.querySelector("#cleanupView"),
  cleanupSummary: document.querySelector("#cleanupSummary"),
  cleanupSections: document.querySelector("#cleanupSections"),
  searchView: document.querySelector("#searchView"),
  searchResults: document.querySelector("#searchResults"),
  graphView: document.querySelector("#graphView"),
  graphControls: document.querySelector("#graphControls"),
  graphReset: document.querySelector("#graphReset"),
  graphPanelClose: document.querySelector("#graphPanelClose"),
  graphPanelShow: document.querySelector("#graphPanelShow"),
  graphStage: document.querySelector("#graphStage"),
  graphSearch: document.querySelector("#graphSearch"),
  graphShowFolders: document.querySelector("#graphShowFolders"),
  graphShowPdfs: document.querySelector("#graphShowPdfs"),
  graphShowUnsorted: document.querySelector("#graphShowUnsorted"),
  graphWarningsOnly: document.querySelector("#graphWarningsOnly"),
  graphShowLabels: document.querySelector("#graphShowLabels"),
  graphFolderColors: document.querySelector("#graphFolderColors"),
  graphNodeSize: document.querySelector("#graphNodeSize"),
  graphLinkThickness: document.querySelector("#graphLinkThickness"),
  graphTextThreshold: document.querySelector("#graphTextThreshold"),
  graphAnimate: document.querySelector("#graphAnimate"),
  graphCenterForce: document.querySelector("#graphCenterForce"),
  graphRepelForce: document.querySelector("#graphRepelForce"),
  graphLinkForce: document.querySelector("#graphLinkForce"),
  graphLinkDistance: document.querySelector("#graphLinkDistance"),
  graphSummary: document.querySelector("#graphSummary"),
  dailyFive: document.querySelector("#dailyFive"),
  dailyFiveTitle: document.querySelector("#dailyFiveTitle"),
  dailyFivePrev: document.querySelector("#dailyFivePrev"),
  dailyFiveNext: document.querySelector("#dailyFiveNext"),
  dailyFivePreview: document.querySelector("#dailyFivePreview"),
  dailyFivePosition: document.querySelector("#dailyFivePosition"),
  dailyFiveName: document.querySelector("#dailyFiveName"),
  dailyFivePath: document.querySelector("#dailyFivePath"),
  dailyFiveRead: document.querySelector("#dailyFiveRead"),
  dailyFiveOpen: document.querySelector("#dailyFiveOpen"),
  dailyFiveDetails: document.querySelector("#dailyFiveDetails"),
  dailyFiveTrack: document.querySelector("#dailyFiveTrack"),
  dailyFiveProgress: document.querySelector("#dailyFiveProgress"),
  dailyFiveStreak: document.querySelector("#dailyFiveStreak"),
  dailyFiveHeatmap: document.querySelector("#dailyFiveHeatmap"),
  detailsPanel: document.querySelector("#detailsPanel"),
  detailsTitle: document.querySelector("#detailsTitle"),
  detailsClose: document.querySelector("#detailsClose"),
  detailsFilename: document.querySelector("#detailsFilename"),
  detailsStatus: document.querySelector("#detailsStatus"),
  detailsTags: document.querySelector("#detailsTags"),
  detailsSourceUrl: document.querySelector("#detailsSourceUrl"),
  detailsReadToggle: document.querySelector("#detailsReadToggle"),
  detailsPassport: document.querySelector("#detailsPassport"),
  detailsNote: document.querySelector("#detailsNote"),
  detailsTrash: document.querySelector("#detailsTrash"),
  detailsClear: document.querySelector("#detailsClear"),
  detailsSave: document.querySelector("#detailsSave"),
  pdfReaderModal: document.querySelector("#pdfReaderModal"),
  pdfReaderBackdrop: document.querySelector("#pdfReaderBackdrop"),
  pdfReaderShell: document.querySelector("#pdfReaderShell"),
  pdfReaderTitle: document.querySelector("#pdfReaderTitle"),
  pdfReaderToggleSidebar: document.querySelector("#pdfReaderToggleSidebar"),
  pdfReaderOpenTab: document.querySelector("#pdfReaderOpenTab"),
  pdfReaderClose: document.querySelector("#pdfReaderClose"),
  pdfReaderFrame: document.querySelector("#pdfReaderFrame"),
  pdfReaderSidebar: document.querySelector("#pdfReaderSidebar"),
  pdfReaderSidebarTitle: document.querySelector("#pdfReaderSidebarTitle"),
  pdfReaderMessage: document.querySelector("#pdfReaderMessage"),
  pdfReaderFilename: document.querySelector("#pdfReaderFilename"),
  pdfReaderStatus: document.querySelector("#pdfReaderStatus"),
  pdfReaderTags: document.querySelector("#pdfReaderTags"),
  pdfReaderSourceUrl: document.querySelector("#pdfReaderSourceUrl"),
  pdfReaderReadToggle: document.querySelector("#pdfReaderReadToggle"),
  pdfReaderNote: document.querySelector("#pdfReaderNote"),
  pdfReaderClear: document.querySelector("#pdfReaderClear"),
  pdfReaderSave: document.querySelector("#pdfReaderSave"),
  grid: document.querySelector("#pdfGrid"),
  empty: document.querySelector("#emptyState"),
};

const cleanupLabels = {
  unsorted: ["Encore dans _Unsorted", "PDFs qui restent à trier."],
  long_names: ["Noms trop longs", "Titres difficiles à scanner ou à afficher."],
  double_extension: ["Double extension", "Fichiers contenant .pdf.pdf."],
  archive_leftovers: ["Archives restantes", "Fichiers -archive encore dans la bibliothèque principale."],
  missing_preview: ["Previews manquantes", "PDFs sans aperçu généré."],
  empty_folders: ["Dossiers vides", "Dossiers sans PDF dans leurs sous-dossiers."],
  possible_duplicates: ["Doublons probables", "Groupes au nom normalisé identique."],
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Erreur locale");
    error.code = data.code;
    error.details = data.details || {};
    throw error;
  }
  return data;
}

async function loadLibrary() {
  state.library = await api("/api/library");
  state.selected = null;
  resetGridRenderLimit();
  render();
  loadSearchIndexStatus();
}

async function loadSearchIndexStatus() {
  if (state.searchIndexing) return;
  try {
    const status = await api("/api/search/status");
    state.searchIndexMessage = searchIndexStatusMessage(status);
    render();
  } catch (_error) {
    state.searchIndexMessage = "";
  }
}

async function loadCleanupReport(force = false) {
  if (state.cleanupLoading) return;
  if (state.cleanupReport && !force) return;
  state.cleanupLoading = true;
  renderCleanup();
  try {
    state.cleanupReport = await api("/api/cleanup");
  } finally {
    state.cleanupLoading = false;
    render();
  }
}

async function loadRenameIndex() {
  if (state.renameIndex || state.renameIndexLoading) return;
  state.renameIndexLoading = true;
  try {
    const response = await fetch("/search_index.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    state.renameIndex = new Map(
      (data.documents || [])
        .filter((document) => document.path)
        .map((document) => [document.path, document])
    );
  } catch (_error) {
    state.renameIndex = new Map();
  } finally {
    state.renameIndexLoading = false;
    render();
  }
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Daily Five still works for the current render if localStorage is unavailable.
  }
}

function renderSearchIndexMessage() {
  const messageEl = ensureSearchIndexMessageElement();
  messageEl.textContent = state.searchIndexMessage || "";
  messageEl.hidden = !state.searchIndexMessage;
}

function ensureSearchIndexMessageElement() {
  if (el.searchIndexMessage) return el.searchIndexMessage;
  const messageEl = document.createElement("span");
  messageEl.id = "searchIndexMessage";
  messageEl.className = "toolbar-note";
  messageEl.style.fontSize = "12px";
  messageEl.style.color = "var(--muted)";
  messageEl.style.whiteSpace = "nowrap";
  el.rebuildSearchBtn.insertAdjacentElement("afterend", messageEl);
  el.searchIndexMessage = messageEl;
  return messageEl;
}

function searchIndexStatusMessage(status) {
  if (!status || !status.indexed) return "";
  const failed = Number(status.failed || 0);
  const pending = Number(status.pending || 0);
  const documents = Number(status.documents || 0);
  if (failed > 0) {
    return `Index: ${documents} PDFs, ${failed} échec${failed > 1 ? "s" : ""}`;
  }
  if (pending > 0) {
    return `Index: ${documents - pending}/${documents}`;
  }
  return "";
}

function errorDisplayMessage(error) {
  const details = error?.details || {};
  if (details.message && error.message === "Library unavailable") {
    return `${error.message}: ${details.message}`;
  }
  return error?.message || "Erreur locale";
}

function render() {
  const { library } = state;
  el.rootLabel.textContent = library.root;
  el.allCount.textContent = library.counts.pdfs;
  el.unsortedCount.textContent = library.counts.unsorted;
  el.quickTriageCount.textContent = library.counts.unsorted;
  el.quickRenameCount.textContent = library.counts.pdfs;
  renderFolders();
  renderGlobalFilters();
  el.quickTriageBtn.classList.toggle("active", state.mode === "triage");
  el.quickRenameBtn.classList.toggle("active", state.mode === "rename");
  el.cleanupBtn.classList.toggle("active", state.mode === "cleanup");
  el.graphBtn.classList.toggle("active", state.mode === "graph");
  el.urlImportBtn.disabled = state.importingUrl;
  el.urlImportBtn.textContent = state.importingUrl ? "Import..." : "URL PDF";
  el.urlImportEyebrow.textContent = "Importer un PDF";
  el.urlImportTitle.textContent = "PDF depuis une URL";
  el.urlImportSubmit.disabled = state.importingUrl;
  el.urlImportSubmit.textContent = state.importingUrl ? "Import..." : "Enregistrer";
  el.urlImportSubmit.classList.toggle("url-loading", state.importingUrl);
  el.urlImportSubmit.style.setProperty("--url-progress", `${state.urlImportPercent}%`);
  renderCaptureInbox();
  el.rebuildSearchBtn.disabled = state.searchIndexing;
  el.rebuildSearchBtn.textContent = state.searchIndexing ? (state.searchIndexProgress || "Index...") : "Indexer";
  el.rebuildSearchBtn.classList.toggle("indexing", state.searchIndexing);
  el.rebuildSearchBtn.style.setProperty("--index-progress", `${state.searchIndexPercent}%`);
  renderSearchIndexMessage();
  el.cleanupCount.textContent = state.cleanupReport
    ? Object.values(state.cleanupReport.counts).reduce((sum, count) => sum + count, 0)
    : 0;
  el.graphCount.textContent = library.folders.length;
  el.dropOverlay.hidden = !state.dragActive;
  renderDestinations();
  renderDailyFive();
  renderGrid();
  renderTriage();
  renderQuickRename();
  renderCleanup();
  renderContentSearch();
  renderGraph();
}

function renderDailyFive() {
  const dailyApi = window.PdfDailyFive;
  const visible =
    state.mode === "grid" &&
    state.folder === "" &&
    state.metadataFilter === "" &&
    state.attributeFilter === "" &&
    state.library &&
    dailyApi &&
    el.dailyFive;
  if (el.dailyFive) el.dailyFive.hidden = !visible;
  if (!visible) return;

  const dailyState = ensureDailyFiveState();
  const queue = dailyState.queue;
  const selectedPdf = currentDailyFivePdf();
  const todayCount = Math.min(dailyApi.DAILY_LIMIT, queue.filter((pdf) => pdf.metadata?.read).length);

  el.dailyFiveProgress.textContent = `${todayCount}/5 lus aujourd'hui`;
  el.dailyFiveStreak.textContent = unreadPdfs().length ? `${unreadPdfs().length} non lus` : "File vide";
  renderDailyFiveHeatmap(dailyState.date);

  if (!queue.length || !selectedPdf) {
    el.dailyFiveTitle.textContent = "Tout est lu";
    el.dailyFivePreview.innerHTML = `<div class="daily-five-empty">Aucun PDF non lu dans la bibliothèque.</div>`;
    delete el.dailyFivePreview.dataset.path;
    el.dailyFivePreview.removeAttribute("title");
    el.dailyFivePreview.removeAttribute("role");
    el.dailyFivePreview.removeAttribute("tabindex");
    el.dailyFivePreview.removeAttribute("aria-label");
    el.dailyFivePosition.textContent = "";
    el.dailyFiveName.textContent = "La file est vide";
    el.dailyFivePath.textContent = "";
    el.dailyFiveTrack.innerHTML = "";
  el.dailyFivePrev.disabled = true;
  el.dailyFiveNext.disabled = true;
  el.dailyFiveRead.disabled = true;
  el.dailyFiveOpen.disabled = true;
  el.dailyFiveDetails.disabled = true;
    return;
  }

  el.dailyFiveTitle.textContent = "5 PDFs du jour";
  el.dailyFivePrev.disabled = queue.length <= 1;
  el.dailyFiveNext.disabled = queue.length <= 1;
  el.dailyFiveRead.disabled = false;
  el.dailyFiveOpen.disabled = false;
  el.dailyFiveDetails.disabled = false;
  el.dailyFiveRead.textContent = selectedPdf.metadata?.read ? "Lu" : "Marquer lu";
  el.dailyFiveRead.classList.toggle("is-read", Boolean(selectedPdf.metadata?.read));
  el.dailyFivePosition.textContent = `${dailyState.selected + 1} / ${queue.length}`;
  el.dailyFiveName.textContent = formatPdfTitle(selectedPdf.name).name;
  el.dailyFivePath.textContent = selectedPdf.folder || "_Racine";
  renderPreviewThumbnail(el.dailyFivePreview, selectedPdf);
  el.dailyFivePreview.dataset.path = selectedPdf.path;
  el.dailyFivePreview.title = `Ouvrir ${selectedPdf.name}`;
  el.dailyFivePreview.setAttribute("role", "button");
  el.dailyFivePreview.setAttribute("tabindex", "0");
  el.dailyFivePreview.setAttribute("aria-label", `Ouvrir ${selectedPdf.name}`);
  renderDailyFiveTrack(queue, dailyState.selected);
}

function ensureDailyFiveState() {
  const dailyApi = window.PdfDailyFive;
  const saved = readJsonStorage(DAILY_FIVE_STORAGE_KEY, null);
  const dailyState = dailyApi.buildDailyFiveState(state.library.pdfs, saved, dailyApi.todayKey());
  state.dailyFive = dailyState;
  writeJsonStorage(DAILY_FIVE_STORAGE_KEY, dailyApi.serializeState(dailyState));
  return dailyState;
}

function renderDailyFiveTrack(queue, selectedIndex) {
  el.dailyFiveTrack.innerHTML = "";
  queue.forEach((pdf, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "daily-five-slot";
    button.classList.toggle("active", index === selectedIndex);
    button.classList.toggle("read", Boolean(pdf.metadata?.read));
    button.title = pdf.name;
    button.innerHTML = `
      <span>${index + 1}</span>
      <strong>${escapeHtml(formatPdfTitle(pdf.name).name)}</strong>
      <small>${escapeHtml(pdf.folder || "_Racine")}</small>
    `;
    button.addEventListener("click", () => selectDailyFiveIndex(index));
    el.dailyFiveTrack.append(button);
  });
}

function renderDailyFiveHeatmap(today) {
  const dailyApi = window.PdfDailyFive;
  const days = dailyApi.buildReadingHistoryDays(state.dailyFiveHistory, today, 105);
  el.dailyFiveHeatmap.innerHTML = "";
  days.forEach((day) => {
    const cell = document.createElement("span");
    cell.className = "heatmap-cell";
    cell.dataset.level = day.level;
    cell.dataset.detail = `${day.count}/5`;
    cell.dataset.date = day.date;
    cell.title = `${day.date}: ${day.count}/5 lus`;
    cell.setAttribute("aria-label", `${day.date}: ${day.count}/5 lus`);
    el.dailyFiveHeatmap.append(cell);
  });
}

function currentDailyFivePdf() {
  const dailyState = state.dailyFive || ensureDailyFiveState();
  return dailyState.queue[dailyState.selected] || null;
}

function unreadPdfs() {
  return state.library.pdfs.filter((pdf) => !pdf.metadata?.read);
}

function selectDailyFiveIndex(index) {
  const dailyApi = window.PdfDailyFive;
  const dailyState = ensureDailyFiveState();
  state.dailyFive = {
    ...dailyState,
    selected: Math.min(Math.max(0, index), Math.max(0, dailyState.queue.length - 1)),
  };
  writeJsonStorage(DAILY_FIVE_STORAGE_KEY, dailyApi.serializeState(state.dailyFive));
  render();
}

function rotateDailyFive(direction) {
  const dailyApi = window.PdfDailyFive;
  state.dailyFive = dailyApi.rotateDailyFive(ensureDailyFiveState(), direction);
  writeJsonStorage(DAILY_FIVE_STORAGE_KEY, dailyApi.serializeState(state.dailyFive));
  render();
}

async function toggleDailyFiveRead() {
  const pdf = currentDailyFivePdf();
  if (!pdf) return;
  const dailyApi = window.PdfDailyFive;
  const date = state.dailyFive?.date || dailyApi.todayKey();
  const nextRead = !Boolean(pdf.metadata?.read);
  await api("/api/metadata", {
    method: "POST",
    body: JSON.stringify({
      path: pdf.path,
      metadata: {
        ...(pdf.metadata || {}),
        read: nextRead,
        readAt: nextRead ? new Date().toISOString() : "",
      },
    }),
  });
  const currentCount = Math.min(dailyApi.DAILY_LIMIT, Number(state.dailyFiveHistory[date] || 0));
  state.dailyFiveHistory = {
    ...state.dailyFiveHistory,
    [date]: Math.max(0, Math.min(dailyApi.DAILY_LIMIT, currentCount + (nextRead ? 1 : -1))),
  };
  writeJsonStorage(DAILY_FIVE_HISTORY_KEY, state.dailyFiveHistory);
  await loadLibrary();
}

function renderFolders() {
  document.querySelectorAll(".folder[data-folder]").forEach((button) => {
    button.classList.toggle("active", state.metadataFilter === "" && button.dataset.folder === state.folder);
  });
  document.querySelectorAll(".folder[data-metadata-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.metadataFilter === state.metadataFilter);
  });
  el.folderTree.innerHTML = "";
  const counts = countByFolder();
  const childrenByParent = groupFoldersByParent();
  expandActiveAncestors();
  state.library.folders
    .filter((folder) => folder.path !== "_Unsorted")
    .filter((folder) => isFolderVisible(folder.path))
    .forEach((folder) => {
      const button = document.createElement("button");
      button.className = "folder";
      button.dataset.folder = folder.path;
      button.style.paddingLeft = `${8 + folder.path.split("/").length * 13}px`;
      const hasChildren = childrenByParent.has(folder.path);
      const collapsed = state.collapsedFolders.has(folder.path);
      button.innerHTML = `
        <span class="folder-label">
          ${hasChildren ? `<span class="twisty" title="${collapsed ? "Déplier" : "Replier"}">${collapsed ? "▸" : "▾"}</span>` : `<span class="twisty spacer"></span>`}
          <span>${escapeHtml(folder.name)}</span>
        </span>
        <span class="folder-count">${counts.get(folder.path) || 0}</span>
      `;
      button.addEventListener("click", () => setFolder(folder.path));
      if (hasChildren) {
        button.querySelector(".twisty").addEventListener("click", (event) => {
          event.stopPropagation();
          toggleFolder(folder.path);
        });
      }
      if (folder.path === state.folder) button.classList.add("active");
      el.folderTree.append(button);
    });
}

function renderDestinations() {
  el.destinationSelect.innerHTML = "";
  state.library.folders
    .filter((folder) => folder.path !== "_Unsorted" && !folder.path.startsWith("_Unsorted/"))
    .forEach((folder) => {
      const option = document.createElement("option");
      option.value = folder.path;
      option.textContent = folder.path;
      el.destinationSelect.append(option);
    });
}

function renderGlobalFilters() {
  el.sortSelect.value = state.sortMode;
  el.readFilter.value = state.readFilter;
  el.attributeFilter.value = state.attributeFilter;
}

function syncTriageDestinations() {
  const folders = destinationFolders();
  const current = state.triageDestination || el.destinationSelect.value || folders[0]?.path || "";
  state.triageDestination = folders.some((folder) => folder.path === current) ? current : (folders[0]?.path || "");
  el.triageDestinationButtons.innerHTML = "";
  folders
    .forEach((folder) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "destination-button";
      button.dataset.destination = folder.path;
      button.title = folder.path;
      button.textContent = folder.path;
      button.classList.toggle("active", folder.path === state.triageDestination);
      button.addEventListener("click", () => {
        state.triageDestination = folder.path;
        syncTriageDestinations();
        queueCurrentTriageMove();
      });
      el.triageDestinationButtons.append(button);
    });
}

function renderGrid() {
  disconnectGridObserver();
  disconnectThumbnailObserver();
  el.grid.innerHTML = "";
  if (state.mode === "triage" || state.mode === "rename" || state.mode === "cleanup" || state.mode === "contentSearch" || state.mode === "graph") {
    el.grid.hidden = true;
    el.empty.hidden = true;
    el.triagePanel.hidden = true;
    return;
  }

  const pdfs = filteredPdfs();
  el.grid.hidden = false;
  el.triagePanel.hidden = state.folder !== "_Unsorted";
  el.moveBtn.disabled = !(state.folder === "_Unsorted" && state.selected);
  el.viewTitle.textContent = titleForFolder();
  el.viewMeta.textContent = state.importing
    ? "Import en cours..."
    : `${pdfs.length} document${pdfs.length > 1 ? "s" : ""}${activeFilterText()}`;
  el.empty.hidden = state.mode === "triage" || pdfs.length !== 0;

  const visiblePdfs = pdfs.slice(0, state.gridRenderLimit);
  visiblePdfs.forEach((pdf, index) => {
    const card = document.createElement("article");
    const title = formatPdfTitle(pdf.name);
    const metadata = pdf.metadata || emptyMetadata();
    const badges = metadataBadges(metadata);
    card.className = "card";
    if (state.selected === pdf.path) card.classList.add("selected");
    card.innerHTML = `
      <div class="thumb" data-thumbnail-path="${escapeHtml(pdf.path)}">${thumbnailMarkup(pdf)}</div>
      <div class="meta">
        <div class="name" title="${escapeHtml(pdf.name)}">${escapeHtml(title.name)}</div>
        <div class="path">${escapeHtml(pdf.folder)}</div>
        ${badges.length ? `<div class="badges">${badges.map((badge) => `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`).join("")}</div>` : ""}
        ${metadata.note ? `<div class="note-preview">${escapeHtml(metadata.note)}</div>` : ""}
      </div>
      <div class="actions">
        <button class="icon ${pdf.favorite ? "favorite" : ""}" title="Favori">${pdf.favorite ? "★" : "☆"}</button>
        <button class="details">Details</button>
        <button class="open">Ouvrir</button>
      </div>
    `;
    card.addEventListener("click", () => selectPdf(pdf.path));
    card.querySelector(".icon").addEventListener("click", async (event) => {
      event.stopPropagation();
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ path: pdf.path, favorite: !pdf.favorite }),
      });
      await loadLibrary();
    });
    card.querySelector(".thumb").addEventListener("click", (event) => {
      event.stopPropagation();
      previewPdfInReader(pdf.path);
    });
    card.querySelector(".open").addEventListener("click", (event) => {
      event.stopPropagation();
      previewPdfInReader(pdf.path);
    });
    card.querySelector(".details").addEventListener("click", (event) => {
      event.stopPropagation();
      openDetails(pdf.path, event.currentTarget);
    });
    el.grid.append(card);
    if (index < INITIAL_THUMBNAIL_BATCH_SIZE) loadCardThumbnail(card, pdf);
    observeCardThumbnail(card, pdf);
  });

  if (state.gridRenderLimit < pdfs.length) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "grid-load-more";
    loadMore.textContent = `Charger ${Math.min(GRID_BATCH_SIZE, pdfs.length - state.gridRenderLimit)} de plus`;
    loadMore.addEventListener("click", () => extendGridRenderLimit(pdfs.length));
    el.grid.append(loadMore);
    observeGridSentinel(loadMore);
  }
}

function resetGridRenderLimit() {
  state.gridRenderLimit = GRID_BATCH_SIZE;
  disconnectGridObserver();
}

function extendGridRenderLimit(total) {
  state.gridRenderLimit = Math.min(total, state.gridRenderLimit + GRID_BATCH_SIZE);
  renderGrid();
}

function observeGridSentinel(sentinel) {
  if (!("IntersectionObserver" in window)) return;
  state.gridObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      extendGridRenderLimit(filteredPdfs().length);
    }
  }, { rootMargin: "400px" });
  state.gridObserver.observe(sentinel);
}

function disconnectGridObserver() {
  if (!state.gridObserver) return;
  state.gridObserver.disconnect();
  state.gridObserver = null;
}

function disconnectThumbnailObserver() {
  if (!state.thumbnailObserver) return;
  state.thumbnailObserver.disconnect();
  state.thumbnailObserver = null;
}

function thumbnailMarkup(pdf) {
  return pdf.thumbnailUrl
    ? `<img src="${escapeHtml(pdf.thumbnailUrl)}" loading="lazy" decoding="async" alt="">`
    : `<div class="fallback">PDF</div>`;
}

function observeCardThumbnail(card, pdf) {
  if (pdf.thumbnailUrl) return;
  if (!("IntersectionObserver" in window)) {
    loadCardThumbnail(card, pdf);
    return;
  }
  if (!state.thumbnailObserver) {
    state.thumbnailObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        state.thumbnailObserver.unobserve(entry.target);
        const path = entry.target.dataset.thumbnailPath;
        const item = pdfByPath(path);
        if (item) loadCardThumbnail(entry.target.closest(".card"), item);
      });
    }, { rootMargin: "160px" });
  }
  state.thumbnailObserver.observe(card.querySelector(".thumb"));
}

function loadCardThumbnail(card, pdf) {
  const thumb = card?.querySelector(".thumb");
  if (!thumb || thumb.dataset.loading === "1" || pdf.thumbnailUrl) return;
  if (!canLoadGeneratedThumbnails()) return;
  thumb.dataset.loading = "1";
  pdf.thumbnailUrl = thumbnailUrlForPath(pdf.path);
  thumb.innerHTML = thumbnailMarkup(pdf);
  const img = thumb.querySelector("img");
  if (!img) {
    thumb.dataset.loading = "0";
    return;
  }
  if (img.complete) {
    thumb.dataset.loading = "0";
    if (!img.naturalWidth) {
      pdf.thumbnailUrl = "";
      thumb.innerHTML = thumbnailMarkup(pdf);
    }
    return;
  }
  img.addEventListener("load", () => {
    thumb.dataset.loading = "0";
  }, { once: true });
  img.addEventListener("error", () => {
    pdf.thumbnailUrl = "";
    thumb.dataset.loading = "0";
    thumb.innerHTML = thumbnailMarkup(pdf);
  }, { once: true });
}

function canLoadGeneratedThumbnails() {
  return state.library?.canGenerateThumbnails === false ? false : true;
}

function renderPreviewThumbnail(container, pdf) {
  container.innerHTML = thumbnailMarkup(pdf);
  if (!pdf.thumbnailUrl) {
    loadCardThumbnail({ querySelector: () => container }, pdf);
  }
}

function thumbnailUrlForPath(path) {
  return `/thumbnail/${encodePath(path)}`;
}

function renderTriage() {
  el.quickTriage.hidden = state.mode !== "triage";
  if (state.mode !== "triage") return;

  const pdfs = renamePdfs();
  const pdf = currentTriagePdf();
  el.triagePanel.hidden = true;
  el.viewTitle.textContent = "Classer";
  el.viewMeta.textContent = `${pdfs.length} PDF${pdfs.length > 1 ? "s" : ""} à trier${state.pendingMoves ? ` · ${state.pendingMoves} en file` : ""}`;

  if (!pdf) {
    el.triagePreview.innerHTML = `<div class="triage-empty">Aucun PDF à trier</div>`;
    el.triageProgress.textContent = "0 / 0";
    el.triageTitle.textContent = "Tout est trié";
    el.triageFilename.value = "";
    el.triageMove.disabled = true;
    el.triageSkip.disabled = true;
    el.triageOpen.disabled = true;
    el.triagePrevious.disabled = true;
    el.triageNext.disabled = true;
    syncTriageDestinations();
    return;
  }

  renderPreviewThumbnail(el.triagePreview, pdf);
  el.triageProgress.textContent = `${state.triageIndex + 1} / ${pdfs.length}`;
  el.triageTitle.textContent = formatPdfTitle(pdf.name).name;
  if (document.activeElement !== el.triageFilename) {
    el.triageFilename.value = filenameStem(pdf.name);
  }
  syncTriageDestinations();
  el.triageMove.disabled = false;
  el.triageSkip.disabled = false;
  el.triageOpen.disabled = false;
  el.triagePrevious.disabled = state.triageIndex <= 0;
  el.triageNext.disabled = state.triageIndex >= pdfs.length - 1;
}

function renderQuickRename() {
  el.quickRename.hidden = state.mode !== "rename";
  if (state.mode !== "rename") return;

  const pdfs = unsortedPdfs();
  const pdf = currentRenamePdf();
  el.quickTriage.hidden = true;
  el.triagePanel.hidden = true;
  el.viewTitle.textContent = "Renommer";
  el.viewMeta.textContent = `${pdfs.length} PDF${pdfs.length > 1 ? "s" : ""} à renommer`;

  if (!pdf) {
    el.renamePreview.innerHTML = `<div class="triage-empty">Aucun PDF à renommer</div>`;
    el.renameProgress.textContent = "0 / 0";
    el.renameTitle.textContent = "Tout est renommé";
    el.renameFilename.value = "";
    el.renameSuggestions.innerHTML = "";
    el.renameApply.disabled = true;
    el.renameSkip.disabled = true;
    el.renameOpen.disabled = true;
    el.renamePrevious.disabled = true;
    el.renameNext.disabled = true;
    return;
  }

  renderPreviewThumbnail(el.renamePreview, pdf);
  el.renameProgress.textContent = `${state.renameIndexPosition + 1} / ${pdfs.length}`;
  el.renameTitle.textContent = formatPdfTitle(pdf.name).name;
  if (document.activeElement !== el.renameFilename) {
    el.renameFilename.value = filenameStem(pdf.name);
  }
  renderRenameSuggestions(pdf, el.renameSuggestions, el.renameFilename);
  el.renameApply.disabled = false;
  el.renameSkip.disabled = false;
  el.renameOpen.disabled = false;
  el.renamePrevious.disabled = state.renameIndexPosition <= 0;
  el.renameNext.disabled = state.renameIndexPosition >= pdfs.length - 1;
}

function renderRenameSuggestions(pdf, container, input) {
  const cacheKey = pdf.path;
  const cached = state.renameSuggestionCache.get(cacheKey);
  if (!cached) {
    container.innerHTML = `<div class="rename-suggestions-label">Suggestions</div>`;
    loadBackendRenameSuggestions(pdf).catch((_error) => {
      state.renameSuggestionCache.set(cacheKey, []);
      render();
    });
    return;
  }
  const suggestions = cached;
  if (!suggestions.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="rename-suggestions-label">Suggestions</div>
    <div class="rename-suggestion-buttons"></div>
  `;
  renderSuggestionButtons(suggestions, container, input, true);
}

function renderSuggestionButtons(suggestions, container, input, preserveShell = false) {
  if (!suggestions.length) {
    container.innerHTML = "";
    return;
  }
  if (!preserveShell) {
    container.innerHTML = `
      <div class="rename-suggestions-label">Suggestions</div>
      <div class="rename-suggestion-buttons"></div>
    `;
  }
  const list = container.querySelector(".rename-suggestion-buttons");
  if (!list) return;
  list.innerHTML = "";
  suggestions.forEach((suggestion) => {
    const value = suggestion.value || suggestion;
    const reason = suggestion.reason || "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rename-suggestion";
    button.innerHTML = `<span>${escapeHtml(value)}</span>${reason ? `<small>${escapeHtml(reason)}</small>` : ""}`;
    button.title = value;
    button.addEventListener("click", () => {
      input.value = value;
      input.focus();
      input.select();
    });
    list.append(button);
  });
}

async function loadBackendRenameSuggestions(pdf) {
  if (state.renameSuggestionCache.has(pdf.path)) return;
  const document = state.renameIndex?.get(pdf.path);
  const data = await api("/api/rename-suggestions", {
    method: "POST",
    body: JSON.stringify({
      path: pdf.path,
      name: pdf.name,
      originalFilename: pdf.metadata?.originalFilename || pdf.name,
      indexedText: document?.text || "",
      sourceUrl: pdf.metadata?.sourceUrl || "",
      currentName: "",
    }),
  });
  state.renameSuggestionCache.set(pdf.path, data.suggestions || []);
  render();
}

function renderCleanup() {
  el.cleanupView.hidden = state.mode !== "cleanup";
  if (state.mode !== "cleanup") return;
  el.quickTriage.hidden = true;
  el.quickRename.hidden = true;
  el.triagePanel.hidden = true;
  el.viewTitle.textContent = "À nettoyer";

  if (state.cleanupLoading && !state.cleanupReport) {
    el.viewMeta.textContent = "Analyse en cours...";
    el.cleanupSummary.innerHTML = "";
    el.cleanupSections.innerHTML = `<div class="cleanup-empty">Analyse de la bibliothèque...</div>`;
    return;
  }

  const report = state.cleanupReport;
  if (!report) {
    el.viewMeta.textContent = "Pas encore analysé";
    el.cleanupSummary.innerHTML = "";
    el.cleanupSections.innerHTML = "";
    return;
  }

  const total = Object.values(report.counts).reduce((sum, count) => sum + count, 0);
  const previewStatus = state.previewProcessing
    ? ` · previews ${state.previewTotal - state.previewQueue.length}/${state.previewTotal}`
    : "";
  el.viewMeta.textContent = `${total} point${total > 1 ? "s" : ""} à vérifier${previewStatus}`;
  el.cleanupSummary.innerHTML = Object.entries(report.counts)
    .map(([key, count]) => `<span>${escapeHtml(cleanupLabels[key][0])}: <strong>${count}</strong></span>`)
    .join("");
  el.cleanupSections.innerHTML = "";

  Object.entries(cleanupLabels).forEach(([key, [label, help]]) => {
    const items = report.issues[key] || [];
    const section = document.createElement("section");
    section.className = "cleanup-section";
    section.innerHTML = `
      <header>
        <div>
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(help)}</p>
        </div>
        <div class="cleanup-section-tools">
          ${key === "missing_preview" && items.length ? `<button type="button" data-generate-all-previews ${state.previewProcessing ? "disabled" : ""}>Générer toutes</button>` : ""}
          <strong>${items.length}</strong>
        </div>
      </header>
      <div class="cleanup-list"></div>
    `;
    section.querySelector("[data-generate-all-previews]")?.addEventListener("click", () => {
      generateAllMissingPreviews(items.map((item) => item.path));
    });
    const list = section.querySelector(".cleanup-list");
    if (!items.length) {
      list.innerHTML = `<div class="cleanup-empty">Rien à signaler.</div>`;
    } else if (key === "possible_duplicates") {
      items.forEach((group) => list.append(renderDuplicateGroup(group)));
    } else {
      items.forEach((item) => list.append(renderCleanupItem(item, null, key)));
    }
    el.cleanupSections.append(section);
  });
}

function renderContentSearch() {
  el.searchView.hidden = state.mode !== "contentSearch";
  if (state.mode !== "contentSearch") return;
  el.quickTriage.hidden = true;
  el.quickRename.hidden = true;
  el.triagePanel.hidden = true;
  el.viewTitle.textContent = "Recherche contenu";

  if (state.contentSearchLoading) {
    el.viewMeta.textContent = "Recherche en cours...";
    el.searchResults.innerHTML = `<div class="cleanup-empty">Recherche dans l'index...</div>`;
    return;
  }

  const result = state.contentSearch;
  if (!result) {
    el.viewMeta.textContent = "Lance une recherche contenu.";
    el.searchResults.innerHTML = "";
    return;
  }
  if (!result.indexed) {
    el.viewMeta.textContent = "Index absent";
    el.searchResults.innerHTML = `<div class="cleanup-empty">Clique sur Indexer avant la première recherche contenu.</div>`;
    return;
  }

  el.viewMeta.textContent = `${result.count} résultat${result.count > 1 ? "s" : ""} pour "${result.query}"`;
  if (!result.results.length) {
    el.searchResults.innerHTML = `<div class="cleanup-empty">Aucun résultat contenu.</div>`;
    return;
  }

  el.searchResults.innerHTML = "";
  result.results.forEach((item) => {
    const row = document.createElement("article");
    row.className = "search-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title || item.name)}</strong>
        <span>${escapeHtml(item.folder)}</span>
        <p>${escapeHtml(item.snippet)}</p>
      </div>
      <div class="cleanup-actions">
        <button type="button" data-open="${escapeHtml(item.path)}">Ouvrir</button>
        <button type="button" data-folder="${escapeHtml(item.folder)}">Dossier</button>
      </div>
    `;
    row.querySelector("[data-open]").addEventListener("click", (event) => {
      openPdf(event.currentTarget.dataset.open, event);
    });
    row.querySelector("[data-folder]").addEventListener("click", (event) => {
      setFolder(event.currentTarget.dataset.folder);
    });
    el.searchResults.append(row);
  });
}

function renderGraph() {
  el.graphView.hidden = state.mode !== "graph";
  if (state.mode !== "graph") {
    if (state.graphRenderer) {
      state.graphRenderer.destroy();
      state.graphRenderer = null;
    }
    return;
  }
  el.quickTriage.hidden = true;
  el.quickRename.hidden = true;
  el.triagePanel.hidden = true;
  el.viewTitle.textContent = "Graph";
  syncGraphControls();
  if (!state.library) {
    el.viewMeta.textContent = "Chargement...";
    el.graphSummary.textContent = "";
    el.graphStage.innerHTML = `<div class="graph-message">Chargement...</div>`;
    return;
  }
  const graphApi = window.PdfGraphModel;
  const forceApi = window.PdfForceGraph;
  if (!graphApi || !forceApi) {
    el.viewMeta.textContent = "Graph indisponible";
    el.graphSummary.textContent = "";
    el.graphStage.innerHTML = `<div class="graph-message">Module graph indisponible.</div>`;
    return;
  }
  const model = graphApi.buildGraphModel(state.library);
  const graph = graphApi.visibleGraph(model, {
    focusPath: state.graphFocusPath,
    showFolders: state.graphOptions.showFolders,
    showPdfs: state.graphOptions.showPdfs,
    showUnsorted: state.graphOptions.showUnsorted,
    warningsOnly: state.graphOptions.warningsOnly,
    query: state.graphSearch || state.query,
  });
  if (!state.graphRenderer) {
    state.graphRenderer = forceApi.createForceGraph(el.graphStage, {
      onNodeClick: handleGraphNodeClick,
      onNodeDoubleClick: handleGraphNodeDoubleClick,
    });
  }
  state.graphRenderer.render(graph, { ...state.graphOptions, focusPath: state.graphFocusPath });
  const focusText = state.graphFocusPath ? ` · focus ${state.graphFocusPath}` : "";
  el.viewMeta.textContent = `Carte physics des dossiers${focusText}`;
  el.graphSummary.textContent = `${graph.nodes.length} noeuds · ${graph.links.length} liens`;
}

function syncGraphControls() {
  el.graphControls.hidden = state.graphPanelHidden;
  el.graphPanelShow.hidden = !state.graphPanelHidden;
  el.graphSearch.value = state.graphSearch;
  el.graphShowFolders.checked = state.graphOptions.showFolders;
  el.graphShowPdfs.checked = state.graphOptions.showPdfs;
  el.graphShowUnsorted.checked = state.graphOptions.showUnsorted;
  el.graphWarningsOnly.checked = state.graphOptions.warningsOnly;
  el.graphShowLabels.checked = state.graphOptions.showLabels;
  el.graphFolderColors.checked = state.graphOptions.folderColors;
  el.graphNodeSize.value = state.graphOptions.nodeSize;
  el.graphLinkThickness.value = state.graphOptions.linkThickness;
  el.graphTextThreshold.value = state.graphOptions.textThreshold;
  el.graphCenterForce.value = state.graphOptions.centerForce;
  el.graphRepelForce.value = state.graphOptions.repelForce;
  el.graphLinkForce.value = state.graphOptions.linkForce;
  el.graphLinkDistance.value = state.graphOptions.linkDistance;
  el.graphAnimate.textContent = state.graphOptions.animate ? "Pause" : "Animate";
}

function setGraphOption(key, value) {
  state.graphOptions = { ...state.graphOptions, [key]: value };
  render();
}

function resetGraphView() {
  state.graphFocusPath = "";
  state.graphSearch = "";
  state.graphOptions = { ...DEFAULT_GRAPH_OPTIONS };
  state.graphPanelHidden = false;
  el.graphControls.querySelectorAll("details").forEach((section) => {
    section.open = false;
  });
  render();
}

function setGraphPanelHidden(hidden) {
  state.graphPanelHidden = hidden;
  syncGraphControls();
}

function handleGraphNodeDoubleClick(node) {
  if (node.type === "pdf") openPdf(node.path);
}

function handleGraphNodeClick(node, anchor) {
  if (node.type === "root") {
    state.graphFocusPath = "";
    render();
    return;
  }
  if (node.type === "folder") {
    state.graphFocusPath = node.path;
    render();
    return;
  }
  if (node.type === "pdf") {
    openDetails(node.path, anchor);
  }
}

function renderCleanupItem(item, duplicateGroup = null, sectionKey = "") {
  const row = document.createElement("article");
  row.className = "cleanup-row";
  const isPdf = Boolean(item.path && item.name);
  const isEmptyFolder = Boolean(item.path && !item.name);
  const canArchive = sectionKey === "archive_leftovers" && isPdf;
  const canGeneratePreview = sectionKey === "missing_preview" && isPdf;
  const canIgnore = Boolean(sectionKey) && sectionKey !== "possible_duplicates" && item.path;
  row.innerHTML = `
    <div>
      <strong>${escapeHtml(item.title || item.path)}</strong>
      <span>${escapeHtml(item.folder || item.parent || "")}</span>
      ${item.detail ? `<em>${escapeHtml(item.detail)}</em>` : ""}
    </div>
    <div class="cleanup-actions">
      ${isPdf ? `<button type="button" data-open="${escapeHtml(item.path)}">Ouvrir</button>` : ""}
      ${isPdf ? `<button type="button" data-rename="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}">Renommer</button>` : ""}
      ${isPdf ? `<button type="button" data-trash="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title || item.name)}">Corbeille</button>` : ""}
      ${duplicateGroup && isPdf ? `<button type="button" data-keep-both="${escapeHtml(item.path)}">Garder les deux</button>` : ""}
      ${canArchive ? `<button type="button" data-archive="${escapeHtml(item.path)}" data-title="${escapeHtml(item.title || item.name)}">Archiver</button>` : ""}
      ${canGeneratePreview ? `<button type="button" data-preview="${escapeHtml(item.path)}" ${state.previewProcessing ? "disabled" : ""}>Générer preview</button>` : ""}
      ${item.isUnsorted ? `<button type="button" data-triage="${escapeHtml(item.path)}">Classer</button>` : ""}
      ${isEmptyFolder ? `<button type="button" data-delete-folder="${escapeHtml(item.path)}">Supprimer dossier</button>` : ""}
      ${canIgnore ? `<button type="button" data-ignore="${escapeHtml(item.path)}" data-section="${escapeHtml(sectionKey)}">Ignorer</button>` : ""}
    </div>
  `;
  row.querySelector("[data-open]")?.addEventListener("click", (event) => {
    openPdf(event.currentTarget.dataset.open, event);
  });
  row.querySelector("[data-rename]")?.addEventListener("click", (event) => {
    renameCleanupPdf(event.currentTarget.dataset.rename, event.currentTarget.dataset.name);
  });
  row.querySelector("[data-trash]")?.addEventListener("click", (event) => {
    trashCleanupPdf(event.currentTarget.dataset.trash, event.currentTarget.dataset.title);
  });
  row.querySelector("[data-keep-both]")?.addEventListener("click", () => {
    keepDuplicateGroup(duplicateGroup);
  });
  row.querySelector("[data-archive]")?.addEventListener("click", (event) => {
    archiveCleanupPdf(event.currentTarget.dataset.archive, event.currentTarget.dataset.title);
  });
  row.querySelector("[data-preview]")?.addEventListener("click", (event) => {
    generateMissingPreview(event.currentTarget.dataset.preview);
  });
  row.querySelector("[data-triage]")?.addEventListener("click", (event) => {
    jumpToTriagePath(event.currentTarget.dataset.triage);
  });
  row.querySelector("[data-delete-folder]")?.addEventListener("click", (event) => {
    deleteCleanupFolder(event.currentTarget.dataset.deleteFolder);
  });
  row.querySelector("[data-ignore]")?.addEventListener("click", (event) => {
    ignoreCleanupIssue(event.currentTarget.dataset.section, event.currentTarget.dataset.ignore);
  });
  return row;
}

function renderDuplicateGroup(group) {
  const wrapper = document.createElement("article");
  wrapper.className = "cleanup-duplicate";
  wrapper.innerHTML = `
    <h4>
      <span>${escapeHtml(group.key)}</span>
      <small>${group.items.length} fichiers</small>
    </h4>
    <div></div>
  `;
  const list = wrapper.querySelector("div");
  group.items.forEach((item) => list.append(renderCleanupItem(item, group)));
  return wrapper;
}

function filteredPdfs() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.library.pdfs.filter((pdf) => {
    const inFolder =
      state.folder === "" ||
      pdf.folder === state.folder;
    const metadata = pdf.metadata || emptyMetadata();
    const matchesMetadata =
      state.metadataFilter === "" ||
      metadata.status === state.metadataFilter;
    const matchesAttribute =
      state.attributeFilter === "" ||
      (state.attributeFilter === "favorite" && pdf.favorite) ||
      (state.attributeFilter === "to_read" && metadata.status === "to_read") ||
      (state.attributeFilter === "important" && metadata.status === "important");
    const tags = visibleTags(metadata.tags || []);
    const matchesRead =
      state.readFilter === "" ||
      (state.readFilter === "read" && Boolean(metadata.read)) ||
      (state.readFilter === "unread" && !metadata.read);
    const searchable = [
      pdf.name,
      pdf.folder,
      metadata.status || "",
      metadata.sourceUrl || "",
      tags.join(" "),
    ].join(" ").toLowerCase();
    const matches = !query || searchable.includes(query);
    return inFolder && matchesMetadata && matchesAttribute && matchesRead && matches;
  });
  return sortPdfs(filtered);
}

function sortPdfs(pdfs) {
  const sorted = [...pdfs];
  const byName = (left, right) => compareText(formatPdfTitle(left.name).name, formatPdfTitle(right.name).name);
  const byFolder = (left, right) => compareText(left.folder, right.folder) || byName(left, right);

  sorted.sort((left, right) => {
    if (state.sortMode === "name_desc") return -byName(left, right);
    if (state.sortMode === "date_desc") return dateValue(right) - dateValue(left) || byName(left, right);
    if (state.sortMode === "date_asc") return dateValue(left) - dateValue(right) || byName(left, right);
    if (state.sortMode === "folder_asc") return byFolder(left, right);
    return byName(left, right);
  });
  return sorted;
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), "fr", {
    sensitivity: "base",
    numeric: true,
  });
}

function dateValue(pdf) {
  const match = pdf.name.match(/^(\d{4})[-_. ](\d{2})[-_. ](\d{2})/);
  if (match) {
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return Number(pdf.modified || 0) * 1000;
}

function unsortedPdfs() {
  return state.library.pdfs.filter((pdf) => pdf.folder === "_Unsorted");
}

function renamePdfs() {
  return sortPdfs(state.library.pdfs);
}

function destinationFolders() {
  return state.library.folders
    .filter((folder) => folder.path !== "_Unsorted" && !folder.path.startsWith("_Unsorted/"));
}

function safePdfName(filename) {
  const trimmed = filename.trim();
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

function safeDocumentName(pdf, filename) {
  return safePdfName(filename);
}

function optimisticMove(pdf, destination, filename) {
  const targetName = safeDocumentName(pdf, filename);
  const optimisticPath = `${destination}/${targetName}`;
  const movedPdf = {
    ...pdf,
    name: targetName,
    path: optimisticPath,
    folder: destination,
    isUnsorted: false,
  };
  const index = state.library.pdfs.findIndex((item) => item.path === pdf.path);
  if (index >= 0) {
    state.library.pdfs.splice(index, 1, movedPdf);
  }
  state.selected = null;
  refreshLocalCounts();
  const unsortedCount = unsortedPdfs().length;
  state.triageIndex = Math.min(state.triageIndex, Math.max(0, unsortedCount - 1));
  return {
    sourcePath: pdf.path,
    optimisticPath,
    originalPdf: pdf,
    destination,
    filename,
  };
}

function applyServerMoveResult(job, result) {
  const index = state.library.pdfs.findIndex((pdf) => pdf.path === job.optimisticPath);
  if (result.action === "deleted_source_duplicate") {
    if (index >= 0) state.library.pdfs.splice(index, 1);
    refreshLocalCounts();
    return;
  }
  if (index >= 0) {
    state.library.pdfs[index] = {
      ...state.library.pdfs[index],
      name: result.name,
      path: result.path,
      folder: result.folder,
      isUnsorted: false,
    };
  }
  refreshLocalCounts();
}

function rollbackOptimisticMove(job) {
  const index = state.library.pdfs.findIndex((pdf) => pdf.path === job.optimisticPath);
  if (index >= 0) {
    state.library.pdfs.splice(index, 1, job.originalPdf);
  } else if (!state.library.pdfs.some((pdf) => pdf.path === job.originalPdf.path)) {
    state.library.pdfs.push(job.originalPdf);
  }
  state.library.pdfs.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
  refreshLocalCounts();
}

function refreshLocalCounts() {
  state.library.counts = {
    ...state.library.counts,
    pdfs: state.library.pdfs.length,
    favorites: state.library.pdfs.filter((pdf) => pdf.favorite).length,
    unsorted: state.library.pdfs.filter((pdf) => pdf.isUnsorted).length,
    toRead: state.library.pdfs.filter((pdf) => pdf.metadata?.status === "to_read").length,
    important: state.library.pdfs.filter((pdf) => pdf.metadata?.status === "important").length,
  };
}

function currentTriagePdf() {
  const pdfs = unsortedPdfs();
  if (!pdfs.length) return null;
  state.triageIndex = Math.min(Math.max(state.triageIndex, 0), pdfs.length - 1);
  return pdfs[state.triageIndex];
}

function currentRenamePdf() {
  const pdfs = renamePdfs();
  if (!pdfs.length) return null;
  state.renameIndexPosition = Math.min(Math.max(state.renameIndexPosition, 0), pdfs.length - 1);
  return pdfs[state.renameIndexPosition];
}

function filenameStem(name) {
  return name.toLowerCase().endsWith(".pdf") ? name.slice(0, -4) : name;
}

function renameSuggestionsFor(pdf) {
  const suggestions = [];
  const current = filenameStem(pdf.name);
  const localTitle = cleanRenameTitle(current);
  addRenameSuggestion(suggestions, localTitle, current);
  addRenameSuggestion(suggestions, datedRenameTitle(pdf, localTitle), current);

  const indexedTitle = indexedRenameTitle(pdf);
  addRenameSuggestion(suggestions, indexedTitle, current);
  if (indexedTitle) addRenameSuggestion(suggestions, datedRenameTitle(pdf, indexedTitle), current);

  return suggestions.slice(0, 3);
}

function addRenameSuggestion(suggestions, value, current) {
  const cleaned = normalizeRenameSuggestion(value);
  if (!cleaned) return;
  if (cleaned.length < 4) return;
  if (cleaned.localeCompare(current, undefined, { sensitivity: "base" }) === 0) return;
  if (suggestions.some((item) => item.localeCompare(cleaned, undefined, { sensitivity: "base" }) === 0)) return;
  suggestions.push(cleaned);
}

function normalizeRenameSuggestion(value) {
  const raw = String(value || "").trim();
  const dated = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  if (dated) {
    const title = cleanRenameTitle(dated[2]);
    return title ? `${dated[1]} ${title}` : "";
  }
  return cleanRenameTitle(raw);
}

function cleanRenameTitle(value) {
  let title = String(value || "");
  title = filenameStem(title);
  title = title.replace(/^(\d{4})[-_. ](\d{2})[-_. ](\d{2})\s*/i, "");
  title = title.replace(/\.(aspx?|php)$/i, "");
  title = title.replace(/\b(main|fulltext|download|document|article|paper|untitled|index)\b/gi, " ");
  title = title.replace(/\b[a-f0-9]{12,}\b/gi, " ");
  title = title.replace(/\b\d{6,}\b/g, " ");
  title = title.replace(/\s*\((?:copy|\d+)\)\s*$/i, "");
  title = title.replace(/([a-z])([A-Z])/g, "$1 $2");
  title = title.replace(/([A-Za-z])(\d)/g, "$1 $2");
  title = title.replace(/(\d)([A-Za-z])/g, "$1 $2");
  title = title.replace(/[_-]+/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  title = title.replace(/\b[a-z]/g, (char) => char.toUpperCase());
  return title.slice(0, 120).trim();
}

function datedRenameTitle(pdf, title) {
  const cleanTitle = cleanRenameTitle(title);
  if (!cleanTitle) return "";
  const date = pdfDatePrefix(pdf);
  if (!date || cleanTitle.startsWith(date)) return "";
  return `${date} ${cleanTitle}`;
}

function pdfDatePrefix(pdf) {
  const nameMatch = pdf.name.match(/^(\d{4})[-_. ](\d{2})[-_. ](\d{2})/);
  if (nameMatch) return `${nameMatch[1]}-${nameMatch[2]}-${nameMatch[3]}`;
  const modified = Number(pdf.modified || 0);
  if (!modified) return "";
  const date = new Date(modified * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function indexedRenameTitle(pdf) {
  const document = state.renameIndex?.get(pdf.path);
  if (!document?.text) return "";
  const lines = document.text
    .split(/[.\n\r]+/)
    .map((line) => cleanRenameTitle(line))
    .filter((line) => usefulIndexedTitle(line));
  return lines[0] || "";
}

function usefulIndexedTitle(line) {
  if (line.length < 8 || line.length > 100) return false;
  if (/^[^A-Za-z0-9À-ÿ]/.test(line)) return false;
  if (/^https?:/i.test(line)) return false;
  if (/\b(chairman|chairmen|secretary|confidential|publication|page|figure|table)\b/i.test(line)) return false;
  if (/:/.test(line)) return false;
  if (/[,;]/.test(line)) return false;
  if (/^(abstract|introduction|references|contents|table of contents|page \d+)$/i.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 14;
}

function setMode(mode) {
  state.mode = mode;
  if (mode === "triage" && state.folder === "_Unsorted" && state.selected) {
    const index = unsortedPdfs().findIndex((pdf) => pdf.path === state.selected);
    if (index >= 0) state.triageIndex = index;
  }
  if (mode === "rename" && state.selected) {
    const index = renamePdfs().findIndex((pdf) => pdf.path === state.selected);
    if (index >= 0) state.renameIndexPosition = index;
  }
  if (mode === "rename") loadRenameIndex();
  render();
}

async function runContentSearch() {
  const query = el.search.value.trim();
  if (query.length < 2) {
    alert("Tape au moins 2 caractères.");
    return;
  }
  state.mode = "contentSearch";
  state.contentSearchLoading = true;
  state.contentSearch = null;
  render();
  try {
    state.contentSearch = await api(`/api/search?q=${encodeURIComponent(query)}`);
  } catch (error) {
    alert(errorDisplayMessage(error));
  } finally {
    state.contentSearchLoading = false;
    render();
  }
}

async function rebuildSearchIndex() {
  if (state.searchIndexing) return;
  const confirmed = window.confirm("Indexer le contenu des PDFs ? La première fois peut prendre un peu de temps.");
  if (!confirmed) return;
  state.searchIndexing = true;
  state.searchIndexProgress = "Index...";
  state.searchIndexPercent = 0;
  state.searchIndexMessage = "";
  render();
  try {
    let result = null;
    do {
      result = await api("/api/search/rebuild", {
        method: "POST",
        body: JSON.stringify({ limit: 3 }),
      });
      const done = result.indexed - result.remaining;
      state.searchIndexProgress = `${done}/${result.indexed}`;
      state.searchIndexPercent = indexProgressPercent(result);
      render();
      await new Promise((resolve) => setTimeout(resolve, 80));
    } while (result && !result.done);
    state.searchIndexMessage = searchIndexResultMessage(result);
  } catch (error) {
    state.searchIndexMessage = errorDisplayMessage(error);
  } finally {
    state.searchIndexing = false;
    state.searchIndexProgress = "";
    state.searchIndexPercent = 0;
    render();
  }
}

function indexProgressPercent(result) {
  const indexed = Number(result?.indexed || 0);
  const remaining = Number(result?.remaining || 0);
  if (indexed <= 0) return 0;
  const done = Math.max(0, Math.min(indexed, indexed - remaining));
  return Math.round((done / indexed) * 100);
}

function searchIndexResultMessage(result) {
  if (!result) return "";
  const failed = Number(result.failed || 0);
  if (failed > 0) {
    return `Index terminé: ${result.indexed} PDFs, ${failed} échec${failed > 1 ? "s" : ""}`;
  }
  return "";
}

function setCleanupMode() {
  state.mode = "cleanup";
  state.folder = "";
  state.metadataFilter = "";
  state.selected = null;
  render();
  loadCleanupReport();
}

function setGraphMode() {
  state.mode = "graph";
  state.folder = "";
  state.metadataFilter = "";
  state.selected = null;
  render();
}

function jumpToTriagePath(path) {
  state.mode = "triage";
  state.folder = "_Unsorted";
  const index = unsortedPdfs().findIndex((pdf) => pdf.path === path);
  state.triageIndex = index >= 0 ? index : 0;
  render();
}

async function refreshCleanupReport() {
  state.cleanupReport = null;
  await loadCleanupReport(true);
}

async function renameCleanupPdf(path, currentName) {
  const stem = filenameStem(currentName);
  const filename = window.prompt("Nouveau nom du PDF", stem);
  if (filename === null) return;
  const trimmed = filename.trim();
  if (!trimmed) {
    alert("Le nom ne peut pas être vide.");
    return;
  }
  try {
    await api("/api/rename", {
      method: "POST",
      body: JSON.stringify({ path, filename: trimmed, onConflict: "error" }),
    });
    await refreshCleanupReport();
  } catch (error) {
    if (error.code !== "name_conflict") {
      alert(error.message);
      return;
    }
    const suggested = error.details?.suggested || "un nom unique";
    const keepBoth = window.confirm(`Un PDF avec ce nom existe déjà.\n\nRenommer avec un nom unique ?\n${suggested}`);
    if (!keepBoth) return;
    await api("/api/rename", {
      method: "POST",
      body: JSON.stringify({ path, filename: trimmed, onConflict: "keep_both" }),
    });
    await refreshCleanupReport();
  }
}

async function trashCleanupPdf(path, title) {
  const confirmed = window.confirm(`Mettre ce PDF dans pdf_trash ?\n\n${title}`);
  if (!confirmed) return;
  await api("/api/trash", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
  await refreshCleanupReport();
}

async function archiveCleanupPdf(path, title) {
  const confirmed = window.confirm(`Déplacer cette archive hors de la bibliothèque principale ?\n\n${title}`);
  if (!confirmed) return;
  try {
    await api("/api/archive", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    await refreshCleanupReport();
  } catch (error) {
    alert(error.message);
  }
}

async function generateMissingPreview(path, refresh = true) {
  try {
    await api("/api/preview", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    removeCleanupItem("missing_preview", path);
    if (refresh) {
      await refreshCleanupReport();
    } else {
      render();
    }
    return true;
  } catch (error) {
    if (refresh) alert(error.message);
    return false;
  }
}

async function generateAllMissingPreviews(paths) {
  if (state.previewProcessing || !paths.length) return;
  const confirmed = window.confirm(`Générer ${paths.length} preview${paths.length > 1 ? "s" : ""} manquante${paths.length > 1 ? "s" : ""} ?`);
  if (!confirmed) return;

  const failures = [];
  state.previewQueue = [...paths];
  state.previewTotal = paths.length;
  state.previewProcessing = true;
  render();

  while (state.previewQueue.length) {
    const path = state.previewQueue.shift();
    const ok = await generateMissingPreview(path, false);
    if (!ok) failures.push(path);
  }

  state.previewProcessing = false;
  state.previewTotal = 0;
  await refreshCleanupReport();
  if (failures.length) {
    alert(
      `${failures.length} preview${failures.length > 1 ? "s" : ""} impossible${failures.length > 1 ? "s" : ""} à générer:\n\n` +
      failures.join("\n")
    );
  }
}

function removeCleanupItem(section, path) {
  const items = state.cleanupReport?.issues?.[section];
  if (!items) return;
  const index = items.findIndex((item) => item.path === path);
  if (index >= 0) items.splice(index, 1);
  state.cleanupReport.counts[section] = items.length;
}

async function keepDuplicateGroup(group) {
  const paths = group.items.map((item) => item.path);
  if (paths.length < 2) return;

  const confirmed = window.confirm(
    "Garder les deux et ne plus afficher ce groupe comme doublon probable ?\n\n" +
    paths.join("\n")
  );
  if (!confirmed) return;

  try {
    await api("/api/ignore-duplicate", {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
  } catch (error) {
    alert(error.message);
    return;
  }

  await refreshCleanupReport();
}

async function ignoreCleanupIssue(section, path) {
  const confirmed = window.confirm(`Ignorer cet élément dans cette liste ?\n\n${path}`);
  if (!confirmed) return;
  try {
    await api("/api/ignore-cleanup", {
      method: "POST",
      body: JSON.stringify({ section, path }),
    });
    await refreshCleanupReport();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteCleanupFolder(path) {
  const confirmed = window.confirm(`Supprimer ce dossier vide ?\n\n${path}`);
  if (!confirmed) return;
  try {
    await api("/api/delete-folder", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
    await refreshCleanupReport();
  } catch (error) {
    alert(error.message);
  }
}

function countByFolder() {
  const map = new Map();
  for (const pdf of state.library.pdfs) {
    const parts = pdf.folder ? pdf.folder.split("/") : [];
    for (let index = 1; index <= parts.length; index += 1) {
      const path = parts.slice(0, index).join("/");
      map.set(path, (map.get(path) || 0) + 1);
    }
  }
  return map;
}

function groupFoldersByParent() {
  const map = new Map();
  for (const folder of state.library.folders) {
    if (folder.path === "_Unsorted") continue;
    if (!map.has(folder.parent)) map.set(folder.parent, []);
    map.get(folder.parent).push(folder);
  }
  return map;
}

function isFolderVisible(path) {
  const parts = path.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const ancestor = parts.slice(0, index).join("/");
    if (state.collapsedFolders.has(ancestor)) return false;
  }
  return true;
}

function expandActiveAncestors() {
  if (!state.folder) return;
  const parts = state.folder.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    state.collapsedFolders.delete(parts.slice(0, index).join("/"));
  }
}

function titleForFolder() {
  if (state.folder === "") return "Bibliothèque";
  if (state.folder === "_Unsorted") return "À trier";
  return state.folder;
}

function activeFilterText() {
  const parts = [];
  if (state.query.trim()) parts.push(`recherche "${state.query.trim()}"`);
  if (state.readFilter === "read") parts.push("lus uniquement");
  if (state.readFilter === "unread") parts.push("non lus uniquement");
  if (state.attributeFilter === "favorite") parts.push("favoris");
  if (state.attributeFilter === "to_read") parts.push("à lire");
  if (state.attributeFilter === "important") parts.push("important");
  if (state.sortMode === "date_desc") parts.push("plus récent d'abord");
  if (state.sortMode === "date_asc") parts.push("plus ancien d'abord");
  if (state.sortMode === "name_desc") parts.push("nom Z-A");
  if (state.sortMode === "folder_asc") parts.push("dossier A-Z");
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function setFolder(folder) {
  state.mode = "grid";
  state.folder = folder;
  state.metadataFilter = "";
  state.selected = null;
  resetGridRenderLimit();
  render();
}

function setMetadataFilter(filter) {
  state.mode = "grid";
  state.folder = "";
  state.metadataFilter = filter;
  state.attributeFilter = filter;
  state.selected = null;
  resetGridRenderLimit();
  render();
}

function toggleFolder(folder) {
  if (state.collapsedFolders.has(folder)) {
    state.collapsedFolders.delete(folder);
  } else {
    state.collapsedFolders.add(folder);
  }
  renderFolders();
}

function selectPdf(path) {
  state.selected = state.selected === path ? null : path;
  renderGrid();
}

function queueCurrentTriageMove() {
  const pdf = currentTriagePdf();
  if (!pdf) return;
  if (!state.triageDestination) {
    alert("Choisis un dossier destination.");
    return;
  }
  const filename = el.triageFilename.value.trim();
  if (!filename) {
    alert("Le nom ne peut pas être vide.");
    return;
  }
  if (filename.includes("/") || filename.includes("\\")) {
    alert("Le nom ne peut pas contenir de dossier.");
    return;
  }
  const job = optimisticMove(pdf, state.triageDestination, filename);
  state.moveQueue.push(job);
  state.pendingMoves += 1;
  render();
  processMoveQueue();
}

async function processMoveQueue() {
  if (state.processingQueue) return;
  state.processingQueue = true;
  while (state.moveQueue.length) {
    const job = state.moveQueue.shift();
    try {
      const result = await sendMove(job, "error");
      applyServerMoveResult(job, result);
    } catch (error) {
      if (error.code === "name_conflict") {
        await handleQueuedMoveConflict(job, error);
      } else {
        rollbackOptimisticMove(job);
        alert(error.message);
      }
    } finally {
      state.pendingMoves = Math.max(0, state.pendingMoves - 1);
      render();
    }
  }
  state.processingQueue = false;
}

async function sendMove(job, onConflict) {
  return api("/api/move", {
    method: "POST",
    body: JSON.stringify({
      path: job.sourcePath,
      destination: job.destination,
      filename: job.filename,
      onConflict,
    }),
  });
}

async function handleQueuedMoveConflict(job, error) {
  const existing = error?.details?.existing || "le dossier choisi";
  const suggested = error?.details?.suggested || "un nouveau nom";
  const addAnyway = window.confirm(
    `Un PDF avec le même nom existe déjà dans ${existing}.\n\n` +
    `Ajouter quand même en le renommant en:\n${suggested} ?`
  );
  if (addAnyway) {
    const result = await sendMove(job, "keep_both");
    applyServerMoveResult(job, result);
    return;
  }

  const deleteSource = window.confirm(
    "Supprimer le PDF actuellement dans _Unsorted et garder celui déjà classé ?"
  );
  if (deleteSource) {
    const result = await sendMove(job, "delete_source");
    applyServerMoveResult(job, result);
    window.alert("Doublon supprimé de _Unsorted. Le PDF déjà classé a été conservé.");
    return;
  }

  rollbackOptimisticMove(job);
}

function skipTriagePdf(delta = 1) {
  const count = unsortedPdfs().length;
  if (!count) return;
  state.triageIndex = Math.min(Math.max(state.triageIndex + delta, 0), count - 1);
  render();
}

function openCurrentTriagePdf(event) {
  const pdf = currentTriagePdf();
  if (pdf) openPdf(pdf.path, event);
}

function skipRenamePdf(delta = 1) {
  const count = renamePdfs().length;
  if (!count) return;
  state.renameIndexPosition = Math.min(Math.max(state.renameIndexPosition + delta, 0), count - 1);
  render();
}

function openCurrentRenamePdf(event) {
  const pdf = currentRenamePdf();
  if (pdf) openPdf(pdf.path, event);
}

async function renameCurrentPdf(onConflict = "error") {
  const pdf = currentRenamePdf();
  if (!pdf) return;
  const filename = el.renameFilename.value.trim();
  if (!filename) {
    alert("Le nom ne peut pas être vide.");
    return;
  }
  if (filename.includes("/") || filename.includes("\\")) {
    alert("Le nom ne peut pas contenir de dossier.");
    return;
  }
  const wantedName = safeDocumentName(pdf, filename);
  if (wantedName === pdf.name) {
    skipRenamePdf(1);
    return;
  }
  try {
    const result = await api("/api/rename", {
      method: "POST",
      body: JSON.stringify({ path: pdf.path, filename, onConflict }),
    });
    applyRenameResult(pdf.path, result);
    skipRenamePdf(1);
  } catch (error) {
    if (error.code !== "name_conflict") throw error;
    await handleQuickRenameConflict(pdf.path, filename, error);
  }
}

function applyRenameResult(sourcePath, result) {
  const index = state.library.pdfs.findIndex((pdf) => pdf.path === sourcePath);
  if (index >= 0) {
    state.library.pdfs[index] = {
      ...state.library.pdfs[index],
      name: result.name,
      path: result.path,
      folder: result.folder,
      isUnsorted: result.folder === "_Unsorted",
    };
  }
  if (state.selected === sourcePath) state.selected = result.path;
  refreshLocalCounts();
  if (state.renameIndex?.has(sourcePath)) {
    const document = state.renameIndex.get(sourcePath);
    state.renameIndex.delete(sourcePath);
    state.renameIndex.set(result.path, {
      ...document,
      path: result.path,
      name: result.name,
      folder: result.folder,
    });
  }
}

async function handleQuickRenameConflict(path, filename, error) {
  const suggested = error.details?.suggested || "un nom unique";
  const keepBoth = window.confirm(`Un PDF avec ce nom existe déjà.\n\nRenommer avec un nom unique ?\n${suggested}`);
  if (!keepBoth) return;
  const result = await api("/api/rename", {
    method: "POST",
    body: JSON.stringify({ path, filename, onConflict: "keep_both" }),
  });
  applyRenameResult(path, result);
  skipRenamePdf(1);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function formatPdfTitle(filename) {
  const withoutExtension = filename.replace(/\.pdf$/i, "");
  const match = withoutExtension.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  return { name: match ? match[2] : withoutExtension };
}

function emptyMetadata() {
  return {
    tags: [],
    note: "",
    status: "",
    sourceUrl: "",
    originalFilename: "",
    importedAt: "",
    importMethod: "",
    contentHash: "",
    archive: {},
    history: [],
    read: false,
    readAt: "",
  };
}

function metadataBadges(metadata) {
  const labels = {
    to_read: "A lire",
    read: "Lu",
    important: "Important",
    archive: "Archive",
  };
  const badges = [];
  if (metadata.status && labels[metadata.status]) {
    badges.push({
      label: labels[metadata.status],
      className: `badge status-${metadata.status.replace("_", "-")}`,
    });
  } else if (metadata.read) {
    badges.push({
      label: "Lu",
      className: "badge status-read",
    });
  }
  visibleTags(metadata.tags || []).slice(0, 3).forEach((tag) => {
    badges.push({ label: tag, className: "badge tag" });
  });
  if (metadata.sourceUrl) {
    badges.push({ label: "Source", className: "badge source" });
  }
  return badges;
}

function visibleTags(tags) {
  return (tags || []).filter((tag) => String(tag).trim().toLowerCase() !== "pdf");
}

function pdfByPath(path) {
  return state.library.pdfs.find((pdf) => pdf.path === path);
}

function detailsFields() {
  return {
    title: el.detailsTitle,
    filename: el.detailsFilename,
    status: el.detailsStatus,
    readToggle: el.detailsReadToggle,
    tags: el.detailsTags,
    sourceUrl: el.detailsSourceUrl,
    note: el.detailsNote,
  };
}

function readerFields() {
  return {
    title: el.pdfReaderSidebarTitle,
    filename: el.pdfReaderFilename,
    status: el.pdfReaderStatus,
    readToggle: el.pdfReaderReadToggle,
    tags: el.pdfReaderTags,
    sourceUrl: el.pdfReaderSourceUrl,
    note: el.pdfReaderNote,
  };
}

function fillMetadataFields(pdf, fields) {
  const metadata = pdf.metadata || emptyMetadata();
  fields.title.textContent = formatPdfTitle(pdf.name).name;
  fields.filename.value = filenameStem(pdf.name);
  fields.status.value = ["important", "archive"].includes(metadata.status) ? metadata.status : "";
  setReadToggle(fields.readToggle, Boolean(metadata.read));
  fields.tags.value = (metadata.tags || []).join(", ");
  fields.sourceUrl.value = metadata.sourceUrl || "";
  fields.note.value = metadata.note || "";
}

function clearMetadataFields(fields) {
  fields.status.value = "";
  setReadToggle(fields.readToggle, false);
  fields.tags.value = "";
  fields.sourceUrl.value = "";
  fields.note.value = "";
}

async function saveMetadataFields(path, fields) {
  const pdf = pdfByPath(path);
  if (!pdf) throw new Error("PDF introuvable.");
  const filename = fields.filename.value.trim();
  if (!filename) throw new Error("Le nom ne peut pas être vide.");
  if (filename.includes("/") || filename.includes("\\")) throw new Error("Le nom ne peut pas contenir de dossier.");

  let activePath = path;
  let activePdf = pdf;
  const wantedName = safeDocumentName(pdf, filename);
  if (wantedName !== pdf.name) {
    const renamed = await renameDetailsPdf(path, filename);
    activePath = renamed.path;
    activePdf = {
      ...pdf,
      name: renamed.name,
      path: renamed.path,
      folder: renamed.folder,
      metadata: pdf.metadata,
    };
    const index = state.library.pdfs.findIndex((item) => item.path === path);
    if (index >= 0) state.library.pdfs[index] = activePdf;
    state.selected = state.selected === path ? activePath : state.selected;
    if (state.readerPath === path) state.readerPath = activePath;
  }

  const metadata = {
    ...(activePdf.metadata || {}),
    status: fields.status.value,
    read: fields.readToggle?.dataset.read === "true",
    readAt: fields.readToggle?.dataset.read === "true"
      ? ((activePdf.metadata || {}).readAt || new Date().toISOString())
      : "",
    tags: fields.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    sourceUrl: fields.sourceUrl.value.trim(),
    note: fields.note.value,
  };
  const result = await api("/api/metadata", {
    method: "POST",
    body: JSON.stringify({ path: activePath, metadata }),
  });
  activePdf.metadata = result.metadata;
  refreshLocalCounts();
  return activePdf;
}

function setReadToggle(button, read) {
  if (!button) return;
  button.dataset.read = read ? "true" : "false";
  button.textContent = read ? "Lu" : "Non lu";
  button.setAttribute("aria-pressed", read ? "true" : "false");
  button.classList.toggle("is-read", read);
}

function toggleReadField(button) {
  if (!button) return;
  setReadToggle(button, button.dataset.read !== "true");
}

function pdfUrl(path) {
  return `/pdf/${encodePath(path)}`;
}

function openPdf(path, event) {
  if (event?.shiftKey) {
    openPdfInSystem(path).catch((error) => alert(error.message));
    return;
  }
  previewPdfInReader(path);
}

async function openPdfInSystem(path) {
  await api(`/api/open?path=${encodePath(path)}`);
}

function openPdfInTab(path) {
  window.open(pdfUrl(path), "_blank", "noopener");
}

function previewPdfInReader(path) {
  const pdf = pdfByPath(path);
  state.readerPath = path;
  state.readerSidebarOpen = true;
  el.pdfReaderModal.hidden = false;
  el.pdfReaderModal.classList.toggle("sidebar-collapsed", !state.readerSidebarOpen);
  loadPdfInReader(path);
  el.pdfReaderMessage.classList.remove("error");

  if (pdf) {
    fillMetadataFields(pdf, readerFields());
    el.pdfReaderTitle.textContent = formatPdfTitle(pdf.name).name;
    el.pdfReaderSave.disabled = false;
    el.pdfReaderClear.disabled = false;
  } else {
    el.pdfReaderTitle.textContent = path;
    el.pdfReaderSidebarTitle.textContent = path;
    el.pdfReaderSave.disabled = true;
    el.pdfReaderClear.disabled = true;
  }
}

function closePdfReader() {
  state.readerPath = "";
  state.readerLoadToken += 1;
  clearPdfReaderFrame();
  el.pdfReaderModal.hidden = true;
  el.pdfReaderMessage.textContent = "";
  el.pdfReaderMessage.classList.remove("error");
}

function clearPdfReaderFrame() {
  if (state.readerObjectUrl) {
    URL.revokeObjectURL(state.readerObjectUrl);
    state.readerObjectUrl = "";
  }
  el.pdfReaderFrame.removeAttribute("data");
}

async function loadPdfInReader(path) {
  const token = state.readerLoadToken + 1;
  state.readerLoadToken = token;
  clearPdfReaderFrame();
  el.pdfReaderMessage.textContent = "Chargement du PDF...";
  el.pdfReaderMessage.classList.remove("error");
  try {
    const response = await fetch(pdfUrl(path), { cache: "no-store" });
    if (!response.ok) throw new Error(`PDF indisponible (${response.status})`);
    const blob = await response.blob();
    if (state.readerLoadToken !== token || state.readerPath !== path) return;
    const objectUrl = URL.createObjectURL(blob);
    state.readerObjectUrl = objectUrl;
    el.pdfReaderFrame.data = objectUrl;
    el.pdfReaderMessage.textContent = "";
  } catch (error) {
    if (state.readerLoadToken !== token || state.readerPath !== path) return;
    clearPdfReaderFrame();
    el.pdfReaderMessage.textContent = `${error.message}. Ouvre-le dans un onglet.`;
    el.pdfReaderMessage.classList.add("error");
  }
}

function togglePdfReaderSidebar() {
  state.readerSidebarOpen = !state.readerSidebarOpen;
  el.pdfReaderModal.classList.toggle("sidebar-collapsed", !state.readerSidebarOpen);
  el.pdfReaderToggleSidebar.title = state.readerSidebarOpen ? "Masquer les attributs" : "Afficher les attributs à côté";
  el.pdfReaderToggleSidebar.setAttribute("aria-label", el.pdfReaderToggleSidebar.title);
}

async function saveReaderDetails() {
  if (!state.readerPath || state.readerSaving) return;
  state.readerSaving = true;
  el.pdfReaderSave.disabled = true;
  el.pdfReaderMessage.textContent = "Enregistrement...";
  el.pdfReaderMessage.classList.remove("error");
  try {
    const savedPdf = await saveMetadataFields(state.readerPath, readerFields());
    fillMetadataFields(savedPdf, readerFields());
    el.pdfReaderTitle.textContent = formatPdfTitle(savedPdf.name).name;
    loadPdfInReader(savedPdf.path);
    el.pdfReaderMessage.textContent = "Enregistré";
    render();
  } catch (error) {
    el.pdfReaderMessage.textContent = error.message;
    el.pdfReaderMessage.classList.add("error");
  } finally {
    state.readerSaving = false;
    el.pdfReaderSave.disabled = !state.readerPath;
  }
}

function openDetails(path, anchor) {
  if (!el.detailsPanel.hidden && el.detailsPanel.dataset.path === path) {
    closeDetails();
    return;
  }
  const pdf = pdfByPath(path);
  if (!pdf) return;
  state.detailsAnchor = anchor?.closest(".card") || anchor || null;
  el.detailsPanel.dataset.path = path;
  fillMetadataFields(pdf, detailsFields());
  renderArchivePassport(pdf);
  el.detailsPanel.hidden = false;
  positionDetailsPopover();
}

function closeDetails() {
  el.detailsPanel.hidden = true;
  el.detailsPanel.dataset.path = "";
  state.detailsAnchor = null;
  el.detailsPanel.classList.remove("place-left", "place-right");
}

async function saveDetails() {
  const path = el.detailsPanel.dataset.path;
  if (!path) return;
  await saveMetadataFields(path, detailsFields());
  closeDetails();
  render();
}

function renderArchivePassport(pdf) {
  const metadata = pdf.metadata || emptyMetadata();
  const rows = [
    ["Méthode", importMethodLabel(metadata.importMethod)],
    ["Importé", formatPassportDate(metadata.importedAt || metadata.createdAt)],
    ["Lecture", metadata.read ? `Lu${metadata.readAt ? ` le ${formatPassportDate(metadata.readAt)}` : ""}` : "Non lu"],
    ["Nom original", metadata.originalFilename || ""],
    ["Chemin", pdf.path],
    ["Taille", formatBytes(pdf.size || metadata.fileSize || 0)],
    ["Empreinte", metadata.contentHash ? `${metadata.contentHash.slice(0, 16)}...` : ""],
  ].filter(([, value]) => value);
  const history = (metadata.history || []).slice(-4).reverse();
  el.detailsPassport.innerHTML = `
    <div class="passport-title">Archive Passport</div>
    <div class="passport-rows">
      ${rows.map(([label, value]) => `
        <div class="passport-row">
          <span>${escapeHtml(label)}</span>
          <strong title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</strong>
        </div>
      `).join("")}
    </div>
    ${history.length ? `
      <div class="passport-history">
        ${history.map((entry) => `
          <div>
            <span>${escapeHtml(historyLabel(entry.type))}</span>
            <time>${escapeHtml(formatPassportDate(entry.at))}</time>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function importMethodLabel(value) {
  return {
    local_upload: "Upload local",
    url_pdf: "URL PDF",
    web_archive: "Archive web",
    manual: "Manuel",
  }[value] || "";
}

function historyLabel(value) {
  return {
    imported: "Importé",
    renamed: "Renommé",
    moved: "Déplacé",
    archived: "Archivé",
    trashed: "Corbeille",
  }[value] || value || "Action";
}

function formatPassportDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-BE", { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function trashDetailsPdf() {
  const path = el.detailsPanel.dataset.path;
  if (!path) return;
  const pdf = pdfByPath(path);
  if (!pdf) return;
  const title = formatPdfTitle(pdf.name).name;
  const confirmed = window.confirm(`Mettre ce PDF dans pdf_trash ?\n\n${title}`);
  if (!confirmed) return;
  await api("/api/trash", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
  const index = state.library.pdfs.findIndex((item) => item.path === path);
  if (index >= 0) state.library.pdfs.splice(index, 1);
  if (state.selected === path) state.selected = null;
  refreshLocalCounts();
  closeDetails();
  render();
}

async function importDroppedFiles(fileList) {
  const files = [...fileList].filter((file) => file.name.toLowerCase().endsWith(".pdf"));
  if (!files.length) {
    alert("Dépose seulement des fichiers PDF.");
    return;
  }
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file, file.name));
  state.importing = true;
  state.dragActive = false;
  state.dragDepth = 0;
  render();
  try {
    const response = await fetch("/api/capture/prepare-upload", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Préparation impossible");
    const candidates = (data.candidates || []).map((candidate, index) => ({
      kind: "upload",
      file: files[index],
      ...(candidate || {}),
    }));
    openCaptureQueue(candidates);
  } catch (error) {
    alert(error.message);
  } finally {
    state.importing = false;
    render();
  }
}

function openUrlImportPanel() {
  el.urlImportPanel.hidden = false;
  render();
  el.urlImportInput.focus();
}

function closeUrlImportPanel() {
  el.urlImportPanel.hidden = true;
  el.urlImportInput.value = "";
  el.urlImportFilename.value = "";
}

async function submitUrlPanel() {
  await importUrl();
}

async function importUrl() {
  const url = el.urlImportInput.value.trim();
  const filename = el.urlImportFilename.value.trim();
  if (!url) {
    alert("Entre une URL.");
    return;
  }
  state.importingUrl = true;
  startUrlImportProgress();
  render();
  try {
    const data = await api("/api/capture/prepare-url", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    if (filename) {
      data.suggestions = [{ value: filenameStem(filename), reason: "Choisi" }, ...(data.suggestions || [])];
    }
    state.urlImportPercent = 100;
    render();
    closeUrlImportPanel();
    openCaptureQueue([{ kind: "url", url, ...data }]);
  } catch (error) {
    alert(error.message);
  } finally {
    stopUrlImportProgress();
    state.importingUrl = false;
    state.urlImportPercent = 0;
    render();
  }
}

function openCaptureQueue(candidates) {
  state.captureQueue = candidates.filter(Boolean);
  state.captureQueueIndex = 0;
  if (!state.captureQueue.length) return;
  openCaptureInbox(state.captureQueue[0]);
}

function openCaptureInbox(candidate) {
  state.captureCandidate = candidate;
  state.captureImporting = false;
  el.captureFilename.value = filenameStem(candidate.suggestions?.[0]?.value || candidate.originalFilename || "Archive.pdf");
  el.captureNewFolder.value = "";
  el.captureTags.value = "";
  el.captureNote.value = "";
  el.captureInbox.hidden = false;
  renderCaptureInbox();
  el.captureFilename.focus();
  el.captureFilename.select();
}

function closeCaptureInbox() {
  state.captureCandidate = null;
  state.captureQueue = [];
  state.captureQueueIndex = 0;
  state.captureImporting = false;
  el.captureInbox.hidden = true;
  el.captureFilename.value = "";
  el.captureNewFolder.value = "";
  el.captureTags.value = "";
  el.captureNote.value = "";
}

function advanceCaptureQueue() {
  state.captureQueueIndex += 1;
  const next = state.captureQueue[state.captureQueueIndex];
  if (!next) {
    closeCaptureInbox();
    return false;
  }
  openCaptureInbox(next);
  return true;
}

function renderCaptureInbox() {
  const candidate = state.captureCandidate;
  el.captureInbox.hidden = !candidate;
  if (!candidate) return;
  const total = state.captureQueue.length || 1;
  el.captureProgress.textContent = total > 1
    ? `Capture inbox ${state.captureQueueIndex + 1} / ${total}`
    : "Capture inbox";
  el.captureTitle.textContent = candidate.kind === "url" ? "Capturer depuis une URL" : "Capturer un PDF";
  el.captureSource.textContent = candidate.sourceUrl || candidate.originalFilename || "";
  renderSuggestionButtons(candidate.suggestions || [], el.captureSuggestions, el.captureFilename);
  renderCaptureDestinations();
  const duplicates = candidate.duplicates || [];
  el.captureDuplicates.innerHTML = duplicates.length
    ? `<strong>Doublon possible</strong>${duplicates.map((item) => `
      <div class="capture-duplicate">
        <span>${escapeHtml(duplicateLabel(item.type))}: ${escapeHtml(item.name)}</span>
        <button type="button" data-open-duplicate="${escapeHtml(item.path)}">Ouvrir</button>
      </div>
    `).join("")}`
    : "";
  el.captureDuplicates.querySelectorAll("[data-open-duplicate]").forEach((button) => {
    button.addEventListener("click", (event) => {
      openPdf(button.dataset.openDuplicate, event);
    });
  });
  el.captureImport.disabled = state.captureImporting;
  el.captureSkip.disabled = state.captureImporting;
  el.captureImport.textContent = state.captureImporting
    ? "Import..."
    : duplicates.length ? "Importer quand même" : "Importer";
}

function renderCaptureDestinations() {
  const current = el.captureDestination.value || state.captureCandidate?.destination || state.triageDestination || state.folder || state.library?.folders?.find((folder) => folder.path === "_Unsorted")?.path || "_Unsorted";
  el.captureDestination.innerHTML = "";
  (state.library?.folders || []).forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.path;
    option.textContent = folder.path;
    el.captureDestination.append(option);
  });
  el.captureDestination.value = current;
  if (!el.captureDestination.value && el.captureDestination.options.length) {
    el.captureDestination.value = "_Unsorted";
  }
}

function duplicateLabel(type) {
  return {
    content_hash: "Même contenu",
    source_url: "Même source",
    normalized_name: "Nom proche",
  }[type] || "Indice";
}

async function importCaptureCandidate() {
  const candidate = state.captureCandidate;
  if (!candidate) return;
  const filename = el.captureFilename.value.trim();
  if (!filename) {
    alert("Le nom ne peut pas être vide.");
    return;
  }
  state.captureImporting = true;
  renderCaptureInbox();
  try {
    let imported;
    if (candidate.kind === "url") {
      const data = await api("/api/import-url", {
        method: "POST",
        body: JSON.stringify({ url: candidate.sourceUrl || candidate.url, filename }),
      });
      imported = data.imported;
    } else {
      const formData = new FormData();
      formData.append("files", candidate.file, safeCaptureFilename(filename));
      const response = await fetch("/api/import", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import impossible");
      imported = data.imported?.[0];
    }
    if (imported?.path) {
      await saveCaptureMetadata(imported.path, candidate);
      const destination = el.captureDestination.value;
      if (destination && destination !== imported.folder) {
        imported = await api("/api/move", {
          method: "POST",
          body: JSON.stringify({ path: imported.path, destination, filename }),
        });
      }
    }
    await loadLibrary();
    setFolder(imported?.folder || "_Unsorted");
    el.viewMeta.textContent = "PDF capturé avec son passeport";
    advanceCaptureQueue();
  } catch (error) {
    alert(error.message);
  } finally {
    state.captureImporting = false;
    render();
  }
}

function skipCaptureCandidate() {
  advanceCaptureQueue();
  render();
}

async function createCaptureFolder() {
  const path = el.captureNewFolder.value.trim();
  if (!path) return;
  await api("/api/folders", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
  el.captureNewFolder.value = "";
  await loadLibrary();
  el.captureDestination.value = path;
  renderCaptureInbox();
}

async function saveCaptureMetadata(path, candidate) {
  const metadata = {
    originalFilename: candidate.originalFilename || "",
    sourceUrl: candidate.sourceUrl || "",
    tags: el.captureTags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    note: el.captureNote.value,
  };
  await api("/api/metadata", {
    method: "POST",
    body: JSON.stringify({ path, metadata }),
  });
}

function safeCaptureFilename(filename) {
  return filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;
}

function startUrlImportProgress() {
  stopUrlImportProgress();
  state.urlImportPercent = 6;
  state.urlImportProgressTimer = window.setInterval(() => {
    const ceiling = 92;
    const remaining = ceiling - state.urlImportPercent;
    if (remaining <= 0) return;
    state.urlImportPercent += Math.max(1, Math.round(remaining * 0.12));
    render();
  }, 420);
}

function stopUrlImportProgress() {
  if (!state.urlImportProgressTimer) return;
  window.clearInterval(state.urlImportProgressTimer);
  state.urlImportProgressTimer = null;
}

function parseWaybackUrl(value) {
  const match = String(value || "").match(/^https?:\/\/web\.archive\.org\/web\/(\d{1,14})(?:[a-z_]+)?\/(https?:\/\/.+)$/i);
  if (!match) return null;
  return { snapshot: match[1], url: match[2] };
}

async function renameDetailsPdf(path, filename) {
  try {
    return await api("/api/rename", {
      method: "POST",
      body: JSON.stringify({ path, filename, onConflict: "error" }),
    });
  } catch (error) {
    if (error.code !== "name_conflict") throw error;
    const suggested = error.details?.suggested || "un nom unique";
    const keepBoth = window.confirm(`Un PDF avec ce nom existe déjà.\n\nRenommer avec un nom unique ?\n${suggested}`);
    if (!keepBoth) throw error;
    return api("/api/rename", {
      method: "POST",
      body: JSON.stringify({ path, filename, onConflict: "keep_both" }),
    });
  }
}

function clearDetails() {
  clearMetadataFields(detailsFields());
}

function positionDetailsPopover() {
  if (el.detailsPanel.hidden || !state.detailsAnchor?.isConnected) return;

  const anchorRect = state.detailsAnchor.getBoundingClientRect();
  const card = el.detailsPanel.querySelector(".details-card");
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width || 420;
  const height = cardRect.height || 500;
  const gap = 14;
  const margin = 14;
  const roomRight = window.innerWidth - anchorRect.right - margin;
  const roomLeft = anchorRect.left - margin;
  const placeRight = roomRight >= width + gap || roomRight >= roomLeft;
  let left = placeRight ? anchorRect.right + gap : anchorRect.left - width - gap;
  left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - width - margin));

  let top = anchorRect.top;
  top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - height - margin));

  el.detailsPanel.style.setProperty("--details-left", `${Math.round(left)}px`);
  el.detailsPanel.style.setProperty("--details-top", `${Math.round(top)}px`);
  el.detailsPanel.classList.toggle("place-right", placeRight);
  el.detailsPanel.classList.toggle("place-left", !placeRight);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[char]));
}

document.querySelectorAll(".folder[data-folder]").forEach((button) => {
  button.addEventListener("click", () => setFolder(button.dataset.folder));
});

document.querySelectorAll(".folder[data-metadata-filter]").forEach((button) => {
  button.addEventListener("click", () => setMetadataFilter(button.dataset.metadataFilter));
});

el.quickTriageBtn.addEventListener("click", () => setMode("triage"));
el.quickRenameBtn.addEventListener("click", () => setMode("rename"));
el.cleanupBtn.addEventListener("click", setCleanupMode);
el.graphBtn.addEventListener("click", setGraphMode);
el.graphReset.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  resetGraphView();
});
el.graphPanelClose.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setGraphPanelHidden(true);
});
el.graphPanelShow.addEventListener("click", () => {
  setGraphPanelHidden(false);
});
el.graphSearch.addEventListener("input", () => {
  state.graphSearch = el.graphSearch.value;
  render();
});
el.graphShowFolders.addEventListener("change", () => setGraphOption("showFolders", el.graphShowFolders.checked));
el.graphShowPdfs.addEventListener("change", () => setGraphOption("showPdfs", el.graphShowPdfs.checked));
el.graphShowUnsorted.addEventListener("change", () => setGraphOption("showUnsorted", el.graphShowUnsorted.checked));
el.graphWarningsOnly.addEventListener("change", () => setGraphOption("warningsOnly", el.graphWarningsOnly.checked));
el.graphShowLabels.addEventListener("change", () => setGraphOption("showLabels", el.graphShowLabels.checked));
el.graphFolderColors.addEventListener("change", () => setGraphOption("folderColors", el.graphFolderColors.checked));
el.graphNodeSize.addEventListener("input", () => setGraphOption("nodeSize", Number(el.graphNodeSize.value)));
el.graphLinkThickness.addEventListener("input", () => setGraphOption("linkThickness", Number(el.graphLinkThickness.value)));
el.graphTextThreshold.addEventListener("input", () => setGraphOption("textThreshold", Number(el.graphTextThreshold.value)));
el.graphAnimate.addEventListener("click", () => setGraphOption("animate", !state.graphOptions.animate));
el.graphCenterForce.addEventListener("input", () => setGraphOption("centerForce", Number(el.graphCenterForce.value)));
el.graphRepelForce.addEventListener("input", () => setGraphOption("repelForce", Number(el.graphRepelForce.value)));
el.graphLinkForce.addEventListener("input", () => setGraphOption("linkForce", Number(el.graphLinkForce.value)));
el.graphLinkDistance.addEventListener("input", () => setGraphOption("linkDistance", Number(el.graphLinkDistance.value)));
window.addEventListener("resize", () => {
  if (state.mode === "graph" && state.graphRenderer) state.graphRenderer.resize();
});
el.dailyFivePrev?.addEventListener("click", () => rotateDailyFive(-1));
el.dailyFiveNext?.addEventListener("click", () => rotateDailyFive(1));
el.dailyFiveRead?.addEventListener("click", () => {
  toggleDailyFiveRead().catch((error) => alert(error.message));
});
el.dailyFiveOpen?.addEventListener("click", () => {
  const pdf = currentDailyFivePdf();
  if (pdf) previewPdfInReader(pdf.path);
});
el.dailyFivePreview?.addEventListener("click", () => {
  const pdf = currentDailyFivePdf();
  if (pdf) previewPdfInReader(pdf.path);
});
el.dailyFivePreview?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const pdf = currentDailyFivePdf();
  if (pdf) previewPdfInReader(pdf.path);
});
el.dailyFiveDetails?.addEventListener("click", (event) => {
  event.stopPropagation();
  const pdf = currentDailyFivePdf();
  if (pdf) openDetails(pdf.path, event.currentTarget);
});
el.urlImportBtn.addEventListener("click", openUrlImportPanel);
el.urlImportClose.addEventListener("click", closeUrlImportPanel);
el.urlImportSubmit.addEventListener("click", () => {
  submitUrlPanel().catch((error) => alert(error.message));
});
el.captureCancel.addEventListener("click", closeCaptureInbox);
el.captureSkip.addEventListener("click", skipCaptureCandidate);
el.captureCreateFolder.addEventListener("click", () => {
  createCaptureFolder().catch((error) => alert(error.message));
});
el.captureImport.addEventListener("click", () => {
  importCaptureCandidate().catch((error) => alert(error.message));
});
el.rebuildSearchBtn.addEventListener("click", rebuildSearchIndex);
el.detailsClose.addEventListener("click", closeDetails);
el.detailsTrash.addEventListener("click", () => {
  trashDetailsPdf().catch((error) => alert(error.message));
});
el.detailsClear?.addEventListener("click", clearDetails);
el.detailsReadToggle?.addEventListener("click", () => toggleReadField(el.detailsReadToggle));
el.detailsSave.addEventListener("click", () => {
  saveDetails().catch((error) => alert(error.message));
});
el.pdfReaderClose.addEventListener("click", closePdfReader);
el.pdfReaderBackdrop.addEventListener("click", closePdfReader);
el.pdfReaderToggleSidebar.addEventListener("click", togglePdfReaderSidebar);
el.pdfReaderOpenTab.addEventListener("click", () => {
  if (state.readerPath) window.open(pdfUrl(state.readerPath), "_blank");
});
el.pdfReaderClear.addEventListener("click", () => clearMetadataFields(readerFields()));
el.pdfReaderReadToggle?.addEventListener("click", () => toggleReadField(el.pdfReaderReadToggle));
el.pdfReaderSave.addEventListener("click", saveReaderDetails);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.pdfReaderModal.hidden) closePdfReader();
});

window.addEventListener("dragenter", (event) => {
  if (![...(event.dataTransfer?.items || [])].some((item) => item.kind === "file")) return;
  event.preventDefault();
  state.dragDepth += 1;
  state.dragActive = true;
  render();
});

window.addEventListener("dragover", (event) => {
  if (!state.dragActive) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (event) => {
  if (!state.dragActive) return;
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) {
    state.dragActive = false;
    render();
  }
});

window.addEventListener("drop", (event) => {
  if (!state.dragActive && !event.dataTransfer?.files?.length) return;
  event.preventDefault();
  const files = event.dataTransfer.files;
  state.dragActive = false;
  state.dragDepth = 0;
  importDroppedFiles(files);
});

window.addEventListener("resize", positionDetailsPopover);
window.addEventListener("scroll", positionDetailsPopover, true);

document.addEventListener("click", (event) => {
  if (el.detailsPanel.hidden) return;
  if (el.detailsPanel.contains(event.target)) return;
  if (event.target.closest(".details")) return;
  closeDetails();
});

el.urlImportPanel.addEventListener("click", (event) => {
  if (event.target === el.urlImportPanel) closeUrlImportPanel();
});

el.search.addEventListener("input", () => {
  state.query = el.search.value;
  if (state.mode === "contentSearch") return;
  resetGridRenderLimit();
  render();
});

el.sortSelect.addEventListener("change", () => {
  state.sortMode = el.sortSelect.value;
  resetGridRenderLimit();
  render();
});

el.readFilter.addEventListener("change", () => {
  state.readFilter = el.readFilter.value;
  resetGridRenderLimit();
  render();
});

el.attributeFilter.addEventListener("change", () => {
  state.attributeFilter = el.attributeFilter.value;
  resetGridRenderLimit();
  render();
});

el.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runContentSearch();
  }
});

el.createFolderBtn.addEventListener("click", async () => {
  const path = el.newFolderInput.value.trim();
  if (!path) return;
  await api("/api/folders", { method: "POST", body: JSON.stringify({ path }) });
  el.newFolderInput.value = "";
  await loadLibrary();
  el.destinationSelect.value = path;
});

el.moveBtn.addEventListener("click", async () => {
  if (!state.selected) return;
  await moveSelectedPdf();
});

el.triageMove.addEventListener("click", () => queueCurrentTriageMove());
el.triageSkip.addEventListener("click", () => skipTriagePdf(1));
el.triageOpen.addEventListener("click", openCurrentTriagePdf);
el.triagePrevious.addEventListener("click", () => skipTriagePdf(-1));
el.triageNext.addEventListener("click", () => skipTriagePdf(1));
el.renameApply.addEventListener("click", () => {
  renameCurrentPdf().catch((error) => alert(error.message));
});
el.renameSkip.addEventListener("click", () => skipRenamePdf(1));
el.renameOpen.addEventListener("click", openCurrentRenamePdf);
el.renamePrevious.addEventListener("click", () => skipRenamePdf(-1));
el.renameNext.addEventListener("click", () => skipRenamePdf(1));
el.triageCreateFolder.addEventListener("click", async () => {
  const path = el.triageNewFolder.value.trim();
  if (!path) return;
  await api("/api/folders", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
  el.triageNewFolder.value = "";
  await loadLibrary();
  state.triageDestination = path;
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !el.urlImportPanel.hidden && document.activeElement !== el.search) {
    event.preventDefault();
    submitUrlPanel().catch((error) => alert(error.message));
    return;
  }
  if (event.key === "Escape" && !el.urlImportPanel.hidden) {
    closeUrlImportPanel();
    return;
  }
  if (event.key === "Enter" && !el.captureInbox.hidden && document.activeElement !== el.captureNote) {
    event.preventDefault();
    importCaptureCandidate().catch((error) => alert(error.message));
    return;
  }
  if (event.key === "Escape" && !el.captureInbox.hidden) {
    closeCaptureInbox();
    return;
  }
  if (event.key === "Escape" && !el.detailsPanel.hidden) {
    closeDetails();
    return;
  }
  if (state.mode === "rename") {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if (event.key === "Enter") {
      event.preventDefault();
      renameCurrentPdf().catch((error) => alert(error.message));
    } else if (event.key === " ") {
      event.preventDefault();
      skipRenamePdf(1);
    } else if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      openCurrentRenamePdf();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      skipRenamePdf(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      skipRenamePdf(-1);
    }
    return;
  }

  if (state.mode !== "triage") return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

  if (event.key === "Enter") {
    event.preventDefault();
    queueCurrentTriageMove();
  } else if (event.key === " ") {
    event.preventDefault();
    skipTriagePdf(1);
  } else if (event.key.toLowerCase() === "o") {
    event.preventDefault();
    openCurrentTriagePdf();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    skipTriagePdf(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    skipTriagePdf(-1);
  }
});

async function moveSelectedPdf(onConflict = "error") {
  try {
    const result = await api("/api/move", {
      method: "POST",
      body: JSON.stringify({
        path: state.selected,
        destination: el.destinationSelect.value,
        onConflict,
      }),
    });
    await loadLibrary();
    if (result.action === "deleted_source_duplicate") {
      window.alert("Doublon supprimé de _Unsorted. Le PDF déjà classé a été conservé.");
    }
  } catch (error) {
    if (error.code !== "name_conflict") throw error;
    await handleMoveConflict(state.selected, el.destinationSelect.value, null, error);
  }
}

async function handleMoveConflict(path, destination, filename, error) {
  const existing = error?.details?.existing || "le dossier choisi";
  const suggested = error?.details?.suggested || "un nouveau nom";
  const addAnyway = window.confirm(
    `Un PDF avec le même nom existe déjà dans ${existing}.\n\n` +
    `Ajouter quand même en le renommant en:\n${suggested} ?`
  );
  if (addAnyway) {
    const result = await api("/api/move", {
      method: "POST",
      body: JSON.stringify({ path, destination, filename, onConflict: "keep_both" }),
    });
    await loadLibrary();
    if (result.action === "deleted_source_duplicate") {
      window.alert("Doublon supprimé de _Unsorted. Le PDF déjà classé a été conservé.");
    }
    return;
  }

  const deleteSource = window.confirm(
    "Supprimer le PDF actuellement dans _Unsorted et garder celui déjà classé ?"
  );
  if (deleteSource) {
    const result = await api("/api/move", {
      method: "POST",
      body: JSON.stringify({ path, destination, filename, onConflict: "delete_source" }),
    });
    await loadLibrary();
    if (result.action === "deleted_source_duplicate") {
      window.alert("Doublon supprimé de _Unsorted. Le PDF déjà classé a été conservé.");
    }
  }
}

loadLibrary().catch((error) => {
  el.viewMeta.textContent = error.message;
});
