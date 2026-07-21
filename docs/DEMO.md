# Guion de demo — Pulso

**Duración objetivo:** 3 minutos · **Dispositivos:** un laptop (mapa proyectado) + un
teléfono (reportar). Un hilo continuo que toca las **4 columnas** del proyecto.

> Regla de oro: si algo falla en vivo, **no te detengas** — narra y cambia al respaldo
> grabado (ver H5 en [PLAN.md](PLAN.md)). Los jueces recuerdan la historia, no el bug.

---

## Preparación (antes de subir a tarima)
- [ ] Re-seed de incidentes con `created_at` reciente (que se vean "hace minutos").
- [ ] Laptop proyectando el **mapa** (`/`), sesión iniciada con identidad verificada.
- [ ] Teléfono con la app abierta, permisos de **cámara**, **micrófono** y **ubicación** concedidos.
- [ ] Una foto lista para reportar (o un objeto real a la mano para fotografiar).
- [ ] Volumen del laptop alto para que se escuche al agente.
- [ ] Respaldo grabado abierto en una pestaña, por si acaso.

---

## Escena 1 — El mapa vivo (0:00–0:30) · *columna: mapa colaborativo*
**Acción:** muestra el mapa lleno de incidentes alrededor del lugar.
**Dices:**
> "Esto es Pulso. Ahora mismo, en esta ciudad, están pasando cosas: un accidente aquí, una
> inundación allá, una feria. Pulso las muestra en tiempo real, reportadas por ciudadanos."

Toca un marcador → se abre el detalle con categoría, severidad y **badge de identidad
verificada**.
> "Cada reporte viene de una persona con identidad verificada. No es ruido anónimo."

## Escena 2 — Reporte en vivo con IA (0:30–1:20) · *columnas: análisis con visión + tiempo real*
**Acción:** en el **teléfono**, abre `/report`, toma la foto.
**Dices:**
> "Veo algo en la calle y lo reporto. Solo tomo una foto."

La IA analiza y **rellena sola** categoría, severidad, título y descripción.
> "OpenAI lee la foto y estructura el reporte: dice que es un accidente, severidad 4, y
> propone título y descripción. Yo solo confirmo."

Toca **Publicar**. Gira hacia el mapa proyectado.
> "Y miren el mapa…"

**El nuevo incidente aparece solo en el mapa del laptop**, sin recargar.
> "Apareció al instante en el mapa de todos. Eso es Supabase Realtime: un ciudadano
> reporta, la ciudad entera lo ve."

## Escena 3 — El agente de voz "Cerca" (1:20–2:30) · *columnas: agente de voz + integración*
**Acción:** en la app, abre `/assistant`, toca el micrófono.
**Preguntas (en voz alta):**
> "Cerca, ¿qué está pasando cerca de mí?"

El agente responde por voz usando datos reales (llama a `get_nearby_incidents`).
> *(a los jueces)* "No está inventando. Llamó a una herramienta que consulta PostGIS y le
> devolvió los incidentes reales, ordenados por distancia."

**Pregunta de seguimiento:**
> "Cuéntame más sobre el accidente."

El agente usa `get_incident_details` y responde con el detalle — **incluido el que acabas
de reportar por foto**.
> "Y ahí está: el accidente que reporté con una foto hace 40 segundos es del que me está
> hablando el agente. Foto, mapa y voz, la misma historia."

## Escena 4 — Cierre (2:30–3:00)
**Dices:**
> "Pulso convierte a los ciudadanos en una red de sensores **verificada** de la ciudad:
> reportas con una foto, todos lo ven en el mapa al instante, y le preguntas por voz qué
> pasa a tu alrededor. Verificado, en tiempo real y conversacional."

---

## (Opcional · stretch) "Una cosa más" — SOS y WhatsApp

> Solo si vas sobrado de tiempo y **todo** ha ido estable. Si no, ni lo menciones — no
> infles los 3 minutos del hilo central. Es una **capa de seguridad añadida, no un pilar**.

**Acción:** en la app, toca el botón **SOS**.
**Dices:**
> "Y una cosa más: Pulso también cuida de ti. Si ocurre un incidente grave muy cerca de mí,
> mis contactos de emergencia reciben un WhatsApp automáticamente —aunque yo no tenga la app
> abierta—. Y si estoy en apuros, este botón SOS les avisa al instante."

(Muestra el WhatsApp llegando a un contacto de respaldo.)
> "Los contactos aceptan por WhatsApp antes de recibir nada. Verificado, en tiempo real,
> conversacional… y con una red de seguridad."

## Puntos técnicos para soltar si hay tiempo o preguntan
- "La API key de OpenAI **nunca** llega al navegador; usamos un *client secret* efímero."
- "El agente no puede hacer nada que el usuario no pueda: la autorización vive en el backend
  (Edge Functions + RLS), no en el prompt."
- "No guardamos la cédula: solo un hash. Verificamos identidad sin almacenar el número."
- "Todo el backend es Supabase — Auth, PostGIS, Storage, Realtime y Edge Functions. Cero
  servidores extra."

## Plan B por escena (si algo falla en vivo)
| Falla | Reacción |
|---|---|
| El micrófono no conecta | "Les muestro cómo responde" → cambia al respaldo grabado de la Escena 3 |
| La IA de la foto tarda/erra | Edita los campos a mano y sigue: "aquí uno lo puede corregir" |
| El Realtime no actualiza | Recarga el mapa: "aquí ya está el reporte" y sigue |
| Ubicación denegada | Usa el centro por defecto del lugar y continúa |
| Todo se cae | Narra sobre el respaldo grabado completo, sin disculpas largas |
