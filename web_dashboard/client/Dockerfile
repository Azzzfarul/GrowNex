FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Optional overrides of client/.env (unset args are ignored), e.g. for the emulator sandbox.
ARG VITE_USE_EMULATORS
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
# Empty → same-origin /api, proxied by nginx to the server container.
ENV VITE_API_URL=
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
