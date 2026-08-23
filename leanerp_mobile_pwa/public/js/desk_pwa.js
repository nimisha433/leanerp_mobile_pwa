// Makes real Desk installable as a PWA. Desk's own app.html can't be edited directly (core
// Frappe), so the manifest link is injected here at runtime instead, via app_include_js.
// Some hosting platforms (e.g. Frappe Cloud) inject their own default manifest link — repoint
// it to ours rather than removing the element, in case its presence matters to them for
// something unrelated to its content. Browsers re-check installability as the DOM changes, so
// this still works even though app_include_js scripts run late (end of body, after </head>).
let link = document.querySelector('link[rel="manifest"]');
if (!link) {
  link = document.createElement("link");
  link.rel = "manifest";
  document.head.appendChild(link);
}
link.href = "/desk-manifest.json";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
