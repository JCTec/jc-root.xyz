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

    form.addEventListener("submit", function () {
        var button = form.querySelector("button[type=submit]");
        if (button) {
            button.disabled = true;
        }
    });
})();
