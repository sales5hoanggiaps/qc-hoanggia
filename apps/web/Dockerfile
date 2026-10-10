FROM node:20-alpine AS base
WORKDIR /repo
# Prisma's engine downloader shells out to `openssl version` to pick the
# right query/schema engine binary for this platform. Without the openssl
# CLI present, detection silently fails and it defaults to an OpenSSL 1.1
# build — which then fails at runtime on this Alpine base (ships OpenSSL 3
# only, no libssl.so.1.1). Install it before `npm install` so the correct
# musl+openssl-3.0.x engines get downloaded in the first place.
RUN apk add --no-cache openssl
COPY package.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY apps/web/package.json apps/web/package.json
# Root "build" (invoked below) also builds apps/worker's workspace after
# apps/web's — its package.json (node-cron et al.) must be installed here
# too, or that step of the root build fails inside this image.
COPY apps/worker/package.json apps/worker/package.json
RUN npm install

FROM base AS build
COPY . .
ENV DATABASE_URL="postgresql://qc:qc_dev_password@postgres:5432/qc_hoanggia"
# Root "build" script runs packages/db's own build (prisma generate + tsc,
# producing dist/index.js) before building apps/web — apps/web's build
# fails to resolve "@qc/db" without that compiled output existing first.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
# Same reasoning as the base stage: the entrypoint runs `prisma migrate
# deploy` at container start, and the Prisma CLI re-detects the OpenSSL
# version at runtime too — needs the openssl CLI present to pick the
# musl+openssl-3.0.x engine instead of a broken OpenSSL 1.1 default.
RUN apk add --no-cache openssl
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# The standalone output above only bundles what Next.js traced as required
# to *serve* the app — it does not include the Prisma CLI or the seed
# script, both devDependencies of packages/db that nothing at runtime
# imports. The entrypoint needs to run `prisma migrate deploy` and
# (conditionally) the seed script before the server starts, so bring in
# the full root node_modules (prisma CLI, tsx, @prisma/client + its
# generated linux-musl engine, bcryptjs, etc.) plus packages/db's own
# schema/migrations/package.json.
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/db/prisma ./packages/db/prisma
COPY --from=build /repo/packages/db/package.json ./packages/db/package.json
# assets/templates/tcsp-template.xlsx is read via fs at runtime (apps/web/src/lib/tcsp-export/
# build-workbook.ts), not imported as a JS module — Next's standalone output only bundles what it
# traces from imports, so this binary asset needs its own explicit COPY or TCSP export 500s in prod.
COPY --from=build /repo/assets ./assets
COPY apps/web/docker-entrypoint.sh ./apps/web/docker-entrypoint.sh
RUN chmod +x ./apps/web/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./apps/web/docker-entrypoint.sh"]
