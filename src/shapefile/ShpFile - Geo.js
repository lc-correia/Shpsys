/* @requires mapshaper-common */
var R = 6378137;
var D2R = Math.PI / 180;

var geom = {
    R: R,
    D2R: D2R,
    degreesToMeters: degreesToMeters,
    segmentHit: segmentHit,
    segmentIntersection: segmentIntersection,
    distanceSq: distanceSq,
    distance2D: distance2D,
    distance3D: distance3D,
    innerAngle: innerAngle,
    innerAngle2: innerAngle2,
    signedAngle: signedAngle,
    bearing: bearing,
    signedAngleSph: signedAngleSph,
    standardAngle: standardAngle,
    convLngLatToSph: convLngLatToSph,
    lngLatToXYZ: lngLatToXYZ,
    xyzToLngLat: xyzToLngLat,
    sphericalDistance: sphericalDistance,
    greatCircleDistance: greatCircleDistance,
    pointSegDistSq: pointSegDistSq,
    pointSegDistSq3D: pointSegDistSq3D,
    innerAngle3D: innerAngle3D,
    triangleArea: triangleArea,
    triangleArea3D: triangleArea3D,
    cosine: cosine,
    cosine3D: cosine3D
};

geom.outsideRange = outsideRange;

// Equirectangular projection
function degreesToMeters(deg) {
    return deg * D2R * R;
}

function distance3D(ax, ay, az, bx, by, bz) {
    var dx = ax - bx,
        dy = ay - by,
        dz = az - bz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distanceSq(ax, ay, bx, by) {
    var dx = ax - bx,
        dy = ay - by;
    return dx * dx + dy * dy;
}

function distance2D(ax, ay, bx, by) {
    var dx = ax - bx,
        dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
}

function distanceSq3D(ax, ay, az, bx, by, bz) {
    var dx = ax - bx,
        dy = ay - by,
        dz = az - bz;
    return dx * dx + dy * dy + dz * dz;
}

// Return id of nearest point to x, y, among x0, y0, x1, y1, ...
function nearestPoint(x, y, x0, y0) {
    var minIdx = -1,
        minDist = Infinity,
        dist;
    for (var i = 0, j = 2, n = arguments.length; j < n; i++, j += 2) {
        dist = distanceSq(x, y, arguments[j], arguments[j+1]);
        if (dist < minDist) {
            minDist = dist;
            minIdx = i;
        }
    }
    return minIdx;
}


// atan2() makes this function fairly slow, replaced by ~2x faster formula
function innerAngle2(ax, ay, bx, by, cx, cy) {
    var a1 = Math.atan2(ay - by, ax - bx),
        a2 = Math.atan2(cy - by, cx - bx),
        a3 = Math.abs(a1 - a2);
    if (a3 > Math.PI) {
        a3 = 2 * Math.PI - a3;
    }
    return a3;
}

// Return angle abc in range [0, 2PI) or NaN if angle is invalid
// (e.g. if length of ab or bc is 0)
/*
function signedAngle2(ax, ay, bx, by, cx, cy) {
  var a1 = Math.atan2(ay - by, ax - bx),
      a2 = Math.atan2(cy - by, cx - bx),
      a3 = a2 - a1;

  if (ax == bx && ay == by || bx == cx && by == cy) {
    a3 = NaN; // Use NaN for invalid angles
  } else if (a3 >= Math.PI * 2) {
    a3 = 2 * Math.PI - a3;
  } else if (a3 < 0) {
    a3 = a3 + 2 * Math.PI;
  }
  return a3;
}
*/

function standardAngle(a) {
    var twoPI = Math.PI * 2;
    while (a < 0) {
        a += twoPI;
    }
    while (a >= twoPI) {
        a -= twoPI;
    }
    return a;
}

function signedAngle(ax, ay, bx, by, cx, cy) {
    if (ax == bx && ay == by || bx == cx && by == cy) {
        return NaN; // Use NaN for invalid angles
    }
    var abx = ax - bx,
        aby = ay - by,
        cbx = cx - bx,
        cby = cy - by,
        dotp = abx * cbx + aby * cby,
        crossp = abx * cby - aby * cbx,
        a = Math.atan2(crossp, dotp);
    return standardAngle(a);
}

// Calc bearing in radians at lng1, lat1
function bearing(lng1, lat1, lng2, lat2) {
    var D2R = Math.PI / 180;
    lng1 *= D2R;
    lng2 *= D2R;
    lat1 *= D2R;
    lat2 *= D2R;
    var y = Math.sin(lng2-lng1) * Math.cos(lat2),
        x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lng2-lng1);
    return Math.atan2(y, x);
}

// Calc angle of turn from ab to bc, in range [0, 2PI)
// Receive lat-lng values in degrees
function signedAngleSph(alng, alat, blng, blat, clng, clat) {
    if (alng == blng && alat == blat || blng == clng && blat == clat) {
        return NaN;
    }
    var b1 = bearing(blng, blat, alng, alat), // calc bearing at b
        b2 = bearing(blng, blat, clng, clat),
        a = Math.PI * 2 + b1 - b2;
    return standardAngle(a);
}

/*
// Convert arrays of lng and lat coords (xsrc, ysrc) into
// x, y, z coords (meters) on the most common spherical Earth model.
//
function convLngLatToSph(xsrc, ysrc, xbuf, ybuf, zbuf) {
  var deg2rad = Math.PI / 180,
      r = R;
  for (var i=0, len=xsrc.length; i<len; i++) {
    var lng = xsrc[i] * deg2rad,
        lat = ysrc[i] * deg2rad,
        cosLat = Math.cos(lat);
    xbuf[i] = Math.cos(lng) * cosLat * r;
    ybuf[i] = Math.sin(lng) * cosLat * r;
    zbuf[i] = Math.sin(lat) * r;
  }
}
*/

// Convert arrays of lng and lat coords (xsrc, ysrc) into
// x, y, z coords (meters) on the most common spherical Earth model.
//
function convLngLatToSph(xsrc, ysrc, xbuf, ybuf, zbuf) {
    var p = [];
    for (var i=0, len=xsrc.length; i<len; i++) {
        lngLatToXYZ(xsrc[i], ysrc[i], p);
        xbuf[i] = p[0];
        ybuf[i] = p[1];
        zbuf[i] = p[2];
    }
}

function xyzToLngLat(x, y, z, p) {
    var d = distance3D(0, 0, 0, x, y, z); // normalize
    var lat = Math.asin(z / d) / D2R;
    var lng = Math.atan2(y / d, x / d) / D2R;
    p[0] = lng;
    p[1] = lat;
}

function lngLatToXYZ(lng, lat, p) {
    var cosLat;
    lng *= D2R;
    lat *= D2R;
    cosLat = Math.cos(lat);
    p[0] = Math.cos(lng) * cosLat * R;
    p[1] = Math.sin(lng) * cosLat * R;
    p[2] = Math.sin(lat) * R;
}

// Haversine formula (well conditioned at small distances)
function sphericalDistance(lam1, phi1, lam2, phi2) {
    var dlam = lam2 - lam1,
        dphi = phi2 - phi1,
        a = Math.sin(dphi / 2) * Math.sin(dphi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dlam / 2) * Math.sin(dlam / 2),
        c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return c;
}

// Receive: coords in decimal degrees;
// Return: distance in meters on spherical earth
function greatCircleDistance(lng1, lat1, lng2, lat2) {
    var D2R = Math.PI / 180,
        dist = sphericalDistance(lng1 * D2R, lat1 * D2R, lng2 * D2R, lat2 * D2R);
    return dist * R;
}

// TODO: make this safe for small angles
function innerAngle(ax, ay, bx, by, cx, cy) {
    var ab = distance2D(ax, ay, bx, by),
        bc = distance2D(bx, by, cx, cy),
        theta, dotp;
    if (ab === 0 || bc === 0) {
        theta = 0;
    } else {
        dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / (ab * bc);
        if (dotp >= 1 - 1e-14) {
            theta = 0;
        } else if (dotp <= -1 + 1e-14) {
            theta = Math.PI;
        } else {
            theta = Math.acos(dotp); // consider using other formula at small dp
        }
    }
    return theta;
}

function innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var ab = distance3D(ax, ay, az, bx, by, bz),
        bc = distance3D(bx, by, bz, cx, cy, cz),
        theta, dotp;
    if (ab === 0 || bc === 0) {
        theta = 0;
    } else {
        dotp = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / (ab * bc);
        if (dotp >= 1) {
            theta = 0;
        } else if (dotp <= -1) {
            theta = Math.PI;
        } else {
            theta = Math.acos(dotp); // consider using other formula at small dp
        }
    }
    return theta;
}

function triangleArea(ax, ay, bx, by, cx, cy) {
    var area = Math.abs(((ay - cy) * (bx - cx) + (by - cy) * (cx - ax)) / 2);
    return area;
}

function detSq(ax, ay, bx, by, cx, cy) {
    var det = ax * by - ax * cy + bx * cy - bx * ay + cx * ay - cx * by;
    return det * det;
}

function cosine(ax, ay, bx, by, cx, cy) {
    var den = distance2D(ax, ay, bx, by) * distance2D(bx, by, cx, cy),
        cos = 0;
    if (den > 0) {
        cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by)) / den;
        if (cos > 1) cos = 1; // handle fp rounding error
        else if (cos < -1) cos = -1;
    }
    return cos;
}

function cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var den = distance3D(ax, ay, az, bx, by, bz) * distance3D(bx, by, bz, cx, cy, cz),
        cos = 0;
    if (den > 0) {
        cos = ((ax - bx) * (cx - bx) + (ay - by) * (cy - by) + (az - bz) * (cz - bz)) / den;
        if (cos > 1) cos = 1; // handle fp rounding error
        else if (cos < -1) cos = -1;
    }
    return cos;
}

function triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var area = 0.5 * Math.sqrt(detSq(ax, ay, bx, by, cx, cy) +
        detSq(ax, az, bx, bz, cx, cz) + detSq(ay, az, by, bz, cy, cz));
    return area;
}

// Given point B and segment AC, return the squared distance from B to the
// nearest point on AC
// Receive the squared length of segments AB, BC, AC
// TODO: analyze rounding error. Returns 0 for these coordinates:
//    P: [2, 3 - 1e-8]  AB: [[1, 3], [3, 3]]
//
function apexDistSq(ab2, bc2, ac2) {
    var dist2;
    if (ac2 === 0) {
        dist2 = ab2;
    } else if (ab2 >= bc2 + ac2) {
        dist2 = bc2;
    } else if (bc2 >= ab2 + ac2) {
        dist2 = ab2;
    } else {
        var dval = (ab2 + ac2 - bc2);
        dist2 = ab2 -  dval * dval / ac2  * 0.25;
    }
    if (dist2 < 0) {
        dist2 = 0;
    }
    return dist2;
}

function pointSegDistSq(ax, ay, bx, by, cx, cy) {
    var ab2 = distanceSq(ax, ay, bx, by),
        ac2 = distanceSq(ax, ay, cx, cy),
        bc2 = distanceSq(bx, by, cx, cy);
    return apexDistSq(ab2, ac2, bc2);
}

function pointSegDistSq3D(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var ab2 = distanceSq3D(ax, ay, az, bx, by, bz),
        ac2 = distanceSq3D(ax, ay, az, cx, cy, cz),
        bc2 = distanceSq3D(bx, by, bz, cx, cy, cz);
    return apexDistSq(ab2, ac2, bc2);
}


Shpsys.calcArcBounds = function(xx, yy, start, len) {
    var i = start | 0,
        n = isNaN(len) ? xx.length - i : len + i,
        x, y, xmin, ymin, xmax, ymax;
    if (n > 0) {
        xmin = xmax = xx[i];
        ymin = ymax = yy[i];
    }
    for (i++; i<n; i++) {
        x = xx[i];
        y = yy[i];
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
    }
    return [xmin, ymin, xmax, ymax];
};

Shpsys.reversePathCoords = function(arr, start, len) {
    var i = start,
        j = start + len - 1,
        tmp;
    while (i < j) {
        tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
        i++;
        j--;
    }
};

// merge B into A
function mergeBounds(a, b) {
    if (b[0] < a[0]) a[0] = b[0];
    if (b[1] < a[1]) a[1] = b[1];
    if (b[2] > a[2]) a[2] = b[2];
    if (b[3] > a[3]) a[3] = b[3];
}

function containsBounds(a, b) {
    return a[0] <= b[0] && a[2] >= b[2] && a[1] <= b[1] && a[3] >= b[3];
}

function boundsArea(b) {
    return (b[2] - b[0]) * (b[3] - b[1]);
}

function determinant2D(a, b, c, d) {
    return a * d - b * c;
}

// returns a positive value if the points a, b, and c are arranged in
// counterclockwise order, a negative value if the points are in clockwise
// order, and zero if the points are collinear.
// Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
function orient2D(ax, ay, bx, by, cx, cy) {
    return determinant2D(ax - cx, ay - cy, bx - cx, by - cy);
}

// Source: Sedgewick, _Algorithms in C_
// (Tried various other functions that failed owing to floating point errors)
function segmentHit(ax, ay, bx, by, cx, cy, dx, dy) {
    return orient2D(ax, ay, bx, by, cx, cy) *
        orient2D(ax, ay, bx, by, dx, dy) <= 0 &&
        orient2D(cx, cy, dx, dy, ax, ay) *
        orient2D(cx, cy, dx, dy, bx, by) <= 0;
}

function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    var hit = segmentHit(ax, ay, bx, by, cx, cy, dx, dy),
        p = null;
    if (hit) {
        p = crossIntersection(ax, ay, bx, by, cx, cy, dx, dy);
        if (!p) { // collinear if p is null
            p = collinearIntersection(ax, ay, bx, by, cx, cy, dx, dy);
        } else if (endpointHit(ax, ay, bx, by, cx, cy, dx, dy)) {
            p = null; // filter out segments that only intersect at an endpoint
        }
    }
    return p;
}

function crossIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    var p = lineIntersection(ax, ay, bx, by, cx, cy, dx, dy);
    var nearest;
    if (p) {
        // Re-order operands so intersection point is closest to a (better precision)
        // Source: Jonathan Shewchuk http://www.cs.berkeley.edu/~jrs/meshpapers/robnotes.pdf
        nearest = nearestPoint(p[0], p[1], ax, ay, bx, by, cx, cy, dx, dy);
        if (nearest == 1) {
            p = lineIntersection(bx, by, ax, ay, cx, cy, dx, dy);
        } else if (nearest == 2) {
            p = lineIntersection(cx, cy, dx, dy, ax, ay, bx, by);
        } else if (nearest == 3) {
            p = lineIntersection(dx, dy, cx, cy, ax, ay, bx, by);
        }
    }
    if (p) {
        clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy);
    }
    return p;
}

function collinearIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    var minX = Math.min(ax, bx, cx, dx),
        maxX = Math.max(ax, bx, cx, dx),
        minY = Math.min(ay, by, cy, dy),
        maxY = Math.max(ay, by, cy, dy),
        useY = maxY - minY > maxX - minX,
        coords = [];

    if (useY ? inside(ay, minY, maxY) : inside(ax, minX, maxX)) {
        coords.push(ax, ay);
    }
    if (useY ? inside(by, minY, maxY) : inside(bx, minX, maxX)) {
        coords.push(bx, by);
    }
    if (useY ? inside(cy, minY, maxY) : inside(cx, minX, maxX)) {
        coords.push(cx, cy);
    }
    if (useY ? inside(dy, minY, maxY) : inside(dx, minX, maxX)) {
        coords.push(dx, dy);
    }
    if (coords.length != 2 && coords.length != 4) {
        coords = null;
        debug("Invalid collinear segment intersection", coords);
    } else if (coords.length == 4 && coords[0] == coords[2] && coords[1] == coords[3]) {
        // segs that meet in the middle don't count
        coords = null;
    }
    return coords;
}

function endpointHit(ax, ay, bx, by, cx, cy, dx, dy) {
    return ax == cx && ay == cy || ax == dx && ay == dy ||
        bx == cx && by == cy || bx == dx && by == dy;
}

function lineIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    var den = determinant2D(bx - ax, by - ay, dx - cx, dy - cy);
    var eps = 1e-18;
    var m, p;
    if (den === 0) return null;
    m = orient2D(cx, cy, dx, dy, ax, ay) / den;
    if (den <= eps && den >= -eps) {
        // tiny denominator = low precision; using one of the endpoints as intersection
        p = findEndpointInRange(ax, ay, bx, by, cx, cy, dx, dy);
        if (!p) {
            debug('[lineIntersection()]');
            geom.debugSegmentIntersection([], ax, ay, bx, by, cx, cy, dx, dy);
        }
    } else {
        p = [ax + m * (bx - ax), ay + m * (by - ay)];
    }
    return p;
}

function clampIntersectionPoint(p, ax, ay, bx, by, cx, cy, dx, dy) {
    // Handle intersection points that fall outside the x-y range of either
    // segment by snapping to nearest endpoint coordinate. Out-of-range
    // intersection points can be caused by floating point rounding errors
    // when a segment is vertical or horizontal. This has caused problems when
    // repeatedly applying bbox clipping along the same segment
    var x = p[0],
        y = p[1];
    // assumes that segment ranges intersect
    x = geom.clampToCloseRange(x, ax, bx);
    x = geom.clampToCloseRange(x, cx, dx);
    y = geom.clampToCloseRange(y, ay, by);
    y = geom.clampToCloseRange(y, cy, dy);
    p[0] = x;
    p[1] = y;
}

function inside(x, minX, maxX) {
    return x > minX && x < maxX;
}

function findEndpointInRange(ax, ay, bx, by, cx, cy, dx, dy) {
    var p = null;
    if (!outsideRange(ax, cx, dx) && !outsideRange(ay, cy, dy)) {
        p = [ax, ay];
    } else if (!outsideRange(bx, cx, dx) && !outsideRange(by, cy, dy)) {
        p = [bx, by];
    } else if (!outsideRange(cx, ax, bx) && !outsideRange(cy, ay, by)) {
        p = [cx, cy];
    } else if (!outsideRange(dx, ax, bx) && !outsideRange(dy, ay, by)) {
        p = [dx, dy];
    }
    return p;
}

geom.debugSegmentIntersection = function(p, ax, ay, bx, by, cx, cy, dx, dy) {
    debug('[debugSegmentIntersection()]');
    debug('  s1\n  dx:', Math.abs(ax - bx), '\n  dy:', Math.abs(ay - by));
    debug('  s2\n  dx:', Math.abs(cx - dx), '\n  dy:', Math.abs(cy - dy));
    debug('  s1 xx:', ax, bx);
    debug('  s2 xx:', cx, dx);
    debug('  s1 yy:', ay, by);
    debug('  s2 yy:', cy, dy);
    debug('  angle:', geom.signedAngle(ax, ay, bx, by, dx - cx + bx, dy - cy + by));
};

geom.clampToCloseRange = function(a, b, c) {
    var lim;
    if (geom.outsideRange(a, b, c)) {
        lim = Math.abs(a - b) < Math.abs(a - c) ? b : c;
        if (Math.abs(a - lim) > 1e-16) {
            debug("[clampToCloseRange()] large clamping interval", a, b, c);
        }
        a = lim;
    }
    return a;
};

function outsideRange(a, b, c) {
    var out;
    if (b < c) {
        out = a < b || a > c;
    } else if (b > c) {
        out = a > b || a < c;
    } else {
        out = a != b;
    }
    return out;
}

geom.getPlanarPathArea2 = function(points) {
    var sum = 0,
        ax, ay, bx, by, dx, dy, p;
    for (var i=0, n=points.length; i<n; i++) {
        p = points[i];
        if (i === 0) {
            ax = 0;
            ay = 0;
            dx = -p[0];
            dy = -p[1];
        } else {
            ax = p[0] + dx;
            ay = p[1] + dy;
            sum += ax * by - bx * ay;
        }
        bx = ax;
        by = ay;
    }
    return sum / 2;
};

geom.getPlanarPathArea = function(ids, arcs) {
    var iter = arcs.getShapeIter(ids),
        sum = 0,
        ax, ay, bx, by, dx, dy;
    if (iter.hasNext()) {
        ax = 0;
        ay = 0;
        dx = -iter.x;
        dy = -iter.y;
        while (iter.hasNext()) {
            bx = ax;
            by = ay;
            ax = iter.x + dx;
            ay = iter.y + dy;
            sum += ax * by - bx * ay;
        }
    }
    return sum / 2;
};

Shpsys.cleanShapes = function(shapes, arcs, type) {
    for (var i=0, n=shapes.length; i<n; i++) {
        shapes[i] = Shpsys.cleanShape(shapes[i], arcs, type);
    }
};

// Remove defective arcs and zero-area polygon rings
// Remove simple polygon spikes of form: [..., id, ~id, ...]
// Don't remove duplicate points
// Don't check winding order of polygon rings
Shpsys.cleanShape = function(shape, arcs, type) {
    return Shpsys.editPaths(shape, function(path) {
        var cleaned = Shpsys.cleanPath(path, arcs);
        if (type == 'polygon' && cleaned) {
            Shpsys.removeSpikesInPath(cleaned); // assumed by addIntersectionCuts()
            if (geom.getPlanarPathArea(cleaned, arcs) === 0) {
                cleaned = null;
            }
        }
        return cleaned;
    });
};

Shpsys.editPaths = function(paths, cb) {
    if (!paths) return null; // null shape
    if (!utils.isArray(paths)) error("[editPaths()] Expected an array, found:", arr);
    var nulls = 0,
        n = paths.length,
        retn;

    for (var i=0; i<n; i++) {
        retn = cb(paths[i], i, paths);
        if (retn === null) {
            nulls++;
            paths[i] = null;
        } else if (utils.isArray(retn)) {
            paths[i] = retn;
        }
    }
    if (nulls == n) {
        return null;
    } else if (nulls > 0) {
        return paths.filter(function(ids) {return !!ids;});
    } else {
        return paths;
    }
};

Shpsys.removeSpikesInPath = function(ids) {
    var n = ids.length;
    if (n >= 2) {
        if (ids[0] == ~ids[n-1]) {
            ids.pop();
            ids.shift();
        } else {
            for (var i=1; i<n; i++) {
                if (ids[i-1] == ~ids[i]) {
                    ids.splice(i-1, 2);
                    break;
                }
            }
        }
        if (ids.length < n) {
            Shpsys.removeSpikesInPath(ids);
        }
    }
};

Shpsys.cleanPath = function(path, arcs) {
    var nulls = 0;
    for (var i=0, n=path.length; i<n; i++) {
        if (arcs.arcIsDegenerate(path[i])) {
            nulls++;
            path[i] = null;
        }
    }
    return nulls > 0 ? path.filter(function(id) {return id !== null;}) : path;
};