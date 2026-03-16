self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload = {};

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "Lipata Gateway Eagles Club",
      body: event.data.text(),
    };
  }

  const title = payload.title || "Lipata Gateway Eagles Club";
  const options = {
    body: payload.body || "New club announcement",
    icon: payload.icon || "/images/tfoe-logo.png",
    badge: payload.icon || "/images/tfoe-logo.png",
    tag: payload.tag || "club-announcement",
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client && client.url === targetUrl);
      if (existing) {
        return existing.focus();
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    }),
  );
});
