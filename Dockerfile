FROM node:dubnium

WORKDIR /opt/openhim-mediator-file-queue

COPY package.json npm-shrinkwrap.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]
