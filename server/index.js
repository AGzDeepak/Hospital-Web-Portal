const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const PORT = 5000;
const DB_PATH = path.join(__dirname, '..', 'database', 'hospital.db');
const JWT_SECRET = process.env.JWT_SECRET || 'local-hospital-secret';

app.use(cors());
app.use(express.json());

let db;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + JWT_SECRET).digest('hex');
}

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  try {
    const token = authHeader.slice(7);
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function getRows(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function initializeDatabase() {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Database connection failed:', err.message);
      process.exit(1);
    }

    db.serialize(async () => {
      await runQuery(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'admin',
          email_verified INTEGER DEFAULT 0,
          reset_token TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          age INTEGER,
          disease TEXT,
          status TEXT DEFAULT 'Pending',
          blood_group TEXT,
          insurance TEXT,
          emergency_contact TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS doctors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          department TEXT,
          specialization TEXT,
          availability TEXT DEFAULT 'Available',
          experience TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS appointments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patient_name TEXT NOT NULL,
          doctor_name TEXT NOT NULL,
          appointment_date TEXT NOT NULL,
          appointment_time TEXT NOT NULL,
          status TEXT DEFAULT 'Pending',
          type TEXT DEFAULT 'Routine',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const existingUser = await getRows('SELECT id FROM users LIMIT 1');
      if (existingUser.length === 0) {
        await runQuery(
          'INSERT INTO users (name, email, password, role, email_verified) VALUES (?, ?, ?, ?, ?)',
          ['Admin User', 'admin@hospital.local', hashPassword('admin123'), 'admin', 1]
        );
      }

      const patientCount = await getRows('SELECT COUNT(*) as count FROM patients');
      if (patientCount[0].count === 0) {
        await runQuery(
          'INSERT INTO patients (name, age, blood_group, disease, status, insurance, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['Asha Rao', 38, 'O+', 'Diabetes', 'Admitted', 'HealthPlus', '9876543210']
        );
        await runQuery(
          'INSERT INTO patients (name, age, blood_group, disease, status, insurance, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['Ravi Kumar', 45, 'B+', 'Cardiac Checkup', 'Pending', 'CareShield', '9123456780']
        );
      }

      const doctorCount = await getRows('SELECT COUNT(*) as count FROM doctors');
      if (doctorCount[0].count === 0) {
        await runQuery(
          'INSERT INTO doctors (name, department, specialization, availability, experience) VALUES (?, ?, ?, ?, ?)',
          ['Dr. Meera Nair', 'Cardiology', 'Heart Specialist', 'Available', '12 years']
        );
        await runQuery(
          'INSERT INTO doctors (name, department, specialization, availability, experience) VALUES (?, ?, ?, ?, ?)',
          ['Dr. Arjun Shah', 'Neurology', 'Brain Specialist', 'Busy', '9 years']
        );
      }

      const appointmentCount = await getRows('SELECT COUNT(*) as count FROM appointments');
      if (appointmentCount[0].count === 0) {
        await runQuery(
          'INSERT INTO appointments (patient_name, doctor_name, appointment_date, appointment_time, status, type) VALUES (?, ?, ?, ?, ?, ?)',
          ['Asha Rao', 'Dr. Meera Nair', '2026-08-01', '09:30', 'Confirmed', 'Routine']
        );
      }

      console.log('Database ready at', DB_PATH);
    });
  });
}

initializeDatabase();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hospital API is running' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });

  try {
    const existing = await getRows('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });

    const user = await runQuery(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashPassword(password), role]
    );

    const token = createToken({ id: user.lastID, email, role });
    res.status(201).json({ token, user: { id: user.lastID, name, email, role, email_verified: 0 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  try {
    const row = await getRows('SELECT * FROM users WHERE email = ? AND password = ?', [email, hashPassword(password)]);
    if (!row.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = row[0];
    const token = createToken({ id: user.id, email: user.email, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, email_verified: user.email_verified } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const token = crypto.randomUUID();
    await runQuery('UPDATE users SET reset_token = ? WHERE email = ?', [token, email]);
    res.json({ message: 'Password reset instructions sent. Demo token: ' + token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/verify-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    await runQuery('UPDATE users SET email_verified = 1 WHERE email = ?', [email]);
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const row = await getRows('SELECT * FROM users WHERE id = ? AND password = ?', [req.user.id, hashPassword(currentPassword)]);
    if (!row.length) return res.status(401).json({ error: 'Current password is incorrect' });
    await runQuery('UPDATE users SET password = ? WHERE id = ?', [hashPassword(newPassword), req.user.id]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  try {
    const row = await getRows('SELECT id, name, email, role, email_verified FROM users WHERE id = ?', [req.user.id]);
    res.json(row[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const totalPatients = await getRows('SELECT COUNT(*) as count FROM patients');
    const doctorsAvailable = await getRows("SELECT COUNT(*) as count FROM doctors WHERE availability = 'Available'");
    const appointmentsToday = await getRows("SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?", [new Date().toISOString().slice(0, 10)]);
    const pendingBills = await getRows("SELECT COUNT(*) as count FROM appointments WHERE status = 'Pending'");
    const monthlyRevenue = [32000, 36000, 39000, 41000, 44000, 47000];
    const patientGrowth = [120, 135, 150, 168, 182, 198];
    const departmentStats = [18, 12, 8, 10];

    res.json({
      todayAppointments: appointmentsToday[0].count,
      totalPatients: totalPatients[0].count,
      doctorsAvailable: doctorsAvailable[0].count,
      revenue: 480000,
      bedAvailability: 12,
      emergencyCases: 3,
      pendingBills: pendingBills[0].count,
      notifications: 4,
      charts: {
        monthlyRevenue,
        patientGrowth,
        departmentStats,
        appointmentTrends: [8, 12, 10, 15, 18, 14]
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM patients ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients', async (req, res) => {
  const { name, age, bloodGroup, disease, status, insurance, emergencyContact } = req.body;
  if (!name || !disease) return res.status(400).json({ error: 'Name and disease are required' });

  try {
    const result = await runQuery(
      'INSERT INTO patients (name, age, blood_group, disease, status, insurance, emergency_contact) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, age || 0, bloodGroup || 'N/A', disease, status || 'Pending', insurance || 'N/A', emergencyContact || 'N/A']
    );
    res.status(201).json({ id: result.lastID, name, age, bloodGroup, disease, status: status || 'Pending', insurance, emergencyContact });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/doctors', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM doctors ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/doctors', verifyToken, async (req, res) => {
  const { name, department, specialization, availability, experience } = req.body;
  if (!name || !department) return res.status(400).json({ error: 'Name and department are required' });

  try {
    const result = await runQuery(
      'INSERT INTO doctors (name, department, specialization, availability, experience) VALUES (?, ?, ?, ?, ?)',
      [name, department, specialization || 'General', availability || 'Available', experience || 'New']
    );
    res.status(201).json({ id: result.lastID, name, department, specialization, availability, experience });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const rows = await getRows('SELECT * FROM appointments ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  const { patientName, doctorName, date, time, status, type } = req.body;
  if (!patientName || !doctorName || !date || !time) return res.status(400).json({ error: 'Patient, doctor, date, and time are required' });

  try {
    const result = await runQuery(
      'INSERT INTO appointments (patient_name, doctor_name, appointment_date, appointment_time, status, type) VALUES (?, ?, ?, ?, ?, ?)',
      [patientName, doctorName, date, time, status || 'Pending', type || 'Routine']
    );
    res.status(201).json({ id: result.lastID, patientName, doctorName, date, time, status: status || 'Pending', type: type || 'Routine' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
