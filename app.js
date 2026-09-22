import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import {
  IFCSLAB,
  IFCSLABSTANDARDCASE,
  IFCSLABELEMENTEDCASE,
  IFCROOF,
  IFCROOFTYPE,
  IFCGEOGRAPHICELEMENT,
  IFCGEOGRAPHICELEMENTTYPE,
  IFCOPENINGELEMENT,
} from "web-ifc";

// Categorias que ficam ocultas por padrão ao carregar um modelo (elementos
// de família do Revit que normalmente atrapalham a visualização):
// Sólido Topográfico, Piso, Telhado e Vazio. O usuário pode trazê-los de
// volta a qualquer momento com o botão "Restaurar" da barra de ferramentas.
const DEFAULT_HIDDEN_TYPES = [
  IFCSLAB,
  IFCSLABSTANDARDCASE,
  IFCSLABELEMENTEDCASE,
  IFCROOF,
  IFCROOFTYPE,
  IFCGEOGRAPHICELEMENT,
  IFCGEOGRAPHICELEMENTTYPE,
  IFCOPENINGELEMENT,
];

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

// Grid de chão desativado (sem grade na cena). O fundo do WebGL é opaco
// e cobre o gradiente do CSS, então a cor de fundo da cena 3D precisa
// acompanhar o tema manualmente.
function updateGridColor() {
  const color = cssVar("--canvas-bg-top") || "#dfe4e8";
  scene.background = new THREE.Color(color);
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

    await applyDefaultCategoryFilters();
    await applyFaceColorCoding();

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

// Nomes de família/categoria do Revit cujos elementos ficam ocultos por
// padrão. O Revit costuma gravar o Nome do elemento no IFC como
// "Família:Tipo:ID" (ex.: "Sólido topográfico:Generic - 1000mm:1770586"),
// então comparamos o primeiro trecho (antes dos ":") com esta lista,
// ignorando acentos/maiúsculas.
const DEFAULT_HIDDEN_NAME_PREFIXES = ["solido topografico", "piso", "telhado", "vazio"];

function normalizeForMatch(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function matchesDefaultHiddenName(name) {
  const firstSegment = normalizeForMatch(name).split(":")[0].trim();
  if (!firstSegment) return false;
  return DEFAULT_HIDDEN_NAME_PREFIXES.some(
    (prefix) => firstSegment === prefix || firstSegment.startsWith(prefix + " ")
  );
}

// Oculta por padrão os elementos das categorias do Revit "Sólido
// topográfico", "Piso", "Telhado" e "Vazio", usando o mesmo mecanismo de
// ocultação (hiddenIds + rebuildVisibilityFilter) já usado pelo botão
// "Ocultar" — restaurável a qualquer momento pelo botão "Restaurar".
//
// Duas estratégias são combinadas porque o mapeamento de categoria do
// Revit para classe IFC varia conforme a configuração de exportação:
// 1) pela classe IFC (funciona quando o Revit exporta como IfcSlab,
//    IfcRoof, IfcGeographicElement ou IfcOpeningElement);
// 2) pelo nome do elemento (necessário quando o Revit exporta a família
//    como IfcBuildingElementProxy — caso comum para "Sólido topográfico"
//    e para famílias genéricas de "Piso"/"Telhado"/"Vazio").
async function applyDefaultCategoryFilters() {
  if (currentModelID === null) return;
  let changed = false;

  for (const type of DEFAULT_HIDDEN_TYPES) {
    let ids = [];
    try {
      ids = (await ifcManager.getAllItemsOfType(currentModelID, type, false)) || [];
    } catch (e) {
      ids = [];
    }
    for (const id of ids) {
      if (allElementIds.has(id) && !hiddenIds.has(id)) {
        hiddenIds.add(id);
        changed = true;
      }
    }
  }

  for (const id of allElementIds) {
    if (hiddenIds.has(id)) continue;
    let name = "";
    try {
      const props = await ifcManager.getItemProperties(currentModelID, id, false);
      name = ifcValueToString(props && props.Name) || "";
    } catch (e) {
      name = "";
    }
    if (matchesDefaultHiddenName(name)) {
      hiddenIds.add(id);
      changed = true;
    }
  }

  if (changed) rebuildVisibilityFilter();
}

// Elementos de família "RT_DANO"/"RT_DANOS" (marcações de dano/inspeção)
// têm um parâmetro de texto "FACE" (A–F) que define uma cor fixa no 3D,
// independente de hover/seleção. O nome de cada família é reconhecido do
// mesmo jeito que as categorias ocultas por padrão (primeiro trecho do
// Nome do elemento, antes do ":").
function matchesRtDanoFamily(name) {
  const normalized = normalizeForMatch(name).replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const firstSegment = normalized.split(":")[0].trim();
  return /^rt\s*danos?(\s|$)/.test(firstSegment);
}

function findFaceValue(psets) {
  for (const pset of psets || []) {
    for (const p of (pset && pset.HasProperties) || []) {
      if (!p || typeof p !== "object") continue;
      const key = ifcValueToString(p.Name);
      if (key && normalizeForMatch(key) === "face") {
        return ifcValueToString("NominalValue" in p ? p.NominalValue : p.Value);
      }
    }
  }
  return null;
}

// mapa letra do parâmetro FACE -> id(s) de elementos com essa letra,
// calculado uma vez ao carregar o modelo e reaplicado (updateFaceColorSubsets)
// sempre que a visibilidade muda (ocultar/isolar/restaurar), pra a cor
// nunca "vazar" pra fora do que está de fato visível na cena.
let faceColorAssignments = new Map();

async function applyFaceColorCoding() {
  faceColorAssignments = new Map();
  if (currentModelID === null) return;

  for (const id of allElementIds) {
    let name = "";
    try {
      const props = await ifcManager.getItemProperties(currentModelID, id, false);
      name = ifcValueToString(props && props.Name) || "";
    } catch (e) {
      continue;
    }
    if (!matchesRtDanoFamily(name)) continue;

    let faceValue = null;
    try {
      const psets = await ifcManager.getPropertySets(currentModelID, id, true);
      faceValue = findFaceValue(psets);
    } catch (e) {
      faceValue = null;
    }

    const letter = (faceValue || "").toString().trim().toUpperCase();
    if (!FACE_COLOR_MATERIALS[letter]) continue;
    if (!faceColorAssignments.has(letter)) faceColorAssignments.set(letter, new Set());
    faceColorAssignments.get(letter).add(id);
  }

  updateFaceColorSubsets();
}

// Recria os subsets de cor por letra do FACE considerando apenas os ids
// que estão de fato visíveis no momento (fora de hiddenIds e, se houver
// isolamento ativo, dentro dele) — chamada tanto no carregamento quanto
// toda vez que rebuildVisibilityFilter roda.
function updateFaceColorSubsets() {
  if (currentModelID === null) return;
  const visibleSet = isolatedId !== null
    ? new Set([isolatedId])
    : new Set(Array.from(allElementIds).filter((id) => !hiddenIds.has(id)));

  Object.keys(FACE_COLOR_MATERIALS).forEach((letter) => {
    try { ifcManager.removeSubset(currentModelID, FACE_COLOR_MATERIALS[letter], "face-" + letter); } catch (e) {}
    const assigned = faceColorAssignments.get(letter);
    if (!assigned) return;
    const ids = Array.from(assigned).filter((id) => visibleSet.has(id));
    if (!ids.length) return;
    const mesh = ifcManager.createSubset({
      modelID: currentModelID,
      ids,
      removePrevious: true,
      customID: "face-" + letter,
      scene,
      material: FACE_COLOR_MATERIALS[letter],
    });
    alignSubsetToModel(mesh);
  });
}

function clearFaceColorSubsets() {
  Object.keys(FACE_COLOR_MATERIALS).forEach((letter) => {
    try { ifcManager.removeSubset(currentModelID, FACE_COLOR_MATERIALS[letter], "face-" + letter); } catch (e) {}
  });
  faceColorAssignments = new Map();
}

function clearModel() {
  if (currentModel) {
    try { ifcManager.removeSubset(currentModelID, SELECT_MATERIAL, "selection"); } catch (e) {}
    try { ifcManager.removeSubset(currentModelID, HOVER_MATERIAL, "hover"); } catch (e) {}
    try { ifcManager.removeSubset(currentModelID, undefined, "visible-filtered"); } catch (e) {}
    clearFaceColorSubsets();
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

// Verdadeiro se o elemento não está sendo renderizado no momento (oculto
// pelo botão "Ocultar", pelas categorias ocultas por padrão, ou por estar
// fora do isolamento atual) — usado para impedir hover/seleção (no 3D e na
// árvore) de elementos que não aparecem na cena.
function isElementHidden(id) {
  // nós da árvore espacial (projeto, terreno, edificação, pavimento) não
  // são geometria própria — não entram em allElementIds — e continuam
  // sempre selecionáveis (apenas mostram suas propriedades).
  if (!allElementIds.has(id)) return false;
  if (isolatedId !== null) return id !== isolatedId;
  return hiddenIds.has(id);
}

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

// Cor fixa por letra do parâmetro "FACE" (elementos de família
// RT_DANO/RT_DANOS). Usa polygonOffset mais fraco que hover/seleção pra
// que o destaque de hover/clique continue aparecendo por cima da cor.
const FACE_COLOR_HEX = {
  A: 0xe53935, // vermelho
  B: 0x1e88e5, // azul
  C: 0x43a047, // verde
  D: 0x8e24aa, // violeta
  E: 0x111111, // preto
  F: 0xfb8c00, // laranja
};
const FACE_COLOR_MATERIALS = {};
Object.keys(FACE_COLOR_HEX).forEach((letter) => {
  FACE_COLOR_MATERIALS[letter] = new THREE.MeshBasicMaterial({
    color: FACE_COLOR_HEX[letter],
    transparent: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
});

function pickAt(clientX, clientY) {
  if (!currentModel) return null;
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  // currentModel é a malha única com TODA a geometria (mesmo a de elementos
  // ocultos — eles só deixam de ser desenhados via o subset "visible-filtered"
  // e model.visible=false, o que não afeta o raycast). Por isso não basta
  // pegar o primeiro acerto: percorremos os acertos em ordem de distância e
  // ignoramos os que caem em elemento oculto, pra achar o que está atrás dele.
  const hits = raycaster.intersectObject(currentModel, false);
  for (const hit of hits) {
    if (hit.faceIndex === undefined) continue;
    const expressID = ifcManager.getExpressId(currentModel.geometry, hit.faceIndex);
    if (isElementHidden(expressID)) continue;
    return { expressID, point: hit.point };
  }
  return null;
}

function highlightHover(id) {
  if (id !== null && isElementHidden(id)) id = null;
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
  if (id !== null && isElementHidden(id)) return;
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
    updateTreeSelectableStates();
    updateFaceColorSubsets();
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
  updateTreeSelectableStates();
  updateFaceColorSubsets();
}

// Atualiza o estado (des)habilitado de cada folha da árvore do modelo para
// refletir quais elementos estão de fato visíveis na cena no momento —
// elementos ocultos (padrão, pelo botão "Ocultar" ou fora do isolamento)
// ficam com aparência apagada e não respondem a clique.
function updateTreeSelectableStates() {
  treeRoot.querySelectorAll(".tree-leaf").forEach((el) => {
    const id = Number(el.dataset.expressId);
    el.classList.toggle("tree-leaf-disabled", isElementHidden(id));
  });
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
  leaf.classList.toggle("tree-leaf-disabled", isElementHidden(node.expressID));
  leaf.addEventListener("click", () => {
    if (isElementHidden(node.expressID)) return;
    selectElement(node.expressID);
  });
  leaf.addEventListener("dblclick", () => {
    if (isElementHidden(node.expressID)) return;
    selectElement(node.expressID, { focus: true });
  });

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
