# ── Stage 1: Builder ──
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools install karo (argon2 compile karne ke liye)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install
COPY . .

# ── Stage 2: Production ──
FROM node:20-alpine

WORKDIR /app

# YAHAN CHANGE HAI: Docker CLI install karo (sirf execution service ke liye)
RUN apk add --no-cache docker-cli

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src

EXPOSE 3000
CMD ["npm", "start"]