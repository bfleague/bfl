FROM node:22-bullseye-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
LABEL haxball.enable='true'
LABEL haxball.modes='[{ "type": "bfl.x4", "name": "Futebol Americano X4", "geo": "br -23 -46.0005" }]'
ENTRYPOINT ["npm", "run", "open"]
