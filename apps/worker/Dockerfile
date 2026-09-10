FROM node:20-alpine AS base
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json ./
COPY packages/db/package.json packages/db/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install

FROM base AS build
COPY . .
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=apps/worker

FROM node:20-alpine AS runner
WORKDIR /repo
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build /repo/apps/worker/package.json ./apps/worker/package.json
CMD ["node", "apps/worker/dist/index.js"]
