#!/bin/sh
set -e
CONF=/etc/coturn/turnserver.conf
SECRET="${TURN_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "TURN_SECRET is required" >&2
  exit 1
fi
sed -i "s|^static-auth-secret=.*|static-auth-secret=${SECRET}|" "$CONF"

# External IP for relay candidates (Railway public / DETECT)
EXT="${TURN_EXTERNAL_IP:-}"
if [ -z "$EXT" ] && [ "${DETECT_EXTERNAL_IP:-1}" = "1" ]; then
  EXT=$(wget -qO- https://api.ipify.org 2>/dev/null || true)
fi
if [ -n "$EXT" ]; then
  # Remove prior external-ip lines then append
  grep -v '^external-ip=' "$CONF" > /tmp/turn.conf || true
  echo "external-ip=${EXT}" >> /tmp/turn.conf
  mv /tmp/turn.conf "$CONF"
  echo "coturn external-ip=${EXT}"
fi

exec turnserver -c "$CONF" --listening-ip=0.0.0.0 -v
