/* jc-root.xyz — progressive enhancement only.
   Layout and content never depend on this file. Bootstrap's vendored bundle
   handles the collapse behavior; this file only guards the contact form
   against double submission. No user-visible strings live in JS. */
(function () {
    "use strict";

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
