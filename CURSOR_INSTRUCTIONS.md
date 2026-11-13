# 🚀 SYNAPMSG — INSTRUCCIONES PARA CURSOR

Hola Cursor. Tu trabajo es construir y deployar la app Synapmsg en producción. Tienes todo el código ya escrito en este directorio. Solo necesitas configurar, instalar, deployar y construir.

---

## 📋 CONTEXTO DEL PROYECTO

**Synapmsg** es una app de mensajería con traducción nativa. Stack:
- **Backend**: Node.js 20 + Express + Prisma + WebSocket + DeepL API
- **Mobile**: React Native 0.74 + Expo SDK 51 (TypeScript)
- **Landing**: Next.js 14 + Tailwind CSS
- **DB**: Neon (PostgreSQL serverless)
- **Hosting**: Railway (backend), Vercel (landing), Cloudflare R2 (archivos)

**Dominio**: `synapmsg.ai` (DNS ya configurado en Cloudflare)
**Bundle ID**: `com.synapmsg.app`
**Empresa**: Toscana Systems, S.A. (cuentas Apple Developer + Google Play ya activas)

---

## 🎯 LO QUE TIENES QUE HACER (orden estricto)

### FASE 1 — Recopilar credenciales del usuario (5 min)

**ANTES de empezar**, pregunta al usuario por estos 4 valores. No sigas hasta tenerlos:

1. **`NEON_DATABASE_URL`**
   - El usuario debe crear cuenta en https://neon.tech (login con GitHub)
   - Crear proyecto: nombre `synapmsg`, región `AWS US East (Ohio)`, plan `Free`
   - Copiar el "Connection string" del dashboard (formato `postgresql://synapmsg_owner:npg_xxx@ep-xxx-pooler.us-east-2.aws.neon.tech/synapmsg?sslmode=require`)

2. **`DEEPL_API_KEY`**
   - El usuario debe registrarse en https://www.deepl.com/pro#developer
   - Plan Free (500K chars/mes) — la API key termina en `:fx`
   - Copiar la "Authentication Key"

3. **`GITHUB_REPO_URL`**
   - El usuario debe crear repo vacío en https://github.com/new
   - Nombre: `synapmsg`, Visibilidad: Private
   - **NO** inicializar con README
   - Copiar URL: `https://github.com/USUARIO/synapmsg.git`

4. **`JWT_SECRET`**
   - **Tú lo generas**: ejecuta `openssl rand -hex 32` y usa el output (64 caracteres hex)

Si el usuario NO tiene alguna de estas cuentas, AYÚDALO a crearla paso a paso antes de continuar.

---

### FASE 2 — Prerrequisitos del sistema (5 min)

Verifica que el usuario tenga instalado:
```bash
node --version    # debe ser v20+
git --version
```

Si no tiene Node 20+, el usuario debe actualizar desde https://nodejs.org.

Instala los CLIs necesarios (puede requerir `sudo` en macOS/Linux):
```bash
npm install -g @railway/cli vercel eas-cli
```

Verifica:
```bash
railway --version
vercel --version
eas --version
```

Si alguno falla, reinstálalo individualmente:
```bash
npm install -g @railway/cli
npm install -g vercel
npm install -g eas-cli
```

---

### FASE 3 — Configurar archivos .env (3 min)

Crea el archivo `.env.deploy` en la raíz del proyecto (`synapmsg/.env.deploy`):

```bash
# === NEON (PostgreSQL serverless) ===
NEON_DATABASE_URL=<VALOR_DEL_USUARIO>

# === JWT SECRET ===
JWT_SECRET=<VALOR_GENERADO_CON_openssl_rand_-hex_32>

# === DEEPL API ===
DEEPL_API_KEY=<VALOR_DEL_USUARIO>

# === GITHUB REPO ===
GITHUB_REPO_URL=<VALOR_DEL_USUARIO>

# === CLOUDFLARE R2 (opcional, dejar vacío si no se usa aún) ===
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=synapmsg-media
R2_PUBLIC_URL=https://media.synapmsg.ai
```

Luego ejecuta:
```bash
chmod +x deploy.sh
./deploy.sh
```

El script `deploy.sh` (que ya está en el proyecto) hará automáticamente:
- ✅ Configurar `apps/api/.env` con las variables correctas
- ✅ Configurar `apps/mobile/.env` con `EXPO_PUBLIC_API_URL=https://api.synapmsg.ai`
- ✅ `npm install` en backend
- ✅ `npx prisma generate` + `npx prisma db push` (crear tablas en Neon)
- ✅ `git init` + commit + push a GitHub
- ✅ Deploy a Railway
- ✅ Deploy a Vercel
- ✅ Build con EAS

**Si el script falla en algún paso, léelo, entiende el error, arréglalo y vuelve a ejecutar.**

---

### FASE 4 — Pasos finales manuales (15 min)

Después de que `deploy.sh` termine, faltan 3 cosas manuales:

#### 4.1 Generar dominio público en Railway
1. Ve a https://railway.app → tu proyecto Synapmsg
2. Click en el servicio del backend → Settings → Networking
3. Click **Generate Domain**
4. Railway te dará una URL como `synapmsg-api.up.railway.app`
5. Esa URL ya está configurada en Cloudflare DNS (`api.synapmsg.ai` → `synapmsg-api.up.railway.app`)

#### 4.2 Agregar dominio en Vercel
1. Ve a https://vercel.com/dashboard → tu proyecto Synapmsg
2. Settings → Domains → Add Domain
3. Escribe `synapmsg.ai` y presiona Add
4. Vercel detectará Cloudflare automáticamente y configurará el SSL
5. Repite para `www.synapmsg.ai` (configurarlo como redirect a `synapmsg.ai`)

#### 4.3 Subir builds a App Store Connect y Play Console

Cuando EAS termine los builds (~30 min cada uno, te llegará email):

**iOS:**
1. Descarga el archivo `.ipa` del link que envió EAS por email
2. Ve a https://appstoreconnect.apple.com
3. Mis Apps → Nueva App
   - Nombre: `Synapmsg`
   - Idioma: Español
   - Bundle ID: `com.synapmsg.app` (debe estar registrado vía Toscana Systems)
   - SKU: `synapmsg`
4. Pestaña TestFlight → subir `.ipa`
5. Completar metadata mínima:
   - Descripción: "Mensajería cifrada con traducción nativa"
   - Keywords: "chat, mensajería, traducción, cifrado"
   - URL soporte: https://synapmsg.ai
6. Agregar testers internos

Apple tarda 24-48h en aprobar el primer build.

**Android:**
1. Descarga el archivo `.aab` del link que envió EAS
2. Ve a https://play.google.com/console
3. Crear nueva app:
   - Nombre: `Synapmsg`
   - Idioma: Español
   - App type: Aplicación
   - Free
4. Internal Testing → Crear release → subir `.aab`
5. Agregar testers por email

Play Internal Testing es **inmediato** (sin review).

---

### FASE 5 — Verificación final (2 min)

Ejecuta estos comandos para verificar que todo está funcionando:

```bash
# 1. Landing page live
curl -I https://synapmsg.ai
# Debe responder: HTTP/2 200

# 2. Backend API vivo
curl https://api.synapmsg.ai/health
# Debe responder: {"status":"ok","service":"synapmsg","time":"..."}

# 3. Probar registro de usuario
curl -X POST https://api.synapmsg.ai/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "lab-test@example.invalid",
    "password": "test12345678",
    "name": "Test User",
    "username": "testuser",
    "preferredLanguage": "es"
  }'
# Debe responder: {"token":"...","user":{...}}

# 4. DNS resolves
dig synapmsg.ai +short
dig api.synapmsg.ai +short
```

---

## 🆘 TROUBLESHOOTING

### Si `npm install` falla en backend
```bash
cd apps/api
rm -rf node_modules package-lock.json
npm install
```

### Si `prisma db push` falla con "P1001: Can't reach database server"
- Verifica que `NEON_DATABASE_URL` en `.env.deploy` tenga `?sslmode=require` al final
- Verifica que la password (la parte después de `:` antes de `@`) sea correcta
- Verifica que el proyecto Neon esté en estado "Active" (no suspended)

### Si `railway login` no abre navegador
```bash
railway login --browser
```
O copia la URL que muestra el comando y ábrela manualmente.

### Si `git push` pide credenciales
El usuario debe crear un Personal Access Token en GitHub:
1. https://github.com/settings/tokens → Generate new token (classic)
2. Marca el scope `repo`
3. Copia el token (empieza con `ghp_`)
4. Cuando git pida password, pega el token

### Si `eas init` falla con "no project ID"
```bash
cd apps/mobile
eas init --id synapmsg
```

### Si `vercel --prod` falla con "No Next.js detected"
Asegúrate de estar en `apps/landing`:
```bash
cd apps/landing
vercel --prod --yes
```

### Si los builds de EAS tardan más de 45 min
Es normal la primera vez (instala dependencias en cloud). Si pasa de 60 min:
```bash
eas build --platform ios --clear-cache --profile production
eas build --platform android --clear-cache --profile production
```

### Si App Store Connect rechaza el build
Posibles causas:
- Bundle ID no registrado: el usuario debe registrarlo en https://developer.apple.com/account/resources/identifiers/list
- Falta privacy policy: crear página `apps/landing/app/privacy/page.tsx`
- App name tomado: probar `Synapmsg Chat` o `Synapmsg Messenger`

### Si `dig api.synapmsg.ai` no responde
1. Ve a Cloudflare dashboard → synapmsg.ai → DNS → Records
2. Verifica que exista el registro: `api` CNAME → `synapmsg-api.up.railway.app` (Solo DNS, gris)
3. Si no existe, créalo con: Add record → Type CNAME → Name `api` → Target `synapmsg-api.up.railway.app` → Proxy status DNS only (gris)

---

## 📊 REPORTE FINAL

Al terminar todo, entrega al usuario un reporte con:

1. **URLs públicas**:
   - Landing: https://synapmsg.ai
   - Backend health: https://api.synapmsg.ai/health
   - Backend Railway: https://synapmsg-api.up.railway.app (interno)

2. **Estado de builds**:
   - iOS build: link de descarga del .ipa
   - Android build: link de descarga del .aab

3. **Estado de stores**:
   - TestFlight: pendiente/building/approved
   - Play Internal Testing: live con link de invitación

4. **Credenciales guardadas en**:
   - `.env.deploy` (raíz del proyecto)
   - Railway variables (dashboard)
   - Vercel variables (dashboard)

5. **Próximos pasos**:
   - Esperar aprobación Apple (24-48h)
   - Invitar 20-50 beta testers
   - Recopilar feedback con NPS

---

## 🎯 COMUNICACIÓN CON EL USUARIO

Durante todo el proceso:
1. **Pregunta antes de ejecutar comandos largos** ("Voy a correr `npm install` que tarda 2 min, ¿ok?")
2. **Pide confirmación antes de logins** ("Voy a abrir el navegador para login en Railway")
3. **Si algo falla, lee el error**, busca solución, intenta 2 veces. Si no funciona, pregunta al usuario.
4. **Reporta progreso** después de cada fase: "Fase 3 completada: deploy.sh ejecutado, GitHub actualizado"
5. **Al final entrega el reporte completo**

¡Buena suerte! 🚀
