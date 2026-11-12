# coturn TURN relay — encrypted SRTP only (cannot decrypt call audio).
FROM coturn/coturn:4.6.2

USER root
COPY turnserver.conf /etc/coturn/turnserver.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DETECT_EXTERNAL_IP=1
EXPOSE 3478 3478/udp 5349 5349/udp

ENTRYPOINT ["/entrypoint.sh"]
