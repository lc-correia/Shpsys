BinArray.prototype = {
    size: function() {
        return this._buffer.byteLength;
    },

    littleEndian: function() {
        this._le = true;
        return this;
    },

    bigEndian: function() {
        this._le = false;
        return this;
    },

    buffer: function() {
        return this._buffer;
    },

    bytesLeft: function() {
        return this._buffer.byteLength - this._idx;
    },

    skipBytes: function(bytes) {
        this._idx += (bytes + 0);
        return this;
    },

    readUint8: function() {
        return this._bytes[this._idx++];
    },

    writeUint8: function(val) {
        this._bytes[this._idx++] = val;
        return this;
    },

    readInt8: function() {
        return this._view.getInt8(this._idx++);
    },

    writeInt8: function(val) {
        this._view.setInt8(this._idx++, val);
        return this;
    },

    readUint16: function() {
        var val = this._view.getUint16(this._idx, this._le);
        this._idx += 2;
        return val;
    },

    writeUint16: function(val) {
        this._view.setUint16(this._idx, val, this._le);
        this._idx += 2;
        return this;
    },

    readUint32: function() {
        var val = this._view.getUint32(this._idx, this._le);
        this._idx += 4;
        return val;
    },

    writeUint32: function(val) {
        this._view.setUint32(this._idx, val, this._le);
        this._idx += 4;
        return this;
    },

    readInt32: function() {
        var val = this._view.getInt32(this._idx, this._le);
        this._idx += 4;
        return val;
    },

    writeInt32: function(val) {
        this._view.setInt32(this._idx, val, this._le);
        this._idx += 4;
        return this;
    },

    readFloat64: function() {
        var val = this._view.getFloat64(this._idx, this._le);
        this._idx += 8;
        return val;
    },

    writeFloat64: function(val) {
        this._view.setFloat64(this._idx, val, this._le);
        this._idx += 8;
        return this;
    },

    // Returns a Float64Array containing @len doubles
    //
    readFloat64Array: function(len) {
        var bytes = len * 8,
            i = this._idx,
            buf = this._buffer,
            arr;
        // Inconsistent: first is a view, second a copy...
        if (i % 8 === 0) {
            arr = new Float64Array(buf, i, len);
        } else if (buf.slice) {
            arr = new Float64Array(buf.slice(i, i + bytes));
        } else { // ie10, etc
            var dest = new ArrayBuffer(bytes);
            BinArray.bufferCopy(dest, 0, buf, i, bytes);
            arr = new Float64Array(dest);
        }
        this._idx += bytes;
        return arr;
    },

    readUint32Array: function(len) {
        var arr = [];
        for (var i=0; i<len; i++) {
            arr.push(this.readUint32());
        }
        return arr;
    },

    peek: function(i) {
        return this._view.getUint8(i >= 0 ? i : this._idx);
    },

    position: function(i) {
        if (i != null) {
            this._idx = i;
            return this;
        }
        return this._idx;
    },

    readCString: function(fixedLen, asciiOnly) {
        var str = "",
            count = fixedLen >= 0 ? fixedLen : this.bytesLeft();
        while (count > 0) {
            var byteVal = this.readUint8();
            count--;
            if (byteVal == 0) {
                break;
            } else if (byteVal > 127 && asciiOnly) {
                str = null;
                break;
            }
            str += String.fromCharCode(byteVal);
        }

        if (fixedLen > 0 && count > 0) {
            this.skipBytes(count);
        }
        return str;
    },

    writeString: function(str, maxLen) {
        var bytesWritten = 0,
            charsToWrite = str.length,
            cval;
        if (maxLen) {
            charsToWrite = Math.min(charsToWrite, maxLen);
        }
        for (var i=0; i<charsToWrite; i++) {
            cval = str.charCodeAt(i);
            if (cval > 127) {
                trace("#writeCString() Unicode value beyond ascii range");
                cval = '?'.charCodeAt(0);
            }
            this.writeUint8(cval);
            bytesWritten++;
        }
        return bytesWritten;
    },

    writeCString: function(str, fixedLen) {
        var maxChars = fixedLen ? fixedLen - 1 : null,
            bytesWritten = this.writeString(str, maxChars);

        this.writeUint8(0); // terminator
        bytesWritten++;

        if (fixedLen) {
            while (bytesWritten < fixedLen) {
                this.writeUint8(0);
                bytesWritten++;
            }
        }
        return this;
    },

    writeBuffer: function(buf, bytes, startIdx) {
        this._idx += BinArray.bufferCopy(this._buffer, this._idx, buf, startIdx, bytes);
        return this;
    }
};

function BinArray(buf, le) {
    if (Shpsys.isNumber(buf)) {
        buf = new ArrayBuffer(buf);
    } else if (typeof Buffer == 'function' && buf instanceof Buffer) {
        // Since node 0.10, DataView constructor doesn't accept Buffers,
        //   so need to copy Buffer to ArrayBuffer
        buf = BinArray.toArrayBuffer(buf);
    }
    if (buf instanceof ArrayBuffer == false) {
        error("BinArray constructor takes an integer, ArrayBuffer or Buffer argument");
    }
    this._buffer = buf;
    this._bytes = new Uint8Array(buf);
    this._view = new DataView(buf);
    this._idx = 0;
    this._le = le !== false;
}

BinArray.toArrayBuffer = function(src) {
    var n = src.length,
        dest = new ArrayBuffer(n),
        view = new Uint8Array(dest);
    for (var i=0; i<n; i++) {
        view[i] = src[i];
    }
    return dest;
};

BinArray.bufferCopy = function(dest, destId, src, srcId, bytes) {
    srcId = srcId || 0;
    bytes = bytes || src.byteLength - srcId;
    if (dest.byteLength - destId < bytes)
        error("Buffer overflow; tried to write:", bytes);

    // When possible, copy buffer data in multi-byte chunks... Added this for faster copying of
    // shapefile data, which is aligned to 32 bits.
    var wordSize = Math.min(BinArray.uintSize(bytes), BinArray.uintSize(srcId),
        BinArray.uintSize(dest.byteLength), BinArray.uintSize(destId),
        BinArray.uintSize(src.byteLength));

    var srcArr = BinArray.bufferToUintArray(src, wordSize),
        destArr = BinArray.bufferToUintArray(dest, wordSize),
        count = bytes / wordSize,
        i = srcId / wordSize,
        j = destId / wordSize;

    while (count--) {
        destArr[j++] = srcArr[i++];
    }
    return bytes;
};

BinArray.bufferToUintArray = function(buf, wordLen) {
    if (wordLen == 4) return new Uint32Array(buf);
    if (wordLen == 2) return new Uint16Array(buf);
    if (wordLen == 1) return new Uint8Array(buf);
    error("BinArray.bufferToUintArray() invalid word length:", wordLen)
};

BinArray.uintSize = function(i) {
    return i & 1 || i & 2 || 4;
};

function ShpReader(src) {
    if (this instanceof ShpReader === false) {
        return new ShpReader(src);
    }

    var file = utils.isString(src) ? new FileReader(src) : new BufferReader(src);
    var header = parseHeader(file.readToBinArray(0, 100));
    var fileSize = file.size();
    var RecordClass = new ShpRecordClass(header.type);
    var recordOffs, i, skippedBytes;

    reset();

    this.header = function() {
        return header;
    };

    // Callback interface: for each record in a .shp file, pass a
    //   record object to a callback function
    //
    this.forEachShape = function(callback) {
        var shape = this.nextShape();
        while (shape) {
            callback(shape);
            shape = this.nextShape();
        }
    };

    // Iterator interface for reading shape records
    this.nextShape = function() {
        var shape = readShapeAtOffset(recordOffs, i),
            offs2, skipped;
        if (!shape && recordOffs + 12 <= fileSize) {
            // Very rarely, in-the-wild .shp files may contain junk bytes between
            // records; it may be possible to scan past the junk to find the next record.
            // TODO: Probably better to use the .shx file to index records, rather
            // than trying to read consecutive records from the .shp file.
            shape = huntForNextShape(recordOffs + 4, i);
        }
        if (shape) {
            recordOffs += shape.byteLength;
            if (shape.id < i) {
                // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
                message("Shapefile record " + shape.id + " appears more than once -- possible file corruption.");
                return this.nextShape();
            }
            i++;
        } else {
            if (skippedBytes > 0) {
                // Encountered in ne_10m_railroads.shp from natural earth v2.0.0
                message("Skipped " + skippedBytes + " bytes in .shp file -- possible data loss.");
            }
            file.close();
            reset();
        }
        return shape;
    };

    function reset() {
        recordOffs = 100;
        skippedBytes = 0;
        i = 1; // Shapefile id of first record
    }

    function parseHeader(bin) {
        var header = {
            signature: bin.bigEndian().readUint32(),
            byteLength: bin.skipBytes(20).readUint32() * 2,
            version: bin.littleEndian().readUint32(),
            type: bin.readUint32(),
            bounds: bin.readFloat64Array(4), // xmin, ymin, xmax, ymax
            zbounds: bin.readFloat64Array(2),
            mbounds: bin.readFloat64Array(2)
        };

        if (header.signature != 9994) {
            error("Not a valid .shp file");
        }

        if (!Shpsys.isSupportedShapefileType(header.type)) {
            error("Unsupported .shp type:", header.type);
        }

        if (header.byteLength != file.size()) {
            error("File size of .shp doesn't match size in header");
        }

        return header;
    }

    function readShapeAtOffset(recordOffs, i) {
        var shape = null,
            recordSize, recordType, recordId, goodId, goodSize, goodType, bin;

        if (recordOffs + 12 <= fileSize) {
            bin = file.readToBinArray(recordOffs, 12);
            recordId = bin.bigEndian().readUint32();
            // record size is bytes in content section + 8 header bytes
            recordSize = bin.readUint32() * 2 + 8;
            recordType = bin.littleEndian().readUint32();
            goodId = recordId == i; // not checking id ...
            goodSize = recordOffs + recordSize <= fileSize && recordSize >= 12;
            goodType = recordType === 0 || recordType == header.type;
            if (goodSize && goodType) {
                bin = file.readToBinArray(recordOffs, recordSize);
                shape = new RecordClass(bin, recordSize);
            }
        }
        return shape;
    }

    // TODO: add tests
    // Try to scan past unreadable content to find next record
    function huntForNextShape(start, id) {
        var offset = start,
            shape = null,
            bin, recordId, recordType, count;
        while (offset + 12 <= fileSize) {
            bin = file.readToBinArray(offset, 12);
            recordId = bin.bigEndian().readUint32();
            recordType = bin.littleEndian().skipBytes(4).readUint32();
            if (recordId == id && (recordType == header.type || recordType === 0)) {
                // we have a likely position, but may still be unparsable
                shape = readShapeAtOffset(offset, id);
                break;
            }
            offset += 4; // try next integer position
        }
        count = shape ? offset - start : fileSize - start;
        debug('Skipped', count, 'bytes', shape ? 'before record ' + id : 'at the end of the file');
        skippedBytes += count;
        return shape;
    }
}

ShpReader.prototype.type = function() {
    return this.header().type;
};

ShpReader.prototype.getCounts = function() {
    var counts = {
        nullCount: 0,
        partCount: 0,
        shapeCount: 0,
        pointCount: 0
    };
    this.forEachShape(function(shp) {
        if (shp.isNull) counts.nullCount++;
        counts.pointCount += shp.pointCount;
        counts.partCount += shp.partCount;
        counts.shapeCount++;
    });
    return counts;
};
