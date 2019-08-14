FROM node:dubnium-alpine

WORKDIR /opt/openhim-mediator-file-queue

COPY package.json npm-shrinkwrap.json /opt/openhim-mediator-file-queue/

RUN npm install

COPY . /opt/openhim-mediator-file-queue

CMD npm start