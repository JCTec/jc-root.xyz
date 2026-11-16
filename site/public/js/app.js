/* jc-root.xyz: progressive enhancement only.
   Layout and content never depend on this file. Bootstrap's vendored bundle
   handles the collapse behavior; this file closes the phone menu once a link
   in it is followed, guards the contact form against double submission and
   reveals the confirmation FormSubmit sends visitors back to. No user-visible strings live in JS: the confirmation copy is in
   the markup, hidden, and comes from the strings catalog like everything else.

   The site is served by a static host that renders nothing per request, so
   this is the one piece of the page that depends on JavaScript. With JS off a
   visitor still sees the form, still submits it, and still lands back on the
   page; they simply do not get the "message sent" line. Nothing else regresses. */
(function () {
    "use strict";

    /* FormSubmit redirects to <page>?sent=1 after a successful submission. */
    function revealConfirmation() {
        if (!/(^|[?&])sent(=|&|$)/.test(window.location.search)) {
            return;
        }
        var note = document.querySelector(".form-sent");
        if (!note) {
            return;
        }
        note.hidden = false;
        /* Announce it to a screen reader that never navigated visually, and
           move the caret there so the next Tab continues from the message. */
        note.setAttribute("role", "status");
        note.focus();
    }

    revealConfirmation();

    /* The phone menu is a <details>, so it opens and closes without this. A
       link inside it scrolls the page but would leave it open over the
       section it just jumped to; close it then, and on Escape, handing focus
       back to its toggle so the next Tab continues from there. */
    function wirePhoneMenu() {
        var menu = document.querySelector(".nav-menu");
        if (!menu) {
            return;
        }
        var toggle = menu.querySelector("summary");
        menu.addEventListener("click", function (event) {
            if (event.target.closest("a")) {
                menu.open = false;
            }
        });
        menu.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && menu.open) {
                menu.open = false;
                toggle.focus();
            }
        });
    }

    wirePhoneMenu();

    var form = document.querySelector(".contact-form");
    if (!form) {
        return;
    }

    var button = form.querySelector("button[type=submit]");
    if (!button) {
        return;
    }

    function lock() {
        button.disabled = true;
        /* Announces the pending state without inventing a visible string. */
        form.setAttribute("aria-busy", "true");
    }

    function unlock() {
        button.disabled = false;
        form.removeAttribute("aria-busy");
    }

    form.addEventListener("submit", lock);

    /* The form POSTs away to FormSubmit, so the locked page is exactly what
       the back button restores. Firefox and Safari also carry form state
       across a plain reload. Either way the visitor would find a permanently
       dead submit button, so release the lock whenever this page is shown
       again rather than freshly loaded. */
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            unlock();
        }
    });
})();
