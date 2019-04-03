const express = require('express');
const bodyParser = require('body-parser');
// const fs = require('fs');
const chalk = require('chalk');
const chokidar = require('chokidar');
const utils = require('./socketMessageUtils');
const path = require('path');

const app = express();

// constants
const serverPort = 3002;
const socketPort = 8000;
const portalName = process.env.PORTAL;
const configDir = 'config/'

// parsing middleware
app.use(bodyParser.json())

// setup web socket
const server = require('http').Server(app);
const io = require('socket.io')(server);
server.listen(socketPort);
io.on('connection', function (socket) {
  console.log(chalk.green(`Socket connected on port ${socketPort}`));

  // watch files
  const watcher = chokidar.watch(`./portals/${portalName}/config/`);
  watcher.on('change', (filepath) => {
    const slicedPath = filepath.slice(filepath.indexOf(configDir) + configDir.length);
    const thePayload = utils.parseChangedFilePath(slicedPath);
    if (thePayload) {
      console.log(chalk.green(`Reloading ${slicedPath.split('/')[1]}`));
      io.emit('hot-portal-reload', thePayload);
    }
  })
});

//listen
app.listen(serverPort, () => {
  console.log(chalk.green(`Welcome to cb-dev-kit server!\nListening on serverPort ${serverPort}.....\n\nNode is watching output files for portal: ${portalName}`));
});
