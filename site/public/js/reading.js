/* jc-root.xyz: reading settings.
   A visitor can switch the page to OpenDyslexic or Atkinson Hyperlegible,
   scale its text, raise its contrast and widen its spacing. Each choice is a
   data-<group> attribute on <html> that site.css styles, saved in this
   browser's localStorage and nowhere else.

   Loaded in <head> without `defer`, so the first half runs before the body is
   parsed: saved choices are on <html> before the first paint, and nothing
   flashes from the default look into the chosen one. The second half waits
   for the DOM, then reveals the toggle and wires the panel. Without this file
   both stay hidden and the page is simply the default; no user-visible
   strings live here, they come from the catalog with the markup.

   Storage can be missing or throw (private windows, blocked site data), so
   every access is guarded and the page works the same, just unremembered. */
(function () {
    "use strict";

    var KEY = "jc-reading";
    /* Group -> its default value. A default is never written to <html>: the
       attribute's absence is the default look. Contrast is the exception the
       stylesheet relies on: an explicit "standard" opts out of the high palette
       that prefers-contrast: more would otherwise apply. */
    var GROUPS = { font: "default", size: "100", contrast: "standard", spacing: "standard" };
    var root = document.documentElement;

    function load() {
        try {
            var saved = JSON.parse(window.localStorage.getItem(KEY) || "{}");
            return saved && typeof saved === "object" ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function save(settings) {
        try {
            if (Object.keys(settings).length) {
                window.localStorage.setItem(KEY, JSON.stringify(settings));
            } else {
                window.localStorage.removeItem(KEY);
            }
        } catch (e) {
            /* Not remembered; still applied for this visit. */
        }
    }

    function apply(settings) {
        Object.keys(GROUPS).forEach(function (group) {
            var value = settings[group];
            var explicitContrast = group === "contrast" && value === "standard";
            if (value && (value !== GROUPS[group] || explicitContrast)) {
                root.setAttribute("data-" + group, value);
            } else {
                root.removeAttribute("data-" + group);
            }
        });
    }

    var settings = load();
    apply(settings);

    function wire() {
        var toggle = document.querySelector(".reading-toggle");
        var panel = document.getElementById("reading-panel");
        if (!toggle || !panel) {
            return;
        }
        var menu = document.querySelector(".nav-menu");
        var prefersMore = window.matchMedia && window.matchMedia("(prefers-contrast: more)");

        /* The checked radio in each group mirrors what is in effect, including
           a high contrast the system asked for rather than the visitor. */
        function sync() {
            Object.keys(GROUPS).forEach(function (group) {
                var value = settings[group] || GROUPS[group];
                if (group === "contrast" && !settings.contrast && prefersMore && prefersMore.matches) {
                    value = "high";
                }
                var input = panel.querySelector('input[name="reading-' + group + '"][value="' + value + '"]');
                if (input) {
                    input.checked = true;
                }
            });
        }

        function open() {
            if (menu) {
                menu.open = false;
            }
            sync();
            panel.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
            /* The panel sits after the bar's other controls in the DOM, so move
               focus into it rather than leave the next Tab in the menu. */
            var first = panel.querySelector("input:checked") || panel.querySelector("input");
            if (first) {
                first.focus();
            }
        }

        function close(returnFocus) {
            if (panel.hidden) {
                return;
            }
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
            if (returnFocus) {
                toggle.focus();
            }
        }

        toggle.addEventListener("click", function () {
            if (panel.hidden) {
                open();
            } else {
                close(false);
            }
        });

        panel.addEventListener("change", function (event) {
            var input = event.target;
            if (!input.name || input.name.indexOf("reading-") !== 0) {
                return;
            }
            var group = input.name.slice("reading-".length);
            if (input.value === GROUPS[group] && group !== "contrast") {
                delete settings[group];
            } else {
                settings[group] = input.value;
            }
            apply(settings);
            save(settings);
        });

        panel.addEventListener("click", function (event) {
            var action = event.target.closest("[data-reading]");
            if (!action) {
                return;
            }
            if (action.getAttribute("data-reading") === "reset") {
                settings = {};
                apply(settings);
                save(settings);
                sync();
            } else {
                close(true);
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !panel.hidden) {
                close(true);
            }
        });

        /* A click or tap anywhere outside the panel and its toggle closes it,
           as a menu would; focus stays wherever that click put it. */
        document.addEventListener("click", function (event) {
            if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) {
                close(false);
            }
        });

        /* Opening the phone menu closes the panel: one overlay at a time. */
        if (menu) {
            menu.addEventListener("toggle", function () {
                if (menu.open) {
                    close(false);
                }
            });
        }

        toggle.hidden = false;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wire);
    } else {
        wire();
    }
})();
