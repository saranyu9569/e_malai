// สถานะเซิร์ฟเวอร์แบบเบา ๆ สำหรับดูตอนทดสอบโหลด (ไม่กระทบการทำงานปกติ)
function registerStatsRoute(app, { io, userRegistry, dataStore }) {
  app.get('/stats', (req, res) => {
    const m = process.memoryUsage();
    const { students, teachers, committee } = userRegistry.counts();
    res.json({
      users: userRegistry.size(),
      students,
      teachers,
      committee,
      sockets: io.engine.clientsCount,
      historyRows: dataStore.historySize(),
      wallFlowers: dataStore.wallSize(),
      rssMB: +(m.rss / 1048576).toFixed(1),
      heapUsedMB: +(m.heapUsed / 1048576).toFixed(1),
      uptimeSec: Math.round(process.uptime()),
    });
  });
}

module.exports = registerStatsRoute;
