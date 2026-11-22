FROM node:20-alpine

# Saare languages ke compilers aur runtimes install karo
RUN apk add --no-cache python3 g++ openjdk17 bash

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3004
CMD ["npm", "start"]