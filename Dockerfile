FROM node:16-alpine

WORKDIR /opt/openhim-mediator-file-queue

COPY package.json package-lock.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]
