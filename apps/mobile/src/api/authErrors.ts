/**
 * Map API / network auth failures to short Spanish copy for real users.
 */

import { ApiError } from './client';

type Payload = { error?: string; code?: string; message?: string };

export function mapAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    const payload = (err.details || {}) as Payload;
    const code = String(payload.code || '').toLowerCase();
    const raw = String(payload.error || payload.message || err.message || '')
      .toLowerCase();

    if (err.status === 0 || /network|timeout|econnaborted/.test(raw)) {
      return 'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.';
    }

    if (
      code === 'invalid_credentials' ||
      err.status === 401 ||
      raw.includes('incorrectos') ||
      raw.includes('invalid email') ||
      raw.includes('invalid password')
    ) {
      if (raw.includes('recovery')) {
        return 'Código de recuperación incorrecto.';
      }
      return 'Correo / Private Number o contraseña incorrectos.';
    }

    if (
      code === 'email_taken' ||
      raw.includes('email is already') ||
      raw.includes('correo ya está')
    ) {
      return 'Ese correo ya está registrado. Iniciá sesión.';
    }
    if (
      code === 'username_taken' ||
      code === 'already_exists' ||
      raw.includes('username is already') ||
      raw.includes('usuario ya')
    ) {
      return 'Ese nombre de usuario ya está en uso. Probá otro.';
    }
    if (code === 'invalid_username' || raw.includes('usuario: 3')) {
      return 'Usuario: 3–24 caracteres, solo letras, números y _.';
    }
    if (raw.includes('password must be at least')) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    if (raw.includes('email is not a valid') || raw.includes('email is required')) {
      return 'Ingresá un correo válido.';
    }
    if (raw.includes('username is required')) {
      return 'Ingresá un nombre de usuario.';
    }
    if (raw.includes('name is required')) {
      return 'Ingresá tu nombre.';
    }
    if (err.status === 409) {
      return 'Esa cuenta ya existe. Iniciá sesión o usá otro correo/usuario.';
    }
    if (err.status >= 500 || raw.includes('internal server')) {
      return 'El servidor tuvo un problema. Intentá de nuevo en unos segundos.';
    }
    if (payload.error && payload.error.length < 120) {
      return payload.error;
    }
    return 'No se pudo completar. Revisá los datos e intentá de nuevo.';
  }

  if (err instanceof Error && err.message === 'FIDO2_REQUIRED') {
    return 'Esta cuenta pide verificación extra (FIDO2). Usá un código de recuperación.';
  }

  return 'No se pudo completar. Revisá los datos e intentá de nuevo.';
}
