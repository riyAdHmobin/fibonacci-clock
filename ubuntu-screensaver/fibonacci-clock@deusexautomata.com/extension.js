// Fibonacci Clock screensaver: watches for idle inside GNOME Shell and
// starts the fullscreen viewer (fibonacci-viewer.py) when the user has
// been inactive for the configured time. Any input stops it again.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {launchViewer} from './launcher.js';

// org.gnome.SessionManager inhibit flag set by video players, browsers, etc.
const INHIBIT_IDLE = 8;

function isIdleInhibited() {
    return new Promise(resolve => {
        Gio.DBus.session.call(
            'org.gnome.SessionManager', '/org/gnome/SessionManager',
            'org.gnome.SessionManager', 'IsInhibited',
            new GLib.Variant('(u)', [INHIBIT_IDLE]), new GLib.VariantType('(b)'),
            Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try {
                    resolve(conn.call_finish(res).deepUnpack()[0]);
                } catch {
                    resolve(false);
                }
            });
    });
}

export default class FibonacciClockExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._monitor = global.backend.get_core_idle_monitor();
        this._idleWatch = 0;
        this._activeWatch = 0;
        this._viewer = null;
        this._timeoutChangedId = this._settings.connect(
            'changed::idle-timeout', () => this._addIdleWatch());
        this._addIdleWatch();
    }

    disable() {
        this._settings.disconnect(this._timeoutChangedId);
        this._removeWatch('_idleWatch');
        this._removeWatch('_activeWatch');
        this._stopViewer();
        this._settings = null;
        this._monitor = null;
    }

    _addIdleWatch() {
        this._removeWatch('_idleWatch');
        const ms = this._settings.get_uint('idle-timeout') * 1000;
        this._idleWatch = this._monitor.add_idle_watch(ms, () => this._onIdle());
    }

    _removeWatch(name) {
        if (this[name]) {
            this._monitor.remove_watch(this[name]);
            this[name] = 0;
        }
    }

    async _onIdle() {
        if (this._viewer || Main.screenShield?.locked)
            return;
        if (!this._settings.get_boolean('ignore-inhibitors') && await isIdleInhibited())
            return;
        if (!this._settings || this._viewer)
            return; // disabled or started while waiting for D-Bus
        this._startViewer();
    }

    _startViewer() {
        let viewer;
        try {
            viewer = launchViewer(this._settings, this.path);
        } catch (e) {
            console.error(`Fibonacci Clock: cannot start viewer: ${e.message}`);
            return;
        }
        this._viewer = viewer;
        viewer.wait_async(null, () => {
            // The viewer closes itself on input inside its window.
            if (this._viewer === viewer) {
                this._viewer = null;
                this._removeWatch('_activeWatch');
            }
        });
        // One-shot watch; catches input even if the viewer has no focus.
        this._activeWatch = this._monitor.add_user_active_watch(() => {
            this._activeWatch = 0;
            this._stopViewer();
        });
    }

    _stopViewer() {
        this._viewer?.send_signal(15); // SIGTERM
        this._viewer = null;
    }
}
