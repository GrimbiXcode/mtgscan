# --- Build stage ---
# Node 20 reached end-of-life in April 2026 and no longer receives security
# patches; 22 is the current LTS and is also what sharp >=0.35 expects
# (engines: >=20.9.0).
FROM node:22-bookworm-slim AS build
WORKDIR /app

# System deps for node-gyp and canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ pkg-config \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package.json package-lock.json* ./
# Remove previous node_modules if any (safety) and install WITH optional deps
RUN rm -rf node_modules \
  && npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist ./
# Copy static assets (e.g., default-card.png) required by the app
COPY ./assets ./assets
COPY ./public ./public

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
