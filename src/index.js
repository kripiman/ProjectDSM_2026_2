const Server = require('./utils/server');

const server = new Server();
server.start().catch((error) => {
  console.error('[Fatal] Server failed to start:', error);
  process.exit(1);
});
