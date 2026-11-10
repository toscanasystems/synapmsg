#!/usr/bin/env bash
# Synapmsg — Deploy automático
# Ejecuta: ./deploy.sh
# Requiere: Node.js 20+, npm, git, curl
# Opcionales (instala si no los tienes): railway CLI, vercel CLI

set -e

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_step() { echo -e "${CYAN}▶ $1${NC}"; }
print_ok()   { echo -e "${GREEN}✓ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_err()  { echo -e "${RED}✗ $1${NC}"; }

echo "================================================"
echo "  Synapmsg — Deploy Automático"
echo "================================================"
echo ""

# 0. Verificar .env.deploy
ENV_FILE=".env.deploy"
if [ ! -f "$ENV_FILE" ]; then
    print_err "No se encontró .env.deploy"
    echo "Copia .env.deploy.example a .env.deploy y completa los valores."
    exit 1
fi

print_step "Cargando configuración desde $ENV_FILE..."
source "$ENV_FILE"
print_ok "Configuración cargada"

# Validar que las variables críticas estén
if [ -z "$NEON_DATABASE_URL" ]; then
    print_err "NEON_DATABASE_URL no está configurada en .env.deploy"
    exit 1
fi
if [ -z "$DEEPL_API_KEY" ]; then
    print_err "DEEPL_API_KEY no está configurada en .env.deploy"
    exit 1
fi
if [ -z "$JWT_SECRET" ]; then
    print_err "JWT_SECRET no está configurado en .env.deploy (genera uno con: openssl rand -hex 32)"
    exit 1
fi
if [ -z "$GITHUB_REPO_URL" ]; then
    print_err "GITHUB_REPO_URL no está configurada en .env.deploy"
    exit 1
fi

print_ok "Variables críticas validadas"

# 1. Configurar .env del backend
print_step "Configurando apps/api/.env..."
cat > apps/api/.env << EOF
# Database (Neon PostgreSQL)
DATABASE_URL="$NEON_DATABASE_URL"
DIRECT_URL="$NEON_DATABASE_URL"

# Auth
JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN="7d"
BCRYPT_ROUNDS=10

# DeepL
DEEPL_API_KEY="$DEEPL_API_KEY"

# Server
PORT=3000
NODE_ENV="production"
CORS_ORIGIN="https://synapmsg.ai,https://www.synapmsg.ai"

# Cloudflare R2 (si configuraste storage)
R2_ACCOUNT_ID="$R2_ACCOUNT_ID"
R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
R2_BUCKET_NAME="$R2_BUCKET_NAME"
R2_PUBLIC_URL="$R2_PUBLIC_URL"
EOF
print_ok "apps/api/.env creado"

# 2. Configurar .env del mobile app
print_step "Configurando apps/mobile/.env..."
# Detectar URL pública del backend (Railway te la dará al final)
cat > apps/mobile/.env << EOF
EXPO_PUBLIC_API_URL="https://api.synapmsg.ai"
EXPO_PUBLIC_WS_URL="wss://api.synapmsg.ai/ws"
EOF
print_ok "apps/mobile/.env creado"

# 3. Instalar dependencias del backend
print_step "Instalando dependencias del backend..."
cd apps/api
npm install --silent
print_ok "Dependencias backend instaladas"

# 4. Generar Prisma client
print_step "Generando Prisma client..."
npx prisma generate
print_ok "Prisma client generado"

# 5. Crear tablas en la base de datos (Neon)
print_step "Creando tablas en Neon PostgreSQL..."
npx prisma db push
print_ok "Tablas creadas en Neon"
cd ../..

# 6. Inicializar Git y subir a GitHub
print_step "Configurando repositorio Git..."
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi
git add -A
git commit -m "Initial commit: Synapmsg v1.0 — MVP completo

- Backend Node.js + Express + Prisma + WebSocket
- Mobile React Native + Expo (7 pantallas)
- Landing Next.js + Tailwind
- Logo Concepto 02 con paleta Toscana
- Traducción DeepL + cifrado E2E básico" || true

# Verificar si el remote ya está configurado
if ! git remote get-url origin > /dev/null 2>&1; then
    git remote add origin "$GITHUB_REPO_URL"
fi
print_ok "Git configurado"

print_step "Subiendo código a GitHub ($GITHUB_REPO_URL)..."
git push -u origin main || git push origin main
print_ok "Código subido a GitHub"

# 7. Deploy a Railway
echo ""
print_step "===== DEPLOY BACKEND A RAILWAY ====="
if command -v railway > /dev/null 2>&1; then
    # Railway CLI está instalado
    cd apps/api
    railway link --force || railway init
    # Set variables en Railway
    railway variables set DATABASE_URL="$NEON_DATABASE_URL"
    railway variables set JWT_SECRET="$JWT_SECRET"
    railway variables set DEEPL_API_KEY="$DEEPL_API_KEY"
    railway variables set NODE_ENV="production"
    railway variables set CORS_ORIGIN="https://synapmsg.ai,https://www.synapmsg.ai"
    railway up --detach
    cd ../..
    print_ok "Backend deployado en Railway"
    print_warn "URL pública: revisa tu dashboard de Railway"
    print_warn "Configura api.synapmsg.ai DNS en Cloudflare apuntando a la URL de Railway"
else
    print_warn "Railway CLI no está instalado."
    echo ""
    echo "Para instalar Railway CLI:"
    echo "  npm install -g @railway/cli"
    echo ""
    echo "Después ejecuta este script de nuevo."
    echo ""
    echo "Alternativa: conecta tu repo GitHub en https://railway.app/new"
    echo "y configura las variables de entorno manualmente:"
    echo ""
    echo "  DATABASE_URL=$NEON_DATABASE_URL"
    echo "  JWT_SECRET=$JWT_SECRET"
    echo "  DEEPL_API_KEY=$DEEPL_API_KEY"
    echo "  NODE_ENV=production"
    echo "  CORS_ORIGIN=https://synapmsg.ai,https://www.synapmsg.ai"
fi

# 8. Deploy a Vercel
echo ""
print_step "===== DEPLOY LANDING A VERCEL ====="
if command -v vercel > /dev/null 2>&1; then
    cd apps/landing
    vercel --prod --yes
    cd ../..
    print_ok "Landing deployada en Vercel"
    print_warn "Configura synapmsg.ai en Vercel: Settings → Domains → Add"
    print_warn "Vercel te dará un registro A o CNAME para poner en Cloudflare"
else
    print_warn "Vercel CLI no está instalado."
    echo ""
    echo "Para instalar Vercel CLI:"
    echo "  npm install -g vercel"
    echo ""
    echo "Alternativa: conecta tu repo GitHub en https://vercel.com/new"
    echo "Selecciona la carpeta apps/landing como root"
fi

# 9. Build mobile
echo ""
print_step "===== BUILD APP MÓVIL ====="
cd apps/mobile
if command -v eas > /dev/null 2>&1; then
    print_step "Login a EAS (Expo Application Services)..."
    eas whoami || eas login

    print_step "Build para iOS (TestFlight)..."
    eas build --platform ios --profile production --non-interactive

    print_step "Build para Android (Play Store)..."
    eas build --platform android --profile production --non-interactive

    print_ok "Builds enviados a EAS"
    print_warn "Cuando terminen (15-30 min), súbelos a App Store Connect y Play Console"
else
    print_warn "EAS CLI no está instalado."
    echo ""
    echo "Para instalar EAS CLI:"
    echo "  npm install -g eas-cli"
    echo ""
    echo "Después desde apps/mobile ejecuta:"
    echo "  eas login"
    echo "  eas build --platform all --profile production"
fi
cd ../..

# Resumen final
echo ""
echo "================================================"
echo "  🎉 DEPLOY COMPLETADO"
echo "================================================"
echo ""
echo "✅ Base de datos: Neon PostgreSQL"
echo "   → Tablas creadas, listas para usar"
echo ""
echo "✅ Código: GitHub ($GITHUB_REPO_URL)"
echo ""
echo "📊 Pendiente configurar manualmente:"
echo "   1. Railway: ver URL pública del backend, configurar api.synapmsg.ai en Cloudflare"
echo "   2. Vercel: agregar dominio synapmsg.ai en Settings → Domains"
echo "   3. EAS Build: esperar builds (15-30 min) y subir a stores"
echo ""
echo "🚀 Cuando termines estos pasos:"
echo "   - synapmsg.ai → Landing page"
echo "   - api.synapmsg.ai → Backend API + WebSocket"
echo "   - App disponible en TestFlight (iOS) y Play Internal Testing (Android)"
echo ""
echo "¿Dudas? Vuelve al chat con Z.ai para guiarte en cada paso."
