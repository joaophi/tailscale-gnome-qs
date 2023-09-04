const { GLib } = imports.gi;

const SOURCES = [];

const addSource = (func, delay, args, remove) => {
    const handle = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        func(...args);
        if (remove) {
            clearSource(handle);
            return GLib.SOURCE_REMOVE;
        } else {
            return GLib.SOURCE_CONTINUE;
        }
    });
    SOURCES.push(handle);
    return handle;
}

const clearSource = (handle) => {
    GLib.Source.remove(handle);
    const index = SOURCES.indexOf(handle);
    if (index > -1) {
        SOURCES.splice(index, 1);
    }
}

var clearSources = () => {
    while (SOURCES.length > 0) {
        clearSource(SOURCES[0]);
    }
};

var setTimeout = (func, delay, ...args) => addSource(func, delay, args, true);
var setInterval = (func, delay, ...args) => addSource(func, delay, args, false);

var clearTimeout = clearSource;
var clearInterval = clearSource;
