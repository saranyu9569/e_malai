const path = require('path');
const { resolveImages, cleanName, newId } = require('../utils/validate');

function registerSocketHandlers(io, { dataStore, wallService, userRegistry, config }) {
  io.on('connection', (socket) => {
    socket.emit('committee-status', userRegistry.committeeStatus());

    socket.on('register', ({ role, name } = {}) => {
      if (role !== 'student' && role !== 'teacher' && role !== 'committee') return;
      const cleaned = cleanName(name) || 'ไม่ระบุชื่อ';

      if (role === 'committee' && userRegistry.countRole('committee') >= config.MAX_COMMITTEE) {
        socket.emit('register-rejected', { reason: `กรรมการเต็มแล้ว (${config.MAX_COMMITTEE}/${config.MAX_COMMITTEE})` });
        return;
      }

      userRegistry.register(socket.id, role, cleaned);

      if (role === 'teacher') {
        io.emit('teachers', userRegistry.teacherList());
        socket.emit('history', dataStore.historyForTeacher(cleaned)); // ส่งประวัติย้อนหลังให้อาจารย์
      } else if (role === 'committee') {
        io.emit('committee-status', userRegistry.committeeStatus());
        const alreadySent = dataStore.committeeAlreadySent(cleaned);
        socket.emit('registered', { role, alreadySent });
      } else {
        socket.emit('teachers', userRegistry.teacherList());
      }
    });

    socket.on('send-garland', ({ toTeacherId, src, thumb, power } = {}) => {
      const from = userRegistry.get(socket.id);
      if (!from || from.role !== 'student') return;

      const target = userRegistry.get(toTeacherId);
      if (!target || target.role !== 'teacher') {
        socket.emit('send-failed', { reason: 'อาจารย์ท่านนี้ออฟไลน์แล้ว' });
        return;
      }

      const imgs = resolveImages(src, thumb, config.MAX_THUMB_LEN);
      if (!imgs) return;
      const [image, thumbImg] = imgs;
      const at = Date.now();
      const pw = Math.max(0, Math.min(1, +power || 0));

      io.to(toTeacherId).emit('receive-garland', { src: image, fromName: from.name, fromRole: 'student', power: pw, at });
      socket.emit('send-ok', { toName: target.name });

      dataStore.addHistory({
        id: newId(),
        teacherName: target.name,
        studentName: from.name,
        fromRole: 'student',
        thumb: dataStore.persistThumb(thumbImg), // เขียนรูปย่อเป็นไฟล์แยก ไม่ฝัง data URL ใน history.json
        at,
      });
    });

    // กรรมการ: ส่งพวงมาลัยให้อาจารย์ทุกคนที่ออนไลน์อยู่ ณ ตอนนั้น — ส่งได้ครั้งเดียว
    socket.on('send-to-all-teachers', ({ src, thumb, power } = {}) => {
      const from = userRegistry.get(socket.id);
      if (!from || from.role !== 'committee') return;

      if (socket.data.sentAll || dataStore.committeeAlreadySent(from.name)) {
        socket.emit('send-failed', { reason: 'กรรมการท่านนี้ส่งไปแล้ว (ส่งได้ครั้งเดียว)' });
        return;
      }

      const targets = userRegistry.teachers();
      if (!targets.length) {
        socket.emit('send-failed', { reason: 'ยังไม่มีอาจารย์ออนไลน์ ลองใหม่อีกครั้ง' });
        return;
      }

      const imgs = resolveImages(src, thumb, config.MAX_THUMB_LEN);
      if (!imgs) return;
      const [image, thumbImg] = imgs;
      const at = Date.now();
      const pw = Math.max(0, Math.min(1, +power || 0));

      targets.forEach((t) => {
        io.to(t.id).emit('receive-garland', { src: image, fromName: from.name, fromRole: 'committee', power: pw, at });
        dataStore.addHistory({
          id: newId(),
          teacherName: t.name,
          studentName: from.name,
          fromRole: 'committee',
          thumb: thumbImg,
          at,
        });
      });

      socket.data.sentAll = true;
      dataStore.markCommitteeSent(from.name);

      socket.emit('send-all-ok', { count: targets.length });
    });

    socket.on('clear-my-history', () => {
      const from = userRegistry.get(socket.id);
      if (!from || from.role !== 'teacher') {
        socket.emit('history-cleared', { removed: 0 });
        return;
      }
      const removed = dataStore.clearHistoryForTeacher(from.name);
      console.log(`[clear-my-history] อ.${from.name} → ลบ ${removed} รายการ`);
      socket.emit('history', dataStore.historyForTeacher(from.name)); // ว่างแล้ว
      socket.emit('history-cleared', { removed });
    });

    // ---------- พวงมาลัยรวม (collaborative) ----------
    // จอพิธีเรียกขอสถานะปัจจุบันทั้งหมด
    socket.on('wall-hello', () => {
      socket.join('wall'); // เข้าห้อง 'wall' เพื่อรับ wall-flower/wall-send-all-ok เฉพาะจอพิธี ไม่ broadcast ไปทุกคน
      socket.emit('wall-state', wallService.state());
    });

    // ผู้เข้าร่วม (นักศึกษา/กรรมการ) เติมดอกไม้ได้หลายดอก (มี cooldown + เพดานต่อคนกันสแปม)
    socket.on('wall-add', (data = {}) => {
      const from = userRegistry.get(socket.id);
      if (!from || (from.role !== 'student' && from.role !== 'committee')) return;

      const now = Date.now();
      if (socket.data.wallLast && now - socket.data.wallLast < config.WALL_ADD_COOLDOWN) return;
      socket.data.wallLast = now;

      socket.data.wallCount = (socket.data.wallCount || 0) + 1;
      if (socket.data.wallCount > config.WALL_ADD_PER_SOCKET) {
        socket.emit('wall-added', { count: wallService.state().length, limit: true });
        return;
      }

      const flower = wallService.addFlower(data, from.name);
      io.to('wall').emit('wall-flower', flower);
      socket.emit('wall-added', { count: wallService.state().length, mine: socket.data.wallCount });
    });

    // ส่งพวงมาลัยรวมให้อาจารย์ทุกคนที่ออนไลน์ (สั่งจากจอพิธี /wall)
    socket.on('wall-send-all', () => {
      if (!wallService.canSendAll()) {
        socket.emit('wall-send-all-failed', { reason: 'เพิ่งส่งไปเมื่อสักครู่ รอสักครู่แล้วลองใหม่' });
        return;
      }

      const targets = userRegistry.teachers();
      if (!targets.length) {
        socket.emit('wall-send-all-failed', { reason: 'ยังไม่มีอาจารย์ออนไลน์' });
        return;
      }

      const result = wallService.prepareSendAll();
      if (!result) {
        socket.emit('wall-send-all-failed', { reason: 'ยังไม่มีดอกไม้ในพวงมาลัยรวม' });
        return;
      }

      const at = Date.now();
      const thumb = result.src.length > config.MAX_THUMB_LEN ? 'assets/malai-1.svg' : result.src;
      targets.forEach((t) => {
        io.to(t.id).emit('receive-garland', {
          src: result.src, fromName: 'พวงมาลัยรวมน้ำใจศิษย์', fromRole: 'wall', power: 1, at,
        });
        dataStore.addHistory({
          id: newId(), teacherName: t.name, studentName: 'พวงมาลัยรวมน้ำใจศิษย์',
          fromRole: 'wall', thumb, at,
        });
      });
      console.log(`[wall-send-all] ส่งพวงมาลัยรวม (${result.flowerCount} ดอก) → อาจารย์ ${targets.length} ท่าน` + (result.savedPath ? ` · บันทึก ${path.basename(result.savedPath)}` : ''));
      io.to('wall').emit('wall-send-all-ok', { count: targets.length, flowers: result.flowerCount });
    });

    socket.on('disconnect', () => {
      const u = userRegistry.remove(socket.id);
      if (u && u.role === 'teacher') io.emit('teachers', userRegistry.teacherList());
      if (u && u.role === 'committee') io.emit('committee-status', userRegistry.committeeStatus());
    });
  });
}

module.exports = registerSocketHandlers;
