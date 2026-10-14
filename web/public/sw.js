// Service worker de las notificaciones push. El servidor manda { titulo, mensaje, url, seccion }
// (ver services/envios.js); acá se muestra el aviso y, al tocarlo, se abre el enlace a la sección.

self.addEventListener("push", (event) => {
  let datos = {};
  try { datos = event.data ? event.data.json() : {}; } catch { datos = {}; }
  const titulo = datos.titulo || "Sistema Académico";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.mensaje || "",
      icon: "/logo-ucse.png",
      data: { url: datos.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta, se la trae al frente en la sección indicada; si no, se abre una ventana.
      const abierta = ventanas.find((v) => new URL(v.url).origin === new URL(url).origin);
      if (abierta) return abierta.navigate(url).then((v) => v && v.focus());
      return self.clients.openWindow(url);
    }),
  );
});
