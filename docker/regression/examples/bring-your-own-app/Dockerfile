# Multi-stage build: Angular AOT build → minimal Node runtime serving via Express
#
# Stage 1 — install + build the Angular bundle
FROM node:24-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY app/ ./
RUN npm run build

# Stage 2 — runtime: Node + Express + the built static bundle
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY app/package.json app/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
