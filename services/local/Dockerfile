FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends fontconfig fonts-liberation ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY . .
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

CMD ["node", "apps/api/dist/index.js"]
