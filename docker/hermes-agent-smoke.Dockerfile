FROM node:24-alpine

WORKDIR /opt/smoke-hermes
COPY docker/hermes-agent-smoke-server.mjs ./server.mjs

ENV API_SERVER_PORT=8642
EXPOSE 8642

ENTRYPOINT ["node", "/opt/smoke-hermes/server.mjs"]
