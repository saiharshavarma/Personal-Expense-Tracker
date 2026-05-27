FROM node:22-alpine
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json ./
RUN pnpm install
CMD ["pnpm", "dev", "--host"]
