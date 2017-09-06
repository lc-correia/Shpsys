var Shpsys = {
    VERSION: '0.0.1',
    LOGGING: false,
    context: createContext()
};

var api = {};
var cli = {};

var utils = {

    isString: function(obj) {
        return obj != null && obj.toString === String.prototype.toString;
    },

    isFunction: function(obj) {
        return typeof obj == 'function';
    },

    isObject: function(obj) {
        return obj === Object(obj); // via underscore
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

    toArray: function(obj) {
        var arr;
        if (!utils.isArrayLike(obj)) error("Utils.toArray() requires an array-like object");
        try {
            arr = Array.prototype.slice.call(obj, 0); // breaks in ie8
        } catch(e) {
            // support ie8
            arr = [];
            for (var i=0, n=obj.length; i<n; i++) {
                arr[i] = obj[i];
            }
        }
        return arr;
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

var T = {
    stack: [],
    verbose: true,

    start: function(msg) {
        if (T.verbose && msg) verbose(T.prefix() + msg);
        T.stack.push(+new Date);
    },

    // Stop timing, print a message if T.verbose == true
    stop: function(note) {
        var startTime = T.stack.pop();
        var elapsed = (+new Date - startTime);
        if (T.verbose) {
            var msg =  T.prefix() + elapsed + 'ms';
            if (note) {
                msg += " " + note;
            }
            verbose(msg);
        }
        return elapsed;
    },

    prefix: function() {
        var str = "- ",
            level = this.stack.length;
        while (level--) str = "-" + str;
        return str;
    }
};

api.enableLogging = function() {
    Shpsys.LOGGING = true;
    return api;
};

api.runCommands = function(argv, done) {
    var commands;
    try {
        commands = Shpsys.parseCommands(argv);
    } catch(e) {
        return done(e);
    }
    Shpsys.runParsedCommands(commands, null, function(err, catalog) {
        done(err);
    });
};

api.runCommand = function(cmd, catalog, cb) {
    var name = cmd.name,
        opts = cmd.options,
        source,
        outputLayers,
        outputFiles,
        targets,
        targetDataset,
        targetLayers,
        arcs;

    try { // catch errors from synchronous functions

        T.start();
        if (!catalog) catalog = new Catalog();

        if (name == 'rename-layers') {
            // default target is all layers
            targets = catalog.findCommandTargets(opts.target || '*');
            targetLayers = targets.reduce(function(memo, obj) {
                return memo.concat(obj.layers);
            }, []);

        } else if (name == 'o') {
            // when combining GeoJSON layers, default is all layers
            // TODO: check that combine_layers is only used w/ GeoJSON output
            targets = catalog.findCommandTargets(opts.target || opts.combine_layers && '*');
        } else if (name == 'proj') {
            // accepts multiple target datasets
            targets = catalog.findCommandTargets(opts.target);
        } else {
            targets = catalog.findCommandTargets(opts.target);
            if (targets.length == 1) {
                targetDataset = targets[0].dataset;
                arcs = targetDataset.arcs;
                targetLayers = targets[0].layers;
                // target= option sets default target
                catalog.setDefaultTarget(targetLayers, targetDataset);

            } else if (targets.length > 1) {
                stop("Targetting multiple datasets is not supported");
            }
        }

        if (targets.length === 0) {
            if (opts.target) {
                stop(utils.format('Missing target: %s\nAvailable layers: %s',
                    opts.target, Shpsys.getFormattedLayerList(catalog)));
            }
            if (!(name == 'help' || name == 'graticule' || name == 'i' || name == 'point-grid' || name == 'shape' || name == 'rectangle' || name == 'polygon-grid')) {
                throw new UserError("Missing a -i command");
            }
        }

        if (opts.source) {
            source = Shpsys.findCommandSource(opts.source, catalog, opts);
        }

        if (name == 'affine') {
            api.affine(targetLayers, targetDataset, opts);

        } else if (name == 'data-fill') {
            Shpsys.applyCommand(api.dataFill, targetLayers, arcs, opts);

        } else if (name == 'cluster') {
            Shpsys.applyCommand(api.cluster, targetLayers, arcs, opts);

        } else if (name == 'calc') {
            Shpsys.applyCommand(api.calc, targetLayers, arcs, opts);

        } else if (name == 'clean') {
            api.cleanLayers(targetLayers, targetDataset, opts);

        } else if (name == 'clean2') {
            outputLayers = api.clean2(targetLayers, targetDataset, opts);

        } else if (name == 'clip') {
            outputLayers = api.clipLayers(targetLayers, source, targetDataset, opts);

        } else if (name == 'colorizer') {
            outputLayers = api.colorizer(opts);

        } else if (name == 'dissolve') {
            outputLayers = internal.applyCommand(api.dissolve, targetLayers, arcs, opts);

        } else if (name == 'dissolve2') {
            outputLayers = api.dissolve2(targetLayers, targetDataset, opts);

        } else if (name == 'each') {
            Shpsys.applyCommand(api.evaluateEachFeature, targetLayers, arcs, opts.expression, opts);

        } else if (name == 'erase') {
            outputLayers = api.eraseLayers(targetLayers, source, targetDataset, opts);

        } else if (name == 'explode') {
            outputLayers = Shpsys.applyCommand(api.explodeFeatures, targetLayers, arcs, opts);

        } else if (name == 'filter') {
            outputLayers = Shpsys.applyCommand(api.filterFeatures, targetLayers, arcs, opts);

        } else if (name == 'filter-fields') {
            Shpsys.applyCommand(api.filterFields, targetLayers, opts.fields);

        } else if (name == 'filter-islands') {
            Shpsys.applyCommand(api.filterIslands, targetLayers, arcs, opts);

        } else if (name == 'filter-slivers') {
            Shpsys.applyCommand(api.filterSlivers, targetLayers, arcs, opts);

        } else if (name == 'graticule') {
            catalog.addDataset(api.graticule(targetDataset, opts));

        } else if (name == 'help') {
            Shpsys.getOptionParser().printHelp(opts.command);

        } else if (name == 'i') {
            if (opts.replace) catalog = new Catalog();
            targetDataset = api.importFiles(cmd.options);
            if (targetDataset) {
                catalog.addDataset(targetDataset);
                outputLayers = targetDataset.layers; // kludge to allow layer naming below
            }

        } else if (name == 'info') {
            Shpsys.printInfo(catalog.getLayers());

        } else if (name == 'inspect') {
            Shpsys.applyCommand(api.inspect, targetLayers, arcs, opts);

        } else if (name == 'innerlines') {
            outputLayers = Shpsys.applyCommand(api.innerlines, targetLayers, arcs, opts);

        } else if (name == 'join') {
            Shpsys.applyCommand(api.join, targetLayers, targetDataset, source, opts);

        } else if (name == 'lines') {
            outputLayers = Shpsys.applyCommand(api.lines, targetLayers, arcs, opts);

        } else if (name == 'merge-layers') {
            // careful, returned layers are modified input layers
            if (!opts.target) {
                targetLayers = targetDataset.layers; // kludge
            }
            outputLayers = api.mergeLayers(targetLayers);

        } else if (name == 'o') {
            outputFiles = Shpsys.exportTargetLayers(targets, opts);
            if (opts.final) {
                // don't propagate data if output is final
                catalog = null;
            }
            return Shpsys.writeFiles(outputFiles, opts, done);

        } else if (name == 'point-grid') {
            outputLayers = [api.pointGrid(targetDataset, opts)];
            if (!targetDataset) {
                catalog.addDataset({layers: outputLayers});
            }

        } else if (name == 'polygon-grid') {
            catalog.addDataset(api.polygonGrid(targetDataset, opts));

        } else if (name == 'points') {
            outputLayers = Shpsys.applyCommand(api.createPointLayer, targetLayers, arcs, opts);

        } else if (name == 'polygons') {
            outputLayers = api.polygons(targetLayers, targetDataset, opts);

        } else if (name == 'proj') {
            Shpsys.initProjLibrary(opts, function() {
                var err = null;
                try {
                    targets.forEach(function(targ) {
                        var srcInfo, destInfo;
                        if (opts.from) {
                            srcInfo = Shpsys.getProjectionInfo(opts.from, catalog);
                            if (!srcInfo.crs) stop("Unknown projection source:", opts.from);
                            Shpsys.setDatasetProjection(targ.dataset, srcInfo);
                        }
                        if (opts.match || opts.projection) {
                            destInfo = Shpsys.getProjectionInfo(opts.match || opts.projection, catalog);
                            api.proj(targ.dataset, destInfo, opts);
                        }
                    });
                } catch(e) {
                    err = e;
                }
                done(err);
            });
            return; // async command

        } else if (name == 'rectangle') {
            catalog.addDataset(api.rectangle(source, opts));

        } else if (name == 'rename-fields') {
            Shpsys.applyCommand(api.renameFields, targetLayers, opts.fields);

        } else if (name == 'rename-layers') {
            api.renameLayers(targetLayers, opts.names);

        } else if (name == 'shape') {
            catalog.addDataset(api.shape(opts));

        } else if (name == 'simplify') {
            api.simplify(targetDataset, opts);

        } else if (name == 'slice') {
            outputLayers = api.sliceLayers(targetLayers, source, targetDataset, opts);

        } else if (name == 'sort') {
            Shpsys.applyCommand(api.sortFeatures, targetLayers, arcs, opts);

        } else if (name == 'split') {
            outputLayers = Shpsys.applyCommand(api.splitLayer, targetLayers, opts.field, opts);

        } else if (name == 'split-on-grid') {
            outputLayers = Shpsys.applyCommand(api.splitLayerOnGrid, targetLayers, arcs, opts);

        } else if (name == 'stitch') {
            api.stitch(targetDataset);

        } else if (name == 'subdivide') {
            outputLayers = Shpsys.applyCommand(api.subdivideLayer, targetLayers, arcs, opts.expression);

        } else if (name == 'svg-style') {
            Shpsys.applyCommand(api.svgStyle, targetLayers, targetDataset, opts);

        } else if (name == 'uniq') {
            Shpsys.applyCommand(api.uniq, targetLayers, arcs, opts);

        } else if (name == 'target') {
            Shpsys.target(catalog, opts);

        } else {
            error("Unhandled command: [" + name + "]");
        }

        // apply name parameter
        if (('name' in opts) && outputLayers) {
            // TODO: consider uniqifying multiple layers here
            outputLayers.forEach(function(lyr) {
                lyr.name = opts.name;
            });
        }

        // delete arcs if no longer needed (e.g. after -points command)
        if (targetDataset) {
            Shpsys.cleanupArcs(targetDataset);
        }

        // integrate output layers into the target dataset
        if (outputLayers && targetDataset && outputLayers != targetDataset.layers) {
            if (opts.no_replace) {
                targetDataset.layers = targetDataset.layers.concat(outputLayers);
            } else {
                // TODO: consider replacing old layers as they are generated, for gc
                Shpsys.replaceLayers(targetDataset, targetLayers, outputLayers);
            }
            // use command output as new default target
            catalog.setDefaultTarget(outputLayers, targetDataset);
        }
    } catch(e) {
        return done(e);
    }

    done(null);

    function done(err) {
        T.stop('-' + name);
        cb(err, err ? null : catalog);
    }
};

Shpsys.setStateVar = function(key, val) {
    Shpsys.context[key] = val;
};

Shpsys.runParsedCommands = function(commands, catalog, cb) {
    if (!catalog) {
        cb = createAsyncContext(cb); // use new context when creating new catalog
        catalog = new Catalog();
    } else if (catalog instanceof Catalog === false) {
        error("Changed in v0.4: runParsedCommands() takes a Catalog object");
    }

    if (!utils.isFunction(done)) {
        error("Missing a callback function");
    }

    if (!utils.isArray(commands)) {
        error("Expected an array of parsed commands");
    }

    if (commands.length === 0) {
        return done(new UserError("No commands to run"));
    }
    commands = Shpsys.runAndRemoveInfoCommands(commands);
    if (commands.length === 0) {
        return done(null);
    }
    commands = Shpsys.divideImportCommand(commands);
    utils.reduceAsync(commands, catalog, nextCommand, done);

    function nextCommand(catalog, cmd, next) {
        Shpsys.setStateVar('current_command', cmd.name); // for log msgs
        api.runCommand(cmd, catalog, next);
    }

    function done(err, catalog) {
        cb(err, catalog);
        Shpsys.setStateVar('current_command', null);
    }
};

utils.reduceAsync = function(arr, memo, iter, done) {
    var call = typeof setImmediate == 'undefined' ? setTimeout : setImmediate;
    var i=0;
    next(null, memo);

    function next(err, memo) {
        // Detach next operation from call stack to prevent overflow
        // Don't use setTimeout(, 0) if setImmediate is available
        // (setTimeout() can introduce a long delay if previous operation was slow,
        //    as of Node 0.10.32 -- a bug?)
        if (err) {
            return done(err, null);
        }
        call(function() {
            if (i < arr.length === false) {
                done(null, memo);
            } else {
                iter(memo, arr[i++], next);
            }
        }, 0);
    }
};

function Catalog() {
    var datasets = [],
        target;

    this.forEachLayer = function(cb) {
        var i = 0;
        datasets.forEach(function(dataset) {
            dataset.layers.forEach(function(lyr) {
                cb(lyr, dataset, i++);
            });
        });
    };

    // remove a layer from a dataset
    this.deleteLayer = function(lyr, dataset) {
        var targ = this.getDefaultTarget(),
            other;

        // remove layer from its dataset
        dataset.layers.splice(dataset.layers.indexOf(lyr), 1);

        if (dataset.layers.length === 0) {
            this.removeDataset(dataset);
        }

        if (this.isEmpty()) {
            target = null;
        } else if (targ.layers[0] == lyr) {
            // deleting first target layer (selected in gui) -- switch to some other layer
            other = this.findAnotherLayer(lyr);
            this.setDefaultTarget([other.layer], other.dataset);
        } else if (targ.layers.indexOf(lyr) > -1) {
            // deleted layer is targeted -- update target
            targ.layers.splice(targ.layers.indexOf(lyr), 1);
            this.setDefaultTarget(targ.layers, targ.dataset);
        } else {
            // deleted layer is not a targeted layer, target not updated
        }
    };

    this.findLayer = function(target) {
        var found = null;
        this.forEachLayer(function(lyr, dataset) {
            if (lyr == target) {
                found = layerObject(lyr, dataset);
            }
        });
        return found;
    };

    this.findCommandTargets = function(pattern, type) {
        if (pattern) {
            return internal.findCommandTargets(this, pattern, type);
        }
        return target ? [target] : [];
    };

    this.removeDataset = function(dataset) {
        if (target && target.dataset == dataset) {
            target = null;
        }
        datasets = datasets.filter(function(d) {
            return d != dataset;
        });
    };

    this.getDatasets = function() {
        return datasets;
    };

    this.getLayers = function() {
        var layers = [];
        this.forEachLayer(function(lyr, dataset) {
            layers.push(layerObject(lyr, dataset));
        });
        return layers;
    };

    this.addDataset = function(dataset) {
        this.setDefaultTarget(dataset.layers, dataset);
        return this;
    };

    this.findNextLayer = function(lyr) {
        var layers = this.getLayers(),
            idx = indexOfLayer(lyr, layers);
        return idx > -1 ? layers[(idx + 1) % layers.length] : null;
    };

    this.findPrevLayer = function(lyr) {
        var layers = this.getLayers(),
            idx = indexOfLayer(lyr, layers);
        return idx > -1 ? layers[(idx - 1 + layers.length) % layers.length] : null;
    };

    this.findAnotherLayer = function(target) {
        var layers = this.getLayers(),
            found = null;
        if (layers.length > 0) {
            found = layers[0].layer == target ? layers[1] : layers[0];
        }
        return found;
    };

    this.isEmpty = function() {
        return datasets.length === 0;
    };

    this.getDefaultTarget = function() {return target || null;};

    this.setDefaultTarget = function(layers, dataset) {
        if (datasets.indexOf(dataset) == -1) {
            datasets.push(dataset);
        }
        target = {
            layers: layers,
            dataset: dataset
        };
    };

    // should be in mapshaper-gui-model.js, moved here for testing
    this.getActiveLayer = function() {
        var targ = this.getDefaultTarget();
        return targ ? {layer: targ.layers[0], dataset: targ.dataset} : null;
    };

    function layerObject(lyr, dataset) {
        return {
            layer: lyr,
            dataset: dataset
        };
    }

    function indexOfLayer(lyr, layers) {
        var idx = -1;
        layers.forEach(function(o, i) {
            if (o.layer == lyr) idx = i;
        });
        return idx;
    }
}

Shpsys.divideImportCommand = function(commands) {
    var firstCmd = commands[0],
        lastCmd = commands[commands.length-1],
        opts = firstCmd.options;

    if (lastCmd.name == 'o') {
        // final output -- ok to modify dataset in-place during export, avoids
        //   having to copy entire dataset
        lastCmd.options.final = true;
    }

    if (firstCmd.name != 'i' || opts.stdin || opts.merge_files ||
        opts.combine_files || !opts.files || opts.files.length < 2) {
        return commands;
    }

    return (opts.files).reduce(function(memo, file) {
        var importCmd = {
            name: 'i',
            options: utils.defaults({
                files:[file],
                replace: true  // kludge to replace data catalog
            }, opts)
        };
        memo.push(importCmd);
        memo.push.apply(memo, commands.slice(1));
        return memo;
    }, []);
};

Shpsys.runAndRemoveInfoCommands = function(commands) {
    return commands.filter(function(cmd) {
        if (cmd.name == 'version') {
            message(Shpsys.VERSION);
        } else if (cmd.name == 'encodings') {
            Shpsys.printEncodings();
        } else if (cmd.name == 'projections') {
            Shpsys.printProjections();
        } else if (cmd.name == 'verbose') {
            Shpsys.setStateVar('VERBOSE', true);
        } else if (cmd.name == 'quiet') {
            Shpsys.setStateVar('QUIET', true);
        } else if (cmd.name == 'debug') {
            Shpsys.setStateVar('DEBUG', true);
        } else {
            return true;
        }
        return false;
    });
};

function createAsyncContext(cb) {
    Shpsys.context = createContext();
    return function() {
        cb.apply(null, utils.toArray(arguments));
        // clear context after cb(), so output/errors can be handled in current context
        Shpsys.context = createContext();
    };
}

api.printError = function(err) {
    var msg;
    if (utils.isString(err)) {
        err = new UserError(err);
    }
    if (Shpsys.LOGGING && err.name == 'UserError') {
        msg = err.message;
        if (!/Error/.test(msg)) {
            msg = "Error: " + msg;
        }
        console.error(messageArgs([msg]).join(' '));
        Shpsys.message("Run mapshaper -h to view help");
    } else {
        // not a user error or logging is disabled -- throw it
        throw err;
    }
};

function UserError(msg) {
    var err = new Error(msg);
    err.name = 'UserError';
    return err;
}

Shpsys.parseCommands = function(tokens) {
    if (Array.isArray(tokens) && utils.isObject(tokens[0])) {
        // argv seems to contain parsed commands already... make a copy
        return tokens.map(function(cmd) {
            return {name: cmd.name, options: utils.extend({}, cmd.options)};
        });
    }
    if (utils.isString(tokens)) {
        tokens = Shpsys.splitShellTokens(tokens);
    }
    return Shpsys.getOptionParser().parseArgv(tokens);
};

Shpsys.splitShellTokens = function(str) {
    return Shpsys.splitTokens(str, '\\s');
};

Shpsys.splitTokens = function(str, delimChars) {
    var BAREWORD = '([^' + delimChars + '\'"])+'; // TODO: make safer
    var SINGLE_QUOTE = '"((\\\\"|[^"])*?)"';
    var DOUBLE_QUOTE = '\'((\\\\\'|[^\'])*?)\'';
    var rxp = new RegExp('(' + BAREWORD + '|' + SINGLE_QUOTE + '|' + DOUBLE_QUOTE + ')*', 'g');
    var matches = str.match(rxp) || [];
    var chunks = matches.filter(function(chunk) {
        // single backslashes may be present in multiline commands pasted from a makefile, e.g.
        return !!chunk && chunk != '\\';
    }).map(utils.trimQuotes);
    return chunks;
};

utils.trimQuotes = function(raw) {
    var len = raw.length, first, last;
    if (len >= 2) {
        first = raw.charAt(0);
        last = raw.charAt(len-1);
        if (first == '"' && last == '"' || first == "'" && last == "'") {
            return raw.substr(1, len-2);
        }
    }
    return raw;
};


Shpsys.getOptionParser = function() {
    // definitions of options shared by more than one command
    var targetOpt = {
            describe: "layer(s) to target (comma-sep. list)"
        },
        nameOpt = {
            describe: "rename the edited layer(s)"
        },
        noReplaceOpt = {
            alias: "+",
            type: 'flag',
            describe: "retain the original layer(s) instead of replacing"
        },
        noSnapOpt = {
            // describe: "don't snap points before applying command"
            type: 'flag'
        },
        encodingOpt = {
            describe: "text encoding (applies to .dbf and delimited text files)"
        },
        autoSnapOpt = {
            alias: "snap",
            describe: "snap nearly identical points to fix minor topology errors",
            type: "flag"
        },
        snapIntervalOpt = {
            describe: "specify snapping distance in source units",
            type: "number"
        },
        sumFieldsOpt = {
            describe: "fields to sum when dissolving  (comma-sep. list)",
            type: "strings"
        },
        copyFieldsOpt = {
            describe: "fields to copy when dissolving (comma-sep. list)",
            type: "strings"
        },
        dissolveFieldOpt = {
            describe: "(optional) name of a data field to dissolve on"
        },
        fieldTypesOpt = {
            describe: "type hints for csv source files, e.g. FIPS:str,STATE_FIPS:str",
            type: "strings"
        },
        stringFieldsOpt = {
            describe: "csv field(s) to import as strings, e.g. FIPS,ZIPCODE",
            type: "strings"
        },
        bboxOpt = {
            type: "bbox",
            describe: "comma-sep. bounding box: xmin,ymin,xmax,ymax"
        },
        whereOpt = {
            describe: "use a JS expression to select a subset of features"
        };

    var parser = new CommandParser();
    parser.usage("Usage:  mapshaper -<command> [options] ...");

    /*
    parser.example("Fix minor topology errors, simplify to 10%, convert to GeoJSON\n" +
        "$ mapshaper states.shp auto-snap -simplify 10% -o format=geojson");

    parser.example("Aggregate census tracts to counties\n" +
        "$ mapshaper tracts.shp -each \"CTY_FIPS=FIPS.substr(0, 5)\" -dissolve CTY_FIPS");
    */

    parser.note("Enter mapshaper -help <command> to view options for a single command");

    parser.section("I/O commands");

    parser.default('i');

    parser.command('i')
        .describe("input one or more files")
        .validate(validateInputOpts)
        .flag("multi_arg")
        .option("files", {
            label: "<files>",
            describe: "files to import (separated by spaces), or - to use stdin"
        })
        .option("merge-files", {
            describe: "merge features from compatible files into the same layer",
            type: "flag"
        })
        .option("combine-files", {
            describe: "import files to separate layers with shared topology",
            type: "flag"
        })
        .option("no-topology", {
            describe: "treat each shape as topologically independent",
            type: "flag"
        })
        .option("precision", {
            describe: "coordinate precision in source units, e.g. 0.001",
            type: "number"
        })
        .option("auto-snap", autoSnapOpt)
        .option("snap-interval", snapIntervalOpt)
        .option("encoding", encodingOpt)
        /*
        .option("fields", {
          describe: "attribute fields to import (comma-sep.) (default is all fields)",
          type: "strings"
        }) */
        .option("id-field", {
            describe: "import Topo/GeoJSON id property to this field"
        })
        .option("string-fields", stringFieldsOpt)
        .option("field-types", fieldTypesOpt)
        .option("name", {
            describe: "Rename the imported layer(s)"
        });

    parser.command('o')
        .describe("output edited content")
        .validate(validateOutputOpts)
        .option('_', {
            label: "<file|directory>",
            describe: "(optional) name of output file or directory, - for stdout"
        })
        .option("format", {
            describe: "options: shapefile,geojson,topojson,json,dbf,csv,tsv,svg"
        })
        .option("target", targetOpt)
        .option("force", {
            describe: "allow overwriting input files",
            type: "flag"
        })
        .option("dry-run", {
            // describe: "do not output any files"
            type: "flag"
        })
        .option("encoding", {
            describe: "text encoding of output dbf file"
        })
        .option("ldid", {
            // describe: "language driver id of dbf file",
            type: "number"
        })
        .option("bbox-index", {
            describe: "export a .json file with bbox of each layer",
            type: 'flag'
        })
        .option("cut-table", {
            describe: "detach data attributes from shapes and save as a JSON file",
            type: "flag"
        })
        .option("drop-table", {
            describe: "remove data attributes from output",
            type: "flag"
        })
        .option("precision", {
            describe: "coordinate precision in source units, e.g. 0.001",
            type: "number"
        })
        .option("id-field", {
            describe: "(Topo/GeoJSON/SVG) field to use for id property",
            type: "strings"
        })
        .option("bbox", {
            type: "flag",
            describe: "(Topo/GeoJSON) add bbox property"
        })
        .option("extension", {
            describe: "(Topo/GeoJSON) set file extension (default is \".json\")"
        })
        .option("prettify", {
            type: "flag",
            describe: "(Topo/GeoJSON) format output for readability"
        })
        .option("singles", {
            // describe: "(TopoJSON) save each layer as a single file",
            type: "flag"
        })
        .option("quantization", {
            describe: "(TopoJSON) specify quantization (auto-set by default)",
            type: "integer"
        })
        .option("no-quantization", {
            describe: "(TopoJSON) export coordinates without quantization",
            type: "flag"
        })
        .option("no-point-quantization", {
            // describe: "(TopoJSON) export point coordinates without quantization",
            type: "flag"
        })
        .option('presimplify', {
            describe: "(TopoJSON) add per-vertex data for dynamic simplification",
            type: "flag"
        })
        .option("topojson-precision", {
            // describe: "pct of avg segment length for rounding (0.02 is default)",
            type: "number"
        })
        .option("rfc7946", {
            describe: "(GeoJSON) follow RFC 7946 (CCW outer ring order, etc.)",
            type: "flag"
        })
        .option("combine-layers", {
            describe: "(GeoJSON) output layers as a single file",
            type: "flag"
        })
        .option("geojson-type", {
            describe: "(GeoJSON) FeatureCollection, GeometryCollection or Feature"
        })
        .option("width", {
            describe: "(SVG/TopoJSON) pixel width of output (SVG default is 800)",
            type: "number"
        })
        .option("margin", {
            describe: "(SVG/TopoJSON) space betw. data and viewport (default is 1)"
        })
        .option("svg-scale", {
            describe: "(SVG) source units per pixel (alternative to width= option)",
            type: "number"
        })
        .option("point-symbol", {
            describe: "(SVG) circle or square (default is circle)"
        })
        .option("delimiter", {
            describe: "(CSV) field delimiter"
        })
        .option("final", {
            type: "flag" // for testing
        });

    parser.section("\nEditing commands");

    parser.command("clip")
        .describe("use a polygon layer to clip another layer")
        .example("$ mapshaper states.shp -clip land_area.shp -o clipped.shp")
        .validate(validateClipOpts)
        .default("source")
        .option("source", {
            describe: "file or layer containing clip polygons"
        })
        .option('remove-slivers', {
            describe: "remove sliver polygons created by clipping",
            type: 'flag'
        })
        .option("cleanup", {type: 'flag'}) // obsolete; renamed in validation func.
        .option("bbox", bboxOpt)
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("no-snap", noSnapOpt)
        .option("target", targetOpt);

    parser.command("dissolve")
        .describe("merge features within a layer")
        .example("Dissolve all polygons in a feature layer into a single polygon\n" +
            "$ mapshaper states.shp -dissolve -o country.shp")
        .example("Generate state-level polygons by dissolving a layer of counties\n" +
            "(STATE_FIPS, POPULATION and STATE_NAME are attribute field names)\n" +
            "$ mapshaper counties.shp -dissolve STATE_FIPS copy-fields=STATE_NAME sum-fields=POPULATION -o states.shp")
        .default("field")
        .option("field", dissolveFieldOpt)
        .option("calc", {
            describe: "use a JS expression to aggregate data values"
        })
        .option("sum-fields", sumFieldsOpt)
        .option("copy-fields", copyFieldsOpt)
        .option("weight", {
            describe: "[points] field or expression to use for weighting centroid"
        })
        .option("planar", {
            type: 'flag',
            describe: "[points] use 2D math to find centroids of latlong points"
        })
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("dissolve2")
        .describe("merge adjacent and overlapping polygons")
        .default("field")
        .option("field", dissolveFieldOpt)
        .option("calc", {
            describe: "use a JS expression to aggregate data values"
        })
        .option("sum-fields", sumFieldsOpt)
        .option("copy-fields", copyFieldsOpt)
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("no-snap", noSnapOpt)
        .option("target", targetOpt);

    parser.command("each")
        .describe("create/update/delete data fields using a JS expression")
        .example("Add two calculated data fields to a layer of U.S. counties\n" +
            "$ mapshaper counties.shp -each 'STATE_FIPS=CNTY_FIPS.substr(0, 2), AREA=$.area'")
        .default("expression")
        .option("expression", {
            describe: "JS expression to apply to each target feature"
        })
        .option("where", whereOpt)
        .option("target", targetOpt);

    parser.command("erase")
        .describe("use a polygon layer to erase another layer")
        .example("$ mapshaper land_areas.shp -erase water_bodies.shp -o erased.shp")
        .validate(validateClipOpts)
        .default("source")
        .option("source", {
            describe: "file or layer containing erase polygons"
        })
        .option('remove-slivers', {
            describe: "remove sliver polygons created by erasing",
            type: 'flag'
        })
        .option("cleanup", {type: 'flag'})
        .option("bbox", bboxOpt)
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("no-snap", noSnapOpt)
        .option("target", targetOpt);

    parser.command("explode")
        .describe("divide multi-part features into single-part features")
        .option("naive", {type: "flag"}) // testing
        .option("target", targetOpt);

    parser.command("filter")
        .describe("delete features using a JS expression")
        .default("expression")
        .option("expression", {
            describe: "delete features that evaluate to false"
        })
        .option("remove-empty", {
            type: "flag",
            describe: "delete features with null geometry"
        })
        .option("keep-shapes", {
            type: "flag"
        })
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("filter-fields")
        .describe('retain a subset of data fields')
        .default('fields')
        .option("fields", {
            type: "strings",
            describe: "fields to retain (comma-sep.), e.g. 'fips,name'"
        })
        .option("target", targetOpt);

    parser.command("filter-islands")
        .describe("remove small detached polygon rings (islands)")
        .option("min-area", {
            type: "number",
            describe: "remove small-area islands (sq meters or projected units)"
        })
        .option("min-vertices", {
            type: "integer",
            describe: "remove low-vertex-count islands"
        })
        .option("remove-empty", {
            type: "flag",
            describe: "delete features with null geometry"
        })
        .option("target", targetOpt);

    parser.command("filter-slivers")
        .describe("remove small polygon rings")
        .option("min-area", {
            type: "number",
            describe: "remove small-area rings (sq meters or projected units)"
        })
        /*
        .option("remove-empty", {
          type: "flag",
          describe: "delete features with null geometry"
        })
        */
        .option("target", targetOpt);

    parser.command("graticule")
        .describe("create a graticule layer");

    parser.command("innerlines")
        .describe("convert polygons to polylines along shared edges")
        .flag('no_arg')
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("join")
        .describe("join data records from a file or layer to a layer")
        .example("Join a csv table to a Shapefile (don't auto-convert FIPS column to numbers)\n" +
            "$ mapshaper states.shp -join data.csv keys=STATE_FIPS,FIPS string-fields=FIPS -o joined.shp")
        .validate(function(cmd) {
            if (!cmd.options.source) {
                error("Command requires the name of a layer or file to join");
            }
        })
        .default("source")
        .option("source", {
            describe: "file or layer containing data records"
        })
        .option("keys", {
            describe: "join by matching target,source key fields; e.g. keys=FIPS,GEOID",
            type: "strings"
        })
        .option("calc", {
            describe: "use a JS expression to calculate values for many-to-one joins"
        })
        .option("where", {
            describe: "use a JS expression to filter source records"
        })
        .option("fields", {
            describe: "fields to join, e.g. fields=FIPS,POP (default is all fields)",
            type: "strings"
        })
        .option("string-fields", stringFieldsOpt)
        .option("field-types", fieldTypesOpt)
        .option("sum-fields", {
            describe: "fields to sum for many-to-one join (consider calc= option instead)",
            type: "strings"
        })
        .option("force", {
            describe: "replace values from same-named fields",
            type: "flag"
        })
        .option("unjoined", {
            describe: "copy unjoined records from source table to \"unjoined\" layer",
            type: "flag"
        })
        .option("unmatched", {
            describe: "copy unmatched records in target table to \"unmatched\" layer",
            type: "flag"
        })
        .option("encoding", encodingOpt)
        .option("target", targetOpt);

    parser.command("lines")
        .describe("convert polygons to polylines, classified by edge type")
        .default("fields")
        .option("fields", {
            describe: "optional comma-sep. list of fields to create a hierarchy",
            type: "strings"
        })
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("merge-layers")
        .describe("merge multiple layers into as few layers as possible")
        .flag('no_arg')
        .option("name", nameOpt)
        .option("target", targetOpt);

    parser.command("point-grid")
        .describe("create a rectangular grid of points")
        .validate(validateGridOpts)
        .option("-", {
            label: "<cols,rows>",
            describe: "size of the grid, e.g. -point-grid 100,100"
        })
        .option('interval', {
            describe: 'distance between adjacent points, in source units',
            type: 'number'
        })
        .option("cols", {
            type: "integer"
        })
        .option("rows", {
            type: "integer"
        })
        .option('bbox', {
            type: "bbox",
            describe: "xmin,ymin,xmax,ymax (default is bbox of data)"
        })
        .option("name", nameOpt);

    parser.command("points")
        .describe("create a point layer from a different layer type")
        .flag("no_arg")
        .option("x", {
            describe: "field containing x coordinate"
        })
        .option("y", {
            describe: "field containing y coordinate"
        })
        .option("inner", {
            describe: "create an interior point for each polygon's largest ring",
            type: "flag"
        })
        .option("centroid", {
            describe: "create a centroid point for each polygon's largest ring",
            type: "flag"
        })
        .option("vertices", {
            describe: "capture unique vertices of polygons and polylines",
            type: "flag"
        })
        .option("endpoints", {
            describe: "capture unique endpoints of polygons and polylines",
            type: "flag"
        })
        //.option("intersections", {
        //  describe: "capture line segment intersections of polygons and polylines",
        //  type: "flag"
        //})
        .option("interpolated", {
            describe: "interpolate points along polylines; requires interval=",
            type: "flag"
        })
        .option("interval", {
            describe: "distance between interpolated points (meters or projected units)",
            type: "number"
        })
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("polygon-grid")
    // .describe("create a rectangular grid of cells")
        .validate(validateGridOpts)
        .option("-", {
            label: "<cols,rows>",
            describe: "size of the grid, e.g. -point-grid 100,100"
        })
        .option('interval', {
            describe: 'distance between adjacent points, in source units',
            type: 'number'
        })
        .option("cols", {
            type: "integer"
        })
        .option("rows", {
            type: "integer"
        })
        .option('bbox', {
            type: "bbox",
            describe: "xmin,ymin,xmax,ymax (default is bbox of data)"
        })
        .option("name", nameOpt);

    parser.command("proj")
        .describe("project your data (using Proj.4)")
        .flag("multi_arg")
        .option("projection", {
            label: "<projection>",
            describe: "set destination CRS using a Proj.4 definition or alias"
        })
        .option("match", {
            describe: "set destination CRS using a .prj file or layer id"
        })
        .option("source", {
            // describe: "(deprecated) alias for match",
            alias_to: "match"
        })
        .option("from", {
            describe: "set source CRS (if unset) using a string, .prj or layer id"
        })
        .option("densify", {
            type: "flag",
            describe: "add points along straight segments to approximate curves"
        })
        .option("target", targetOpt)
        .validate(validateProjOpts);

    parser.command("rename-fields")
        .default('fields')
        .describe('rename data fields')
        .option("fields", {
            type: "strings",
            describe: "fields to rename (comma-sep.), e.g. 'fips=STATE_FIPS,st=state'"
        })
        .option("target", targetOpt);

    parser.command("rename-layers")
        .default('names')
        .describe("assign new names to layers")
        .option("names", {
            type: "strings",
            describe: "new layer name(s) (comma-sep. list)"
        })
        .option("target", targetOpt);

    parser.command('simplify')
        .default('percentage')
        .validate(validateSimplifyOpts)
        .example("Retain 10% of removable vertices\n$ mapshaper input.shp -simplify 10%")
        .describe("simplify the geometry of polygon and polyline features")
        .option('percentage', {
            alias: 'p',
            type: 'percent',
            describe: "percentage of removable points to retain, e.g. 10%"
        })
        .option("dp", {
            alias: "rdp",
            describe: "use Ramer-Douglas-Peucker simplification",
            assign_to: "method"
        })
        .option("visvalingam", {
            describe: "use Visvalingam simplification with \"effective area\" metric",
            assign_to: "method"
        })
        .option("weighted", {
            describe: "use weighted Visvalingam simplification (default)",
            assign_to: "method"
        })
        .option("method", {
            // hidden option
        })
        .option("weighting", {
            type: "number",
            describe: "weighted Visvalingam coefficient (default is 0.7)"
        })
        .option("resolution", {
            describe: "output resolution as a grid (e.g. 1000x500)"
        })
        .option("interval", {
            // alias: "i",
            describe: "output resolution as a distance (e.g. 100)",
            type: "number"
        })
        /*
        .option("value", {
          // for testing
          // describe: "raw value of simplification threshold",
          type: "number"
        })
        */
        .option("planar", {
            describe: "simplify decimal degree coords in 2D space (default is 3D)",
            type: "flag"
        })
        .option("cartesian", {
            // describe: "(deprecated) alias for planar",
            type: "flag",
            alias_to: "planar"
        })
        .option("keep-shapes", {
            describe: "prevent small polygon features from disappearing",
            type: "flag"
        })
        .option("lock-box", {
            // describe: "don't remove vertices along bbox edges"
            type: "flag"
        })
        .option("no-repair", {
            describe: "don't remove intersections introduced by simplification",
            type: "flag"
        })
        .option("stats", {
            describe: "display simplification statistics",
            type: "flag"
        });

    parser.command("slice")
    // .describe("slice a layer using polygons in another layer")
        .default("source")
        .option("source", {
            describe: "file or layer containing clip polygons"
        })
        /*
        .option('remove-slivers', {
          describe: "remove sliver polygons created by clipping",
          type: 'flag'
        }) */
        .option("id-field", {
            describe: "slice id field (from source layer)"
        })
        .option("name", nameOpt)
        .option("no-replace", noReplaceOpt)
        .option("no-snap", noSnapOpt)
        .option("target", targetOpt);

    parser.command("sort")
        .describe("sort features using a JS expression")
        .default("expression")
        .option("expression", {
            describe: "JS expression to generate a sort key for each feature"
        })
        .option("ascending", {
            describe: "sort in ascending order (default)",
            type: "flag"
        })
        .option("descending", {
            describe: "sort in descending order",
            type: "flag"
        })
        .option("target", targetOpt);

    parser.command("split")
        .describe("split features into separate layers using a data field")
        .default("field")
        .option("field", {
            describe: "name of an attribute field (omit to split all features)"
        })
        .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("split-on-grid")
        .describe("split features into separate layers using a grid")
        .validate(validateGridOpts)
        .option("-", {
            label: "<cols,rows>",
            describe: "size of the grid, e.g. -split-on-grid 12,10"
        })
        .option("cols", {
            type: "integer"
        })
        .option("rows", {
            type: "integer"
        })
        .option("id-field", {
            describe: "assign each feature a cell id instead of splitting layer"
        })
        // .option("no-replace", noReplaceOpt)
        .option("target", targetOpt);

    parser.command("svg-style")
        .describe("set SVG properties using JS expressions or literal values")
        .option("where", whereOpt)
        .option("class", {
            describe: 'name of CSS class or classes (space-separated)'
        })
        .option("fill", {
            describe: 'fill color; examples: #eee pink rgba(0, 0, 0, 0.2)'
        })
        .option("stroke", {
            describe: 'stroke color'
        })
        .option("stroke-width", {
            describe: 'stroke width'
        })
        .option("opacity", {
            describe: 'opacity; example: 0.5'
        })
        .option("r", {
            describe: 'symbol radius (set this to export points as circles)',
        })
        .option("label-text", {
            describe: 'label text (set this to export points as labels)'
        })
        .option("text-anchor", {
            describe: 'label alignment; one of: start, end, middle (default)'
        })
        .option("dx", {
            describe: 'x offset of labels (default is 0)'
        })
        .option("dy", {
            describe: 'y offset of labels (default is baseline-aligned)'
        })
        .option("font-size", {
            describe: 'size of label text (default is 12)'
        })
        .option("font-family", {
            describe: 'CSS font family of labels (default is sans-serif)'
        })
        .option("font-weight", {
            describe: 'CSS font weight property of labels (e.g. bold, 700)'
        })
        .option("font-style", {
            describe: 'CSS font style property of labels (e.g. italic)'
        })
        .option("letter-spacing", {
            describe: 'CSS letter-spacing property of labels'
        })
        .option("line-height", {
            describe: 'line spacing of multi-line labels (default is 1.1em)'
        })
        .option("target", targetOpt);

    parser.command("target")
        .describe("set active layer")
        .default('target')
        .option("target", {
            describe: "name or index of layer to target"
        })
        .option('type', {
            describe: "type of layer to target (polygon|polyline|point)"
        })
        .option("name", {
            describe: 'rename the target layer'
        });

    parser.command("uniq")
        .describe("delete features with the same id as a previous feature")
        .default("expression")
        .option("expression", {
            describe: "JS expression to obtain the id of a feature"
        })
        .option("verbose", {
            describe: "print each removed feature",
            type: "flag"
        })
        .option("target", targetOpt);


    // Experimental commands
    parser.section("\nExperimental commands (may give unexpected results)");

    parser.command("affine")
        .describe("transform coordinates by shifting, scaling and rotating")
        .flag("no_args")
        .option("shift", {
            type: 'numbers',
            describe: "x,y offsets in source units (e.g. 5000,-5000)"
        })
        .option("scale", {
            type: 'number',
            describe: "scale (default is 1)"
        })
        .option("rotate", {
            type: 'number',
            describe: "angle of rotation in degrees (default is 0)"
        })
        .option("anchor", {
            type: 'numbers',
            describe: "center of rotation/scaling (default is center of selected shapes)"
        })
        .option("where", whereOpt)
        .option("target", targetOpt);


    // Work-in-progress (no .describe(), so hidden from -h)
    parser.command("clean")
        .option("target", targetOpt);

    parser.command("clean2")
        .option("snap-interval", snapIntervalOpt)
        .option("no-snap", noSnapOpt)
        .option("target", targetOpt);


    parser.command("cluster")
        .describe("group polygons into compact clusters")
        .option("id-field", {
            describe: "field name of cluster id (default is \"cluster\")"
        })
        .option('pct', {
            alias: 'p',
            type: 'percent',
            describe: "percentage of shapes to retain, e.g. 50%"
        })
        .option("max-width", {
            describe: "max width of cluster bounding box",
            type: "number"
        })
        .option("max-height", {
            describe: "max height of cluster bounding box",
            type: "number"
        })
        .option("max-area", {
            describe: "max area of a cluster",
            type: "number"
        })
        .option("group-by", {
            describe: "field name; only same-value shapes will be grouped"
        })
        .option("target", targetOpt);

    parser.command("colorizer")
        .describe("define a function to convert data values to color classes")
        .flag("no_arg")
        .option("colors", {
            describe: "comma-separated list of CSS colors",
            type: "colors"
        })
        .option("breaks", {
            describe: "ascending-order list of breaks for sequential color scheme",
            type: "numbers"
        })
        .option("categories", {
            describe: "comma-sep. list of keys for categorical color scheme",
            type: "strings"
        })
        .option("other", {
            describe: "default color for categorical scheme (defaults to no-data color)"
        })
        .option("nodata", {
            describe: "color to use for invalid or missing data (default is white)"
        })
        .option("name", {
            describe: "function name to use in -each and -svg-style commands"
        })
        .option("precision", {
            describe: "rounding precision to apply before classification (e.g. 0.1)",
            type: "number"
        });

    parser.command("data-fill")
    // .describe("interpolate missing values by copying from neighbor polygons")
        .option("field", {
            describe: "name of field to fill out"
        })
        .option("postprocess", {
            describe: "remove data islands",
            type: "flag"
        });

    parser.command("polygons")
        .describe("convert polylines to polygons")
        .option("gap-tolerance", {
            describe: "specify gap tolerance in source units",
            type: "number"
        })
        .option("target", targetOpt);

    parser.command("rectangle")
        .describe("create a rectangular polygon")
        .option('type', {

        })
        .option("bbox", {
            describe: "rectangle coordinates (xmin,ymin,xmax,ymax)",
            type: "bbox"
        })
        .option("offset", {
            describe: "space around bbox or source layer",
            type: "number"
        })
        .option("source", {
            describe: "name of layer to enclose"
        })
        .option("name", nameOpt);

    parser.command("shape")
        .describe("create a polyline or polygon from coordinates")
        .option("coordinates", {
            describe: "list of vertices as x,y,x,y...",
            type: "numbers"
        })
        .option("offsets", {
            describe: "list of vertices as offsets from coordinates list",
            type: "numbers"
        })
        .option("closed", {
            describe: "close an open path to create a polygon",
            type: "flag"
        })
        .option("name", nameOpt);

    parser.command("subdivide")
        .describe("recursively split a layer using a JS expression")
        .validate(validateExpressionOpt)
        .default("expression")
        .option("expression", {
            describe: "boolean JS expression"
        })
        .option("target", targetOpt);


    parser.section("\nInformational commands");

    parser.command("calc")
        .describe("calculate statistics about the features in a layer")
        .example("Calculate the total area of a polygon layer\n" +
            "$ mapshaper polygons.shp -calc 'sum($.area)'")
        .example("Count census blocks in NY with zero population\n" +
            "$ mapshaper ny-census-blocks.shp -calc 'count()' where='POPULATION == 0'")
        .validate(validateExpressionOpt)
        .default("expression")
        .option("expression", {
            describe: "functions: sum() average() median() max() min() count()"
        })
        .option("where", whereOpt)
        .option("target", targetOpt);

    parser.command('encodings')
        .describe("print list of supported text encodings (for .dbf import)");

    parser.command('help')
        .alias('h')
        .describe("print help; takes optional command name")
        .default('command')
        .option("command", {
            describe: "view detailed information about a command"
        });

    parser.command('info')
        .describe("print information about data layers");

    parser.command('inspect')
        .describe("print information about a feature")
        .default("expression")
        .option("expression", {
            describe: "boolean JS expression for selecting a feature"
        })
        .option("target", targetOpt)
        .validate(validateExpressionOpt);

    parser.command('projections')
        .describe("print list of supported projections");

    parser.command('quiet')
        .describe("inhibit console messages");

    parser.command('verbose')
        .describe("print verbose processing messages");

    parser.command('version')
        .alias('v')
        .describe("print mapshaper version");

    parser.command('debug');

    /*
    parser.command("divide")
      .option("name", nameOpt)
      .option("no-replace", noReplaceOpt)
      .option("target", targetOpt);

    parser.command("fill-holes")
      .option("no-replace", noReplaceOpt)
      .option("target", targetOpt);
    */

    return parser;
};

function CommandParser() {
    var commandRxp = /^--?([a-z][\w-]*)$/i,
        assignmentRxp = /^([a-z0-9_+-]+)=(?!\=)(.*)$/i, // exclude ==
        _usage = "",
        _examples = [],
        _commands = [],
        _default = null,
        _note;

    if (this instanceof CommandParser === false) return new CommandParser();

    this.usage = function(str) {
        _usage = str;
        return this;
    };

    this.note = function(str) {
        _note = str;
        return this;
    };

    // set a default command; applies to command line args preceding the first
    // explicit command
    this.default = function(str) {
        _default = str;
    };

    this.example = function(str) {
        _examples.push(str);
    };

    this.command = function(name) {
        var opts = new CommandOptions(name);
        _commands.push(opts);
        return opts;
    };

    this.section = function(name) {
        return this.command("").title(name);
    };

    this.parseArgv = function(raw) {
        var commandDefs = getCommands(),
            commands = [], cmd,
            argv = Shpsys.cleanArgv(raw),
            cmdName, cmdDef, opt;

        if (argv.length == 1 && tokenIsCommandName(argv[0])) {
            // show help if only a command name is given
            argv.unshift('-help'); // kludge (assumes -help <command> syntax)
        } else if (argv.length > 0 && !tokenLooksLikeCommand(argv[0]) && _default) {
            // if there are arguments before the first explicit command, use the default command
            argv.unshift('-' + _default);
        }

        while (argv.length > 0) {
            cmdName = readCommandName(argv);
            if (!cmdName) {
                stop("Invalid command:", argv[0]);
            }
            cmdDef = findCommandDefn(cmdName, commandDefs);
            if (!cmdDef) {
                stop("Unknown command:", cmdName);
            }
            cmd = {
                name: cmdDef.name,
                options: {},
                _: []
            };

            while (argv.length > 0 && !tokenLooksLikeCommand(argv[0])) {
                readOption(cmd, argv, cmdDef);
            }

            try {
                if (cmd._.length > 0 && cmdDef.no_arg) {
                    error("Received one or more unexpected parameters:", cmd._.join(' '));
                }
                if (cmd._.length > 1 && !cmdDef.multi_arg) {
                    error("Command expects a single value. Received:", cmd._.join(' '));
                }
                if (cmdDef.default && cmd._.length == 1) {
                    // TODO: support multiple-token values, like -i filenames
                    readDefaultOptionValue(cmd, cmdDef);
                }
                if (cmdDef.validate) {
                    cmdDef.validate(cmd);
                }
            } catch(e) {
                stop("[" + cmdName + "] " + e.message);
            }
            commands.push(cmd);
        }
        return commands;

        function tokenIsCommandName(s) {
            return !!utils.find(getCommands(), function(cmd) {
                return s === cmd.name || s === cmd.alias;
            });
        }

        function tokenLooksLikeCommand(s) {
            return commandRxp.test(s);
        }

        // Try to parse an assignment @token for command @cmdDef
        function parseAssignment(cmd, token, cmdDef) {
            var match = assignmentRxp.exec(token),
                name = match[1],
                val = utils.trimQuotes(match[2]),
                optDef = findOptionDefn(name, cmdDef);

            if (!optDef) {
                // Assignment to an unrecognized identifier could be an expression
                // (e.g. -each 'id=$.id') -- save for later parsing
                cmd._.push(token);
            } else if (optDef.type == 'flag' || optDef.assign_to) {
                stop("-" + cmdDef.name + " " + name + " option doesn't take a value");
            } else {
                readOption(cmd, [name, val], cmdDef);
            }
        }

        // Try to read an option for command @cmdDef from @argv
        function readOption(cmd, argv, cmdDef) {
            var token = argv.shift(),
                optDef = findOptionDefn(token, cmdDef),
                optName;

            if (assignmentRxp.test(token)) {
                parseAssignment(cmd, token, cmdDef);
                return;
            }

            if (!optDef) {
                // not a defined option; add it to _ array for later processing
                cmd._.push(token);
                return;
            }

            optName = optDef.alias_to || optDef.name;
            optName = optName.replace(/-/g, '_');

            if (optDef.assign_to) {
                cmd.options[optDef.assign_to] = optDef.name;
            } else if (optDef.type == 'flag') {
                cmd.options[optName] = true;
            } else {
                cmd.options[optName] = readOptionValue(argv, optDef);
            }
        }

        // Read an option value for @optDef from @argv
        function readOptionValue(argv, optDef) {
            if (argv.length === 0 || tokenLooksLikeCommand(argv[0])) {
                stop("Missing value for " + optDef.name + " option");
            }
            return parseOptionValue(argv.shift(), optDef); // remove token from argv
        }

        function readDefaultOptionValue(cmd, cmdDef) {
            var optDef = findOptionDefn(cmdDef.default, cmdDef);
            cmd.options[cmdDef.default] = readOptionValue(cmd._, optDef);
        }

        function parseOptionValue(token, optDef) {
            var type = optDef.type;
            var val, err;
            if (type == 'number') {
                val = Number(token);
            } else if (type == 'integer') {
                val = Math.round(Number(token));
            } else if (type == 'colors') {
                val = internal.parseColorList(token);
            } else if (type == 'strings') {
                val = internal.parseStringList(token);
            } else if (type == 'bbox' || type == 'numbers') {
                val = token.split(',').map(parseFloat);
            } else if (type == 'percent') {
                val = utils.parsePercent(token);
            } else {
                val = token; // assume string type
            }

            if (val !== val) {
                err = "Invalid numeric value";
            }

            if (err) {
                stop(err + " for " + optDef.name + " option");
            }
            return val;
        }

        // Check first element of an array of tokens; remove and return if it looks
        // like a command name, else return null;
        function readCommandName(args) {
            var match = commandRxp.exec(args[0]);
            if (match) {
                args.shift();
                return match[1];
            }
            return null;
        }

        function findCommandDefn(name, arr) {
            return utils.find(arr, function(cmd) {
                return cmd.name === name || cmd.alias === name;
            });
        }

        function findOptionDefn(name, cmdDef) {
            return utils.find(cmdDef.options, function(o) {
                return o.name === name || o.alias === name;
            });
        }
    };

    this.getHelpMessage = function(commandName) {
        var helpStr = '',
            cmdPre = '  ',
            optPre = '  ',
            exPre = '  ',
            gutter = '  ',
            colWidth = 0,
            detailView = false,
            cmd, helpCommands;

        helpCommands = getCommands().filter(function(cmd) {
            // hide commands without a description, except section headers
            return !!cmd.describe || cmd.title;
        });

        if (commandName) {
            cmd = utils.find(helpCommands, function(cmd) {return cmd.name == commandName;});
            if (!cmd) {
                stop(commandName, "is not a known command");
            }
            detailView = true;
            helpCommands = [cmd];
        }

        if (!detailView) {
            if (_usage) {
                helpStr += _usage + "\n\n";
            }
        }

        // Format help strings, calc width of left column.
        colWidth = helpCommands.reduce(function(w, cmd) {
            var help = cmdPre + (cmd.name ? "-" + cmd.name : "");
            if (cmd.alias) help += ", -" + cmd.alias;
            cmd.help = help;
            if (detailView) {
                w = cmd.options.reduce(function(w, opt) {
                    if (opt.describe) {
                        w = Math.max(formatOption(opt, cmd), w);
                    }
                    return w;
                }, w);
            }
            return Math.max(w, help.length);
        }, 0);

        // Layout help display
        helpCommands.forEach(function(cmd) {
            if (!detailView && cmd.title) {
                helpStr += cmd.title;
            }
            if (detailView) {
                helpStr += '\nCommand\n';
            }
            helpStr += formatHelpLine(cmd.help, cmd.describe);
            if (detailView && cmd.options.length > 0) {
                helpStr += '\nOptions\n';
                cmd.options.forEach(function(opt) {
                    if (opt.help && opt.describe) {
                        helpStr += formatHelpLine(opt.help, opt.describe);
                    }
                });
            }
            if (detailView && cmd.examples) {
                helpStr += '\nExample' + (cmd.examples.length > 1 ? 's' : ''); //  + '\n';
                cmd.examples.forEach(function(ex) {
                    ex.split('\n').forEach(function(line) {
                        helpStr += '\n' + exPre + line;
                    });
                    helpStr += '\n';
                });
            }
        });

        // additional notes for non-detail view
        if (!detailView) {
            if (_examples.length > 0) {
                helpStr += "\nExamples\n";
                _examples.forEach(function(str) {
                    helpStr += "\n" + str + "\n";
                });
            }
            if (_note) {
                helpStr += '\n' + _note;
            }
        }

        return helpStr;

        function formatHelpLine(help, desc) {
            return utils.rpad(help, colWidth, ' ') + gutter + (desc || '') + '\n';
        }

        function formatOption(o, cmd) {
            o.help = optPre;
            if (o.label) {
                o.help += o.label;
            } else if (o.name == cmd.default) {
                o.help += '<' + o.name + '>';
            } else {
                o.help += o.name;
                if (o.alias) o.help += ", " + o.alias;
                if (o.type != 'flag' && !o.assign_to) o.help += "=";
            }
            return o.help.length;
        }

    };

    this.printHelp = function(command) {
        message(this.getHelpMessage(command));
    };

    function getCommands() {
        return _commands.map(function(cmd) {
            return cmd.done();
        });
    }
}

function CommandOptions(name) {
    var _command = {
        name: name,
        options: []
    };

    // set default option (assign unnamed argument to option of this name)
    this.default = function(name) {
        _command.default = name;
        return this;
    };

    this.validate = function(f) {
        _command.validate = f;
        return this;
    };

    this.describe = function(str) {
        _command.describe = str;
        return this;
    };

    this.example = function(str) {
        if (!_command.examples) {
            _command.examples = [];
        }
        _command.examples.push(str);
        return this;
    };

    this.alias = function(name) {
        _command.alias = name;
        return this;
    };

    this.title = function(str) {
        _command.title = str;
        return this;
    };

    this.flag = function(name) {
        _command[name] = true;
        return this;
    };

    this.option = function(name, opts) {
        opts = opts || {}; // accept just a name -- some options don't need properties
        if (!utils.isString(name) || !name) error("Missing option name");
        if (!utils.isObject(opts)) error("Invalid option definition:", opts);
        opts.name = name;
        _command.options.push(opts);
        return this;
    };

    this.done = function() {
        return _command;
    };
}

function validateInputOpts(cmd) {
    var o = cmd.options,
        _ = cmd._;

    if (_[0] == '-' || _[0] == '/dev/stdin') {
        o.stdin = true;
    } else if (_.length > 0) {
        o.files = cli.expandInputFiles(_);
    }

    if ("precision" in o && o.precision > 0 === false) {
        error("precision= option should be a positive number");
    }

    if (o.encoding) {
        o.encoding = Shpsys.validateEncoding(o.encoding);
    }
}

Shpsys.validateEncoding = function(enc) {
    if (!Shpsys.encodingIsSupported(enc)) {
        stop("Unknown encoding:", enc, "\nRun the -encodings command see a list of supported encodings");
    }
    return enc;
};

Shpsys.encodingIsSupported = function(raw) {
    var enc = Shpsys.standardizeEncodingName(raw);
    return utils.contains(Shpsys.getEncodings(), enc);
};

Shpsys.standardizeEncodingName = function(enc) {
    return enc.toLowerCase().replace(/[_-]/g, '');
};

Shpsys.getEncodings = function() {
    var iconv = require('iconv-lite');
    iconv.encodingExists('ascii'); // make iconv load its encodings
    return Object.keys(iconv.encodings);
};

cli.expandInputFiles = function(files) {
    return files.reduce(function(memo, name) {
        if (name.indexOf('*') > -1) {
            memo = memo.concat(cli.expandFileName(name));
        } else {
            memo.push(name);
        }
        return memo;
    }, []);
};

cli.expandFileName = function(name) {
    var info = utils.parseLocalPath(name),
        rxp = utils.wildcardToRegExp(info.filename),
        dir = info.directory || '.',
        files = [];

    try {
        require('fs').readdirSync(dir).forEach(function(item) {
            var path = require('path').join(dir, item);
            if (rxp.test(item) && cli.isFile(path)) {
                files.push(path);
            }
        });
    } catch(e) {}

    if (files.length === 0) {
        stop('No files matched (' + name + ')');
    }
    return files;
};

utils.parseLocalPath = function(path) {
    var obj = {},
        sep = utils.getPathSep(path),
        parts = path.split(sep),
        i;

    if (parts.length == 1) {
        obj.filename = parts[0];
        obj.directory = "";
    } else {
        obj.filename = parts.pop();
        obj.directory = parts.join(sep);
    }
    i = obj.filename.lastIndexOf('.');
    if (i > -1) {
        obj.extension = obj.filename.substr(i + 1);
        obj.basename = obj.filename.substr(0, i);
        obj.pathbase = path.substr(0, path.lastIndexOf('.'));
    } else {
        obj.extension = "";
        obj.basename = obj.filename;
        obj.pathbase = path;
    }
    return obj;
};

utils.getPathSep = function(path) {
    // TODO: improve
    return path.indexOf('/') == -1 && path.indexOf('\\') != -1 ? '\\' : '/';
};

utils.wildcardToRegExp = function(name) {
    var rxp = name.split('*').map(function(str) {
        return utils.regexEscape(str);
    }).join('.*');
    return new RegExp('^' + rxp + '$');
};

function validateOutputOpts(cmd) {
    var _ = cmd._,
        o = cmd.options,
        arg = _[0] || "",
        pathInfo = utils.parseLocalPath(arg);

    if (_.length > 1) {
        error("Command takes one file or directory argument");
    }

    if (arg == '-' || arg == '/dev/stdout') {
        o.stdout = true;
    } else if (arg && !pathInfo.extension) {
        if (!cli.isDirectory(arg)) {
            error("Unknown output option:", arg);
        }
        o.directory = arg;
    } else if (arg) {
        if (pathInfo.directory) {
            o.directory = pathInfo.directory;
            cli.validateOutputDir(o.directory);
        }
        o.file = pathInfo.filename;
        if (Shpsys.filenameIsUnsupportedOutputType(o.file)) {
            error("Output file looks like an unsupported file type:", o.file);
        }
    }

    if (o.format) {
        o.format = o.format.toLowerCase();
        if (o.format == 'csv') {
            o.format = 'dsv';
            o.delimiter = o.delimiter || ',';
        } else if (o.format == 'tsv') {
            o.format = 'dsv';
            o.delimiter = o.delimiter || '\t';
        }
        if (!Shpsys.isSupportedOutputFormat(o.format)) {
            error("Unsupported output format:", o.format);
        }
    }

    if (o.delimiter) {
        // convert "\t" '\t' \t to tab
        o.delimiter = o.delimiter.replace(/^["']?\\t["']?$/, '\t');
        if (!Shpsys.isSupportedDelimiter(o.delimiter)) {
            error("Unsupported delimiter:", o.delimiter);
        }
    }

    if (o.encoding) {
        o.encoding = Shpsys.validateEncoding(o.encoding);
    }

    // topojson-specific
    if ("quantization" in o && o.quantization > 0 === false) {
        error("quantization= option should be a nonnegative integer");
    }

    if ("topojson_precision" in o && o.topojson_precision > 0 === false) {
        error("topojson-precision= option should be a positive number");
    }
}

cli.validateOutputDir = function(name) {
    if (!cli.isDirectory(name)) {
        error("Output directory not found:", name);
    }
};

Shpsys.filenameIsUnsupportedOutputType = function(file) {
    var rxp = /\.(shx|prj|xls|xlsx|gdb|sbn|sbx|xml|kml)$/i;
    return rxp.test(file);
};

Shpsys.isSupportedOutputFormat = function(fmt) {
    var types = ['geojson', 'topojson', 'json', 'dsv', 'dbf', 'shapefile', 'svg'];
    return types.indexOf(fmt) > -1;
};

Shpsys.supportedDelimiters = ['|', '\t', ',', ';'];

Shpsys.isSupportedDelimiter = function(d) {
    return utils.contains(Shpsys.supportedDelimiters, d);
};

function validateClipOpts(cmd) {
    var opts = cmd.options;
    // rename old option
    if (opts.cleanup) {
        delete opts.cleanup;
        opts.remove_slivers = true;
    }
    if (!opts.source && !opts.bbox) {
        error("Command requires a source file, layer id or bbox");
    }
}

function validateGridOpts(cmd) {
    var o = cmd.options;
    if (cmd._.length == 1) {
        var tmp = cmd._[0].split(',');
        o.cols = parseInt(tmp[0], 10);
        o.rows = parseInt(tmp[1], 10) || o.cols;
    }
}

function validateProjOpts(cmd) {
    var _ = cmd._,
        proj4 = [];

    // separate proj4 options
    _ = _.filter(function(arg) {
        if (/^\+[a-z]/i.test(arg)) {
            proj4.push(arg);
            return false;
        }
        return true;
    });

    if (proj4.length > 0) {
        cmd.options.projection = proj4.join(' ');
    } else if (_.length > 0) {
        cmd.options.projection = _.shift();
    }

    if (_.length > 0) {
        error("Received one or more unexpected parameters: " + _.join(', '));
    }

    if (!(cmd.options.projection  || cmd.options.match || cmd.options.from)) {
        stop("Missing projection data");
    }
}

function validateSimplifyOpts(cmd) {
    var o = cmd.options,
        arg = cmd._[0];

    if (arg) {
        if (/^[0-9.]+%?$/.test(arg)) {
            o.percentage = utils.parsePercent(arg);
        } else {
            error("Unparsable option:", arg);
        }
    }

    var intervalStr = o.interval;
    if (intervalStr) {
        o.interval = Number(intervalStr);
        if (o.interval >= 0 === false) {
            error(utils.format("Out-of-range interval value: %s", intervalStr));
        }
    }

    if (isNaN(o.interval) && !utils.isNumber(o.percentage) && !o.resolution) {
        error("Command requires an interval, percentage or resolution parameter");
    }
}

utils.parsePercent = function(o) {
    var str = String(o);
    var isPct = str.indexOf('%') > 0;
    var pct;
    if (isPct) {
        pct = Number(str.replace('%', '')) / 100;
    } else {
        pct = Number(str);
    }
    if (!(pct >= 0 && pct <= 1)) {
        stop(utils.format("Invalid percentage: %s", str));
    }
    return pct;
};

function validateExpressionOpt(cmd) {
    if (!cmd.options.expression) {
        error("Command requires a JavaScript expression");
    }
}

function createContext() {
    return {
        DEBUG: false,
        QUIET: false,
        VERBOSE: false,
        defs: {},
        input_files: []
    };
}

function verbose() {
    if (Shpsys.getStateVar('VERBOSE')) {
        Shpsys.logArgs(arguments);
    }
}

Shpsys.getStateVar = function(key) {
    return Shpsys.context[key];
};

Shpsys.logArgs = function(args) {
    if (Shpsys.LOGGING && !Shpsys.getStateVar('QUIET') && utils.isArrayLike(args)) {
        (console.error || console.log).call(console, Shpsys.formatLogArgs(args));
    }
};

Shpsys.translateShapefileType = function(shpType) {
    if (utils.contains([ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ], shpType)) {
        return 'polygon';
    } else if (utils.contains([ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ], shpType)) {
        return 'polyline';
    } else if (utils.contains([ShpType.POINT, ShpType.POINTM, ShpType.POINTZ,
            ShpType.MULTIPOINT, ShpType.MULTIPOINTM, ShpType.MULTIPOINTZ], shpType)) {
        return 'point';
    }
    return null;
};

Shpsys.isSupportedShapefileType = function(t) {
    return utils.contains([0,1,3,5,8,11,13,15,18,21,23,25,28], t);
};

Shpsys.getShapefileType = function(type) {
    return {
        polygon: ShpType.POLYGON,
        polyline: ShpType.POLYLINE,
        point: ShpType.MULTIPOINT
    }[type] || ShpType.NULL;
};

Shpsys.snapCoords = function(arcs, threshold) {
    var avgDist = Shpsys.getAvgSegment(arcs),
        autoSnapDist = avgDist * 0.0025,
        snapDist = autoSnapDist;

    if (threshold > 0) {
        snapDist = threshold;
        message(utils.format("Applying snapping threshold of %s -- %.6f times avg. segment length", threshold, threshold / avgDist));
    }
    var snapCount = Shpsys.snapCoordsByInterval(arcs, snapDist);
    if (snapCount > 0) arcs.dedupCoords();
    message(utils.format("Snapped %s point%s", snapCount, utils.pluralSuffix(snapCount)));
};

Shpsys.getAvgSegment = function(arcs) {
    var sum = 0;
    var count = arcs.forEachSegment(function(i, j, xx, yy) {
        var dx = xx[i] - xx[j],
            dy = yy[i] - yy[j];
        sum += Math.sqrt(dx * dx + dy * dy);
    });
    return sum / count || 0;
};

Shpsys.snapCoordsByInterval = function(arcs, snapDist) {
    var snapCount = 0,
        data = arcs.getVertexData();

    // Get sorted coordinate ids
    // Consider: speed up sorting -- try bucket sort as first pass.
    //
    var ids = utils.sortCoordinateIds(data.xx);
    for (var i=0, n=ids.length; i<n; i++) {
        snapCount += snapPoint(i, snapDist, ids, data.xx, data.yy);
    }
    return snapCount;

    function snapPoint(i, limit, ids, xx, yy) {
        var j = i,
            n = ids.length,
            x = xx[ids[i]],
            y = yy[ids[i]],
            snaps = 0,
            id2, dx, dy;

        while (++j < n) {
            id2 = ids[j];
            dx = xx[id2] - x;
            if (dx > limit) break;
            dy = yy[id2] - y;
            if (dx === 0 && dy === 0 || dx * dx + dy * dy > limit * limit) continue;
            xx[id2] = x;
            yy[id2] = y;
            snaps++;
        }
        return snaps;
    }
};

Shpsys.formatLogArgs = function(args) {
    return utils.toArray(args).join(' ');
};

function stop() {
    Shpsys.stop.apply(null, utils.toArray(arguments));
}

Shpsys.layerHasPaths = function(lyr) {
    return (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') &&
        Shpsys.layerHasNonNullShapes(lyr);
};

Shpsys.layerHasNonNullShapes = function(lyr) {
    return utils.some(lyr.shapes || [], function(shp) {
        return !!shp;
    });
};

function absArcId(arcId) {
    return arcId >= 0 ? arcId : ~arcId;
}

Shpsys.probablyDecimalDegreeBounds = function(b) {
    var world = Shpsys.getWorldBounds(-1), // add a bit of excess
        bbox = (b instanceof Bounds) ? b.toArray() : b;
    return containsBounds(world, bbox);
};

Shpsys.getWorldBounds = function(e) {
    e = utils.isFiniteNumber(e) ? e : 1e-10;
    return [-180 + e, -90 + e, 180 - e, 90 - e];
};

Shpsys.decodeString = function(buf, encoding) {
    var iconv = require('iconv-lite'),
        str = iconv.decode(buf, encoding);
    // remove BOM if present
    if (str.charCodeAt(0) == 0xfeff) {
        str = str.substr(1);
    }
    return str;
};

Shpsys.detectEncoding = function(samples) {
    var encoding = null;
    if (Shpsys.looksLikeUtf8(samples)) {
        encoding = 'utf8';
    } else if (Shpsys.looksLikeWin1252(samples)) {
        // Win1252 is the same as Latin1, except it replaces a block of control
        // characters with n-dash, Euro and other glyphs. Encountered in-the-wild
        // in Natural Earth (airports.dbf uses n-dash).
        encoding = 'win1252';
    }
    return encoding;
};

Shpsys.looksLikeUtf8 = function(samples) {
    // Remove the byte sequence for the utf-8-encoded replacement char before decoding,
    // in case the file is in utf-8, but contains some previously corrupted text.
    // samples = samples.map(internal.replaceUtf8ReplacementChar);
    var str = internal.decodeSamples('utf8', samples);
    return str.indexOf('\ufffd') == -1;
};

Shpsys.decodeSamples = function(enc, samples) {
    return samples.map(function(buf) {
        return Shpsys.decodeString(buf, enc).trim();
    }).join('\n');
};

Shpsys.formatStringsAsGrid = function(arr) {
    // TODO: variable column width
    var longest = arr.reduce(function(len, str) {
            return Math.max(len, str.length);
        }, 0),
        colWidth = longest + 2,
        perLine = Math.floor(80 / colWidth) || 1;
    return arr.reduce(function(memo, name, i) {
        var col = i % perLine;
        if (i > 0 && col === 0) memo += '\n';
        if (col < perLine - 1) { // right-pad all but rightmost column
            name = utils.rpad(name, colWidth - 2, ' ');
        }
        return memo +  '  ' + name;
    }, '');
};

api.cli = cli;
api.internal = Shpsys;
api.utils = utils;
api.geom = geom;
this.shpsys = api;

if (typeof define === "function" && define.amd) {
    define("mapshaper", api);
} else if (typeof module === "object" && module.exports) {
    module.exports = api;
}

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
    for (var i = 0, n = path.length; i < n; i++) {
        if (arcs.arcIsDegenerate(path[i])) {
            nulls++;
            path[i] = null;
        }
    }
    return nulls > 0 ? path.filter(function (id) {
        return id !== null;
    }) : path;
};

// Accumulates points in buffers until #endPath() is called
// @drain callback: function(xarr, yarr, size) {}
//
    function PathImportStream(drain) {
        var buflen = 10000,
            xx = new Float64Array(buflen),
            yy = new Float64Array(buflen),
            i = 0;

        this.endPath = function () {
            drain(xx, yy, i);
            i = 0;
        };

        this.addPoint = function (x, y) {
            if (i >= buflen) {
                buflen = Math.ceil(buflen * 1.3);
                xx = utils.extendBuffer(xx, buflen);
                yy = utils.extendBuffer(yy, buflen);
            }
            xx[i] = x;
            yy[i] = y;
            i++;
        };
    }

// Import path data from a non-topological source (Shapefile, GeoJSON, etc)
// in preparation for identifying topology.
// @opts.reserved_points -- estimate of points in dataset, for pre-allocating buffers
//
    function PathImporter(opts) {
        var bufSize = opts.reserved_points > 0 ? opts.reserved_points : 20000,
            xx = new Float64Array(bufSize),
            yy = new Float64Array(bufSize),
            shapes = [],
            properties = [],
            nn = [],
            types = [],
            collectionType = opts.type || null, // possible values: polygon, polyline, point
            round = null,
            pathId = -1,
            shapeId = -1,
            pointId = 0,
            dupeCount = 0,
            openRingCount = 0;

        if (opts.precision) {
            round = utils.getRoundingFunction(opts.precision);
        }

        // mix in #addPoint() and #endPath() methods
        utils.extend(this, new PathImportStream(importPathCoords));

        this.startShape = function (d) {
            shapes[++shapeId] = null;
            if (d) properties[shapeId] = d;
        };

        this.importLine = function (points) {
            setShapeType('polyline');
            this.importPath(points);
        };

        this.importPoints = function (points) {
            setShapeType('point');
            if (round) {
                points.forEach(function (p) {
                    p[0] = round(p[0]);
                    p[1] = round(p[1]);
                });
            }
            points.forEach(appendToShape);
        };

        this.importRing = function (points, isHole) {
            var area = geom.getPlanarPathArea2(points);
            setShapeType('polygon');
            if (isHole === true && area > 0 || isHole === false && area < 0) {
                verbose("Warning: reversing", isHole ? "a CW hole" : "a CCW ring");
                points.reverse();
            }
            this.importPath(points);
        };

        // Import an array of [x, y] Points
        this.importPath = function importPath(points) {
            var p;
            for (var i = 0, n = points.length; i < n; i++) {
                p = points[i];
                this.addPoint(p[0], p[1]);
            }
            this.endPath();
        };

        // Return imported dataset
        // Apply any requested snapping and rounding
        // Remove duplicate points, check for ring inversions
        //
        this.done = function () {
            var arcs;
            var layers;
            var lyr = {name: ''};

            if (dupeCount > 0) {
                verbose(utils.format("Removed %,d duplicate point%s", dupeCount, utils.pluralSuffix(dupeCount)));
            }
            if (openRingCount > 0) {
                message(utils.format("Closed %,d open polygon ring%s", openRingCount, utils.pluralSuffix(openRingCount)));
            }
            if (pointId > 0) {
                if (pointId < xx.length) {
                    xx = xx.subarray(0, pointId);
                    yy = yy.subarray(0, pointId);
                }
                arcs = new ArcCollection(nn, xx, yy);

                if (opts.auto_snap || opts.snap_interval) {
                    Shpsys.snapCoords(arcs, opts.snap_interval);
                }
            }

            if (collectionType == 'mixed') {
                layers = Shpsys.divideFeaturesByType(shapes, properties, types);

            } else {
                lyr = {geometry_type: collectionType};
                if (collectionType) {
                    lyr.shapes = shapes;
                }
                if (properties.length > 0) {
                    lyr.data = new DataTable(properties);
                }
                layers = [lyr];
            }

            layers.forEach(function (lyr) {
                if (Shpsys.layerHasPaths(lyr)) {
                    Shpsys.cleanShapes(lyr.shapes, arcs, lyr.geometry_type);
                }
                if (lyr.data) {
                    Shpsys.fixInconsistentFields(lyr.data.getRecords());
                }
            });

            return {
                arcs: arcs || null,
                info: {},
                layers: layers
            };
        };

        function setShapeType(t) {
            var currType = shapeId < types.length ? types[shapeId] : null;
            if (!currType) {
                types[shapeId] = t;
                if (!collectionType) {
                    collectionType = t;
                } else if (t != collectionType) {
                    collectionType = 'mixed';
                }
            } else if (currType != t) {
                stop("Unable to import mixed-geometry GeoJSON features");
            }
        }

        function checkBuffers(needed) {
            if (needed > xx.length) {
                var newLen = Math.max(needed, Math.ceil(xx.length * 1.5));
                xx = utils.extendBuffer(xx, newLen, pointId);
                yy = utils.extendBuffer(yy, newLen, pointId);
            }
        }

        function appendToShape(part) {
            var currShape = shapes[shapeId] || (shapes[shapeId] = []);
            currShape.push(part);
        }

        function appendPath(n) {
            pathId++;
            nn[pathId] = n;
            appendToShape([pathId]);
        }

        function importPathCoords(xsrc, ysrc, n) {
            var count = 0;
            var x, y, prevX, prevY;
            checkBuffers(pointId + n);
            for (var i = 0; i < n; i++) {
                x = xsrc[i];
                y = ysrc[i];
                if (round) {
                    x = round(x);
                    y = round(y);
                }
                if (i > 0 && x == prevX && y == prevY) {
                    dupeCount++;
                } else {
                    xx[pointId] = x;
                    yy[pointId] = y;
                    pointId++;
                    count++;
                }
                prevY = y;
                prevX = x;
            }

            // check for open rings
            if (collectionType == 'polygon' && count > 0) {
                if (xsrc[0] != xsrc[n - 1] || ysrc[0] != ysrc[n - 1]) {
                    checkBuffers(pointId + 1);
                    xx[pointId] = xsrc[0];
                    yy[pointId] = ysrc[0];
                    openRingCount++;
                    pointId++;
                    count++;
                }
            }

            appendPath(count);
        }
    }

    function DataTable(obj) {
        var records;
        if (utils.isArray(obj)) {
            records = obj;
        } else {
            records = [];
            // integer object: create empty records
            if (utils.isInteger(obj)) {
                for (var i = 0; i < obj; i++) {
                    records.push({});
                }
            } else if (obj) {
                error("Invalid DataTable constructor argument:", obj);
            }
        }

        this.exportAsDbf = function (encoding) {
            return Dbf.exportRecords(records, encoding);
        };

        this.getRecords = function () {
            return records;
        };

        this.getRecordAt = function (i) {
            return records[i];
        };
    }

    BinArray.prototype = {
        size: function () {
            return this._buffer.byteLength;
        },

        littleEndian: function () {
            this._le = true;
            return this;
        },

        bigEndian: function () {
            this._le = false;
            return this;
        },

        buffer: function () {
            return this._buffer;
        },

        bytesLeft: function () {
            return this._buffer.byteLength - this._idx;
        },

        skipBytes: function (bytes) {
            this._idx += (bytes + 0);
            return this;
        },

        readUint8: function () {
            return this._bytes[this._idx++];
        },

        writeUint8: function (val) {
            this._bytes[this._idx++] = val;
            return this;
        },

        readInt8: function () {
            return this._view.getInt8(this._idx++);
        },

        writeInt8: function (val) {
            this._view.setInt8(this._idx++, val);
            return this;
        },

        readUint16: function () {
            var val = this._view.getUint16(this._idx, this._le);
            this._idx += 2;
            return val;
        },

        writeUint16: function (val) {
            this._view.setUint16(this._idx, val, this._le);
            this._idx += 2;
            return this;
        },

        readUint32: function () {
            var val = this._view.getUint32(this._idx, this._le);
            this._idx += 4;
            return val;
        },

        writeUint32: function (val) {
            this._view.setUint32(this._idx, val, this._le);
            this._idx += 4;
            return this;
        },

        readInt32: function () {
            var val = this._view.getInt32(this._idx, this._le);
            this._idx += 4;
            return val;
        },

        writeInt32: function (val) {
            this._view.setInt32(this._idx, val, this._le);
            this._idx += 4;
            return this;
        },

        readFloat64: function () {
            var val = this._view.getFloat64(this._idx, this._le);
            this._idx += 8;
            return val;
        },

        writeFloat64: function (val) {
            this._view.setFloat64(this._idx, val, this._le);
            this._idx += 8;
            return this;
        },

        // Returns a Float64Array containing @len doubles
        //
        readFloat64Array: function (len) {
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

        readUint32Array: function (len) {
            var arr = [];
            for (var i = 0; i < len; i++) {
                arr.push(this.readUint32());
            }
            return arr;
        },

        peek: function (i) {
            return this._view.getUint8(i >= 0 ? i : this._idx);
        },

        position: function (i) {
            if (i != null) {
                this._idx = i;
                return this;
            }
            return this._idx;
        },

        readCString: function (fixedLen, asciiOnly) {
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

        writeString: function (str, maxLen) {
            var bytesWritten = 0,
                charsToWrite = str.length,
                cval;
            if (maxLen) {
                charsToWrite = Math.min(charsToWrite, maxLen);
            }
            for (var i = 0; i < charsToWrite; i++) {
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

        writeCString: function (str, fixedLen) {
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

        writeBuffer: function (buf, bytes, startIdx) {
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

    BinArray.toArrayBuffer = function (src) {
        var n = src.length,
            dest = new ArrayBuffer(n),
            view = new Uint8Array(dest);
        for (var i = 0; i < n; i++) {
            view[i] = src[i];
        }
        return dest;
    };

    BinArray.bufferCopy = function (dest, destId, src, srcId, bytes) {
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

    BinArray.bufferToUintArray = function (buf, wordLen) {
        if (wordLen == 4) return new Uint32Array(buf);
        if (wordLen == 2) return new Uint16Array(buf);
        if (wordLen == 1) return new Uint8Array(buf);
        error("BinArray.bufferToUintArray() invalid word length:", wordLen)
    };

    BinArray.uintSize = function (i) {
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

        this.header = function () {
            return header;
        };

        // Callback interface: for each record in a .shp file, pass a
        //   record object to a callback function
        //
        this.forEachShape = function (callback) {
            var shape = this.nextShape();
            while (shape) {
                callback(shape);
                shape = this.nextShape();
            }
        };

        // Iterator interface for reading shape records
        this.nextShape = function () {
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

    ShpReader.prototype.type = function () {
        return this.header().type;
    };

    ShpReader.prototype.getCounts = function () {
        var counts = {
            nullCount: 0,
            partCount: 0,
            shapeCount: 0,
            pointCount: 0
        };
        this.forEachShape(function (shp) {
            if (shp.isNull) counts.nullCount++;
            counts.pointCount += shp.pointCount;
            counts.partCount += shp.partCount;
            counts.shapeCount++;
        });
        return counts;
    };

    var ShpType = {
        NULL: 0,
        POINT: 1,
        POLYLINE: 3,
        POLYGON: 5,
        MULTIPOINT: 8,
        POINTZ: 11,
        POLYLINEZ: 13,
        POLYGONZ: 15,
        MULTIPOINTZ: 18,
        POINTM: 21,
        POLYLINEM: 23,
        POLYGONM: 25,
        MULIPOINTM: 28,
        MULTIPATCH: 31 // not supported
    };

    ShpType.isPolygonType = function (t) {
        return t == 5 || t == 15 || t == 25;
    };

    ShpType.isPolylineType = function (t) {
        return t == 3 || t == 13 || t == 23;
    };

    ShpType.isMultiPartType = function (t) {
        return ShpType.isPolygonType(t) || ShpType.isPolylineType(t);
    };

    ShpType.isMultiPointType = function (t) {
        return t == 8 || t == 18 || t == 28;
    };

    ShpType.isZType = function (t) {
        return utils.contains([11, 13, 15, 18], t);
    };

    ShpType.isMType = function (t) {
        return ShpType.isZType(t) || utils.contains([21, 23, 25, 28], t);
    };

    ShpType.hasBounds = function (t) {
        return ShpType.isMultiPartType(t) || ShpType.isMultiPointType(t);
    };

    /* @requires
    mapshaper-encodings
    mapshaper-encoding-detection
    mapshaper-data-utils
    */

// DBF format references:
// http://www.dbf2002.com/dbf-file-format.html
// http://www.digitalpreservation.gov/formats/fdd/fdd000325.shtml
// http://www.clicketyclick.dk/databases/xbase/format/index.html
// http://www.clicketyclick.dk/databases/xbase/format/data_types.html

    var Dbf = {};

// source: http://webhelp.esri.com/arcpad/8.0/referenceguide/index.htm#locales/task_code.htm
    Dbf.languageIds = [0x01, '437', 0x02, '850', 0x03, '1252', 0x08, '865', 0x09, '437', 0x0A, '850', 0x0B, '437', 0x0D, '437', 0x0E, '850', 0x0F, '437', 0x10, '850', 0x11, '437', 0x12, '850', 0x13, '932', 0x14, '850', 0x15, '437', 0x16, '850', 0x17, '865', 0x18, '437', 0x19, '437', 0x1A, '850', 0x1B, '437', 0x1C, '863', 0x1D, '850', 0x1F, '852', 0x22, '852', 0x23, '852', 0x24, '860', 0x25, '850', 0x26, '866', 0x37, '850', 0x40, '852', 0x4D, '936', 0x4E, '949', 0x4F, '950', 0x50, '874', 0x57, '1252', 0x58, '1252', 0x59, '1252', 0x64, '852', 0x65, '866', 0x66, '865', 0x67, '861', 0x6A, '737', 0x6B, '857', 0x6C, '863', 0x78, '950', 0x79, '949', 0x7A, '936', 0x7B, '932', 0x7C, '874', 0x86, '737', 0x87, '852', 0x88, '857', 0xC8, '1250', 0xC9, '1251', 0xCA, '1254', 0xCB, '1253', 0xCC, '1257'];

// Language & Language family names for some code pages
    Dbf.encodingNames = {
        '932': "Japanese",
        '936': "Simplified Chinese",
        '950': "Traditional Chinese",
        '1252': "Western European",
        '949': "Korean",
        '874': "Thai",
        '1250': "Eastern European",
        '1251': "Russian",
        '1254': "Turkish",
        '1253': "Greek",
        '1257': "Baltic"
    };

    Dbf.ENCODING_PROMPT =
        "To avoid corrupted text, re-import using the \"encoding=\" option.\n" +
        "To see a list of supported encodings, run the \"encodings\" command.";

    Dbf.lookupCodePage = function (lid) {
        var i = Dbf.languageIds.indexOf(lid);
        return i == -1 ? null : Dbf.languageIds[i + 1];
    };

    Dbf.readAsciiString = function (bin, size) {
        var require7bit = true;
        var str = bin.readCString(size, require7bit);
        if (str === null) {
            stop("DBF file contains non-ascii text.\n" + Dbf.ENCODING_PROMPT);
        }
        return utils.trim(str);
    };

    Dbf.readStringBytes = function (bin, size, buf) {
        var count = 0, c;
        for (var i = 0; i < size; i++) {
            c = bin.readUint8();
            if (c === 0) break; // C string-terminator (observed in-the-wild)
            if (count > 0 || c != 32) { // ignore leading spaces (e.g. DBF numbers)
                buf[count++] = c;
            }
        }
        // ignore trailing spaces (DBF string fields are typically r-padded w/ spaces)
        while (count > 0 && buf[count - 1] == 32) {
            count--;
        }
        return count;
    };

    Dbf.getAsciiStringReader = function () {
        var buf = new Uint8Array(256); // new Buffer(256);
        return function readAsciiString(bin, size) {
            var str = '',
                n = Dbf.readStringBytes(bin, size, buf);
            for (var i = 0; i < n; i++) {
                str += String.fromCharCode(buf[i]);
            }
            return str;
        };
    };

    Dbf.getEncodedStringReader = function (encoding) {
        var buf = new Buffer(256),
            isUtf8 = Shpsys.standardizeEncodingName(encoding) == 'utf8';
        return function readEncodedString(bin, size) {
            var i = Dbf.readStringBytes(bin, size, buf),
                str;
            if (i === 0) {
                str = '';
            } else if (isUtf8) {
                str = buf.toString('utf8', 0, i);
            } else {
                str = Shpsys.decodeString(buf.slice(0, i), encoding); // slice references same memory
            }
            return str;
        };
    };

    Dbf.getStringReader = function (encoding) {
        if (!encoding || encoding === 'ascii') {
            return Dbf.getAsciiStringReader();
            // return Dbf.readAsciiString;
        } else {
            return Dbf.getEncodedStringReader(encoding);
        }
    };

    Dbf.bufferContainsHighBit = function (buf, n) {
        for (var i = 0; i < n; i++) {
            if (buf[i] >= 128) return true;
        }
        return false;
    };

    Dbf.getNumberReader = function () {
        var read = Dbf.getAsciiStringReader();
        return function readNumber(bin, size) {
            var str = read(bin, size);
            var val;
            if (str.indexOf(',') >= 0) {
                str = str.replace(',', '.'); // handle comma decimal separator
            }
            val = parseFloat(str);
            return isNaN(val) ? null : val;
        };
    };

    Dbf.readInt = function (bin, size) {
        return bin.readInt32();
    };

    Dbf.readBool = function (bin, size) {
        var c = bin.readCString(size),
            val = null;
        if (/[ty]/i.test(c)) val = true;
        else if (/[fn]/i.test(c)) val = false;
        return val;
    };

    Dbf.readDate = function (bin, size) {
        var str = bin.readCString(size),
            yr = str.substr(0, 4),
            mo = str.substr(4, 2),
            day = str.substr(6, 2);
        return new Date(Date.UTC(+yr, +mo - 1, +day));
    };

// cf. http://code.google.com/p/stringencoding/
//
// @src is a Buffer or ArrayBuffer or filename
//
    function DbfReader(src, encodingArg) {
        if (utils.isString(src)) {
            error("[DbfReader] Expected a buffer, not a string");
        }
        var bin = new BinArray(src);
        var header = readHeader(bin);
        var encoding = encodingArg || null;

        this.size = function () {
            return header.recordCount;
        };

        this.readRow = function (i) {
            // create record reader on-the-fly
            // (delays encoding detection until we need to read data)
            return getRecordReader(header.fields)(i);
        };

        this.getFields = getFieldNames;

        this.getBuffer = function () {
            return bin.buffer();
        };

        this.deleteField = function (f) {
            header.fields = header.fields.filter(function (field) {
                return field.name != f;
            });
        };

        this.readRows = function () {
            var reader = getRecordReader(header.fields);
            var data = [];
            for (var r = 0, n = this.size(); r < n; r++) {
                data.push(reader(r));
            }
            return data;
        };

        function readHeader(bin) {
            bin.position(0).littleEndian();
            var header = {
                version: bin.readInt8(),
                updateYear: bin.readUint8(),
                updateMonth: bin.readUint8(),
                updateDay: bin.readUint8(),
                recordCount: bin.readUint32(),
                dataOffset: bin.readUint16(),
                recordSize: bin.readUint16(),
                incompleteTransaction: bin.skipBytes(2).readUint8(),
                encrypted: bin.readUint8(),
                mdx: bin.skipBytes(12).readUint8(),
                ldid: bin.readUint8()
            };
            var colOffs = 1; // first column starts on second byte of record
            var field;
            bin.skipBytes(2);
            header.fields = [];

            // Detect header terminator (LF is standard, CR has been seen in the wild)
            while (bin.peek() != 0x0D && bin.peek() != 0x0A && bin.position() < header.dataOffset - 1) {
                field = readFieldHeader(bin);
                field.columnOffset = colOffs;
                header.fields.push(field);
                colOffs += field.size;
            }
            if (colOffs != header.recordSize) {
                error("Record length mismatch; header:", header.recordSize, "detected:", colOffs);
            }
            if (bin.peek() != 0x0D) {
                message('Found a non-standard DBF header terminator (' + bin.peek() + '). DBF file may be corrupted.');
            }

            // Uniqify header names
            Shpsys.getUniqFieldNames(utils.pluck(header.fields, 'name')).forEach(function (name2, i) {
                header.fields[i].name = name2;
            });

            return header;
        }

        function readFieldHeader(bin) {
            return {
                name: bin.readCString(11),
                type: String.fromCharCode(bin.readUint8()),
                address: bin.readUint32(),
                size: bin.readUint8(),
                decimals: bin.readUint8(),
                id: bin.skipBytes(2).readUint8(),
                position: bin.skipBytes(2).readUint8(),
                indexFlag: bin.skipBytes(7).readUint8()
            };
        }

        function getFieldNames() {
            return utils.pluck(header.fields, 'name');
        }

        function getRowOffset(r) {
            return header.dataOffset + header.recordSize * r;
        }

        function getEncoding() {
            if (!encoding) {
                encoding = findStringEncoding();
                if (!encoding) {
                    // fall back to utf8 if detection fails (so GUI can continue without further errors)
                    encoding = 'utf8';
                    stop("Unable to auto-detect the text encoding of the DBF file.\n" + Dbf.ENCODING_PROMPT);
                }
            }
            return encoding;
        }

        // Create new record objects using object literal syntax
        // (Much faster in v8 and other engines than assigning a series of properties
        //  to an object)
        function getRecordConstructor() {
            var args = getFieldNames().map(function (name, i) {
                return JSON.stringify(name) + ': arguments[' + i + ']';
            });
            return new Function('return {' + args.join(',') + '};');
        }

        function findEofPos(bin) {
            var pos = bin.size() - 1;
            if (bin.peek(pos) != 0x1A) { // last byte may or may not be EOF
                pos++;
            }
            return pos;
        }

        function getRecordReader(fields) {
            var readers = fields.map(getFieldReader),
                eofOffs = findEofPos(bin),
                create = getRecordConstructor(),
                values = [];

            return function readRow(r) {
                var offs = getRowOffset(r),
                    fieldOffs, field;
                for (var c = 0, cols = fields.length; c < cols; c++) {
                    field = fields[c];
                    fieldOffs = offs + field.columnOffset;
                    if (fieldOffs + field.size > eofOffs) {
                        stop('Invalid DBF file: encountered end-of-file while reading data');
                    }
                    bin.position(fieldOffs);
                    values[c] = readers[c](bin, field.size);
                }
                return create.apply(null, values);
            };
        }

        // @f Field metadata from dbf header
        function getFieldReader(f) {
            var type = f.type,
                r = null;
            if (type == 'I') {
                r = Dbf.readInt;
            } else if (type == 'F' || type == 'N') {
                r = Dbf.getNumberReader();
            } else if (type == 'L') {
                r = Dbf.readBool;
            } else if (type == 'D') {
                r = Dbf.readDate;
            } else if (type == 'C') {
                r = Dbf.getStringReader(getEncoding());
            } else {
                message("Field \"" + field.name + "\" has an unsupported type (" + field.type + ") -- converting to null values");
                r = function () {
                    return null;
                };
            }
            return r;
        }

        function findStringEncoding() {
            var ldid = header.ldid,
                codepage = Dbf.lookupCodePage(ldid),
                samples = getNonAsciiSamples(50),
                only7bit = samples.length === 0,
                encoding, msg;

            // First, check the ldid (language driver id) (an obsolete way to specify which
            // codepage to use for text encoding.)
            // ArcGIS up to v.10.1 sets ldid and encoding based on the 'locale' of the
            // user's Windows system :P
            //
            if (codepage && ldid != 87) {
                // if 8-bit data is found and codepage is detected, use the codepage,
                // except ldid 87, which some GIS software uses regardless of encoding.
                encoding = codepage;
            } else if (only7bit) {
                // Text with no 8-bit chars should be compatible with 7-bit ascii
                // (Most encodings are supersets of ascii)
                encoding = 'ascii';
            }

            // As a last resort, try to guess the encoding:
            if (!encoding) {
                encoding = Shpsys.detectEncoding(samples);
            }

            // Show a sample of decoded text if non-ascii-range text has been found
            if (encoding && samples.length > 0) {
                msg = Shpsys.decodeSamples(encoding, samples);
                msg = Shpsys.formatStringsAsGrid(msg.split('\n'));
                msg = "\nSample text containing non-ascii characters:" + (msg.length > 60 ? '\n' : '') + msg;
                msg = "Detected DBF text encoding: " + encoding + (encoding in Dbf.encodingNames ? " (" + Dbf.encodingNames[encoding] + ")" : "") + msg;
                message(msg);
            }
            return encoding;
        }

        // Return up to @size buffers containing text samples
        // with at least one byte outside the 7-bit ascii range.
        function getNonAsciiSamples(size) {
            var samples = [];
            var stringFields = header.fields.filter(function (f) {
                return f.type == 'C';
            });
            var buf = new Buffer(256);
            var index = {};
            var f, chars, sample, hash;
            for (var r = 0, rows = header.recordCount; r < rows; r++) {
                for (var c = 0, cols = stringFields.length; c < cols; c++) {
                    if (samples.length >= size) break;
                    f = stringFields[c];
                    bin.position(getRowOffset(r) + f.columnOffset);
                    chars = Dbf.readStringBytes(bin, f.size, buf);
                    if (chars > 0 && Dbf.bufferContainsHighBit(buf, chars)) {
                        sample = new Buffer(buf.slice(0, chars)); //
                        hash = sample.toString('hex');
                        if (hash in index === false) { // avoid duplicate samples
                            index[hash] = true;
                            samples.push(sample);
                        }
                    }
                }
            }
            return samples;
        }

    }

    /* @requires
    dbf-reader
    mapshaper-data-table
    */

    var dataFieldRxp = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

    Shpsys.importDbfTable = function (buf, o) {
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

        this.exportAsDbf = function (encoding) {
            // export original dbf bytes if records haven't been touched.
            return reader && !altered ? reader.getBuffer() : getTable().exportAsDbf(encoding);
        };

        this.getRecordAt = function (i) {
            return reader ? reader.readRow(i) : table.getRecordAt(i);
        };

        this.deleteField = function (f) {
            if (table) {
                table.deleteField(f);
            } else {
                altered = true;
                reader.deleteField(f);
            }
        };

        this.getRecords = function () {
            return getTable().getRecords();
        };

        this.getFields = function () {
            return reader ? reader.getFields() : table.getFields();
        };

        this.size = function () {
            return reader ? reader.size() : table.size();
        };
    }

    var dataTableProto = {

        fieldExists: function (name) {
            return utils.contains(this.getFields(), name);
        },

        toString: function () {
            return JSON.stringify(this);
        },

        toJSON: function () {
            return this.getRecords();
        },

        addField: function (name, init) {
            var useFunction = utils.isFunction(init);
            if (!utils.isNumber(init) && !utils.isString(init) && !useFunction) {
                error("DataTable#addField() requires a string, number or function for initialization");
            }
            if (this.fieldExists(name)) error("DataTable#addField() tried to add a field that already exists:", name);
            if (!dataFieldRxp.test(name)) error("DataTable#addField() invalid field name:", name);

            this.getRecords().forEach(function (obj, i) {
                obj[name] = useFunction ? init(obj, i) : init;
            });
        },

        addIdField: function () {
            this.addField('FID', function (obj, i) {
                return i;
            });
        },

        deleteField: function (f) {
            this.getRecords().forEach(function (o) {
                delete o[f];
            });
        },

        getFields: function () {
            var records = this.getRecords(),
                first = records[0];
            return first ? Object.keys(first) : [];
        },

        update: function (f) {
            var records = this.getRecords();
            for (var i = 0, n = records.length; i < n; i++) {
                records[i] = f(records[i], i);
            }
        },

        clone: function () {
            // TODO: this could be sped up using a record constructor function
            // (see getRecordConstructor() in DbfReader)
            var records2 = this.getRecords().map(function (rec) {
                return utils.extend({}, rec);
            });
            return new DataTable(records2);
        },

        size: function () {
            return this.getRecords().length;
        }
    };


    utils.extend(ShapefileTable.prototype, dataTableProto);

    /* @requires mapshaper-common, mapshaper-geom, mapshaper-shape-iter */

// An interface for managing a collection of paths.
// Constructor signatures:
//
// ArcCollection(arcs)
//    arcs is an array of polyline arcs; each arc is an array of points: [[x0, y0], [x1, y1], ... ]
//
// ArcCollection(nn, xx, yy)
//    nn is an array of arc lengths; xx, yy are arrays of concatenated coords;
    function ArcCollection() {
        var _xx, _yy,  // coordinates data
            _ii, _nn,  // indexes, sizes
            _zz, _zlimit = 0, // simplification
            _bb, _allBounds, // bounding boxes
            _arcIter, _filteredArcIter; // path iterators

        if (arguments.length == 1) {
            initLegacyArcs(arguments[0]);  // want to phase this out
        } else if (arguments.length == 3) {
            initXYData.apply(this, arguments);
        } else {
            error("ArcCollection() Invalid arguments");
        }

        function initLegacyArcs(arcs) {
            var xx = [], yy = [];
            var nn = arcs.map(function (points) {
                var n = points ? points.length : 0;
                for (var i = 0; i < n; i++) {
                    xx.push(points[i][0]);
                    yy.push(points[i][1]);
                }
                return n;
            });
            initXYData(nn, xx, yy);
        }

        function initXYData(nn, xx, yy) {
            var size = nn.length;
            if (nn instanceof Array) nn = new Uint32Array(nn);
            if (xx instanceof Array) xx = new Float64Array(xx);
            if (yy instanceof Array) yy = new Float64Array(yy);
            _xx = xx;
            _yy = yy;
            _nn = nn;
            _zz = null;
            _zlimit = 0;
            _filteredArcIter = null;

            // generate array of starting idxs of each arc
            _ii = new Uint32Array(size);
            for (var idx = 0, j = 0; j < size; j++) {
                _ii[j] = idx;
                idx += nn[j];
            }

            if (idx != _xx.length || _xx.length != _yy.length) {
                error("ArcCollection#initXYData() Counting error");
            }

            initBounds();
            // Pre-allocate some path iterators for repeated use.
            _arcIter = new ArcIter(_xx, _yy);
            return this;
        }

        function initZData(zz) {
            if (!zz) {
                _zz = null;
                _zlimit = 0;
                _filteredArcIter = null;
            } else {
                if (zz.length != _xx.length) error("ArcCollection#initZData() mismatched arrays");
                if (zz instanceof Array) zz = new Float64Array(zz);
                _zz = zz;
                _filteredArcIter = new FilteredArcIter(_xx, _yy, _zz);
            }
        }

        function initBounds() {
            var data = calcArcBounds(_xx, _yy, _nn);
            _bb = data.bb;
            _allBounds = data.bounds;
        }

        function calcArcBounds(xx, yy, nn) {
            var numArcs = nn.length,
                bb = new Float64Array(numArcs * 4),
                bounds = new Bounds(),
                arcOffs = 0,
                arcLen,
                j, b;
            for (var i = 0; i < numArcs; i++) {
                arcLen = nn[i];
                if (arcLen > 0) {
                    j = i * 4;
                    b = Shpsys.calcArcBounds(xx, yy, arcOffs, arcLen);
                    bb[j++] = b[0];
                    bb[j++] = b[1];
                    bb[j++] = b[2];
                    bb[j] = b[3];
                    arcOffs += arcLen;
                    bounds.mergeBounds(b);
                }
            }
            return {
                bb: bb,
                bounds: bounds
            };
        }

        this.updateVertexData = function (nn, xx, yy, zz) {
            initXYData(nn, xx, yy);
            initZData(zz || null);
        };

        // Give access to raw data arrays...
        this.getVertexData = function () {
            return {
                xx: _xx,
                yy: _yy,
                zz: _zz,
                bb: _bb,
                nn: _nn,
                ii: _ii
            };
        };

        this.getCopy = function () {
            var copy = new ArcCollection(new Int32Array(_nn), new Float64Array(_xx),
                new Float64Array(_yy));
            if (_zz) {
                copy.setThresholds(new Float64Array(_zz));
                copy.setRetainedInterval(_zlimit);
            }
            return copy;
        };

        function getFilteredPointCount() {
            var zz = _zz, z = _zlimit;
            if (!zz || !z) return this.getPointCount();
            var count = 0;
            for (var i = 0, n = zz.length; i < n; i++) {
                if (zz[i] >= z) count++;
            }
            return count;
        }

        function getFilteredVertexData() {
            var len2 = getFilteredPointCount();
            var arcCount = _nn.length;
            var xx2 = new Float64Array(len2),
                yy2 = new Float64Array(len2),
                zz2 = new Float64Array(len2),
                nn2 = new Int32Array(arcCount),
                i = 0, i2 = 0,
                n, n2;

            for (var arcId = 0; arcId < arcCount; arcId++) {
                n2 = 0;
                n = _nn[arcId];
                for (var end = i + n; i < end; i++) {
                    if (_zz[i] >= _zlimit) {
                        xx2[i2] = _xx[i];
                        yy2[i2] = _yy[i];
                        zz2[i2] = _zz[i];
                        i2++;
                        n2++;
                    }
                }
                if (n2 < 2) error("Collapsed arc"); // endpoints should be z == Infinity
                nn2[arcId] = n2;
            }
            return {
                xx: xx2,
                yy: yy2,
                zz: zz2,
                nn: nn2
            };
        }

        this.getFilteredCopy = function () {
            if (!_zz || _zlimit === 0) return this.getCopy();
            var data = getFilteredVertexData();
            var copy = new ArcCollection(data.nn, data.xx, data.yy);
            copy.setThresholds(data.zz);
            return copy;
        };

        // Return arcs as arrays of [x, y] points (intended for testing).
        this.toArray = function () {
            var arr = [];
            this.forEach(function (iter) {
                var arc = [];
                while (iter.hasNext()) {
                    arc.push([iter.x, iter.y]);
                }
                arr.push(arc);
            });
            return arr;
        };

        this.toJSON = function () {
            return this.toArray();
        };

        // @cb function(i, j, xx, yy)
        this.forEachArcSegment = function (arcId, cb) {
            var fw = arcId >= 0,
                absId = fw ? arcId : ~arcId,
                zlim = this.getRetainedInterval(),
                n = _nn[absId],
                step = fw ? 1 : -1,
                v1 = fw ? _ii[absId] : _ii[absId] + n - 1,
                v2 = v1,
                count = 0;

            for (var j = 1; j < n; j++) {
                v2 += step;
                if (zlim === 0 || _zz[v2] >= zlim) {
                    cb(v1, v2, _xx, _yy);
                    v1 = v2;
                    count++;
                }
            }
            return count;
        };

        // @cb function(i, j, xx, yy)
        this.forEachSegment = function (cb) {
            var count = 0;
            for (var i = 0, n = this.size(); i < n; i++) {
                count += this.forEachArcSegment(i, cb);
            }
            return count;
        };

        this.transformPoints = function (f) {
            var xx = _xx, yy = _yy, arcId = -1, n = 0, p;
            for (var i = 0, len = xx.length; i < len; i++, n--) {
                while (n === 0) {
                    n = _nn[++arcId];
                }
                p = f(xx[i], yy[i], arcId);
                if (p) {
                    xx[i] = p[0];
                    yy[i] = p[1];
                }
            }
            initBounds();
        };

        // Return an ArcIter object for each path in the dataset
        //
        this.forEach = function (cb) {
            for (var i = 0, n = this.size(); i < n; i++) {
                cb(this.getArcIter(i), i);
            }
        };

        // Iterate over arcs with access to low-level data
        //
        this.forEach2 = function (cb) {
            for (var arcId = 0, n = this.size(); arcId < n; arcId++) {
                cb(_ii[arcId], _nn[arcId], _xx, _yy, _zz, arcId);
            }
        };

        this.forEach3 = function (cb) {
            var start, end, xx, yy, zz;
            for (var arcId = 0, n = this.size(); arcId < n; arcId++) {
                start = _ii[arcId];
                end = start + _nn[arcId];
                xx = _xx.subarray(start, end);
                yy = _yy.subarray(start, end);
                if (_zz) zz = _zz.subarray(start, end);
                cb(xx, yy, zz, arcId);
            }
        };

        // Remove arcs that don't pass a filter test and re-index arcs
        // Return array mapping original arc ids to re-indexed ids. If arr[n] == -1
        // then arc n was removed. arr[n] == m indicates that the arc at n was
        // moved to index m.
        // Return null if no arcs were re-indexed (and no arcs were removed)
        //
        this.filter = function (cb) {
            var map = new Int32Array(this.size()),
                goodArcs = 0,
                goodPoints = 0;
            for (var i = 0, n = this.size(); i < n; i++) {
                if (cb(this.getArcIter(i), i)) {
                    map[i] = goodArcs++;
                    goodPoints += _nn[i];
                } else {
                    map[i] = -1;
                }
            }
            if (goodArcs === this.size()) {
                return null;
            } else {
                condenseArcs(map);
                if (goodArcs === 0) {
                    // no remaining arcs
                }
                return map;
            }
        };

        function condenseArcs(map) {
            var goodPoints = 0,
                goodArcs = 0,
                copyElements = utils.copyElements,
                k, arcLen;
            for (var i = 0, n = map.length; i < n; i++) {
                k = map[i];
                arcLen = _nn[i];
                if (k > -1) {
                    copyElements(_xx, _ii[i], _xx, goodPoints, arcLen);
                    copyElements(_yy, _ii[i], _yy, goodPoints, arcLen);
                    if (_zz) copyElements(_zz, _ii[i], _zz, goodPoints, arcLen);
                    _nn[k] = arcLen;
                    goodPoints += arcLen;
                    goodArcs++;
                }
            }

            initXYData(_nn.subarray(0, goodArcs), _xx.subarray(0, goodPoints),
                _yy.subarray(0, goodPoints));
            if (_zz) initZData(_zz.subarray(0, goodPoints));
        }

        this.dedupCoords = function () {
            var arcId = 0, i = 0, i2 = 0,
                arcCount = this.size(),
                zz = _zz,
                arcLen, arcLen2;
            while (arcId < arcCount) {
                arcLen = _nn[arcId];
                arcLen2 = Shpsys.dedupArcCoords(i, i2, arcLen, _xx, _yy, zz);
                _nn[arcId] = arcLen2;
                i += arcLen;
                i2 += arcLen2;
                arcId++;
            }
            if (i > i2) {
                initXYData(_nn, _xx.subarray(0, i2), _yy.subarray(0, i2));
                if (zz) initZData(zz.subarray(0, i2));
            }
            return i - i2;
        };

        this.getVertex = function (arcId, nth) {
            var i = this.indexOfVertex(arcId, nth);
            return {
                x: _xx[i],
                y: _yy[i]
            };
        };

        // @nth: index of vertex. ~(idx) starts from the opposite endpoint
        this.indexOfVertex = function (arcId, nth) {
            var absId = arcId < 0 ? ~arcId : arcId,
                len = _nn[absId];
            if (nth < 0) nth = len + nth;
            if (absId != arcId) nth = len - nth - 1;
            if (nth < 0 || nth >= len) error("[ArcCollection] out-of-range vertex id");
            return _ii[absId] + nth;
        };

        // Test whether the vertex at index @idx is the endpoint of an arc
        this.pointIsEndpoint = function (idx) {
            var ii = _ii,
                nn = _nn;
            for (var j = 0, n = ii.length; j < n; j++) {
                if (idx === ii[j] || idx === ii[j] + nn[j] - 1) return true;
            }
            return false;
        };

        // Tests if arc endpoints have same x, y coords
        // (arc may still have collapsed);
        this.arcIsClosed = function (arcId) {
            var i = this.indexOfVertex(arcId, 0),
                j = this.indexOfVertex(arcId, -1);
            return i != j && _xx[i] == _xx[j] && _yy[i] == _yy[j];
        };

        // Tests if first and last segments mirror each other
        // A 3-vertex arc with same endpoints tests true
        this.arcIsLollipop = function (arcId) {
            var len = this.getArcLength(arcId),
                i, j;
            if (len <= 2 || !this.arcIsClosed(arcId)) return false;
            i = this.indexOfVertex(arcId, 1);
            j = this.indexOfVertex(arcId, -2);
            return _xx[i] == _xx[j] && _yy[i] == _yy[j];
        };

        this.arcIsDegenerate = function (arcId) {
            var iter = this.getArcIter(arcId);
            var i = 0,
                x, y;
            while (iter.hasNext()) {
                if (i > 0) {
                    if (x != iter.x || y != iter.y) return false;
                }
                x = iter.x;
                y = iter.y;
                i++;
            }
            return true;
        };

        this.getArcLength = function (arcId) {
            return _nn[absArcId(arcId)];
        };

        this.getArcIter = function (arcId) {
            var fw = arcId >= 0,
                i = fw ? arcId : ~arcId,
                iter = _zz && _zlimit ? _filteredArcIter : _arcIter;
            if (i >= _nn.length) {
                error("#getArcId() out-of-range arc id:", arcId);
            }
            return iter.init(_ii[i], _nn[i], fw, _zlimit);
        };

        this.getShapeIter = function (ids) {
            return new ShapeIter(this).init(ids);
        };

        // Add simplification data to the dataset
        // @thresholds is either a single typed array or an array of arrays of removal thresholds for each arc;
        //
        this.setThresholds = function (thresholds) {
            var n = this.getPointCount(),
                zz = null;
            if (!thresholds) {
                // nop
            } else if (thresholds.length == n) {
                zz = thresholds;
            } else if (thresholds.length == this.size()) {
                zz = flattenThresholds(thresholds, n);
            } else {
                error("Invalid threshold data");
            }
            initZData(zz);
            return this;
        };

        function flattenThresholds(arr, n) {
            var zz = new Float64Array(n),
                i = 0;
            arr.forEach(function (arr) {
                for (var j = 0, n = arr.length; j < n; i++, j++) {
                    zz[i] = arr[j];
                }
            });
            if (i != n) error("Mismatched thresholds");
            return zz;
        }

        // bake in current simplification level, if any
        this.flatten = function () {
            if (_zlimit > 0) {
                var data = getFilteredVertexData();
                this.updateVertexData(data.nn, data.xx, data.yy);
                _zlimit = 0;
            } else {
                _zz = null;
            }
        };

        this.getRetainedInterval = function () {
            return _zlimit;
        };

        this.setRetainedInterval = function (z) {
            _zlimit = z;
            return this;
        };

        this.getRetainedPct = function () {
            return this.getPctByThreshold(_zlimit);
        };

        this.setRetainedPct = function (pct) {
            if (pct >= 1) {
                _zlimit = 0;
            } else {
                _zlimit = this.getThresholdByPct(pct);
                _zlimit = Shpsys.clampIntervalByPct(_zlimit, pct);
            }
            return this;
        };

        // Return array of z-values that can be removed for simplification
        //
        this.getRemovableThresholds = function (nth) {
            if (!_zz) error("[arcs] Missing simplification data.");
            var skip = nth | 1,
                arr = new Float64Array(Math.ceil(_zz.length / skip)),
                z;
            for (var i = 0, j = 0, n = this.getPointCount(); i < n; i += skip) {
                z = _zz[i];
                if (z != Infinity) {
                    arr[j++] = z;
                }
            }
            return arr.subarray(0, j);
        };

        this.getArcThresholds = function (arcId) {
            if (!(arcId >= 0 && arcId < this.size())) {
                error("[arcs] Invalid arc id:", arcId);
            }
            var start = _ii[arcId],
                end = start + _nn[arcId];
            return _zz.subarray(start, end);
        };

        this.getPctByThreshold = function (val) {
            var arr, rank, pct;
            if (val > 0) {
                arr = this.getRemovableThresholds();
                rank = utils.findRankByValue(arr, val);
                pct = arr.length > 0 ? 1 - (rank - 1) / arr.length : 1;
            } else {
                pct = 1;
            }
            return pct;
        };

        this.getThresholdByPct = function (pct) {
            var tmp = this.getRemovableThresholds(),
                rank, z;
            if (tmp.length === 0) { // No removable points
                rank = 0;
            } else {
                rank = Math.floor((1 - pct) * (tmp.length + 2));
            }

            if (rank <= 0) {
                z = 0;
            } else if (rank > tmp.length) {
                z = Infinity;
            } else {
                z = utils.findValueByRank(tmp, rank);
            }
            return z;
        };

        this.arcIntersectsBBox = function (i, b1) {
            var b2 = _bb,
                j = i * 4;
            return b2[j] <= b1[2] && b2[j + 2] >= b1[0] && b2[j + 3] >= b1[1] && b2[j + 1] <= b1[3];
        };

        this.arcIsContained = function (i, b1) {
            var b2 = _bb,
                j = i * 4;
            return b2[j] >= b1[0] && b2[j + 2] <= b1[2] && b2[j + 1] >= b1[1] && b2[j + 3] <= b1[3];
        };

        this.arcIsSmaller = function (i, units) {
            var bb = _bb,
                j = i * 4;
            return bb[j + 2] - bb[j] < units && bb[j + 3] - bb[j + 1] < units;
        };

        // TODO: allow datasets in lat-lng coord range to be flagged as planar
        this.isPlanar = function () {
            return !Shpsys.probablyDecimalDegreeBounds(this.getBounds());
        };

        this.size = function () {
            return _ii && _ii.length || 0;
        };

        this.getPointCount = function () {
            return _xx && _xx.length || 0;
        };

        this.getBounds = function () {
            return _allBounds.clone();
        };

        this.getSimpleShapeBounds = function (arcIds, bounds) {
            bounds = bounds || new Bounds();
            for (var i = 0, n = arcIds.length; i < n; i++) {
                this.mergeArcBounds(arcIds[i], bounds);
            }
            return bounds;
        };

        this.getSimpleShapeBounds2 = function (arcIds, arr) {
            var bbox = arr || [],
                bb = _bb,
                id = absArcId(arcIds[0]) * 4;
            bbox[0] = bb[id];
            bbox[1] = bb[++id];
            bbox[2] = bb[++id];
            bbox[3] = bb[++id];
            for (var i = 1, n = arcIds.length; i < n; i++) {
                id = absArcId(arcIds[i]) * 4;
                if (bb[id] < bbox[0]) bbox[0] = bb[id];
                if (bb[++id] < bbox[1]) bbox[1] = bb[id];
                if (bb[++id] > bbox[2]) bbox[2] = bb[id];
                if (bb[++id] > bbox[3]) bbox[3] = bb[id];
            }
            return bbox;
        };

        this.getMultiShapeBounds = function (shapeIds, bounds) {
            bounds = bounds || new Bounds();
            if (shapeIds) { // handle null shapes
                for (var i = 0, n = shapeIds.length; i < n; i++) {
                    this.getSimpleShapeBounds(shapeIds[i], bounds);
                }
            }
            return bounds;
        };

        this.mergeArcBounds = function (arcId, bounds) {
            if (arcId < 0) arcId = ~arcId;
            var offs = arcId * 4;
            bounds.mergeBounds(_bb[offs], _bb[offs + 1], _bb[offs + 2], _bb[offs + 3]);
        };
    }

    ArcCollection.prototype.inspect = function () {
        var n = this.getPointCount(), str;
        if (n < 50) {
            str = JSON.stringify(this.toArray());
        } else {
            str = '[ArcCollection (' + this.size() + ')]';
        }
        return str;
    };

// Remove duplicate coords and NaNs
    Shpsys.dedupArcCoords = function (src, dest, arcLen, xx, yy, zz) {
        var n = 0, n2 = 0; // counters
        var x, y, i, j, keep;
        while (n < arcLen) {
            j = src + n;
            x = xx[j];
            y = yy[j];
            keep = x == x && y == y && (n2 === 0 || x != xx[j - 1] || y != yy[j - 1]);
            if (keep) {
                i = dest + n2;
                xx[i] = x;
                yy[i] = y;
                n2++;
            }
            if (zz && n2 > 0 && (keep || zz[j] > zz[i])) {
                zz[i] = zz[j];
            }
            n++;
        }
        return n2 > 1 ? n2 : 0;
    };


// Constructor takes arrays of coords: xx, yy, zz (optional)
//
// Iterate over the points of an arc
// properties: x, y
// method: hasNext()
// usage:
//   while (iter.hasNext()) {
//     iter.x, iter.y; // do something w/ x & y
//   }
//
    function ArcIter(xx, yy) {
        this._i = 0;
        this._n = 0;
        this._inc = 1;
        this._xx = xx;
        this._yy = yy;
        this.i = 0;
        this.x = 0;
        this.y = 0;
    }

    ArcIter.prototype.init = function (i, len, fw) {
        if (fw) {
            this._i = i;
            this._inc = 1;
        } else {
            this._i = i + len - 1;
            this._inc = -1;
        }
        this._n = len;
        return this;
    };

    ArcIter.prototype.hasNext = function () {
        var i = this._i;
        if (this._n > 0) {
            this._i = i + this._inc;
            this.x = this._xx[i];
            this.y = this._yy[i];
            this.i = i;
            this._n--;
            return true;
        }
        return false;
    };

    function FilteredArcIter(xx, yy, zz) {
        var _zlim = 0,
            _i = 0,
            _inc = 1,
            _stop = 0;

        this.init = function (i, len, fw, zlim) {
            _zlim = zlim || 0;
            if (fw) {
                _i = i;
                _inc = 1;
                _stop = i + len;
            } else {
                _i = i + len - 1;
                _inc = -1;
                _stop = i - 1;
            }
            return this;
        };

        this.hasNext = function () {
            // using local vars is significantly faster when skipping many points
            var zarr = zz,
                i = _i,
                j = i,
                zlim = _zlim,
                stop = _stop,
                inc = _inc;
            if (i == stop) return false;
            do {
                j += inc;
            } while (j != stop && zarr[j] < zlim);
            _i = j;
            this.x = xx[i];
            this.y = yy[i];
            this.i = i;
            return true;
        };
    }

// Iterate along a path made up of one or more arcs.
// Similar interface to ArcIter()
//
    function ShapeIter(arcs) {
        this._arcs = arcs;
        this._i = 0;
        this._n = 0;
        this.x = 0;
        this.y = 0;
    }

    ShapeIter.prototype.hasNext = function () {
        var arc = this._arc;
        if (this._i < this._n === false) {
            return false;
        }
        if (arc.hasNext()) {
            this.x = arc.x;
            this.y = arc.y;
            return true;
        }
        this.nextArc();
        return this.hasNext();
    };

    ShapeIter.prototype.init = function (ids) {
        this._ids = ids;
        this._n = ids.length;
        this.reset();
        return this;
    };

    ShapeIter.prototype.nextArc = function () {
        var i = this._i + 1;
        if (i < this._n) {
            this._arc = this._arcs.getArcIter(this._ids[i]);
            if (i > 0) this._arc.hasNext(); // skip first point
        }
        this._i = i;
    };

    ShapeIter.prototype.reset = function () {
        this._i = -1;
        this.nextArc();
    };

    function Bounds() {
        if (arguments.length > 0) {
            this.setBounds.apply(this, arguments);
        }
    }


    function Transform() {
        this.mx = this.my = 1;
        this.bx = this.by = 0;
    }

Shpsys.cleanArgv = function(argv) {
    argv = argv.map(function(s) {return s.trim();}); // trim whitespace
    argv = argv.filter(function(s) {return s !== '';}); // remove empty tokens
    argv = argv.map(utils.trimQuotes); // remove one level of single or dbl quotes
    return argv;
};

function messageArgs(args) {
    var arr = utils.toArray(args);
    var cmd = Shpsys.getStateVar('current_command');
    if (cmd && cmd != 'help' && cmd != 'info') {
        arr.unshift('[' + cmd + ']');
    }
    return arr;
}


Shpsys.message = function() {
    Shpsys.logArgs(arguments);
};

function message() {
    Shpsys.message.apply(null, messageArgs(arguments));
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
    return str + utils.repeatString(pad, size - str.length);
};

Shpsys.repeatString = function(src, n) {
    var str = "";
    for (var i=0; i<n; i++)
        str += src;
    return str;
};

utils.find = function(arr, test, ctx) {
    var matches = arr.filter(test, ctx);
    return matches.length === 0 ? null : matches[0];
};

// Expose internal objects for testing
utils.extend(api.internal, {
    Catalog: Catalog,
    DataTable: DataTable,
    BinArray: BinArray,
    ShpReader: ShpReader,
    ShpType: ShpType,
    Dbf: Dbf,
    DbfReader: DbfReader,
    ShapefileTable: ShapefileTable,
    ArcCollection: ArcCollection,
    ArcIter: ArcIter,
    ShapeIter: ShapeIter,
    Bounds: Bounds,
    Transform: Transform /*,
    NodeCollection: NodeCollection,
    PolygonIndex: PolygonIndex,
    PathIndex: PathIndex,
    topojson: TopoJSON,
    geojson: GeoJSON,
    svg: SVG,
    UserError: UserError
    */
});