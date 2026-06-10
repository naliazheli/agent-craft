ARG NGINX_BASE=nginx:alpine

FROM node:24-bookworm AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_APP_BASE_PATH=/
ARG VITE_API_BASE_URL=/api
ARG VITE_MCP_BASE_URL=/mcp
ENV VITE_APP_BASE_PATH=$VITE_APP_BASE_PATH
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MCP_BASE_URL=$VITE_MCP_BASE_URL
RUN npm run build

FROM ${NGINX_BASE}
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.aws.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
