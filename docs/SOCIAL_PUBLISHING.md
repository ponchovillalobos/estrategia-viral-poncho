# Publicación a redes sociales

El dashboard publica video directo a **LinkedIn** e **Instagram** con sus APIs oficiales
(nada de scraping ni manejar tu password — todo por OAuth). Las credenciales se guardan
**local** en `C:\hermes-data\user-settings.json`, fuera del repo.

> TikTok quedó con el código presente pero **oculto del UI** porque requiere la auditoría
> del Content Posting API de TikTok (2-4 semanas). Facebook no está implementado.

---

## LinkedIn — la más fácil ✅

Ya está todo programado (OAuth + subida y publicación de video). Solo creás la app y conectás.
**No requiere auditoría.**

### Pasos

1. Abrí **https://www.linkedin.com/developers/apps** → *Create app*.
   - App name: `Estrategia Viral Poncho`
   - Asociá una **Página de LinkedIn** que administres (si no tenés, creá una rápida).
   - Privacy policy URL: `http://localhost:3000/privacy`
2. En la pestaña **Products**, agregá (son self-serve, instantáneos):
   - *Sign In with LinkedIn using OpenID Connect* → da `openid`, `profile`
   - *Share on LinkedIn* → da `w_member_social`
3. En **Auth → Authorized redirect URLs**, agregá EXACTO (sin barra final):
   ```
   http://localhost:3000/api/auth/linkedin/callback
   ```
4. Copiá **Client ID** y **Primary Client Secret**.
5. En la app: abrí `http://localhost:3000/setup/linkedin`, pegá Client ID + Secret → *Guardar y
   autorizar* → autorizás en LinkedIn → volvés conectado.
6. En **Producción**, el botón **LI** sube y publica el video.

### Detalles técnicos

- Flujo: `lib/linkedin-client.ts` (OAuth) + `lib/linkedin-upload.ts` (5 pasos: initialize →
  chunks → finalize → poll AVAILABLE → create post). Rutas: `/api/auth/linkedin/{login,callback}`,
  `/api/linkedin/publish`.
- El token dura ~60 días; después reconectás con un click.
- Scopes: `openid profile w_member_social`. API version header `202605`.

---

## Instagram — posible, con más setup ⚠️

API oficial de Meta (Instagram Graph API, Reels). Para **tu propia cuenta** funciona en modo
desarrollo sin revisión larga.

### Requisitos extra (vs LinkedIn)

1. Tu Instagram tiene que ser **Business o Creator** y estar vinculado a una **Página de Facebook**.
2. Una **app de Meta** (developers.facebook.com).
3. Una **URL pública HTTPS** (un túnel) — Instagram **descarga** el video desde esa URL;
   `localhost` no le sirve.

### Pasos (asistente en `/setup/instagram`)

1. **https://developers.facebook.com/apps** → crear app tipo *Business* → *Add Products* →
   **Instagram** (Graph API). Privacy policy: `http://localhost:3000/privacy`.
2. Pasá tu IG a **Business/Creator** y vinculalo a una Página de FB (en la app de IG:
   Configuración → Cuenta → Cambiar a profesional).
3. En **Facebook Login → Valid OAuth Redirect URIs**, pegá EXACTO:
   ```
   http://localhost:3000/api/auth/instagram/callback
   ```
   Permisos: `instagram_basic`, `instagram_content_publish`, `pages_show_list`,
   `pages_read_engagement`, `business_management`.
4. **Levantá el túnel** (gratis, sin cuenta):
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
   Te da una URL `https://algo.trycloudflare.com`. **Dejala corriendo** al publicar.
5. En `http://localhost:3000/setup/instagram`: pegá **App ID**, **App Secret** y la **URL del
   túnel** → *Guardar y autorizar* → autorizás en Meta → conectado.
6. En **Producción**, el botón **IG** publica el Reel de verdad (si no estás conectado, cae al
   bridge manual de copiar caption).

### Detalles técnicos

- Flujo: `lib/instagram-client.ts` (OAuth Meta: code → token corto → token largo 60d →
  descubrir cuenta IG Business) + `lib/instagram-upload.ts` (3 pasos: crear container con
  `video_url` → poll `status_code=FINISHED` → `media_publish`). Rutas:
  `/api/auth/instagram/{login,callback}`, `/api/instagram/publish`.
- El `video_url` se arma con `instagram.publicBaseUrl` (la URL del túnel) +
  `/api/videos/{id}/stream?source=render`.
- Si cambia la URL del túnel, actualizala en `/setup/instagram` antes de publicar.

---

## Troubleshooting

| Síntoma | Causa / solución |
|---|---|
| LinkedIn: "redirect_uri does not match" | El redirect en la app de LinkedIn no es idéntico. Debe ser `http://localhost:3000/api/auth/linkedin/callback` sin barra final. |
| LinkedIn: scopes faltantes | Revisá que ambos *Products* estén activos (paso 2). |
| Instagram: "Ninguna Página tiene IG Business" | Tu IG no es Business/Creator o no está vinculado a una Página de FB. |
| Instagram: el video no procesa / falla la descarga | El túnel no está corriendo o la URL cambió. Verificá `publicBaseUrl` en `/setup/instagram`. |
| Token venció (~60 días) | Reconectá desde `/setup/{linkedin,instagram}`. |
| El dev server no está en :3000 | El OAuth redirige a localhost:3000; arrancá `npm run dev` antes de conectar. |

> Para automatizar la creación de la app de LinkedIn con un agente de navegador, hay un prompt
> de referencia; pedíselo al asistente. El alta de la app **siempre** requiere tu login (ToS).
