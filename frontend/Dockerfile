FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---- Desarrollo: el mismo comportamiento de siempre (hot-reload con Vite) ----
FROM base AS dev
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---- Build de producción ----
# VITE_API_URL se hornea en el bundle en este paso (Vite la lee en build time,
# no en runtime), así que aquí sí hace falta pasarla como build arg y no como
# variable de entorno del contenedor final.
FROM base AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm install
COPY . .
RUN npm run build

# ---- Producción: solo los estáticos, servidos por nginx con cache-control ----
FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
