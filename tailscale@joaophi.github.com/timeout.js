import GLib from "gi://GLib";

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

export const clearSources = () => {
    while (SOURCES.length > 0) {
        clearSource(SOURCES[0]);
    }
};

export const setTimeout = (func, delay, ...args) => addSource(func, delay, args, true);
export const setInterval = (func, delay, ...args) => addSource(func, delay, args, false);

export const clearTimeout = clearSource;
export const clearInterval = clearSource;
