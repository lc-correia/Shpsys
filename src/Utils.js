var error = function() {
    var msg = utils.toArray(arguments).join(' ');
    throw new Error(msg);
};

var utils = {

    isString: function(obj) {
        return obj != null && obj.toString === String.prototype.toString;
    },

    isInteger: function(obj) {
        return utils.isNumber(obj) && ((obj | 0) === obj);
    },

    isArray: function(obj) {
        return Array.isArray(obj);
    },

    isArrayLike: function(obj) {
        if (!obj) return false;
        if (utils.isArray(obj)) return true;
        if (utils.isString(obj)) return false;
        if (obj.length === 0) return true;
        if (obj.length > 0) return true;
        return false;
    },

    clamp: function(val, min, max) {
        return val < min ? min : (val > max ? max : val);
    },

    defaults: function(dest) {
        for (var i=1, n=arguments.length; i<n; i++) {
            var src = arguments[i] || {};
            for (var key in src) {
                if (key in dest === false && src.hasOwnProperty(key)) {
                    dest[key] = src[key];
                }
            }
        }
        return dest;
    },

    regexEscape: function(str) {
        return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    },

    extend: function(o) {
        var dest = o || {},
            n = arguments.length,
            key, i, src;
        for (i=1; i<n; i++) {
            src = arguments[i] || {};
            for (key in src) {
                if (src.hasOwnProperty(key)) {
                    dest[key] = src[key];
                }
            }
        }
        return dest;
    }
};

utils.indexOf = function(arr, item) {
    var nan = !(item === item);
    for (var i = 0, len = arr.length || 0; i < len; i++) {
        if (arr[i] === item) return i;
        if (nan && !(arr[i] === arr[i])) return i;
    }
    return -1;
};

utils.contains = function(container, item) {
    if (utils.isString(container)) {
        return container.indexOf(item) != -1;
    }
    else if (utils.isArrayLike(container)) {
        return utils.indexOf(container, item) != -1;
    }
    error("Expected Array or String argument");
};

utils.extendBuffer = function(src, newLen, copyLen) {
    var len = Math.max(src.length, newLen);
    var n = copyLen || src.length;
    var dest = new src.constructor(len);
    utils.copyElements(src, 0, dest, 0, n);
    return dest;
};

utils.copyElements = function(src, i, dest, j, n, rev) {
    if (src === dest && j > i) error ("copy error");
    var inc = 1,
        offs = 0;
    if (rev) {
        inc = -1;
        offs = n - 1;
    }
    for (var k=0; k<n; k++, offs += inc) {
        dest[k + j] = src[i + offs];
    }
};

utils.getRoundingFunction = function(inc) {
    if (!utils.isNumber(inc) || inc === 0) {
        error("Rounding increment must be a non-zero number.");
    }
    var inv = 1 / inc;
    if (inv > 1) inv = Math.round(inv);
    return function(x) {
        return Math.round(x * inv) / inv;
        // these alternatives show rounding error after JSON.stringify()
        // return Math.round(x / inc) / inv;
        // return Math.round(x / inc) * inc;
        // return Math.round(x * inv) * inc;
    };
};

utils.pluralSuffix = function(count) {
    return count != 1 ? 's' : '';
};

utils.format = function(fmt) {
    var fn = utils.formatter(fmt);
    var str = fn.apply(null, Array.prototype.slice.call(arguments, 1));
    return str;
};

utils.formatter = function(fmt) {
    var codeRxp = /%([\',+0]*)([1-9]?)((?:\.[1-9])?)([sdifxX%])/g;
    var literals = [],
        formatCodes = [],
        startIdx = 0,
        prefix = "",
        literal,
        matches;

    while (matches=codeRxp.exec(fmt)) {
        literal = fmt.substring(startIdx, codeRxp.lastIndex - matches[0].length);
        if (matches[0] == '%%') {
            prefix += literal + '%';
        } else {
            literals.push(prefix + literal);
            prefix = '';
            formatCodes.push(matches);
        }
        startIdx = codeRxp.lastIndex;
    }
    literals.push(prefix + fmt.substr(startIdx));

    return function() {
        var str = literals[0],
            n = arguments.length;
        if (n != formatCodes.length) {
            error("[format()] Data does not match format string; format:", fmt, "data:", arguments);
        }
        for (var i=0; i<n; i++) {
            str += formatValue(arguments[i], formatCodes[i]) + literals[i+1];
        }
        return str;
    };
};

utils.sortCoordinateIds = function(a) {
    var n = a.length,
        ids = new Uint32Array(n);
    for (var i=0; i<n; i++) {
        ids[i] = i;
    }
    utils.quicksortIds(a, ids, 0, ids.length-1);
    return ids;
};

utils.quicksortIds = function (a, ids, lo, hi) {
    if (hi - lo > 24) {
        var pivot = a[ids[lo + hi >> 1]],
            i = lo,
            j = hi,
            tmp;
        while (i <= j) {
            while (a[ids[i]] < pivot) i++;
            while (a[ids[j]] > pivot) j--;
            if (i <= j) {
                tmp = ids[i];
                ids[i] = ids[j];
                ids[j] = tmp;
                i++;
                j--;
            }
        }
        if (j > lo) utils.quicksortIds(a, ids, lo, j);
        if (i < hi) utils.quicksortIds(a, ids, i, hi);
    } else {
        utils.insertionSortIds(a, ids, lo, hi);
    }
};

utils.insertionSortIds = function(arr, ids, start, end) {
    var id, i, j;
    for (j = start + 1; j <= end; j++) {
        id = ids[j];
        for (i = j - 1; i >= start && arr[id] < arr[ids[i]]; i--) {
            ids[i+1] = ids[i];
        }
        ids[i+1] = id;
    }
};

function formatValue(val, matches) {
    var flags = matches[1];
    var padding = matches[2];
    var decimals = matches[3] ? parseInt(matches[3].substr(1)) : void 0;
    var type = matches[4];
    var isString = type == 's',
        isHex = type == 'x' || type == 'X',
        isInt = type == 'd' || type == 'i',
        isFloat = type == 'f',
        isNumber = !isString;

    var sign = "",
        padDigits = 0,
        isZero = false,
        isNeg = false;

    var str;
    if (isString) {
        str = String(val);
    }
    else if (isHex) {
        str = val.toString(16);
        if (type == 'X')
            str = str.toUpperCase();
    }
    else if (isNumber) {
        str = utils.numToStr(val, isInt ? 0 : decimals);
        if (str[0] == '-') {
            isNeg = true;
            str = str.substr(1);
        }
        isZero = parseFloat(str) == 0;
        if (flags.indexOf("'") != -1 || flags.indexOf(',') != -1) {
            str = utils.addThousandsSep(str);
        }
        if (!isZero) { // BUG: sign is added when num rounds to 0
            if (isNeg) {
                sign = "\u2212"; // U+2212
            } else if (flags.indexOf('+') != -1) {
                sign = '+';
            }
        }
    }

    if (padding) {
        var strLen = str.length + sign.length;
        var minWidth = parseInt(padding, 10);
        if (strLen < minWidth) {
            padDigits = minWidth - strLen;
            var padChar = flags.indexOf('0') == -1 ? ' ' : '0';
            var padStr = utils.repeatString(padChar, padDigits);
        }
    }

    if (padDigits == 0) {
        str = sign + str;
    } else if (padChar == '0') {
        str = sign + padStr + str;
    } else {
        str = padStr + sign + str;
    }
    return str;
}

Shpsys.numToStr = function(num, decimals) {
    return decimals >= 0 ? num.toFixed(decimals) : String(num);
};

Shpsys.addThousandsSep = function(str) {
    var fmt = '',
        start = str[0] == '-' ? 1 : 0,
        dec = str.indexOf('.'),
        end = str.length,
        ins = (dec == -1 ? end : dec) - 3;
    while (ins > start) {
        fmt = ',' + str.substring(ins, end) + fmt;
        end = ins;
        ins -= 3;
    }
    return str.substring(0, end) + fmt;
};

Shpsys.repeatString = function(src, n) {
    var str = "";
    for (var i=0; i<n; i++)
        str += src;
    return str;
};

Shpsys.divideFeaturesByType = function(shapes, properties, types) {
    var typeSet = utils.uniq(types);
    var layers = typeSet.map(function(geoType) {
        var p = [],
            s = [],
            dataNulls = 0,
            rec;
        for (var i=0, n=shapes.length; i<n; i++) {
            if (types[i] != geoType) continue;
            if (geoType) s.push(shapes[i]);
            rec = properties[i];
            p.push(rec);
            if (!rec) dataNulls++;
        }
        return {
            geometry_type: geoType,
            shapes: s,
            data: dataNulls < s.length ? new DataTable(p) : null
        };
    });
    return layers;
};

utils.uniq = function(src) {
    var index = {};
    return src.reduce(function(memo, el) {
        if (el in index === false) {
            index[el] = true;
            memo.push(el);
        }
        return memo;
    }, []);
};

Shpsys.fixInconsistentFields = function(records) {
    var fields = Shpsys.findIncompleteFields(records);
    Shpsys.patchMissingFields(records, fields);
};

Shpsys.findIncompleteFields = function(records) {
    var counts = {},
        i, j, keys;
    for (i=0; i<records.length; i++) {
        keys = Object.keys(records[i] || {});
        for (j=0; j<keys.length; j++) {
            counts[keys[j]] = (counts[keys[j]] | 0) + 1;
        }
    }
    return Object.keys(counts).filter(function(k) {return counts[k] < records.length;});
};

Shpsys.patchMissingFields = function(records, fields) {
    var rec, i, j, f;
    for (i=0; i<records.length; i++) {
        rec = records[i] || (records[i] = {});
        for (j=0; j<fields.length; j++) {
            f = fields[j];
            if (f in rec === false) {
                rec[f] = undefined;
            }
        }
    }
};

Shpsys.getUniqFieldNames = function(fields, maxLen) {
    var used = {};
    return fields.map(function(name) {
        var i = 0,
            validName;
        do {
            validName = Shpsys.adjustFieldName(name, maxLen, i);
            i++;
        } while (validName in used);
        used[validName] = true;
        return validName;
    });
};

Shpsys.adjustFieldName = function(name, maxLen, i) {
    var name2, suff;
    maxLen = maxLen || 256;
    if (!i) {
        name2 = name.substr(0, maxLen);
    } else {
        suff = String(i);
        if (suff.length == 1) {
            suff = '_' + suff;
        }
        name2 = name.substr(0, maxLen - suff.length) + suff;
    }
    return name2;
};


function Transform() {
    this.mx = this.my = 1;
    this.bx = this.by = 0;
}

Transform.prototype.isNull = function() {
    return !this.mx || !this.my || isNaN(this.bx) || isNaN(this.by);
};

Transform.prototype.invert = function() {
    var inv = new Transform();
    inv.mx = 1 / this.mx;
    inv.my = 1 / this.my;
    //inv.bx = -this.bx * inv.mx;
    //inv.by = -this.by * inv.my;
    inv.bx = -this.bx / this.mx;
    inv.by = -this.by / this.my;
    return inv;
};


Transform.prototype.transform = function(x, y, xy) {
    xy = xy || [];
    xy[0] = x * this.mx + this.bx;
    xy[1] = y * this.my + this.by;
    return xy;
};

Transform.prototype.toString = function() {
    return utils.toString(utils.extend({}, this));
};


function Bounds() {
    if (arguments.length > 0) {
        this.setBounds.apply(this, arguments);
    }
}

Bounds.prototype.toString = function() {
    return JSON.stringify({
        xmin: this.xmin,
        xmax: this.xmax,
        ymin: this.ymin,
        ymax: this.ymax
    });
};

Bounds.prototype.toArray = function() {
    return this.hasBounds() ? [this.xmin, this.ymin, this.xmax, this.ymax] : [];
};

Bounds.prototype.hasBounds = function() {
    return this.xmin <= this.xmax && this.ymin <= this.ymax;
};

Bounds.prototype.sameBounds =
    Bounds.prototype.equals = function(bb) {
        return bb && this.xmin === bb.xmin && this.xmax === bb.xmax &&
            this.ymin === bb.ymin && this.ymax === bb.ymax;
    };

Bounds.prototype.width = function() {
    return (this.xmax - this.xmin) || 0;
};

Bounds.prototype.height = function() {
    return (this.ymax - this.ymin) || 0;
};

Bounds.prototype.area = function() {
    return this.width() * this.height() || 0;
};

Bounds.prototype.empty = function() {
    this.xmin = this.ymin = this.xmax = this.ymax = void 0;
    return this;
};

Bounds.prototype.setBounds = function(a, b, c, d) {
    if (arguments.length == 1) {
        // assume first arg is a Bounds or array
        if (utils.isArrayLike(a)) {
            b = a[1];
            c = a[2];
            d = a[3];
            a = a[0];
        } else {
            b = a.ymin;
            c = a.xmax;
            d = a.ymax;
            a = a.xmin;
        }
    }

    this.xmin = a;
    this.ymin = b;
    this.xmax = c;
    this.ymax = d;
    if (a > c || b > d) this.update();
    // error("Bounds#setBounds() min/max reversed:", a, b, c, d);
    return this;
};


Bounds.prototype.centerX = function() {
    var x = (this.xmin + this.xmax) * 0.5;
    return x;
};

Bounds.prototype.centerY = function() {
    var y = (this.ymax + this.ymin) * 0.5;
    return y;
};

Bounds.prototype.containsPoint = function(x, y) {
    if (x >= this.xmin && x <= this.xmax &&
        y <= this.ymax && y >= this.ymin) {
        return true;
    }
    return false;
};

// intended to speed up slightly bubble symbol detection; could use intersects() instead
// TODO: fix false positive where circle is just outside a corner of the box
Bounds.prototype.containsBufferedPoint =
    Bounds.prototype.containsCircle = function(x, y, buf) {
        if ( x + buf > this.xmin && x - buf < this.xmax ) {
            if ( y - buf < this.ymax && y + buf > this.ymin ) {
                return true;
            }
        }
        return false;
    };

Bounds.prototype.intersects = function(bb) {
    if (bb.xmin <= this.xmax && bb.xmax >= this.xmin &&
        bb.ymax >= this.ymin && bb.ymin <= this.ymax) {
        return true;
    }
    return false;
};

Bounds.prototype.contains = function(bb) {
    if (bb.xmin >= this.xmin && bb.ymax <= this.ymax &&
        bb.xmax <= this.xmax && bb.ymin >= this.ymin) {
        return true;
    }
    return false;
};

Bounds.prototype.shift = function(x, y) {
    this.setBounds(this.xmin + x,
        this.ymin + y, this.xmax + x, this.ymax + y);
};

Bounds.prototype.padBounds = function(a, b, c, d) {
    this.xmin -= a;
    this.ymin -= b;
    this.xmax += c;
    this.ymax += d;
};

// Rescale the bounding box by a fraction. TODO: implement focus.
// @param {number} pct Fraction of original extents
// @param {number} pctY Optional amount to scale Y
//
Bounds.prototype.scale = function(pct, pctY) { /*, focusX, focusY*/
    var halfWidth = (this.xmax - this.xmin) * 0.5;
    var halfHeight = (this.ymax - this.ymin) * 0.5;
    var kx = pct - 1;
    var ky = pctY === undefined ? kx : pctY - 1;
    this.xmin -= halfWidth * kx;
    this.ymin -= halfHeight * ky;
    this.xmax += halfWidth * kx;
    this.ymax += halfHeight * ky;
};

// Return a bounding box with the same extent as this one.
Bounds.prototype.cloneBounds = // alias so child classes can override clone()
    Bounds.prototype.clone = function() {
        return new Bounds(this.xmin, this.ymin, this.xmax, this.ymax);
    };

Bounds.prototype.clearBounds = function() {
    this.setBounds(new Bounds());
};

Bounds.prototype.mergePoint = function(x, y) {
    if (this.xmin === void 0) {
        this.setBounds(x, y, x, y);
    } else {
        // this works even if x,y are NaN
        if (x < this.xmin)  this.xmin = x;
        else if (x > this.xmax)  this.xmax = x;

        if (y < this.ymin) this.ymin = y;
        else if (y > this.ymax) this.ymax = y;
    }
};

// expands either x or y dimension to match @aspect (width/height ratio)
// @focusX, @focusY (optional): expansion focus, as a fraction of width and height
Bounds.prototype.fillOut = function(aspect, focusX, focusY) {
    if (arguments.length < 3) {
        focusX = 0.5;
        focusY = 0.5;
    }
    var w = this.width(),
        h = this.height(),
        currAspect = w / h,
        pad;
    if (isNaN(aspect) || aspect <= 0) {
        // error condition; don't pad
    } else if (currAspect < aspect) { // fill out x dimension
        pad = h * aspect - w;
        this.xmin -= (1 - focusX) * pad;
        this.xmax += focusX * pad;
    } else {
        pad = w / aspect - h;
        this.ymin -= (1 - focusY) * pad;
        this.ymax += focusY * pad;
    }
    return this;
};

Bounds.prototype.update = function() {
    var tmp;
    if (this.xmin > this.xmax) {
        tmp = this.xmin;
        this.xmin = this.xmax;
        this.xmax = tmp;
    }
    if (this.ymin > this.ymax) {
        tmp = this.ymin;
        this.ymin = this.ymax;
        this.ymax = tmp;
    }
};

Bounds.prototype.transform = function(t) {
    this.xmin = this.xmin * t.mx + t.bx;
    this.xmax = this.xmax * t.mx + t.bx;
    this.ymin = this.ymin * t.my + t.by;
    this.ymax = this.ymax * t.my + t.by;
    this.update();
    return this;
};

// Returns a Transform object for mapping this onto Bounds @b2
// @flipY (optional) Flip y-axis coords, for converting to/from pixel coords
//
Bounds.prototype.getTransform = function(b2, flipY) {
    var t = new Transform();
    t.mx = b2.width() / this.width() || 1; // TODO: better handling of 0 w,h
    t.bx = b2.xmin - t.mx * this.xmin;
    if (flipY) {
        t.my = -b2.height() / this.height() || 1;
        t.by = b2.ymax - t.my * this.ymin;
    } else {
        t.my = b2.height() / this.height() || 1;
        t.by = b2.ymin - t.my * this.ymin;
    }
    return t;
};

Bounds.prototype.mergeCircle = function(x, y, r) {
    if (r < 0) r = -r;
    this.mergeBounds([x - r, y - r, x + r, y + r]);
};

Bounds.prototype.mergeBounds = function(bb) {
    var a, b, c, d;
    if (bb instanceof Bounds) {
        a = bb.xmin, b = bb.ymin, c = bb.xmax, d = bb.ymax;
    } else if (arguments.length == 4) {
        a = arguments[0];
        b = arguments[1];
        c = arguments[2];
        d = arguments[3];
    } else if (bb.length == 4) {
        // assume array: [xmin, ymin, xmax, ymax]
        a = bb[0], b = bb[1], c = bb[2], d = bb[3];
    } else {
        error("Bounds#mergeBounds() invalid argument:", bb);
    }

    if (this.xmin === void 0) {
        this.setBounds(a, b, c, d);
    } else {
        if (a < this.xmin) this.xmin = a;
        if (b < this.ymin) this.ymin = b;
        if (c > this.xmax) this.xmax = c;
        if (d > this.ymax) this.ymax = d;
    }
    return this;
};

Shpsys.clampIntervalByPct = function(z, pct) {
    if (pct <= 0) z = Infinity;
    else if (pct >= 1) z = 0;
    return z;
};

utils.findRankByValue = function(arr, value) {
    if (isNaN(value)) return arr.length;
    var rank = 1;
    for (var i=0, n=arr.length; i<n; i++) {
        if (value > arr[i]) rank++;
    }
    return rank;
};

utils.findValueByRank = function(arr, rank) {
    if (!arr.length || rank < 1 || rank > arr.length) error("[findValueByRank()] invalid input");

    rank = utils.clamp(rank | 0, 1, arr.length);
    var k = rank - 1, // conv. rank to array index
        n = arr.length,
        l = 0,
        m = n - 1,
        i, j, val, tmp;

    while (l < m) {
        val = arr[k];
        i = l;
        j = m;
        do {
            while (arr[i] < val) {i++;}
            while (val < arr[j]) {j--;}
            if (i <= j) {
                tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
                i++;
                j--;
            }
        } while (i <= j);
        if (j < k) l = i;
        if (k < i) m = j;
    }
    return arr[k];
};

utils.isFiniteNumber = function(val) {
    return val === 0 || !!val && val.constructor == Number && val !== Infinity && val !== -Infinity;
};

utils.pluck = function(arr, key) {
    return arr.map(function(obj) {
        return obj[key];
    });
};

utils.sum = function(arr, info) {
    if (!utils.isArrayLike(arr)) error ("utils.sum() expects an array, received:", arr);
    var tot = 0,
        nan = 0,
        val;
    for (var i=0, n=arr.length; i<n; i++) {
        val = arr[i];
        if (val) {
            tot += val;
        } else if (isNaN(val)) {
            nan++;
        }
    }
    if (info) {
        info.nan = nan;
    }
    return tot;
};

utils.lpad = function(str, size, pad) {
    pad = pad || ' ';
    str = String(str);
    return utils.repeatString(pad, size - str.length) + str;
};

utils.rpad = function(str, size, pad) {
    pad = pad || ' ';
    str = String(str);
    return str + Utils.repeatString(pad, size - str.length);
};

utils.find = function(arr, test, ctx) {
    var matches = arr.filter(test, ctx);
    return matches.length === 0 ? null : matches[0];
};