# Dockerfile (corrigé)
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# MAJ + install LO (draw inclut l'import PDF), polices, ghostscript
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice \
      libreoffice-writer \
      libreoffice-draw \
      fonts-dejavu \
      fonts-noto-core \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      ghostscript \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
