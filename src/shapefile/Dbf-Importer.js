/* @requires
dbf-reader
mapshaper-data-table
*/

var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

Shpsys.importDbfTable = function(buf, o) {
    var opts = o || {};
    return new ShapefileTable(buf, opts.encoding);
};

// Implements the DataTable api for DBF file data.
// We avoid touching the raw DBF field data if possible. This way, we don't need
// to parse the DBF at all in common cases, like importing a Shapefile, editing
// just the shapes and exporting in Shapefile format.
// TODO: consider accepting just the filename, so buffer doesn't consume memory needlessly.
//
function ShapefileTable(buf, encoding) {
    var reader = new DbfReader(buf, encoding),
        altered = false,
        table;

    function getTable() {
        if (!table) {
            // export DBF records on first table access
            table = new DataTable(reader.readRows());
            reader = null;
            buf = null; // null out references to DBF data for g.c.
        }
        return table;
    }

    this.exportAsDbf = function(encoding) {
        // export original dbf bytes if records haven't been touched.
        return reader && !altered ? reader.getBuffer() : getTable().exportAsDbf(encoding);
    };

    this.getRecordAt = function(i) {
        return reader ? reader.readRow(i) : table.getRecordAt(i);
    };

    this.deleteField = function(f) {
        if (table) {
            table.deleteField(f);
        } else {
            altered = true;
            reader.deleteField(f);
        }
    };

    this.getRecords = function() {
        return getTable().getRecords();
    };

    this.getFields = function() {
        return reader ? reader.getFields() : table.getFields();
    };

    this.size = function() {
        return reader ? reader.size() : table.size();
    };
}

var dataTableProto = {

    fieldExists: function(name) {
        return utils.contains(this.getFields(), name);
    },

    toString: function() {return JSON.stringify(this);},

    toJSON: function() {
        return this.getRecords();
    },

    addField: function(name, init) {
        var useFunction = utils.isFunction(init);
        if (!utils.isNumber(init) && !utils.isString(init) && !useFunction) {
            error("DataTable#addField() requires a string, number or function for initialization");
        }
        if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
        if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

        this.getRecords().forEach(function(obj, i) {
            obj[name] = useFunction ? init(obj, i) : init;
        });
    },

    addIdField: function() {
        this.addField('FID', function(obj, i) {
            return i;
        });
    },

    deleteField: function(f) {
        this.getRecords().forEach(function(o) {
            delete o[f];
        });
    },

    getFields: function() {
        var records = this.getRecords(),
            first = records[0];
        return first ? Object.keys(first) : [];
    },

    update: function(f) {
        var records = this.getRecords();
        for (var i=0, n=records.length; i<n; i++) {
            records[i] = f(records[i], i);
        }
    },

    clone: function() {
        // TODO: this could be sped up using a record constructor function
        // (see getRecordConstructor() in DbfReader)
        var records2 = this.getRecords().map(function(rec) {
            return utils.extend({}, rec);
        });
        return new DataTable(records2);
    },

    size: function() {
        return this.getRecords().length;
    }
};


utils.extend(ShapefileTable.prototype, dataTableProto);
