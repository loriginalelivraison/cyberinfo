# Image Node officielle + Debian (bookworm-slim)
FROM node:20-bookworm-slim

# Installer LibreOffice + fonts (et nettoyer les caches)
RUN apt-get update && apt-get install -y \
    libreoffice libreoffice-writer \
    fonts-dejavu fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Code
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
