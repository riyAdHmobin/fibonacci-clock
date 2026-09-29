// Settings window: behavior, every clock color, and every text font.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {launchViewer, styleKeys} from './launcher.js';

const COLOR_GROUPS = [
    ['Background', [
        ['color-background', 'Background'],
    ]],
    ['Dial', [
        ['color-dial', 'Ring and ticks'],
        ['color-hand', 'Hour hand'],
        ['color-pivot', 'Center dot'],
    ]],
    ['Hours', [
        ['color-hour', 'Hour numbers'],
        ['color-hour-current', 'Current hour number'],
        ['color-track', 'Hour tracks'],
        ['color-track-current', 'Current hour track'],
    ]],
    ['Minutes', [
        ['color-minute', 'Minute numbers'],
        ['color-minute-current', 'Current minute number'],
        ['color-minute-track', 'Minute tracks'],
        ['color-minute-track-current', 'Current minute track'],
    ]],
    ['Seconds', [
        ['color-second', 'Second numbers'],
        ['color-second-current', 'Current second number'],
        ['color-second-track', 'Second tracks'],
        ['color-second-track-current', 'Current second track'],
    ]],
    ['Weekdays', [
        ['color-day', 'Weekday names'],
        ['color-day-current', 'Current weekday name'],
        ['color-day-track', 'Weekday tracks'],
        ['color-day-track-current', 'Current weekday track'],
    ]],
    ['Spiral', [
        ['color-spiral', 'Hour spiral'],
        ['color-minute-spiral', 'Minute spiral'],
        ['color-second-spiral', 'Second spiral'],
        ['color-day-spiral', 'Weekday spiral'],
    ]],
    ['Text', [
        ['color-digital', 'Digital time'],
        ['color-title', 'Title'],
        ['color-caption', 'Caption'],
        ['color-numbers', 'Fibonacci numbers'],
    ]],
];

// [key suffix, label]: each has a font-<suffix> and a size-<suffix> key.
const FONTS = [
    ['digital', 'Digital time'],
    ['hour', 'Hour numbers'],
    ['minute', 'Minute numbers'],
    ['second', 'Second numbers'],
    ['day', 'Weekday names'],
    ['title', 'Title'],
    ['caption', 'Caption'],
    ['numbers', 'Fibonacci numbers'],
];

// Keeps a dialog button and a string setting in step. `read` turns the
// setting into the button value; `write` turns the button value back.
// Updates coming from the setting are not written back, so opening the
// window does not rewrite defaults in a normalized form.
function bindButton(settings, key, button, prop, read, write) {
    let syncing = false;
    const sync = () => {
        syncing = true;
        const value = read(settings.get_string(key));
        if (value)
            button[prop] = value;
        syncing = false;
    };
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    button.connect(`notify::${prop.replace('_', '-')}`, () => {
        if (!syncing)
            settings.set_string(key, write(button[prop]));
    });
    button.connect('destroy', () => settings.disconnect(id));
}

function colorRow(settings, key, title) {
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: true}),
        valign: Gtk.Align.CENTER,
    });
    bindButton(settings, key, button, 'rgba',
        str => {
            const rgba = new Gdk.RGBA();
            return rgba.parse(str) ? rgba : null;
        },
        rgba => rgba.to_string());
    const row = new Adw.ActionRow({title, activatable_widget: button});
    row.add_suffix(button);
    return row;
}

function fontRow(settings, key) {
    const button = new Gtk.FontDialogButton({
        dialog: new Gtk.FontDialog(),
        level: Gtk.FontLevel.FACE,
        use_font: true,
        valign: Gtk.Align.CENTER,
    });
    bindButton(settings, key, button, 'font_desc',
        str => Pango.FontDescription.from_string(str),
        desc => {
            const copy = desc.copy();
            copy.unset_fields(Pango.FontMask.SIZE); // size has its own row
            return copy.to_string();
        });
    const row = new Adw.ActionRow({title: 'Font', activatable_widget: button});
    row.add_suffix(button);
    return row;
}

export default class FibonacciClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep alive with the window
        window.set_default_size(640, 760);

        window.add(this._generalPage(settings));
        window.add(this._colorsPage(settings));
        window.add(this._fontsPage(settings));
    }

    _generalPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'General', icon_name: 'preferences-system-symbolic',
        });

        const behavior = new Adw.PreferencesGroup({title: 'Behavior'});
        const timeout = Adw.SpinRow.new_with_range(10, 7200, 10);
        timeout.title = 'Show after';
        timeout.subtitle = 'Seconds of inactivity';
        settings.bind('idle-timeout', timeout, 'value', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(timeout);

        const inhibitors = new Adw.SwitchRow({
            title: 'Show during video playback',
            subtitle: 'Ignore apps that ask the session not to go idle',
        });
        settings.bind('ignore-inhibitors', inhibitors, 'active', Gio.SettingsBindFlags.DEFAULT);
        behavior.add(inhibitors);
        page.add(behavior);

        const actions = new Adw.PreferencesGroup({title: 'Look'});
        actions.add(this._buttonRow('Preview', 'Show the clock now. Any input closes it.',
            'Preview', () => {
                try {
                    launchViewer(settings, this.path);
                } catch (e) {
                    console.error(`Fibonacci Clock: cannot start viewer: ${e.message}`);
                }
            }));
        actions.add(this._buttonRow('Reset look', 'Restore all default colors, fonts and sizes.',
            'Reset', () => styleKeys(settings).forEach(key => settings.reset(key)),
            'destructive-action'));
        page.add(actions);
        return page;
    }

    _buttonRow(title, subtitle, label, onClicked, cssClass) {
        const button = new Gtk.Button({label, valign: Gtk.Align.CENTER});
        if (cssClass)
            button.add_css_class(cssClass);
        button.connect('clicked', onClicked);
        const row = new Adw.ActionRow({title, subtitle, activatable_widget: button});
        row.add_suffix(button);
        return row;
    }

    _colorsPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Colors', icon_name: 'applications-graphics-symbolic',
        });
        for (const [groupTitle, rows] of COLOR_GROUPS) {
            const group = new Adw.PreferencesGroup({title: groupTitle});
            for (const [key, title] of rows)
                group.add(colorRow(settings, key, title));
            page.add(group);
        }
        return page;
    }

    _fontsPage(settings) {
        const page = new Adw.PreferencesPage({
            title: 'Fonts', icon_name: 'font-x-generic-symbolic',
        });
        for (const [id, title] of FONTS) {
            const group = new Adw.PreferencesGroup({title});
            group.add(fontRow(settings, `font-${id}`));
            const size = Adw.SpinRow.new_with_range(6, 200, 1);
            size.title = 'Size';
            settings.bind(`size-${id}`, size, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(size);
            page.add(group);
        }
        return page;
    }
}
