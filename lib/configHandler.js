'use strict';

const Winston = require('winston');
const OpenHIM = require('./openhim.js');
const endpointUtils = require('./setupEndpoint');
const URL = require('url');

function updateChannelConfig(apiConf, endpointChannel, callback) {
  // edit iHRIS channel with new config
  const openhim = OpenHIM(apiConf);
  openhim.fetchChannelByName(endpointChannel.name, (err, channel) => {
    if (err) {
      Winston.info(err.message);

      openhim.addChannel(endpointChannel, (err) => {
        if(err) {
          callback(err);
          return;
        } else {
          Winston.info('Successfully added new channel');
        }
      });
    } else {
      channel.urlPattern = endpointChannel.urlPattern;
      channel.routes[0] = endpointChannel.routes[0];

      openhim.updateChannel(channel._id, channel, (err) => {
        if (err) {
          callback(err);
          return;
        } else {
          Winston.info('Updated channel');
        }
      });
    }
    callback(null);
  });
}

exports.updateEndpointConfig = function(app, apiConfig, apiOpts, newConfig, mediatorConfig, callback) {
  Winston.debug('Start updating endpoint config');
  if(apiConfig && apiOpts){
    if(newConfig && newConfig.endpoints){
      apiConfig.endpoints = newConfig.endpoints;
    } else {
      Winston.info('The new config is missing "endpoints" element. Resorting to default.');
    }

    // use default config if nothing new is provided
    apiConfig.endpoints.forEach(function(endpoint) {
      if (endpoint.disableAutoChannelManagement === true) {
        return endpointUtils.setUpEndpoint(app, endpoint, apiOpts, function() {
          callback(null);
        });
      }

      var endpointChannel = {
        name: endpoint.name,
        urlPattern: '^' + endpoint.path + '$',
        status: 'enabled',
        routes: [
          {
            name: endpoint.name,
            host: mediatorConfig.endpoints[0].host,
            path: endpoint.path,
            port: apiConfig.port,
            secured: URL.parse(endpoint.url).protocol==='http:'? false : true,
            primary: true
          }
        ],
        authType: 'private',
        allow: [
          'file-queue'
        ]
      };

      updateChannelConfig(apiOpts, endpointChannel, (err) => {
        if(err) {
          return callback(err);
        }
        endpointUtils.setUpEndpoint(app, endpoint, apiOpts, function() {
          callback(null);
        });
      });
    });
    Winston.info('Updated Endpoints config');
  } else {
    callback('Config update failed because of invalid parameters');
  }
};
