# 🚀 Synapmsg — Guía de Deploy (2 horas, 1 comando)

Esta guía te lleva desde "código listo" hasta "app en producción" en 2 horas.

## 📋 Checklist de servicios externos

Antes de ejecutar el deploy, necesitas crear estas cuentas (todas tienen free tier):

### Obligatorios (1 hora)
- [ ] **Cloudflare** ✅ (ya lo tienes — synapmsg.ai configurado)
- [ ] **Neon** — https://neon.tech (PostgreSQL serverless, free 3GB)
- [ ] **GitHub repo** — crea `synapmsg` vacío en tu cuenta
- [ ] **DeepL API** — https://www.deepl.com/pro#developer (free 500K chars/mes)
- [ ] **Railway** — https://railway.app (login con GitHub, $5/mes Hobby)
- [ ] **Vercel** — https://vercel.com (login con GitHub, free)

### Opcional (15 min)
- [ ] **Cloudflare R2** — para almacenamiento multimedia (10GB free)
- [ ] **Apple Developer** — ya tienes vía Toscana Systems ($99/año)
- [ ] **Google Play Console** — ya tienes vía Toscana Systems ($25 una vez)

## 🛠️ Prerrequisitos en tu computadora

Antes de empezar, instala esto:

### 1. Node.js 20+ (si no lo tienes)
Descarga de https://nodejs.org y elige "LTS"

Verifica:
```bash
node --version  # debe decir v20.x o mayor
npm --version
```

### 2. Git (probablemente ya lo tienes)
```bash
git --version
```

### 3. CLIs de los servicios (instala los 3)
```bash
npm install -g @railway/cli
npm install -g vercel
npm install -g eas-cli
```

Verifica:
```bash
railway --version
vercel --version
eas --version
```

## 🎯 Pasos para deployar

### Paso 1 — Conseguir las keys

#### 1.1 Neon (PostgreSQL)
1. https://neon.tech → Sign up con GitHub
2. New Project:
   - Name: `synapmsg`
   - Region: `AWS US East (Ohio)`
   - Plan: Free
3. Click **Create Project**
4. Copia el **Connection string** (la URL completa con password)

#### 1.2 DeepL API
1. https://www.deepl.com/pro#developer
2. Click **Sign up for free**
3. Plan: **Free** (500K chars/mes)
4. Una vez logueado, ve a **Account → Authentication Key**
5. Copia tu API key (termina en `:fx`)

#### 1.3 Genera JWT secret
En tu terminal:
```bash
openssl rand -hex 32
```
Copia el output (64 caracteres hex).

#### 1.4 Crea GitHub repo
1. https://github.com/new
2. Repository name: `synapmsg`
3. Visibilidad: Private (recomendado)
4. NO inicialices con README (deja vacío)
5. Click **Create repository**
6. Copia la URL: `https://github.com/TU_USUARIO/synapmsg.git`

### Paso 2 — Configurar el deploy

En tu computadora, en la carpeta donde extrajiste el proyecto:

```bash
cd synapmsg
cp .env.deploy.example .env.deploy
```

Edita `.env.deploy` con tu editor favorito (VS Code, nano, etc.) y completa:

```bash
NEON_DATABASE_URL=postgresql://synapmsg_owner:npg_xxx@ep-xxx-pooler.us-east-2.aws.neon.tech/synapmsg?sslmode=require
JWT_SECRET=tu-jwt-secret-de-64-caracteres
DEEPL_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx
GITHUB_REPO_URL=https://github.com/TU_USUARIO/synapmsg.git

# Opcional (deja vacío si no configuraste R2):
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=synapmsg-media
R2_PUBLIC_URL=https://media.synapmsg.ai
```

### Paso 3 — Ejecutar el deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

El script va a:
1. ✅ Configurar archivos `.env` del backend y mobile
2. ✅ Instalar dependencias (`npm install` en backend)
3. ✅ Generar Prisma client
4. ✅ Crear tablas en Neon (`prisma db push`)
5. ✅ Inicializar Git y subir a GitHub
6. ✅ Deploy del backend a Railway
7. ✅ Deploy de la landing a Vercel
8. ✅ Build de la app móvil (iOS + Android) con EAS

Tiempo total: ~30-45 minutos (la mayor parte es esperar builds).

### Paso 4 — Pasos finales manuales (15 min)

Cuando `deploy.sh` termine, faltarán 3 cosas:

#### 4.1 Configurar dominio en Railway
1. Entra a https://railway.app → tu proyecto Synapmsg
2. Settings → Networking → Generate Domain
3. Te dará una URL tipo `synapmsg-api.up.railway.app` (la que ya configuramos en Cloudflare!)

#### 4.2 Configurar dominio en Vercel
1. Entra a https://vercel.com → tu proyecto Synapmsg
2. Settings → Domains → Add
3. Escribe `synapmsg.ai` y sigue las instrucciones
4. Vercel te pedirá verificar propiedad del dominio (ya está en Cloudflare, automáticamente detecta)

#### 4.3 Subir builds a stores
Cuando EAS termine los builds (te llegará email):
- **iOS**: descarga el `.ipa` → súbelo a App Store Connect → TestFlight
- **Android**: descarga el `.aab` → súbelo a Google Play Console → Internal Testing

## 🔧 Comandos útiles después del deploy

### Ver logs del backend (Railway)
```bash
railway logs
```

### Ver base de datos (Neon)
Entra a tu proyecto en https://neon.tech → SQL Editor → puedes hacer queries directamente.

### Ver landing page
Visita https://synapmsg.ai en tu navegador. Debería cargar en ~5 minutos después del deploy.

### Probar API
```bash
curl https://api.synapmsg.ai/health
# Debería responder: {"status":"ok","service":"synapmsg","time":"..."}
```

### Probar registro de usuario
```bash
curl -X POST https://api.synapmsg.ai/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@synapmsg.ai","password":"test1234","name":"Test","username":"test","preferredLanguage":"es"}'
```

## 🆘 Troubleshooting

### Error: "Cannot find module 'prisma'"
```bash
cd apps/api
npm install
npx prisma generate
```

### Error: "Database connection failed"
Verifica que tu `NEON_DATABASE_URL` en `.env.deploy` sea correcta.
Pruébala en tu terminal:
```bash
psql "postgresql://synapmsg_owner:xxx@ep-xxx.neon.tech/synapmsg?sslmode=require"
```

### Error: "Git push rejected"
Si tu repo de GitHub ya tenía commits, primero hace `git pull`:
```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### Vercel no detecta Next.js
Asegúrate de estar en `apps/landing` cuando ejecutes `vercel`:
```bash
cd apps/landing
vercel --prod
```

### Build de EAS falla
```bash
cd apps/mobile
eas login
eas build --platform ios --clear-cache
```

## 📞 Soporte

Si algo falla:
1. Lee el error completo
2. Busca en Google el mensaje exacto del error
3. Vuelve al chat con Z.ai y pégame el error

## 🎉 Resultado final

Cuando todo termine:

- 🌐 **https://synapmsg.ai** → Landing page live
- 🔌 **https://api.synapmsg.ai/health** → Backend funcionando
- 📱 **App en TestFlight** (iOS) → 24-48h para aprobar Apple
- 📱 **App en Play Internal Testing** (Android) → inmediato

¡Listo para invitar a tus primeros 20-50 beta testers!

---

**Tiempo total estimado:** 2 horas (1h setup cuentas + 30 min deploy + 30 min pasos finales)
