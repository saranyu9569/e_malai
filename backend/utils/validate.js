// ฟังก์ชันล้วน (pure) ไม่มี state — ใช้ตรวจ/ทำความสะอาดข้อมูลที่รับจาก client

const isPath = (s) => /^assets\/[\w.-]+\.(svg|png|jpe?g|webp)$/.test(s);
const isData = (s) => /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(s);

function cleanName(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// คืนค่า [image, thumb] ที่ผ่านการตรวจแล้ว หรือ null ถ้า src ไม่ถูกต้อง
function resolveImages(src, thumb, maxThumbLen) {
  const image = String(src || 'assets/malai-1.svg');
  if (!isPath(image) && !isData(image)) return null;
  let thumbImg = String(thumb || '');
  if (!isPath(thumbImg) && !isData(thumbImg)) thumbImg = isPath(image) ? image : 'assets/malai-1.svg';
  if (isData(thumbImg) && thumbImg.length > maxThumbLen) {
    thumbImg = isPath(image) ? image : 'assets/malai-1.svg';
  }
  return [image, thumbImg];
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

module.exports = { isPath, isData, cleanName, resolveImages, newId };
