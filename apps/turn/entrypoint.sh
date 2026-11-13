#!/bin/sh
set -e
CONF=/etc/coturn/turnserver.conf
SECRET="${TURN_SECRET:-}"
if [ -z "$SECRET" ]; then
  echo "TURN_SECRET is required" >&2
  exit 1
fi
sed -i "s|^static-auth-secret=.*|static-auth-secret=${SECRET}|" "$CONF"

# Advertise external IP for ICE candidates when known.
# Format PUBLIC/PRIVATE (IPv4) so relay candidates match Railway NAT.
EXT="${TURN_EXTERNAL_IP:-}"
if [ -z "$EXT" ] && [ "${DETECT_EXTERNAL_IP:-1}" = "1" ]; then
  EXT=$(wget -qO- https://api.ipify.org 2>/dev/null || true)
fi

# Prefer IPv4 container address (never mix IPv4 public with IPv6 private).
PRIV=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n1 || true)
if [ -z "$PRIV" ]; then
  PRIV=$(hostname -i 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1 || true)
fi

grep -v '^external-ip=' "$CONF" > /tmp/turn.conf || true
if [ -n "$EXT" ] && echo "$EXT" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  if [ -n "$PRIV" ] && [ "$EXT" != "$PRIV" ]; then
    echo "external-ip=${EXT}/${PRIV}" >> /tmp/turn.conf
    echo "coturn external-ip=${EXT}/${PRIV}"
  else
    echo "external-ip=${EXT}" >> /tmp/turn.conf
    echo "coturn external-ip=${EXT}"
  fi
else
  echo "coturn: no usable IPv4 external-ip (got '${EXT}')"
fi
mv /tmp/turn.conf "$CONF"

exec turnserver -c "$CONF" --listening-ip=0.0.0.0 -v
