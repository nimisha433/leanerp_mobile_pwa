// Makes real Desk installable as a PWA. Desk's own app.html can't be edited directly (core
// Frappe), so the manifest link is injected here at runtime instead, via app_include_js.
// Some site configs (e.g. a Website Route Redirect on this Frappe Cloud site) already point a
// default manifest link at /app-manifest.json — our file is served under that exact name so
// that existing link resolves correctly on its own, instead of fighting the redirect. This
// still repoints/creates the link ourselves too, as a fallback for sites without that redirect.
let link = document.querySelector('link[rel="manifest"]');
if (!link) {
  link = document.createElement("link");
  link.rel = "manifest";
  document.head.appendChild(link);
}
link.href = "/app-manifest.json";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
