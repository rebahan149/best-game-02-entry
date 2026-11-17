/*
 * Gleamward — beam geometry (pure math, no DOM access).
 *
 * The whole light-bending model lives here as side-effect-free functions so
 * it can be unit-tested headlessly in Node (module.exports) and used in the
 * browser as window.BeamMath. A mirror is a line segment described by its
 * centre (x, y), its direction `angle` (radians) and `half` (half-length).
 */
(function (global) {
  'use strict';

  // 2D cross product (z component).
  function cross(ax, ay, bx, by) {
    return ax * by - ay * bx;
  }

  // Reflect direction (dx, dy) off a surface with unit normal (nx, ny).
  function reflect(dx, dy, nx, ny) {
    var d = 2 * (dx * nx + dy * ny);
    return [dx - d * nx, dy - d * ny];
  }

  /*
   * Intersect ray O + t*D (t > 0) with segment A -> B.
   * Returns { t, s, x, y, nx, ny } where (nx, ny) is the segment normal
   * flipped to face the incoming ray, or null when there is no hit.
   */
  function raySegment(ox, oy, dx, dy, ax, ay, bx, by) {
    var ex = bx - ax;
    var ey = by - ay;
    var denom = cross(dx, dy, ex, ey);
    if (Math.abs(denom) < 1e-12) return null; // ray parallel to segment
    var fx = ax - ox;
    var fy = ay - oy;
    var t = cross(fx, fy, ex, ey) / denom;
    var s = cross(fx, fy, dx, dy) / denom;
    if (t <= 1e-4 || s < 0 || s > 1) return null;
    var len = Math.hypot(ex, ey) || 1;
    var nx = -ey / len;
    var ny = ex / len;
    if (nx * dx + ny * dy > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { t: t, s: s, x: ox + dx * t, y: oy + dy * t, nx: nx, ny: ny };
  }

  // Distance from point P to segment A -> B, with the closest point and
  // the normalised position u along the segment.
  function pointSegment(px, py, ax, ay, bx, by) {
    var ex = bx - ax;
    var ey = by - ay;
    var len2 = ex * ex + ey * ey;
    var u = len2 === 0 ? 0 : ((px - ax) * ex + (py - ay) * ey) / len2;
    u = Math.max(0, Math.min(1, u));
    var cx = ax + ex * u;
    var cy = ay + ey * u;
    return { dist: Math.hypot(px - cx, py - cy), x: cx, y: cy, u: u };
  }

  // Endpoints of a mirror segment.
  function mirrorEnds(m) {
    var hx = Math.cos(m.angle) * m.half;
    var hy = Math.sin(m.angle) * m.half;
    return [m.x - hx, m.y - hy, m.x + hx, m.y + hy];
  }

  /*
   * Trace a beam from (ox, oy) along `angle`, bouncing off mirror segments
   * until it leaves the field, runs out of total length, or runs out of
   * bounces. opts: { width, height, maxLength, maxBounces }.
   * Returns { points, segments, mirrorHits } — points is the polyline the
   * renderer draws, mirrorHits lists the mirror indices the beam touched.
   */
  function trace(ox, oy, angle, mirrors, opts) {
    var remaining = opts.maxLength;
    var bounces = opts.maxBounces;
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    var x = ox;
    var y = oy;
    var points = [[x, y]];
    var mirrorHits = [];

    for (;;) {
      var best = null;
      var bestMirror = -1;
      for (var i = 0; i < mirrors.length; i++) {
        var e = mirrorEnds(mirrors[i]);
        var hit = raySegment(x, y, dx, dy, e[0], e[1], e[2], e[3]);
        if (hit && hit.t < remaining && (!best || hit.t < best.t)) {
          best = hit;
          bestMirror = i;
        }
      }

      // Distance to the field bounds along the current direction.
      var tBound = remaining;
      if (dx > 1e-9) tBound = Math.min(tBound, (opts.width - x) / dx);
      else if (dx < -1e-9) tBound = Math.min(tBound, (0 - x) / dx);
      if (dy > 1e-9) tBound = Math.min(tBound, (opts.height - y) / dy);
      else if (dy < -1e-9) tBound = Math.min(tBound, (0 - y) / dy);
      if (tBound < 0) tBound = 0;

      if (best && best.t <= tBound && bounces > 0) {
        points.push([best.x, best.y]);
        mirrorHits.push(bestMirror);
        remaining -= best.t;
        var r = reflect(dx, dy, best.nx, best.ny);
        dx = r[0];
        dy = r[1];
        // Nudge the new origin off the surface so we do not re-hit it.
        x = best.x + dx * 0.25;
        y = best.y + dy * 0.25;
        bounces--;
      } else {
        // Stop at the nearer of the next mirror (no bounces left) or bounds.
        var tEnd = best && bounces === 0 ? Math.min(best.t, tBound) : tBound;
        points.push([x + dx * tEnd, y + dy * tEnd]);
        break;
      }
    }

    var segments = [];
    for (var j = 0; j + 1 < points.length; j++) {
      segments.push([points[j], points[j + 1]]);
    }
    return { points: points, segments: segments, mirrorHits: mirrorHits };
  }

  var api = {
    cross: cross,
    reflect: reflect,
    raySegment: raySegment,
    pointSegment: pointSegment,
    mirrorEnds: mirrorEnds,
    trace: trace
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.BeamMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
