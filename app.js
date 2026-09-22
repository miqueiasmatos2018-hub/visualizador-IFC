import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";

/* =====================================================================
   Elementos do DOM
   ===================================================================== */
const canvas = document.getElementById("viewer-canvas");
const viewport = document.getElementById("viewport");
const dropHint = document.getElementById("drop-hint");
const fileInput = document.getElementById("file-input");
const btnOpen = document.getElementById("btn-open");
const fileNameEl = document.getElementById("file-name");
const btnTheme = document.getElementById("btn-theme");
const iconSun = document.getElementById("icon-theme-sun");
const iconMoon = document.getElementById("icon-theme-moon");
const btnFullscreen = document.getElementById("btn-fullscreen");

const progressOverlay = document.getElementById("progress-overlay");
const progressFill = document.getElementById("progress-bar-fill");
const progressLabel = document.getElementById("progress-label");

const toolHome = document.getElementById("tool-home");
const toolPan = document.getElementById("tool-pan");
const toolWireframe = document.getElementById("tool-wireframe");
const toolSection = document.getElementById("tool-section");
const toolExplode = document.getElementById("tool-explode");
const toolMeasure = document.getElementById("tool-measure");
const toolTree = document.getElementById("tool-tree");
const toolReset = document.getElementById("tool-reset");

const sectionPanel = document.getElementById("section-panel");
const sectionSlider = document.getElementById("section-slider");
const sectionFlipBtn = document.getElementById("section-flip");
const axisButtons = sectionPanel.querySelectorAll(".axis-toggle button");

const explodePanel = document.getElementById("explode-panel");
const explodeSlider = document.getElementById("explode-slider");

const measureBadge = document.getElementById("measure-badge");

const sidebar = document.getElementById("sidebar");
const sidebarTabs = document.querySelectorAll("#sidebar-tabs button");
const tabProperties = document.getElementById("tab-properties");
const tabTree = document.getElementById("tab-tree");

const propertiesEmpty = document.getElementById("properties-empty");
const propertiesContent = document.getElementById("properties-content");
const propElementTitle = document.getElementById("prop-element-title");
const propElementType = document.getElementById("prop-element-type");
const propGroups = document.getElementById("prop-groups");
const propIsolateBtn = document.getElementById("prop-isolate");
const propHideBtn = document.getElementById("prop-hide");
const propClearBtn = document.getElementById("prop-clear");

const treeRoot = document.getElementById("tree-root");
const toast = document.getElementById("toast");

/* =====================================================================
   Tema (claro / escuro)
   ===================================================================== */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  iconSun.classList.toggle("hidden", theme === "dark");
  iconMoon.classList.toggle("hidden", theme !== "dark");
  try { localStorage.setItem("ifc-viewer-theme", theme); } catch (e) { /* ignora */ }
  updateGridColor();
}

function initTheme() {
  let theme = "light";
  try {
    const saved = localStorage.getItem("ifc-viewer-theme");
    if (saved) theme = saved;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) theme = "dark";
  } catch (e) { /* ignora */ }
  applyTheme(theme);
}

btnTheme.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

/* =====================================================================
   Cena three.js
   ===================================================================== */
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 10000);
camera.position.set(12, 10, 12);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x555566, 1.1);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(8, 14, 6);
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35);
dirLight2.position.set(-8, 6, -10);
scene.add(dirLight2);

let grid = null;
function updateGridColor() {
  if (grid) {
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
  }
  const color = cssVar("--grid-color") || "#888888";
  grid = new THREE.GridHelper(60, 60, color, color);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0;
  scene.add(grid);
}

function resizeRenderer() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

new ResizeObserver(resizeRenderer).observe(viewport);
resizeRenderer();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

/* =====================================================================
   Carregamento IFC
   ===================================================================== */
const ifcLoader = new IFCLoader();
const ifcManager = ifcLoader.ifcManager;

let wasmReady = ifcManager.setWasmPath("wasm/").catch((err) => {
  console.error("Falha ao carregar o WASM do web-ifc:", err);
  showToast("Não foi possível carregar o mecanismo IFC (verifique a pasta wasm/).");
});

ifcManager.setOnProgress((event) => {
  const pct = event.total ? Math.round((event.loaded / event.total) * 100) : null;
  progressOverlay.classList.remove("hidden");
  if (pct !== null) {
    progressFill.style.width = pct + "%";
    progressLabel.textContent = "Carregando modelo… " + pct + "%";
  } else {
    progressFill.style.width = "60%";
    progressLabel.textContent = "Carregando modelo…";
  }
});

let currentModel = null;
let currentModelID = null;
let modelBox = null;
let allElementIds = new Set();

async function loadIfcFile(file) {
  try {
    await wasmReady;
    progressOverlay.classList.remove("hidden");
    progressFill.style.width = "5%";
    progressLabel.textContent = "Lendo arquivo…";

    const buffer = await file.arrayBuffer();
    clearModel();

    const model = await ifcLoader.parse(buffer);
    scene.add(model);

    // web-ifc-three já entrega a geometria com Y como eixo vertical
    // (equivalente à convenção do three.js), então nenhuma rotação extra
    // é necessária aqui.
    model.updateMatrixWorld(true);

    currentModel = model;
    currentModelID = model.modelID;
    allElementIds = collectGeometryIds(model);

    modelBox = new THREE.Box3().setFromObject(model);
    fitCameraToBox(modelBox);

    fileNameEl.textContent = file.name;
    dropHint.classList.add("hidden");

    await buildTree();
  } catch (err) {
    console.error(err);
    showToast("Não foi possível abrir este arquivo IFC.");
  } finally {
    progressOverlay.classList.add("hidden");
    progressFill.style.width = "0%";
  }
}

function clearModel() {
  if (currentModel) {
    try { ifcManager.removeSubset(currentModelID, SELECT_MATERIAL, "selection"); } catch (e) {}
    try { ifcManager.removeSubset(currentModelID, HOVER_MATERIAL, "hover"); } catch (e) {}
    try { ifcManager.removeSubset(currentModelID, undefined, "visible-filtered"); } catch (e) {}
    clearExplodeSubsets();
    scene.remove(currentModel);
    try { ifcManager.close(currentModelID, scene); } catch (e) {}
  }
  currentModel = null;
  currentModelID = null;
  modelBox = null;
  allElementIds = new Set();
  selectedID = null;
  hoveredID = null;
  hiddenIds.clear();
  isolatedId = null;
  measurePoints.length = 0;
  clearMeasureHelpers();
  updateMeasureBadge();
  showPropertiesEmpty();
  treeRoot.innerHTML = "";
}

function collectGeometryIds(model) {
  const attr = model.geometry.getAttribute("expressID");
  const ids = new Set();
  if (attr) {
    for (let i = 0; i < attr.count; i++) ids.add(attr.getX(i));
  }
  return ids;
}

btnOpen.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) loadIfcFile(fileInput.files[0]);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) => {
  viewport.addEventListener(evt, (e) => {
    e.preventDefault();
    viewport.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((evt) => {
  viewport.addEventListener(evt, (e) => {
    e.preventDefault();
    viewport.classList.remove("dragover");
  });
});
viewport.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadIfcFile(file);
});

/* =====================================================================
   Câmera — enquadrar (fit to view)
   ===================================================================== */
function fitCameraToBox(box, margin = 1.35) {
  if (!box || box.isEmpty()) return;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const fov = camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2);
  dist *= margin;

  const dir = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.near = Math.max(dist / 1000, 0.01);
  camera.far = dist * 1000;
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

// Os subconjuntos (subsets) criados com `scene` explícito viram filhos
// diretos da cena (para não herdar a visibilidade do modelo original) e
// por isso precisam copiar manualmente a rotação/posição do modelo.
function alignSubsetToModel(mesh) {
  if (!mesh || !currentModel) return;
  mesh.quaternion.copy(currentModel.quaternion);
  mesh.position.copy(currentModel.position);
  mesh.scale.copy(currentModel.scale);
}

function computeBoxForIds(model, idSet) {
  const posAttr = model.geometry.getAttribute("position");
  const idAttr = model.geometry.getAttribute("expressID");
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let any = false;
  for (let i = 0; i < posAttr.count; i++) {
    if (idSet.has(idAttr.getX(i))) {
      v.fromBufferAttribute(posAttr, i);
      box.expandByPoint(v);
      any = true;
    }
  }
  if (!any) return null;
  box.applyMatrix4(model.matrixWorld);
  return box;
}

toolHome.addEventListener("click", () => {
  if (modelBox) fitCameraToBox(modelBox);
});

/* =====================================================================
   Órbita / Pan (alternância do botão esquerdo)
   ===================================================================== */
let panModeActive = false;
toolPan.addEventListener("click", () => {
  panModeActive = !panModeActive;
  controls.mouseButtons.LEFT = panModeActive ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  toolPan.classList.toggle("active", panModeActive);
  toolPan.title = panModeActive ? "Modo pan ativo (clique para voltar à órbita)" : "Alternar órbita / pan (botão esquerdo)";
});

/* =====================================================================
   Wireframe
   ===================================================================== */
let wireframeActive = false;
toolWireframe.addEventListener("click", () => {
  if (!currentModel) return;
  wireframeActive = !wireframeActive;
  toolWireframe.classList.toggle("active", wireframeActive);
  const materials = Array.isArray(currentModel.material) ? currentModel.material : [currentModel.material];
  materials.forEach((m) => { if (m) m.wireframe = wireframeActive; });
});

/* =====================================================================
   Plano de corte (seção)
   ===================================================================== */
let sectionActive = false;
let sectionAxis = "y";
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
let sectionFlipped = false;

function axisVector(axis) {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function updateClipPlaneFromSlider() {
  if (!modelBox) return;
  const axisIdx = sectionAxis === "x" ? "x" : sectionAxis === "y" ? "y" : "z";
  const min = modelBox.min[axisIdx];
  const max = modelBox.max[axisIdx];
  const t = Number(sectionSlider.value) / 100;
  const worldPos = min + (max - min) * t;

  const normal = axisVector(sectionAxis).multiplyScalar(sectionFlipped ? 1 : -1);
  clipPlane.normal.copy(normal);
  clipPlane.constant = sectionFlipped ? -worldPos : worldPos;
}

function applyClipping() {
  renderer.localClippingEnabled = sectionActive;
  const planes = sectionActive ? [clipPlane] : [];
  if (currentModel) {
    const materials = Array.isArray(currentModel.material) ? currentModel.material : [currentModel.material];
    materials.forEach((m) => { if (m) { m.clippingPlanes = planes; m.clipShadows = true; } });
  }
}

toolSection.addEventListener("click", () => {
  sectionActive = !sectionActive;
  toolSection.classList.toggle("active", sectionActive);
  sectionPanel.classList.toggle("hidden", !sectionActive);
  if (sectionActive) updateClipPlaneFromSlider();
  applyClipping();
});

axisButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    axisButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    sectionAxis = btn.dataset.axis;
    updateClipPlaneFromSlider();
    applyClipping();
  });
});

sectionSlider.addEventListener("input", () => {
  updateClipPlaneFromSlider();
  applyClipping();
});

sectionFlipBtn.addEventListener("click", () => {
  sectionFlipped = !sectionFlipped;
  updateClipPlaneFromSlider();
  applyClipping();
});

/* =====================================================================
   Explodir por pavimento
   ===================================================================== */
let explodeActive = false;
let explodeGroups = null; // [{ id, name, ids, mesh, baseOffset }]

async function computeExplodeGroups() {
  if (currentModelID === null) return [];
  const structure = await ifcManager.getSpatialStructure(currentModelID, false);
  const containerTypes = new Set(["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE"]);
  const buckets = new Map();

  function walk(node, storeyKey) {
    let key = storeyKey;
    if (node.type === "IFCBUILDINGSTOREY") {
      key = node.expressID;
      if (!buckets.has(key)) buckets.set(key, { id: node.expressID, name: null, ids: [] });
    }
    if (!containerTypes.has(node.type)) {
      const bucketKey = key === null ? "none" : key;
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, { id: null, name: "Sem pavimento", ids: [] });
      buckets.get(bucketKey).ids.push(node.expressID);
    }
    (node.children || []).forEach((c) => walk(c, key));
  }
  walk(structure, null);

  const groups = Array.from(buckets.values()).filter((g) => g.ids.length > 0);
  for (const g of groups) {
    if (g.id !== null) {
      try {
        const props = await ifcManager.getItemProperties(currentModelID, g.id, false);
        g.name = ifcValueToString(props && props.Name) || ("Pavimento " + g.id);
      } catch (e) {
        g.name = "Pavimento " + g.id;
      }
    }
  }
  return groups;
}

function clearExplodeSubsets() {
  if (explodeGroups) {
    explodeGroups.forEach((g) => {
      try { ifcManager.removeSubset(currentModelID, undefined, "explode-" + g.id); } catch (e) {}
    });
  }
  explodeGroups = null;
  if (currentModel) currentModel.visible = true;
}

async function setExplodeActive(active) {
  explodeActive = active;
  toolExplode.classList.toggle("active", explodeActive);
  explodePanel.classList.toggle("hidden", !explodeActive);

  if (!currentModel) return;

  if (active) {
    // explodir e isolar/ocultar não se combinam neste visualizador
    hiddenIds.clear();
    isolatedId = null;
    try { ifcManager.removeSubset(currentModelID, undefined, "visible-filtered"); } catch (e) {}

    explodeSlider.value = "0";
    const groups = await computeExplodeGroups();
    if (groups.length <= 1) {
      showToast("Não há pavimentos suficientes para explodir este modelo.");
      explodeActive = false;
      toolExplode.classList.remove("active");
      explodePanel.classList.add("hidden");
      return;
    }
    groups.forEach((g) => {
      const box = computeBoxForIds(currentModel, new Set(g.ids));
      g.centerY = box ? (box.min.y + box.max.y) / 2 : 0;
    });
    groups.sort((a, b) => a.centerY - b.centerY);

    currentModel.visible = false;
    groups.forEach((g, idx) => {
      const mesh = ifcManager.createSubset({
        modelID: currentModelID,
        ids: g.ids,
        removePrevious: true,
        customID: "explode-" + g.id,
        scene,
      });
      alignSubsetToModel(mesh);
      g.mesh = mesh;
      g.baseY = mesh.position.y;
      g.order = idx;
    });
    explodeGroups = groups;
  } else {
    clearExplodeSubsets();
  }
  applyExplodeOffset();
}

function applyExplodeOffset() {
  if (!explodeActive || !explodeGroups || !modelBox) return;
  const modelHeight = Math.max(modelBox.max.y - modelBox.min.y, 1);
  const gap = modelHeight * 0.6 * (Number(explodeSlider.value) / 100);
  const mid = (explodeGroups.length - 1) / 2;
  explodeGroups.forEach((g) => {
    g.mesh.position.y = g.baseY + (g.order - mid) * gap;
  });
}

toolExplode.addEventListener("click", () => setExplodeActive(!explodeActive));
explodeSlider.addEventListener("input", applyExplodeOffset);

/* =====================================================================
   Medição de distância
   ===================================================================== */
let measureActive = false;
const measurePoints = [];
let measureHelperGroup = null;

function clearMeasureHelpers() {
  if (measureHelperGroup) {
    scene.remove(measureHelperGroup);
    measureHelperGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    measureHelperGroup = null;
  }
}

function updateMeasureBadge() {
  if (!measureActive) {
    measureBadge.classList.add("hidden");
    return;
  }
  measureBadge.classList.remove("hidden");
  if (measurePoints.length === 0) {
    measureBadge.innerHTML = "Clique em dois pontos do modelo para medir a distância.";
  } else if (measurePoints.length === 1) {
    measureBadge.innerHTML = "Clique no segundo ponto…";
  } else {
    const d = measurePoints[0].distanceTo(measurePoints[1]);
    measureBadge.innerHTML = "Distância: <strong>" + d.toFixed(3) + " m</strong> &nbsp;·&nbsp; clique para medir novamente";
  }
}

function addMeasurePoint(point) {
  if (measurePoints.length >= 2) {
    measurePoints.length = 0;
    clearMeasureHelpers();
  }
  measurePoints.push(point.clone());

  if (!measureHelperGroup) {
    measureHelperGroup = new THREE.Group();
    scene.add(measureHelperGroup);
  }
  const markerGeom = new THREE.SphereGeometry(Math.max(modelBox ? modelBox.getSize(new THREE.Vector3()).length() * 0.004 : 0.05, 0.01), 12, 12);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0xff7a00, depthTest: false });
  const marker = new THREE.Mesh(markerGeom, markerMat);
  marker.position.copy(point);
  marker.renderOrder = 999;
  measureHelperGroup.add(marker);

  if (measurePoints.length === 2) {
    const lineGeom = new THREE.BufferGeometry().setFromPoints(measurePoints);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xff7a00, depthTest: false });
    const line = new THREE.Line(lineGeom, lineMat);
    line.renderOrder = 999;
    measureHelperGroup.add(line);
  }
  updateMeasureBadge();
}

function setMeasureActive(active) {
  measureActive = active;
  toolMeasure.classList.toggle("active", measureActive);
  measurePoints.length = 0;
  clearMeasureHelpers();
  updateMeasureBadge();
}

toolMeasure.addEventListener("click", () => setMeasureActive(!measureActive));

/* =====================================================================
   Seleção / hover (raycasting)
   ===================================================================== */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let selectedID = null;
let hoveredID = null;
const hiddenIds = new Set();
let isolatedId = null;

const HOVER_COLOR = new THREE.Color(0x3ea6f2);
const SELECT_COLOR = new THREE.Color(0xff7a00);

// O web-ifc-three identifica cada subconjunto (subset) por
// modelID + material.uuid + customID. Por isso o MESMO objeto de
// material precisa ser reaproveitado em toda chamada de hover/seleção —
// caso contrário cada clique/hover cria um subset novo e permanente,
// nunca substituído nem removido (os destaques ficam acumulando).
const HOVER_MATERIAL = new THREE.MeshBasicMaterial({
  color: HOVER_COLOR, transparent: true, opacity: 0.45, depthTest: true,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
const SELECT_MATERIAL = new THREE.MeshBasicMaterial({
  color: SELECT_COLOR, transparent: true, opacity: 0.55, depthTest: true,
  polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
});

function pickAt(clientX, clientY) {
  if (!currentModel) return null;
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(currentModel, false);
  if (!hits.length) return null;
  const hit = hits[0];
  if (hit.faceIndex === undefined) return null;
  const expressID = ifcManager.getExpressId(currentModel.geometry, hit.faceIndex);
  return { expressID, point: hit.point };
}

function highlightHover(id) {
  if (hoveredID === id) return;
  hoveredID = id;
  if (id === null) {
    try { ifcManager.removeSubset(currentModelID, HOVER_MATERIAL, "hover"); } catch (e) {}
    return;
  }
  const mesh = ifcManager.createSubset({
    modelID: currentModelID,
    ids: [id],
    removePrevious: true,
    customID: "hover",
    scene,
    material: HOVER_MATERIAL,
  });
  alignSubsetToModel(mesh);
}

function highlightSelection(id) {
  selectedID = id;
  if (id === null) {
    try { ifcManager.removeSubset(currentModelID, SELECT_MATERIAL, "selection"); } catch (e) {}
    return;
  }
  const mesh = ifcManager.createSubset({
    modelID: currentModelID,
    ids: [id],
    removePrevious: true,
    customID: "selection",
    scene,
    material: SELECT_MATERIAL,
  });
  alignSubsetToModel(mesh);
}

async function selectElement(id, { focus = false } = {}) {
  highlightSelection(id);
  await showProperties(id);
  highlightTreeSelection(id);
  if (focus && currentModel) {
    const box = computeBoxForIds(currentModel, new Set([id]));
    if (box) fitCameraToBox(box, 2.2);
  }
}

function clearSelection() {
  highlightSelection(null);
  showPropertiesEmpty();
  highlightTreeSelection(null);
}

/* --- interação do ponteiro: distingue clique de arraste (órbita) --- */
let pointerDownPos = null;
let pointerDownTime = 0;

canvas.addEventListener("pointerdown", (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  pointerDownTime = performance.now();
});

canvas.addEventListener("pointerup", (e) => {
  if (!pointerDownPos) return;
  const dx = e.clientX - pointerDownPos.x;
  const dy = e.clientY - pointerDownPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const elapsed = performance.now() - pointerDownTime;
  pointerDownPos = null;
  if (dist > 5 || elapsed > 700) return; // foi um arraste (órbita/pan), não um clique

  const hit = pickAt(e.clientX, e.clientY);

  if (measureActive) {
    if (hit) addMeasurePoint(hit.point);
    return;
  }

  if (hit) selectElement(hit.expressID);
  else clearSelection();
});

canvas.addEventListener("dblclick", (e) => {
  const hit = pickAt(e.clientX, e.clientY);
  if (hit) selectElement(hit.expressID, { focus: true });
});

let hoverPending = false;
canvas.addEventListener("pointermove", (e) => {
  if (measureActive || hoverPending) return;
  hoverPending = true;
  requestAnimationFrame(() => {
    hoverPending = false;
    const hit = pickAt(e.clientX, e.clientY);
    highlightHover(hit ? hit.expressID : null);
    canvas.style.cursor = hit ? "pointer" : "default";
  });
});

canvas.addEventListener("pointerleave", () => highlightHover(null));

/* =====================================================================
   Painel de propriedades
   ===================================================================== */
function ifcValueToString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if ("value" in v) return v.value === null || v.value === undefined ? null : String(v.value);
    return null;
  }
  return String(v);
}

function showPropertiesEmpty() {
  propertiesEmpty.classList.remove("hidden");
  propertiesContent.classList.add("hidden");
}

async function showProperties(id) {
  if (currentModelID === null) return;
  let ifcClass = "";
  try { ifcClass = await ifcManager.getIfcType(currentModelID, id); } catch (e) { ifcClass = ""; }

  try {
    const [itemProps, psets, typeProps] = await Promise.all([
      ifcManager.getItemProperties(currentModelID, id, false),
      ifcManager.getPropertySets(currentModelID, id, true).catch(() => []),
      ifcManager.getTypeProperties(currentModelID, id, true).catch(() => []),
    ]);

    propertiesEmpty.classList.add("hidden");
    propertiesContent.classList.remove("hidden");

    const name = ifcValueToString(itemProps && itemProps.Name) || ("Elemento #" + id);
    propElementTitle.textContent = name;
    propElementType.textContent = ifcClass || "";

    propGroups.innerHTML = "";

    // grupo com dados gerais do elemento
    appendPropGroup("Geral", [
      ["ExpressID", String(id)],
      ["GlobalId", ifcValueToString(itemProps && itemProps.GlobalId)],
      ["Nome", ifcValueToString(itemProps && itemProps.Name)],
      ["Descrição", ifcValueToString(itemProps && itemProps.Description)],
      ["Tag", ifcValueToString(itemProps && itemProps.Tag)],
    ]);

    // conjuntos de propriedades (Psets) — inclui abas de texto como "Texto" do Revit
    (psets || []).forEach((pset) => {
      const psetName = ifcValueToString(pset.Name) || "Propriedades";
      const rows = [];
      (pset.HasProperties || []).forEach((p) => {
        if (!p || typeof p !== "object") return;
        const key = ifcValueToString(p.Name) || "—";
        let value = null;
        if ("NominalValue" in p) value = ifcValueToString(p.NominalValue);
        else if ("Value" in p) value = ifcValueToString(p.Value);
        rows.push([key, value]);
      });
      if (rows.length) appendPropGroup(psetName, rows);
    });

    // propriedades do tipo (IfcType associado)
    (typeProps || []).forEach((tp) => {
      if (!tp || typeof tp !== "object") return;
      const rows = [];
      Object.keys(tp).forEach((k) => {
        if (["expressID", "type", "HasPropertySets"].includes(k)) return;
        const val = ifcValueToString(tp[k]);
        if (val !== null) rows.push([k, val]);
      });
      if (rows.length) appendPropGroup("Tipo", rows);
    });
  } catch (err) {
    console.error(err);
    showToast("Não foi possível carregar as propriedades deste elemento.");
  }
}

function appendPropGroup(title, rows) {
  const filtered = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!filtered.length) return;
  const group = document.createElement("div");
  group.className = "prop-group";
  const heading = document.createElement("div");
  heading.className = "prop-group-title";
  heading.textContent = title;
  group.appendChild(heading);
  filtered.forEach(([key, value]) => {
    const row = document.createElement("div");
    row.className = "prop-row";
    const k = document.createElement("div");
    k.className = "prop-key";
    k.textContent = key;
    const v = document.createElement("div");
    v.className = "prop-value";
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    group.appendChild(row);
  });
  propGroups.appendChild(group);
}

propClearBtn.addEventListener("click", clearSelection);

propIsolateBtn.addEventListener("click", () => {
  if (selectedID === null) return;
  if (explodeActive) setExplodeActive(false);
  isolatedId = selectedID;
  hiddenIds.clear();
  rebuildVisibilityFilter();
  const box = computeBoxForIds(currentModel, new Set([selectedID]));
  if (box) fitCameraToBox(box, 2.2);
});

propHideBtn.addEventListener("click", () => {
  if (selectedID === null) return;
  if (explodeActive) setExplodeActive(false);
  hiddenIds.add(selectedID);
  isolatedId = null;
  rebuildVisibilityFilter();
  clearSelection();
});

toolReset.addEventListener("click", () => {
  hiddenIds.clear();
  isolatedId = null;
  rebuildVisibilityFilter();
});

function rebuildVisibilityFilter() {
  if (!currentModel) return;
  try { ifcManager.removeSubset(currentModelID, undefined, "visible-filtered"); } catch (e) {}

  if (isolatedId === null && hiddenIds.size === 0) {
    currentModel.visible = true;
    return;
  }

  currentModel.visible = false;
  let ids;
  if (isolatedId !== null) {
    ids = [isolatedId];
  } else {
    ids = Array.from(allElementIds).filter((id) => !hiddenIds.has(id));
  }
  const mesh = ifcManager.createSubset({
    modelID: currentModelID,
    ids,
    removePrevious: true,
    customID: "visible-filtered",
    scene,
  });
  alignSubsetToModel(mesh);
}

/* =====================================================================
   Árvore do modelo (estrutura espacial)
   ===================================================================== */
const TYPE_LABELS = {
  IFCPROJECT: "Projeto",
  IFCSITE: "Terreno",
  IFCBUILDING: "Edificação",
  IFCBUILDINGSTOREY: "Pavimento",
  IFCSPACE: "Espaço",
};

async function buildTree() {
  treeRoot.innerHTML = "";
  if (currentModelID === null) return;
  const structure = await ifcManager.getSpatialStructure(currentModelID, false);
  const rootEl = renderTreeNode(structure, true);
  treeRoot.appendChild(rootEl);
}

function renderTreeNode(node, isRoot = false) {
  const hasChildren = node.children && node.children.length > 0;

  if (hasChildren) {
    const details = document.createElement("details");
    if (isRoot) details.open = true;
    details.dataset.expressId = String(node.expressID);

    const summary = document.createElement("summary");
    summary.innerHTML =
      '<svg class="caret" viewBox="0 0 24 24" fill="currentColor"><path d="M9 6l6 6-6 6z"/></svg>' +
      '<span class="tree-label">' + escapeHtml(TYPE_LABELS[node.type] || node.type) + "</span>" +
      '<span class="tree-type">#' + node.expressID + "</span>";
    summary.addEventListener("click", (e) => {
      // o clique expande/colapsa (comportamento nativo do <details>) e
      // também mostra as propriedades deste nó; duplo clique aproxima a câmera
      if (e.target.closest(".caret")) return;
      selectElement(node.expressID);
    });
    summary.addEventListener("dblclick", (e) => {
      e.preventDefault();
      selectElement(node.expressID, { focus: true });
    });

    details.appendChild(summary);

    const list = document.createElement("ul");
    node.children.forEach((child) => {
      const li = document.createElement("li");
      li.appendChild(renderTreeNode(child));
      list.appendChild(li);
    });
    details.appendChild(list);

    // busca o nome real (lazy) quando o nó é expandido
    let nameLoaded = isRoot;
    details.addEventListener("toggle", async () => {
      if (details.open && !nameLoaded) {
        nameLoaded = true;
        try {
          const props = await ifcManager.getItemProperties(currentModelID, node.expressID, false);
          const name = ifcValueToString(props && props.Name);
          if (name) {
            summary.querySelector(".tree-label").textContent = name;
          }
        } catch (e) { /* ignora */ }
      }
    });

    return details;
  }

  // nó folha — elemento físico selecionável
  const leaf = document.createElement("div");
  leaf.className = "tree-leaf";
  leaf.dataset.expressId = String(node.expressID);
  leaf.innerHTML = '<span class="dot"></span><span class="tree-label">Elemento #' + node.expressID + "</span>";
  leaf.addEventListener("click", () => selectElement(node.expressID));
  leaf.addEventListener("dblclick", () => selectElement(node.expressID, { focus: true }));

  // busca o nome real de forma assíncrona (não bloqueia a montagem da árvore)
  ifcManager.getItemProperties(currentModelID, node.expressID, false).then((props) => {
    const name = ifcValueToString(props && props.Name);
    if (name) leaf.querySelector(".tree-label").textContent = name;
  }).catch(() => {});

  return leaf;
}

function highlightTreeSelection(id) {
  treeRoot.querySelectorAll(".tree-leaf.selected").forEach((el) => el.classList.remove("selected"));
  if (id === null) return;
  const el = treeRoot.querySelector('.tree-leaf[data-express-id="' + id + '"]');
  if (el) {
    el.classList.add("selected");
    el.scrollIntoView({ block: "nearest" });
    let parent = el.closest("details");
    while (parent) {
      parent.open = true;
      parent = parent.parentElement ? parent.parentElement.closest("details") : null;
    }
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =====================================================================
   Abas da barra lateral
   ===================================================================== */
sidebarTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    sidebarTabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    tabProperties.classList.toggle("active", tab === "properties");
    tabTree.classList.toggle("active", tab === "tree");
  });
});

toolTree.addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
  toolTree.classList.toggle("active", !sidebar.classList.contains("collapsed"));
});

/* =====================================================================
   Tela cheia
   ===================================================================== */
btnFullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
});

/* =====================================================================
   Utilitário — mensagens (toast)
   ===================================================================== */
let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

/* =====================================================================
   Inicialização
   ===================================================================== */
initTheme();
updateGridColor();
toolTree.classList.add("active");
