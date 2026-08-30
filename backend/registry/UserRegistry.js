/**
 * ทะเบียนผู้ใช้ที่ออนไลน์อยู่ (เก็บในหน่วยความจำ ไม่มีฐานข้อมูล)
 * socket.id -> { id, role: 'student' | 'teacher' | 'committee', name }
 */
class UserRegistry {
  constructor(maxCommittee) {
    this.maxCommittee = maxCommittee;
    this.users = new Map();
  }

  get(id) {
    return this.users.get(id);
  }

  register(id, role, name) {
    this.users.set(id, { id, role, name });
  }

  remove(id) {
    const u = this.users.get(id);
    this.users.delete(id);
    return u;
  }

  size() {
    return this.users.size;
  }

  teachers() {
    return [...this.users.values()].filter((u) => u.role === 'teacher');
  }

  teacherList() {
    return this.teachers().map((u) => ({ id: u.id, name: u.name }));
  }

  countRole(role) {
    let n = 0;
    this.users.forEach((u) => { if (u.role === role) n++; });
    return n;
  }

  committeeStatus() {
    return { count: this.countRole('committee'), max: this.maxCommittee };
  }

  counts() {
    let students = 0, teachers = 0, committee = 0;
    this.users.forEach((u) => {
      if (u.role === 'teacher') teachers++;
      else if (u.role === 'committee') committee++;
      else students++;
    });
    return { students, teachers, committee };
  }
}

module.exports = UserRegistry;
