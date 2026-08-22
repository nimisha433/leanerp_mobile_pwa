// Makes real Desk installable as a PWA. Desk's own app.html can't be edited directly (core
// Frappe), so the manifest link is injected here at runtime instead, via app_include_js.
if (!document.querySelector('link[rel="manifest"]')) {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/desk-manifest.json";
  document.head.appendChild(link);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
