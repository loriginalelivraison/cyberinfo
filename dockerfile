# ---- image de base Debian avec Node + LibreOffice ----
FROM debian:stable-slim

# installer Node, LibreOffice, OCR, etc.
RUN apt-get update && apt-get install -y \
    nodejs npm \
    libreoffice libreoffice-writer \
    tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng \
    ocrmypdf ghostscript qpdf \
    fonts-dejavu fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# copier et installer les dépendances
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# copier tout le code
COPY . .

# port d’écoute (Render assignera PORT)
ENV PORT=8080
EXPOSE 8080

# lancer ton serveur
CMD ["node", "src/index.js"]
