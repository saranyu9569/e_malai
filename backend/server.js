const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const config = require('./config');
const DataStore = require('./stores/DataStore');
const UserRegistry = require('./registry/UserRegistry');
const WallService = require('./services/WallService');
const { DownloadTokenStore, registerDownloadRoutes } = require('./http/downloads');
const registerStatsRoute = require('./http/statsRoute');
const registerSocketHandlers = require('./socket/socketHandlers');

fs.mkdirSync(config.DATA_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
// รองรับรูป PNG ที่นักศึกษาอัปโหลดเอง (ส่งเป็น data URL) จึงเพิ่มขนาด payload
const io = new Server(server, { maxHttpBufferSize: 8e6 });

// no-cache: ระหว่างพัฒนา/อีเวนต์วันเดียว ให้เบราว์เซอร์เช็คไฟล์ใหม่เสมอ (ยัง 304 ได้ถ้าไม่เปลี่ยน)
app.use(express.static(config.PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.use(express.json({ limit: '12mb' }));

const dataStore = new DataStore({
  dataDir: config.DATA_DIR,
  maxHistory: config.MAX_HISTORY,
  maxThumbLen: config.MAX_THUMB_LEN,
});
app.use('/thumb', express.static(dataStore.thumbDir, { maxAge: '365d', immutable: true }));

const userRegistry = new UserRegistry(config.MAX_COMMITTEE);

const wallService = new WallService({
  dataStore,
  dataDir: config.DATA_DIR,
  maxWall: config.MAX_WALL,
  wallEmoji: config.WALL_EMOJI,
  sendAllCooldown: config.WALL_SEND_ALL_COOLDOWN,
});

const downloadStore = new DownloadTokenStore(config.DL_TTL);
registerDownloadRoutes(app, downloadStore);
registerStatsRoute(app, { io, userRegistry, dataStore });

// เส้นทาง /wall — จอฉายในงานพิธี
app.get('/wall', (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'wall.html'));
});

registerSocketHandlers(io, { dataStore, wallService, userRegistry, config });

server.listen(config.PORT, () => {
  console.log(`E-malai ทำงานที่ http://localhost:${config.PORT}`);
  console.log('บนมือถือ ให้เปิด http://<IP-เครื่องนี้>:' + config.PORT + ' โดยอยู่ WiFi วงเดียวกัน');
  console.log('จอพิธี (พวงมาลัยรวม): http://localhost:' + config.PORT + '/wall');
});

module.exports = { app, server, io };
