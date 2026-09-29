// Shared by extension.js and prefs.js: starts the clock viewer with the
// current style settings. Kept free of Shell and GTK imports so both
// processes can load it.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const STYLE_PREFIXES = ['color-', 'font-', 'size-'];

export function styleKeys(settings) {
    return settings.settings_schema.list_keys()
        .filter(key => STYLE_PREFIXES.some(prefix => key.startsWith(prefix)));
}

export function launchViewer(settings, extensionPath) {
    const style = Object.fromEntries(
        styleKeys(settings).map(key => [key, settings.get_value(key).recursiveUnpack()]));
    return Gio.Subprocess.new([
        '/usr/bin/python3',
        GLib.build_filenamev([extensionPath, 'fibonacci-viewer.py']),
        '--style', JSON.stringify(style),
    ], Gio.SubprocessFlags.NONE);
}
