// ============================================================
// FURNITURE ANIMATION — doors opening, drawers sliding
// ============================================================
import {
  meshMap, edgeLineMap, originalPositions, parts,
  setNeedsRender, animationPlaying, setAnimationPlaying
} from './state.js';

const SCALE = 0.001;
const ANIM_HALF_DURATION = 1.0; // seconds per direction (0→1 or 1→0)

var animMap = new Map();       // id → parsed anim data
var animRoots = [];            // root anim ids (parent == -1)
var animChildren = new Map();  // rootId → [childId, ...]
var partAnimMap = new Map();   // partId → animId
var originalQuats = new Map(); // partId → Quaternion
var animTime = 0;

// Pre-allocated temps (avoid GC per frame)
var _tmpV = new THREE.Vector3();
var _p0t = new THREE.Vector3();
var _axisT = new THREE.Vector3();

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function initAnimations() {
  // State imports provide all needed references; kept for API surface
}

/**
 * Parse animation data from БАЗИС export and build internal structures.
 * Call once after parts are loaded and autoLayout has run.
 */
export function loadAnimations(animsData) {
  animMap.clear();
  animRoots = [];
  animChildren = new Map();
  partAnimMap.clear();
  originalQuats.clear();
  animTime = 0;

  if (!animsData || !animsData.length) {
    setAnimationPlaying(false);
    hideAnimButton();
    return;
  }

  // Parse animation definitions
  animsData.forEach(function(a) {
    var p0 = new THREE.Vector3(a.p0[0] * SCALE, a.p0[1] * SCALE, a.p0[2] * SCALE);
    var p1 = new THREE.Vector3(a.p1[0] * SCALE, a.p1[1] * SCALE, a.p1[2] * SCALE);
    var axis = new THREE.Vector3().subVectors(p1, p0);
    if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
    axis.normalize();

    animMap.set(a.id, {
      id: a.id,
      parent: a.parent,
      root: a.root,
      type: a.type,
      p0: p0,
      axis: axis,
      limit: a.limit
    });
  });

  // Build dependency tree
  animsData.forEach(function(a) {
    if (a.parent === -1 || a.parent === undefined || !animMap.has(a.parent)) {
      animRoots.push(a.id);
    }
  });
  animRoots.forEach(function(rootId) {
    var children = [];
    animsData.forEach(function(a) {
      if (a.parent === rootId && a.id !== rootId) children.push(a.id);
    });
    animChildren.set(rootId, children);
  });

  // Map parts → animations and cache original quaternions
  parts.forEach(function(p) {
    if (p.anim !== undefined && p.anim >= 0 && animMap.has(p.anim)) {
      partAnimMap.set(p.id, p.anim);
      originalQuats.set(p.id, p._quat ? p._quat.clone() : new THREE.Quaternion());
    }
  });

  // Show/hide button
  if (partAnimMap.size > 0) {
    setAnimationPlaying(false);
    var btn = document.getElementById('animBtn');
    if (btn) {
      btn.style.display = '';
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      btn.classList.remove('active');
    }
  } else {
    setAnimationPlaying(false);
    hideAnimButton();
  }
}

function hideAnimButton() {
  var btn = document.getElementById('animBtn');
  if (btn) btn.style.display = 'none';
}

/**
 * Compute the local transform for a single animation at given progress (0–1).
 * Returns { q: Quaternion, offset: Vector3 } such that transformed_point = q * point + offset.
 * @param {Object} anim  — anim entry from animMap
 * @param {number} progress — 0..1
 * @param {Vector3} [axisOverride] — use instead of anim.axis (for nested)
 * @param {Vector3} [centerOverride] — use instead of anim.p0 (for nested)
 */
function computeTransform(anim, progress, axisOverride, centerOverride) {
  var t = easeInOut(progress);
  var axis = axisOverride || anim.axis;
  var center = centerOverride || anim.p0;

  if (anim.type === 1) {
    // ROTATE: rotate around axis through center by limit degrees
    var angle = anim.limit * Math.PI / 180 * t;
    var q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    // offset = center - q * center
    _tmpV.copy(center).applyQuaternion(q);
    var offset = center.clone().sub(_tmpV);
    return { q: q, offset: offset };
  } else if (anim.type === 2) {
    // SLIDE: translate along axis by limit mm
    var offset = axis.clone().multiplyScalar(anim.limit * SCALE * t);
    return { q: new THREE.Quaternion(), offset: offset };
  }
  return { q: new THREE.Quaternion(), offset: new THREE.Vector3() };
}

export function toggleAnimation() {
  if (partAnimMap.size === 0) return;
  setAnimationPlaying(!animationPlaying);
  updateAnimButton();
  if (!animationPlaying) {
    resetPositions();
  }
}

function updateAnimButton() {
  var btn = document.getElementById('animBtn');
  if (!btn) return;
  btn.innerHTML = animationPlaying
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  btn.classList.toggle('active', animationPlaying);
}

function resetPositions() {
  partAnimMap.forEach(function(animId, partId) {
    var mesh = meshMap.get(partId);
    var edge = edgeLineMap.get(partId);
    var origPos = originalPositions.get(partId);
    var origQuat = originalQuats.get(partId);
    if (mesh && origPos) {
      mesh.position.copy(origPos);
      if (origQuat) mesh.quaternion.copy(origQuat);
      else mesh.quaternion.identity();
    }
    if (edge && origPos) {
      edge.position.copy(origPos);
      if (origQuat) edge.quaternion.copy(origQuat);
      else edge.quaternion.identity();
    }
  });
  setNeedsRender(true);
}

/**
 * Per-frame update. Call from the render loop with delta time in seconds.
 * Animates 0→1→0 (open then close), looping.
 */
export function animateFrame(dt) {
  if (!animationPlaying || partAnimMap.size === 0) return;

  var cycleDuration = ANIM_HALF_DURATION * 2;
  animTime += dt;
  if (animTime >= cycleDuration) animTime -= cycleDuration;

  // Progress: 0→1 (opening) then 1→0 (closing)
  var progress;
  if (animTime < ANIM_HALF_DURATION) {
    progress = animTime / ANIM_HALF_DURATION;
  } else {
    progress = (cycleDuration - animTime) / ANIM_HALF_DURATION;
  }

  // Compute transforms in dependency order (roots first, then children)
  var transforms = new Map();

  animRoots.forEach(function(rootId) {
    var rootAnim = animMap.get(rootId);
    if (!rootAnim) return;

    var rootT = computeTransform(rootAnim, progress);
    transforms.set(rootId, rootT);

    // Process children of this root
    var children = animChildren.get(rootId) || [];
    children.forEach(function(childId) {
      var childAnim = animMap.get(childId);
      if (!childAnim) return;

      // Transform child's axis by parent's current transform
      _p0t.copy(childAnim.p0).applyQuaternion(rootT.q).add(rootT.offset);
      _axisT.copy(childAnim.axis).applyQuaternion(rootT.q).normalize();

      // Compute child's local transform on the parent-transformed axis
      var childLocalT = computeTransform(childAnim, progress, _axisT, _p0t);

      // Compose: T_combined(p) = T_child(T_parent(p))
      //   q_combined = q_child * q_parent
      //   offset_combined = q_child * offset_parent + offset_child
      var combined = {
        q: childLocalT.q.clone().multiply(rootT.q),
        offset: rootT.offset.clone().applyQuaternion(childLocalT.q).add(childLocalT.offset)
      };
      transforms.set(childId, combined);
    });
  });

  // Apply transforms to meshes
  partAnimMap.forEach(function(animId, partId) {
    var mesh = meshMap.get(partId);
    var edge = edgeLineMap.get(partId);
    var origPos = originalPositions.get(partId);
    var origQuat = originalQuats.get(partId);
    if (!mesh || !origPos) return;

    var t = transforms.get(animId);
    if (!t) return;

    // position = q * origPos + offset
    mesh.position.copy(origPos).applyQuaternion(t.q).add(t.offset);
    // quaternion = animQ * origQuat
    mesh.quaternion.copy(t.q).multiply(origQuat || new THREE.Quaternion());

    if (edge) {
      edge.position.copy(origPos).applyQuaternion(t.q).add(t.offset);
      edge.quaternion.copy(t.q).multiply(origQuat || new THREE.Quaternion());
    }
  });

  setNeedsRender(true);
}