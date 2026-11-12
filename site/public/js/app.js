/* jc-root.xyz: progressive enhancement only.
   Layout and content never depend on this file. Bootstrap's vendored bundle
   handles the collapse behavior; this file guards the contact form against
   double submission and reveals the confirmation FormSubmit sends visitors
   back to. No user-visible strings live in JS: the confirmation copy is in
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
