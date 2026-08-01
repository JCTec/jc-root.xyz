/* jc-root.xyz — progressive enhancement only.
   Layout and content never depend on this file. Bootstrap's vendored bundle
   handles the collapse behavior; this file adds copy-to-clipboard on the
   contact button. All user-visible labels come from the server (data
   attributes populated from the strings catalog), never from JS literals. */
(function () {
    "use strict";

    var copyButton = document.querySelector("[data-copy-email]");
    if (!copyButton || !navigator.clipboard) {
        return;
    }

    copyButton.addEventListener("click", function () {
        var email = copyButton.getAttribute("data-copy-email");
        var copiedLabel = copyButton.getAttribute("data-copied-label");
        var originalLabel = copyButton.textContent;
        navigator.clipboard.writeText(email).then(function () {
            copyButton.textContent = copiedLabel;
            window.setTimeout(function () {
                copyButton.textContent = originalLabel;
            }, 1600);
        });
    });
})();
