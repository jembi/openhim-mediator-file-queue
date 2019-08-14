FROM node:dubnium-alpine

ADD . /opt/openhim-mediator-file-queue

WORKDIR /opt/openhim-mediator-file-queue

RUN npm install

CMD npm start