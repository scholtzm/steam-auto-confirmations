var vapor = require('vapor');
var totp = require('steam-totp');
var SteamCommunity = require('steamcommunity');

var config = require('./config.json');

var client = vapor();
var steamCommunity = new SteamCommunity();

try {
  client.servers = require('./data/servers.json');
} catch(error) {
  // The file probably doesn't exist or cannot be parsed
}

client.init({
  username: config.username,
  password: config.password,
  state: 'Offline'
});

client.use(vapor.plugins.consoleLogger);
client.use(vapor.plugins.fs, 'data');
client.use(vapor.plugins.essentials);

client.use({
  name: 'steamguard',
  plugin: function(API) {

    var log = API.getLogger();
    var lastCode = '0';

    API.registerHandler({
      emitter: 'vapor',
      event: 'steamGuard'
    }, function(callback) {
      log.info('Received request for SteamGuard code.');
      var code = totp.generateAuthCode(config.shared_secret);

      if(lastCode === code) {
        log.info('Waiting 30 seconds before generating new SteamGuard code.');

        setTimeout(function() {
          lastCode = totp.generateAuthCode(config.shared_secret);
          callback(lastCode);
        }, 30000);
      } else {
        lastCode = code;
        callback(lastCode);
      }
    });

  }
});

client.use({
  name: 'confirmations',
  plugin: function(API) {

    var log = API.getLogger();

    function acceptConfirmations(confirmations, index) {
      log.info('Accepting confirmation #' + index);

      var time = totp.time();
      var key = totp.getConfirmationKey(config.identity_secret, time, 'allow');

      confirmations[index].respond(time, key, true, function(error) {
        if(error) {
          log.error('Failed to accept confirmation #' + index);
          log.error(error);
        } else {
          log.info('Confirmation #' + index + ' has been accepted.');
        }

        if(confirmations.length - 1 > index) {
          setTimeout(function() {
            acceptConfirmations(confirmations, index + 1);
          }, 1000);
        } else {
          API.disconnect();
        }
      });
    }

    API.registerHandler({
      emitter: 'vapor',
      event: 'cookies'
    }, function(cookies) {
      steamCommunity.setCookies(cookies);

      var time = totp.time();
      var key = totp.getConfirmationKey(config.identity_secret, time, 'conf');

      steamCommunity.getConfirmations(time, key, function(error, confirmations) {
        if(error) {
          log.error('Received error while loading confirmations:');
          log.error(error);

          API.disconnect();

          return;
        }

        log.info('Received ' + confirmations.length + ' confirmations.');

        if(confirmations.length > 0) {
          acceptConfirmations(confirmations, 0);
        } else {
          API.disconnect();
        }
      });
    });

  }
});

client.connect();

process.on('SIGINT', function() {
  client.disconnect();
  setTimeout(process.exit, 1000, 0);
});
