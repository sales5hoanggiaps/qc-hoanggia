FROM node:20-alpine AS base
WORKDIR /repo
COPY package.json ./
COPY packages/db/package.json packages/db/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

FROM base AS build
COPY . .
# Root "build" script runs packages/db's own build (prisma generate + tsc,
# producing dist/index.js) before building apps/web — apps/web's build
# fails to resolve "@qc/db" without that compiled output existing first.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
