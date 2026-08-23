// Makes real Desk installable as a PWA. Desk's own app.html can't be edited directly (core
// Frappe), so the manifest link is injected here at runtime instead, via app_include_js.
// Named distinctively (not "manifest.json"/"app-manifest.json") so it doesn't collide with
// generic manifest-path redirects some hosting platforms apply by default (seen on Frappe
// Cloud: requests to common manifest filenames got silently redirected elsewhere).
let link = document.querySelector('link[rel="manifest"]');
if (!link) {
  link = document.createElement("link");
  link.rel = "manifest";
  document.head.appendChild(link);
}
link.href = "/leanerp-desk.webmanifest";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
