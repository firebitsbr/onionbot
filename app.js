/* eslint no-console: ["warn", { allow: ["error", "info"] }] */

const Botkit = require('botkit');
const config = require('./src/config');
const firebase = require('./src/botkit-storage-firebase-admin');
const path = require('path');
const getNewsAndSend = require('./src/getNewsAndSend');
const printConfigTable = require('./src/printConfigTable');

const {
  clientId,
  clientSecret,
  debugEnabled,
  greetingText,
  helpText,
  port,
  redirectUri,
} = config;

const activeBots = {};

if (debugEnabled) {
  printConfigTable();
}

const controller = Botkit.slackbot({
  debug: debugEnabled,
  storage: firebase,
}).configureSlackApp({
  clientId,
  clientSecret,
  redirectUri,
  scopes: ['bot'],
});

controller.setupWebserver(port, (err, webserver) => {
  webserver.get('/', (req, res) => {
    res.sendFile(path.join(`${__dirname}/public/index.html`));
  });

  controller.createOauthEndpoints(webserver, (oauthErr, req, res) => {
    if (oauthErr) {
      res.status(500).send(`ERROR: ${oauthErr}`);
    } else {
      res.send('Success!');
    }
  });
});

controller.storage.teams.all((teams) => {
  teams.forEach((team) => {
    const parsedTeam = team.val();
    const { name } = parsedTeam;

    if (debugEnabled) { console.info(`Adding team: ${name}`); }

    controller.spawn(parsedTeam.bot).startRTM((teamErr, bot) => {
      if (teamErr) {
        console.error(`Error connecting bot to Slack for team ${name}: ${teamErr}`);
      } else if (activeBots[bot.config.token]) {
        console.error(`Error: bot already active for team ${name}`);
      } else {
        activeBots[bot.config.token] = bot;
      }
    });
  });
});

controller.on('create_bot', (bot) => {
  if (activeBots[bot.config.token]) {
    if (debugEnabled) { console.info(`Bot already active: ${bot.config.token}, skipping`); }
  } else {
    bot.startRTM((err) => {
      if (!err) {
        activeBots[bot.config.token] = bot;
      }
    });
  }
});

controller.hears([''], 'direct_message,direct_mention,mention', (bot, message) => {
  const { text } = message;

  if (text === '' || text === 'help') {
    bot.reply(message, helpText);
  } else if (['hi', 'hello', 'hey', 'yo'].includes(text)) {
    bot.reply(message, greetingText);
  } else {
    getNewsAndSend(message, bot);
  }
});
