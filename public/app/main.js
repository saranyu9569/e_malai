import { state } from './core.js';
import { enterStudent } from './student.js';
import { enterTeacher } from './teacher.js';

import './home.js';
import './committee.js';
import './wall-sheet.js';
import './parallax.js';
import './editor.js';

// ---------- start: restore ----------
if (state.role && state.name) {
  if (state.role === 'student') enterStudent();
  else if (state.role === 'teacher') enterTeacher();
  // committee: รอ event 'registered' หลัง socket connect แล้ว register ให้เอง
}
