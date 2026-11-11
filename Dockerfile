FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "server/server.js"]
