// ============================================================
// CSG (Boolean Subtract) — ported from DetalQR (Evan Wallace csg.js)
// Works with THREE r128 BufferGeometry.
// Used for real pocket/groove cutting from panel geometry.
// ============================================================
import { sRGBFix } from './materials.js';

var EPS = 1e-5;

function Vertex(pos, normal) {
  this.pos = pos;
  this.normal = normal;
}
Vertex.prototype.clone = function() {
  return new Vertex(this.pos.clone(), this.normal.clone());
};
Vertex.prototype.flip = function() {
  this.normal.negate();
};
Vertex.prototype.interpolate = function(o, t) {
  return new Vertex(this.pos.clone().lerp(o.pos, t), this.normal.clone().lerp(o.normal, t));
};

function Plane(normal, w) {
  this.normal = normal;
  this.w = w;
}
// Newell method — reliable normal even for degenerate/coplanar polygons
Plane.fromVerts = function(vs) {
  var n = new THREE.Vector3();
  for (var i = 0; i < vs.length; i++) {
    var a = vs[i].pos, b = vs[(i + 1) % vs.length].pos;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < 1e-16) return null;
  n.normalize();
  return new Plane(n, n.dot(vs[0].pos));
};
Plane.prototype.clone = function() {
  return new Plane(this.normal.clone(), this.w);
};
Plane.prototype.flip = function() {
  this.normal.negate();
  this.w = -this.w;
};
Plane.prototype.splitPolygon = function(poly, cf, cb, fr, bk) {
  var CO = 0, FR = 1, BA = 2, SP = 3;
  var ptype = 0;
  var types = [];
  for (var i = 0; i < poly.vertices.length; i++) {
    var t = this.normal.dot(poly.vertices[i].pos) - this.w;
    var ty = (t < -EPS) ? BA : (t > EPS) ? FR : CO;
    ptype |= ty;
    types.push(ty);
  }
  if (ptype === CO) {
    (this.normal.dot(poly.plane.normal) > 0 ? cf : cb).push(poly);
  } else if (ptype === FR) {
    fr.push(poly);
  } else if (ptype === BA) {
    bk.push(poly);
  } else {
    var f = [], b = [];
    var vs = poly.vertices;
    for (var i = 0; i < vs.length; i++) {
      var j = (i + 1) % vs.length;
      var ti = types[i], tj = types[j];
      var vi = vs[i], vj = vs[j];
      if (ti !== BA) f.push(vi);
      if (ti !== FR) b.push(ti !== BA ? vi.clone() : vi);
      if ((ti | tj) === SP) {
        var tt = (this.w - this.normal.dot(vi.pos)) / this.normal.dot(vj.pos.clone().sub(vi.pos));
        var v = vi.interpolate(vj, tt);
        f.push(v);
        b.push(v.clone());
      }
    }
    if (f.length >= 3) { var np = new Polygon(f); if (np.plane) fr.push(np); }
    if (b.length >= 3) { var np2 = new Polygon(b); if (np2.plane) bk.push(np2); }
  }
};

function Polygon(vertices) {
  this.vertices = vertices;
  this.plane = Plane.fromVerts(vertices);
}
Polygon.prototype.clone = function() {
  return new Polygon(this.vertices.map(function(v) { return v.clone(); }));
};
Polygon.prototype.flip = function() {
  this.vertices.reverse();
  for (var i = 0; i < this.vertices.length; i++) this.vertices[i].flip();
  if (this.plane) this.plane.flip();
};

function Node(polys) {
  this.plane = null;
  this.front = null;
  this.back = null;
  this.polygons = [];
  if (polys) this.build(polys);
}
Node.prototype.invert = function() {
  for (var i = 0; i < this.polygons.length; i++) this.polygons[i].flip();
  if (this.plane) this.plane.flip();
  if (this.front) this.front.invert();
  if (this.back) this.back.invert();
  var t = this.front;
  this.front = this.back;
  this.back = t;
};
Node.prototype.clipPolygons = function(polys) {
  if (!this.plane) return polys.slice();
  var fr = [], bk = [];
  for (var i = 0; i < polys.length; i++) {
    this.plane.splitPolygon(polys[i], fr, bk, fr, bk);
  }
  if (this.front) fr = this.front.clipPolygons(fr);
  bk = this.back ? this.back.clipPolygons(bk) : [];
  return fr.concat(bk);
};
Node.prototype.clipTo = function(bsp) {
  this.polygons = bsp.clipPolygons(this.polygons);
  if (this.front) this.front.clipTo(bsp);
  if (this.back) this.back.clipTo(bsp);
};
Node.prototype.allPolygons = function() {
  var ps = this.polygons.slice();
  if (this.front) ps = ps.concat(this.front.allPolygons());
  if (this.back) ps = ps.concat(this.back.allPolygons());
  return ps;
};
Node.prototype.build = function(polys) {
  if (!polys.length) return;
  if (!this.plane) this.plane = polys[0].plane && polys[0].plane.clone();
  if (!this.plane) return;
  var fr = [], bk = [];
  for (var i = 0; i < polys.length; i++) {
    var p = polys[i];
    if (!p.plane) continue;
    this.plane.splitPolygon(p, this.polygons, this.polygons, fr, bk);
  }
  if (fr.length) {
    if (!this.front) this.front = new Node();
    this.front.build(fr);
  }
  if (bk.length) {
    if (!this.back) this.back = new Node();
    this.back.build(bk);
  }
};

// Convert BufferGeometry → polygon array
function toPolys(geo) {
  var g = geo.index ? geo.toNonIndexed() : geo;
  var np = g.attributes.normal;
  if (!np) {
    g = g.clone();
    g.computeVertexNormals();
    np = g.attributes.normal;
  }
  var pp = g.attributes.position;
  var out = [];
  for (var i = 0; i < pp.count; i += 3) {
    var vs = [];
    for (var k = 0; k < 3; k++) {
      var idx = i + k;
      vs.push(new Vertex(
        new THREE.Vector3(pp.getX(idx), pp.getY(idx), pp.getZ(idx)),
        new THREE.Vector3(np.getX(idx), np.getY(idx), np.getZ(idx))
      ));
    }
    var poly = new Polygon(vs);
    if (poly.plane) out.push(poly);
  }
  return out;
}

// Convert polygon array → BufferGeometry (welded, indexed)
function toGeo(polys) {
  var pos = [], nor = [], idx = [], map = new Map();
  var key = function(p, n) {
    // meters: 1e5 -> 0.01 mm weld grid (was *100 = 1 cm, which merged/shifted vertices of 9 mm grooves)
    return Math.round(p.x * 1e5) + '_' + Math.round(p.y * 1e5) + '_' + Math.round(p.z * 1e5) + '_' +
           Math.round(n.x * 8) + '_' + Math.round(n.y * 8) + '_' + Math.round(n.z * 8);
  };
  var add = function(v) {
    var k = key(v.pos, v.normal);
    var i = map.get(k);
    if (i === undefined) {
      i = pos.length / 3;
      pos.push(v.pos.x, v.pos.y, v.pos.z);
      nor.push(v.normal.x, v.normal.y, v.normal.z);
      map.set(k, i);
    }
    return i;
  };
  for (var pi = 0; pi < polys.length; pi++) {
    var vs = polys[pi].vertices;
    for (var i = 2; i < vs.length; i++) {
      idx.push(add(vs[0]), add(vs[i - 1]), add(vs[i]));
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(idx);
  return g;
}

// Boolean Subtract: A - B
function subtract(aPolys, bPolys) {
  var a = new Node(aPolys), b = new Node(bPolys);
  a.invert();
  a.clipTo(b);
  b.clipTo(a);
  b.invert();
  b.clipTo(a);
  b.invert();
  a.build(b.allPolygons());
  a.invert();
  return a.allPolygons();
}

// T-Junction repair: fixes hairline cracks from BSP splitting
function repairT(polys) {
  var pts = [], seen = new Set();
  for (var pi = 0; pi < polys.length; pi++) {
    var vs = polys[pi].vertices;
    for (var vi = 0; vi < vs.length; vi++) {
      var v = vs[vi];
      var k = Math.round(v.pos.x * 5e4) + '_' + Math.round(v.pos.y * 5e4) + '_' + Math.round(v.pos.z * 5e4);
      if (!seen.has(k)) {
        seen.add(k);
        pts.push(v.pos);
      }
    }
  }
  // Units are meters here (0.08 was a millimeter value: it snapped vertices lying up to 8 cm from an
  // edge onto it, warping polygons and creating stray diagonal creases).
  var _EPS = 8e-5, E2 = _EPS * _EPS;
  pts.sort(function(u, v) { return u.x - v.x; });
  var N = pts.length;
  var xs = new Float64Array(N);
  for (var i = 0; i < N; i++) xs[i] = pts[i].x;
  var lower = function(v) {
    var lo = 0, hi = N;
    while (lo < hi) { var m = (lo + hi) >> 1; if (xs[m] < v) lo = m + 1; else hi = m; }
    return lo;
  };
  for (var pi = 0; pi < polys.length; pi++) {
    var vs = polys[pi].vertices;
    var nv = [];
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i], b = vs[(i + 1) % vs.length];
      nv.push(a);
      var ax = a.pos.x, ay = a.pos.y, az = a.pos.z;
      var abx = b.pos.x - ax, aby = b.pos.y - ay, abz = b.pos.z - az;
      var L2 = abx * abx + aby * aby + abz * abz;
      if (L2 < 1e-12) continue;
      var mnx = Math.min(ax, b.pos.x) - _EPS, mxx = Math.max(ax, b.pos.x) + _EPS;
      var mny = Math.min(ay, b.pos.y) - _EPS, mxy = Math.max(ay, b.pos.y) + _EPS;
      var mnz = Math.min(az, b.pos.z) - _EPS, mxz = Math.max(az, b.pos.z) + _EPS;
      var on = null;
      for (var kk = lower(mnx); kk < N && xs[kk] <= mxx; kk++) {
        var q = pts[kk];
        if (q.y < mny || q.y > mxy || q.z < mnz || q.z > mxz) continue;
        var px = q.x - ax, py = q.y - ay, pz = q.z - az;
        var t = (px * abx + py * aby + pz * abz) / L2;
        if (t <= 1e-4 || t >= 1 - 1e-4) continue;
        var dx = px - abx * t, dy = py - aby * t, dz = pz - abz * t;
        if (dx * dx + dy * dy + dz * dz < E2) {
          if (!on) on = [];
          on.push({ t: t, p: q });
        }
      }
      if (on) {
        on.sort(function(x, y) { return x.t - y.t; });
        for (var oi = 0; oi < on.length; oi++) {
          nv.push(new Vertex(on[oi].p.clone(), a.normal.clone()));
        }
      }
    }
    if (nv.length >= 3) polys[pi].vertices = nv;
  }
  return polys;
}

// Crease edges: only edges where TWO DIFFERENT planes meet (real corners).
// Normals are recomputed from the polygon's own vertices (Newell) and degenerate slivers are
// skipped: BSP splitting leaves hair-thin polygons whose stored plane normal is numerical noise,
// and each one used to mark its triangulation seam as a "corner" -> stray diagonal lines on panels.
// Coordinates are in meters; 1e4 -> 0.1 mm vertex grid (a coarser grid collapsed short edges).
function csgCreaseEdges(polys) {
  var vk = function(p) { return Math.round(p.x * 1e4) + '_' + Math.round(p.y * 1e4) + '_' + Math.round(p.z * 1e4); };
  var em = new Map();
  for (var pi = 0; pi < polys.length; pi++) {
    var vs = polys[pi].vertices;
    if (!vs || vs.length < 3) continue;
    var nx = 0, ny = 0, nz = 0;
    for (var k = 0; k < vs.length; k++) {
      var p0 = vs[k].pos, p1 = vs[(k + 1) % vs.length].pos;
      nx += (p0.y - p1.y) * (p0.z + p1.z);
      ny += (p0.z - p1.z) * (p0.x + p1.x);
      nz += (p0.x - p1.x) * (p0.y + p1.y);
    }
    var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-9) continue; // zero-area polygon (len = twice the area, in m^2)
    // Needle: height (2*area / longest edge) under 0.5 mm. BSP leaves these along cut lines; their
    // normals are noise and each one drew a long diagonal across the face.
    var longest2 = 0;
    for (var q = 0; q < vs.length; q++) {
      var qa = vs[q].pos, qb = vs[(q + 1) % vs.length].pos;
      var dx = qa.x - qb.x, dy = qa.y - qb.y, dz = qa.z - qb.z;
      var l2 = dx * dx + dy * dy + dz * dz;
      if (l2 > longest2) longest2 = l2;
    }
    if (len / Math.sqrt(longest2) < 5e-4) continue;
    var n = { x: nx / len, y: ny / len, z: nz / len };
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i].pos, b = vs[(i + 1) % vs.length].pos;
      var ka = vk(a), kb = vk(b);
      if (ka === kb) continue;
      var ek = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      var e = em.get(ek);
      if (!e) { e = { a: a, b: b, ns: [] }; em.set(ek, e); }
      e.ns.push(n);
    }
  }
  var positions = [];
  em.forEach(function(e) {
    var ns = e.ns, crease = false, backToBack = false;
    for (var i = 0; i < ns.length; i++) {
      for (var j = i + 1; j < ns.length; j++) {
        var dot = ns[i].x * ns[j].x + ns[i].y * ns[j].y + ns[i].z * ns[j].z;
        if (dot < -0.99) backToBack = true;   // coincident opposite faces (tool/panel overlap): not a real edge
        else if (dot < 0.9995) crease = true; // > ~1.8 deg between neighbouring faces
      }
    }
    if (backToBack) crease = false;
    if (crease) positions.push(e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z);
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

// Fix UVs after CSG (CSGop.toGeo fills UV with zeros)
// Projects UV from the best-matching plane based on vertex normal
function csgUV(g) {
  var p = g && g.attributes && g.attributes.position;
  var nr = g && g.attributes && g.attributes.normal;
  if (!p || !nr) return g;
  var uv = new Float32Array(p.count * 2);
  for (var i = 0; i < p.count; i++) {
    var ax = Math.abs(nr.getX(i)), ay = Math.abs(nr.getY(i)), az = Math.abs(nr.getZ(i));
    var u, v;
    if (az >= ax && az >= ay) { u = p.getX(i); v = p.getY(i); }      // cap (Z normal)
    else if (ax >= ay)         { u = p.getZ(i); v = p.getY(i); }      // side (X normal)
    else                       { u = p.getX(i); v = p.getZ(i); }      // side (Y normal)
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Cache for CSG results (same pockets + same panel shape = reuse)
var _pkCache = new Map();

function _pkKey(poly, dep, pk) {
  try {
    return JSON.stringify([poly, Math.round(dep * 1000), pk.map(function(k) {
      return [k.t, k.x, k.y, k.r, k.depth, k.face, k.pts];
    })]);
  } catch (e) { return null; }
}

// Create THREE.Shape from pocket/cut data
function cutShape(c) {
  var s = new THREE.Shape();
  if (c.t === 'circle') {
    s.absarc(c.x || 0, c.y || 0, c.r || 0, 0, Math.PI * 2, false);
  } else if (c.pts && c.pts.length >= 3) {
    s.moveTo(c.pts[0][0], c.pts[0][1]);
    for (var i = 1; i < c.pts.length; i++) s.lineTo(c.pts[i][0], c.pts[i][1]);
    s.closePath();
  }
  return s;
}

/**
 * Apply CSG pocket cutting to panel geometry.
 * Pockets are actually CUT from the panel — real depth, walls, and bottom visible.
 *
 * @param {THREE.BufferGeometry} geo — panel geometry (ExtrudeGeometry)
 * @param {Object} p — part data (must have .pockets array, .T for thickness)
 * @param {number} dep — extrusion depth in meters (panel thickness * sc)
 * @returns {THREE.BufferGeometry} — modified geometry with pockets cut
 */
export function applyPockets(geo, p, dep) {
  var sc = 0.001;
  var pk = (p.pockets || []).filter(function(k) {
    return k && (+k.depth || 0) > 0.3 &&
      (k.t === 'circle' ? (k.r > 0) : (k.pts && k.pts.length >= 3));
  });
  if (!pk.length) return geo;

  var th = dep;
  var s = th < 0 ? -1 : 1;
  var aT = Math.abs(th);
  if (aT < 0.0012) return geo; // too thin to cut

  // Check cache
  var key = _pkKey(p.poly || p.contour, dep, pk);
  if (key && _pkCache.has(key)) {
    var cached = _pkCache.get(key);
    var cloned = cached.g.clone();
    if (cached.cr) cloned._crease = cached.cr;
    return cloned;
  }

  var out = geo;
  try {
    var acc = toPolys(geo);
    var tools = [];

    for (var i = 0; i < pk.length; i++) {
      var k = pk[i];
      var d = Math.max(0.3, Math.min(aT - 0.0002, +k.depth || 0)) * sc;
      var shape = cutShape(k);
      // Scale shape coordinates to meters
      var scaledPts = [];
      if (k.t === 'circle') {
        var cs = new THREE.Shape();
        cs.absarc((k.x || 0) * sc, (k.y || 0) * sc, (k.r || 0) * sc, 0, Math.PI * 2, false);
        shape = cs;
      } else if (k.pts) {
        var ps = new THREE.Shape();
        ps.moveTo(k.pts[0][0] * sc, k.pts[0][1] * sc);
        for (var j = 1; j < k.pts.length; j++) ps.lineTo(k.pts[j][0] * sc, k.pts[j][1] * sc);
        ps.closePath();
        shape = ps;
      }

      var tg = new THREE.ExtrudeGeometry(shape, { depth: d + 0.001, bevelEnabled: false });
      // Position: face A → front (Z=-1), face B → back (Z = panelT - depth)
      if (k.face === 'B') {
        tg.translate(0, 0, s > 0 ? (aT - d) : (-aT - 0.001));
      } else {
        tg.translate(0, 0, s > 0 ? -0.001 : (-d));
      }
      var bp = toPolys(tg);
      for (var bi = 0; bi < bp.length; bi++) tools.push(bp[bi]);
      tg.dispose();
    }

    if (tools.length) {
      acc = subtract(acc, tools);
      if (acc.length) {
        acc = repairT(acc);
        out = csgUV(toGeo(acc));
        out._crease = csgCreaseEdges(acc);
      }
    }
  } catch (e) {
    console.warn('pocket CSG error: ' + (e.message || e));
    out = geo;
  }

  // Cache result
  if (key) {
    _pkCache.set(key, { g: out.clone(), cr: out._crease || null });
  }
  return out;
}

/**
 * Build pocket decals (fallback when CSG is not available).
 * Flat dark shapes on panel surface — visual indicator only.
 */
export function buildPocketDecals(mesh, part) {
  var sc = 0.001;
  if (!part.pockets || !part.pockets.length) return;
  var panelT = Math.max(part.T || 16, 1) * sc;

  for (var i = 0; i < part.pockets.length; i++) {
    var pk = part.pockets[i];
    var sh;
    if (pk.t === 'circle' && pk.r > 0) {
      sh = new THREE.Shape();
      sh.absarc(pk.x * sc, pk.y * sc, pk.r * sc, 0, Math.PI * 2, false);
    } else if (pk.t === 'poly' && pk.pts && pk.pts.length >= 3) {
      sh = new THREE.Shape();
      sh.moveTo(pk.pts[0][0] * sc, pk.pts[0][1] * sc);
      for (var j = 1; j < pk.pts.length; j++) sh.lineTo(pk.pts[j][0] * sc, pk.pts[j][1] * sc);
      sh.closePath();
    }
    if (!sh) continue;

    var geo = new THREE.ShapeGeometry(sh);
    var isBack = pk.face === 'B';
    geo.translate(0, 0, isBack ? panelT + 0.0002 : -0.0002);

    // DetalQR pattern: dark overlay, adaptive color for dark panels
    var mat = new THREE.MeshStandardMaterial({
      color: 0x2b2f35,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    sRGBFix(mat);
    var pocketMesh = new THREE.Mesh(geo, mat);
    pocketMesh.renderOrder = 1;
    pocketMesh.userData = { partId: part.id, pocket: true };
    mesh.add(pocketMesh);
  }
}

export function clearPocketCache() {
  _pkCache.clear();
}