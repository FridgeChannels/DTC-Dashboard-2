# syntax=docker/dockerfile:1

FROM node:25-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:25-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nodejs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npx playwright install --with-deps chromium \
  && npm cache clean --force \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R nodejs:nodejs /app /ms-playwright

COPY --from=builder /app/dist ./dist
COPY src/dashboard ./src/dashboard
COPY src/fc ./src/fc

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
