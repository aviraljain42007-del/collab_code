# ── Stage 1: Builder ──
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools with retry logic
RUN attempt=1; delay=2; \
    until apk add --no-cache python3 make g++; do \
      if [ "$attempt" -ge 5 ]; then \
        echo "APK install failed after $attempt attempts" >&2; \
        exit 1; \
      fi; \
      echo "Retrying APK install in ${delay}s..." >&2; \
      sleep "$delay"; \
      attempt=$((attempt + 1)); \
      delay=$((delay * 2)); \
    done

COPY package*.json ./
RUN npm install
COPY . .

# ── Stage 2: Production ──
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src

EXPOSE 3000
CMD ["npm", "start"]