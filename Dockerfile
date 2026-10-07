FROM node:24.8.0-bookworm-slim
ENV NODE_ENV=production \
    PORT=10000 \
    DATA_DIR=/var/data \
    ROUTING_MODE=path
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node vendor ./vendor
COPY --chown=node:node static ./static
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docs ./docs
RUN mkdir -p /var/data && chown node:node /var/data
USER root
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/docker-entrypoint.js"]
