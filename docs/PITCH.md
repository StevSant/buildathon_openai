# Pitch — Pulso

Narrativa para jueces. Incluye el discurso de ~2 min, los puntos clave, por qué gana y
preparación de preguntas. En español (idioma de la presentación).

---

## Una frase (el gancho)
> **Pulso convierte a los ciudadanos en una red de sensores verificada de la ciudad: reporta
> con una foto, todos lo ven en el mapa al instante, y le preguntas por voz qué está pasando
> a tu alrededor.**

## El problema (20s)
Los incidentes urbanos —accidentes, cierres, inundaciones, incendios— pasan más rápido de
lo que cualquier canal oficial alcanza a publicar. Los ciudadanos los ven primero, pero ese
conocimiento se pierde en grupos de WhatsApp y tuits sin verificar. Dos problemas al mismo
tiempo: **la gente no tiene una foto confiable y en tiempo real de lo que pasa cerca**, y
**los reportes ciudadanos son inservibles porque cualquiera publica cualquier cosa**.

## La solución (40s)
Pulso resuelve las dos cosas a la vez, con tres gestos y una garantía:
1. **Reportas con una foto.** OpenAI lee la imagen y estructura el reporte —categoría,
   severidad, título, descripción—; tú solo confirmas.
2. **Aparece en un mapa vivo** para todos los que están cerca, al instante.
3. **Le preguntas por voz** a "Cerca", un agente que responde con datos reales —nunca
   inventados— consultando herramientas sobre la base de datos.
4. **La garantía: identidad verificada.** Cada cuenta se valida contra una cédula real, así
   que cada reporte tiene una persona detrás. El crowdsourcing por fin es confiable.

> **Capa extra de seguridad (no es un quinto pilar):** si un incidente grave ocurre muy cerca
> de ti, Pulso avisa por WhatsApp a tus contactos de emergencia —que aceptaron por opt-in—, y
> hay un botón **SOS** manual. Una red de seguridad sobre los cuatro pilares, no un pilar más.

## Por qué es diferente (20s)
No es "otro mapa de incidentes". Es **verificado, en tiempo real y conversacional**, y las
cuatro piezas se refuerzan: la identidad hace confiable el dato, la IA lo estructura sin
fricción, el mapa lo distribuye al instante y la voz lo hace accesible con las manos ocupadas
—manejando, caminando—. Ese es exactamente el momento en que la información urbana importa.

## Cómo está construido (20s)
- **OpenAI Realtime** (voz por WebRTC) + **Responses API** (visión con salida estructurada).
- **Supabase** como backend completo: Auth, **PostGIS**, Storage, Realtime y Edge Functions.
  Sin servidores extra.
- **Seguridad de verdad:** la API key nunca toca el navegador (client secret efímero); la
  autorización vive en el backend, no en el prompt; la cédula no se guarda, solo su hash.

## El cierre (10s)
> "Los ciudadanos ya son los primeros en ver lo que pasa en la ciudad. Pulso les da una
> forma verificada, instantánea y conversacional de compartirlo. Esa es la diferencia entre
> ruido y una red de sensores urbana."

---

## Los 4 mensajes que deben quedar (aunque olviden todo lo demás)
1. **Verificado** — identidad real por cédula, sin almacenar el número.
2. **Tiempo real** — reportas y toda la ciudad lo ve en segundos.
3. **Conversacional** — un agente de voz que usa datos reales, no alucinaciones.
4. **Serio en seguridad** — secretos en el servidor, autorización en el backend.

## Reparto sugerido de la presentación
- **Persona 1 (narra la demo):** conduce el hilo de [DEMO.md](DEMO.md).
- **Persona 2 (voz técnica):** suelta los puntos de arquitectura y seguridad cuando toque.
- **Persona 3 (respaldo/manos):** maneja el teléfono, permisos y el plan B.

## Preparación de preguntas (Q&A)
| Pregunta probable | Respuesta corta |
|---|---|
| ¿Cómo evitan reportes falsos? | Identidad verificada por cédula (una cuenta por persona) + confirmación comunitaria que sube el estado a "confirmado". |
| ¿El agente puede inventar incidentes? | No: solo responde con resultados de herramientas; si la herramienta no devuelve nada, lo dice. |
| ¿Guardan la cédula? | No. Solo un HMAC con *pepper* del servidor, con restricción única. El número nunca se persiste ni se expone. |
| ¿Qué pasa si un usuario intenta manipular el prompt? | El prompt solo controla la conversación; permisos y validaciones están en Edge Functions + RLS. |
| ¿Escala el tiempo real? | Hoy usamos Postgres Changes (rápido para MVP); a escala migramos a Broadcast con triggers. |
| ¿Y la privacidad de las fotos/ubicación? | El agente nunca revela al reportante ni lee coordenadas exactas; en producción se difuminarían placas/rostros. |
| ¿Y si necesito avisar a alguien de una emergencia? | Capa opcional: reglas de proximidad + botón SOS que envían WhatsApp a contactos de emergencia (que aceptaron opt-in) vía Hermes. Es una capa añadida, no un pilar. Los teléfonos se guardan por dueño (RLS), nunca se exponen. |
| ¿Por qué Supabase y no un backend propio? | Auth + PostGIS + Storage + Realtime + funciones en una plataforma; menos superficie, más velocidad. |

## Roadmap (si preguntan "¿y después?")
- Notificaciones push reales (Web Push / FCM) cuando algo pasa cerca estando la app cerrada.
- Detección de duplicados por cercanía + categoría y reputación de reportantes.
- Feed verificado para autoridades y prensa; personas especializadas (movilidad, riesgos).
- Verificación de identidad contra el Registro Civil (ya está el gancho listo por env).
