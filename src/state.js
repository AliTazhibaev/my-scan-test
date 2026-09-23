// ============================================================
// SHARED STATE — single source of truth for cross-module variables
// ============================================================
// Usage: import { parts, scene, needsRender, setNeedsRender } from './state.js';
// For objects: import, then mutate directly (parts.push(...))
// For primitives: use setter from the module that OWNS the variable

export let deviceQuality = 'high';
export function setDeviceQuality(v) { deviceQuality = v; }

export let parts = [];
export function setParts(v) { parts = v; }

export let selectedId = null;
export function setSelectedId(v) { selectedId = v; }

export const scannedSet = new Set();
export const hiddenSet = new Set();

export let idMode = localStorage.getItem('aivoIdMode') || 'designation';
export function setIdMode(v) { idMode = v; }

export const meshMap = new Map();
export const edgeLineMap = new Map();
export const originalPositions = new Map();
export const moduleMap = new Map();

export let isDarkTheme = true;
export function setIsDarkTheme(v) { isDarkTheme = v; }

export let needsRender = true;
export function setNeedsRender(v) { needsRender = v; }

export let blockMode = false;
export function setBlockMode(v) { blockMode = v; }

export let xrayActive = false;
export function setXrayActive(v) { xrayActive = v; }

export let explodeActive = false;
export function setExplodeActive(v) { explodeActive = v; }

export let explodeProgress = 0;
export function setExplodeProgress(v) { explodeProgress = v; }

export let explodeModuleKey = null;
export function setExplodeModuleKey(v) { explodeModuleKey = v; }

export let isolatedModule = null;
export function setIsolatedModule(v) { isolatedModule = v; }

export let csgEnabled = true;
export function setCsgEnabled(v) { csgEnabled = v; }

export let autoRotate = false;
export function setAutoRotate(v) { autoRotate = v; }

// Camera orbit
export let theta = 0.8;
export function setTheta(v) { theta = v; }
export let phi = 0.9;
export function setPhi(v) { phi = v; }
export let camDist = 3.5;
export function setCamDist(v) { camDist = v; }

export let isDragging = false;
export function setIsDragging(v) { isDragging = v; }
export let prevMouse = { x: 0, y: 0 };
export function setPrevMouse(v) { prevMouse = v; }

export let isSmoothZoom = false;
export function setIsSmoothZoom(v) { isSmoothZoom = v; }

// Assembly
export let assemblyMode = false;
export function setAssemblyMode(v) { assemblyMode = v; }
export let assemblyIndex = 0;
export function setAssemblyIndex(v) { assemblyIndex = v; }
export let assemblyPrevIndex = -1;
export function setAssemblyPrevIndex(v) { assemblyPrevIndex = v; }
export let assemblyOrder = [];
export function setAssemblyOrder(v) { assemblyOrder = v; }
export let assemblyPlaying = false;
export function setAssemblyPlaying(v) { assemblyPlaying = v; }
export let assemblyTimer = null;
export function setAssemblyTimer(v) { assemblyTimer = v; }

// Fasteners / dims
export let fastenerData = [];
export function setFastenerData(v) { fastenerData = v; }
export let dimsData = [];
export function setDimsData(v) { dimsData = v; }
export let dimGroup = null;
export function setDimGroup(v) { dimGroup = v; }
export let dimsVisible = false;
export function setDimsVisible(v) { dimsVisible = v; }
export const fastenerMeshes = [];

// Three.js objects — set by scene module after init
export let scene = null;
export function setScene(v) { scene = v; }
export let camera = null;
export function setCamera(v) { camera = v; }
export let renderer = null;
export function setRenderer(v) { renderer = v; }
export let floor = null;
export function setFloor(v) { floor = v; }
export let wall = null;
export function setWall(v) { wall = v; }
export let targetPosition = null;
export function setTargetPosition(v) { targetPosition = v; }
export let zoomTarget = null;
export function setZoomTarget(v) { zoomTarget = v; }

// Touch state
export let touchStartPos = null;
export function setTouchStartPos(v) { touchStartPos = v; }
export let isPinching = false;
export function setIsPinching(v) { isPinching = v; }
export let pinchStartDist = 0;
export function setPinchStartDist(v) { pinchStartDist = v; }
export let pinchStartCamDist = 0;
export function setPinchStartCamDist(v) { pinchStartCamDist = v; }
export let isPanning = false;
export function setIsPanning(v) { isPanning = v; }
export let panStartMid = null;
export function setPanStartMid(v) { panStartMid = v; }
export let panStartTarget = null;
export function setPanStartTarget(v) { panStartTarget = v; }
export let mouseStartPos = null;
export function setMouseStartPos(v) { mouseStartPos = v; }
export let mouseMovedDistance = 0;
export function setMouseMovedDistance(v) { mouseMovedDistance = v; }
export let isPanningMouse = false;
export function setIsPanningMouse(v) { isPanningMouse = v; }
export let panStartMouse = null;
export function setPanStartMouse(v) { panStartMouse = v; }

// Wake lock
export let wakeLock = null;
export function setWakeLock(v) { wakeLock = v; }

// Layout
export let layoutMinY = 0;
export function setLayoutMinY(v) { layoutMinY = v; }

// Module colors
export const MODULE_COLORS = [
  '#00d4aa','#ff6b6b','#4ade80','#fbbf24','#a78bfa','#f472b6','#38bdf8','#fb923c',
  '#34d399','#e879f9','#06b6d4','#8b5cf6','#ef4444','#10b981','#f59e0b','#ec4899',
  '#14b8a6','#84cc16','#6366f1','#f97316','#22d3ee','#a855f7','#e11d48','#059669',
  '#d97706','#d946ef','#0891b2','#65a30d','#4f46e5','#ea580c'
];
export const colorCache = new Map();
export let colorIdx = 0;
export function setColorIdx(v) { colorIdx = v; }

// Detail meshes
export const detailMeshes = new Map();
