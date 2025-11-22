const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const nodemailer = require('nodemailer');

// Email transporter setup
let transporter = null;
EMAIL_USER='YOUR_EMAIL';
EMAIL_PASS='YOUR_APP_PASS'

if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
} else {
  console.warn('Email configuration not found. OTP will be shown in console for development.');
}

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// @route   POST /api/auth/register
// @desc    Register user
router.post('/register', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role } = req.body;

    // Check if user exists
    const [existing] = await db.pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await db.pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'staff']
    );

    const token = jwt.sign(
      { id: result.insertId, email, role: role || 'staff' },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key',
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.insertId,
        name,
        email,
        role: role || 'staff'
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const [users] = await db.pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your_super_secret_jwt_key',
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset OTP
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    const [users] = await db.pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.pool.query(
      'UPDATE users SET otp_code = ?, otp_expires = ? WHERE email = ?',
      [otp, otpExpires, email]
    );

    // Send OTP via email (if email is configured)
    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"StockMaster" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: 'Password Reset OTP - StockMaster',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4f46e5;">Password Reset Request</h2>
              <p>You have requested to reset your password for StockMaster IMS.</p>
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <h1 style="color: #4f46e5; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
              </div>
              <p>This OTP will expire in 10 minutes.</p>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `,
          text: `Your OTP for password reset is: ${otp}. This OTP will expire in 10 minutes.`
        });
        console.log(`OTP sent to ${email}`);
      } catch (emailError) {
        console.error('Email send error:', emailError);
        // In development, show OTP in response
        return res.json({ 
          message: 'OTP generated. Email sending failed. Check console for OTP in development mode.', 
          otp: process.env.NODE_ENV === 'development' ? otp : undefined,
          error: 'Email not configured properly'
        });
      }
    } else {
      console.log(`[DEVELOPMENT] OTP for ${email}: ${otp}`);
    }

    res.json({ 
      message: transporter ? 'OTP sent to your email' : 'OTP generated. Check console in development mode.',
      otp: process.env.NODE_ENV === 'development' ? otp : undefined 
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password with OTP
router.post('/reset-password', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').notEmpty().withMessage('OTP is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, newPassword } = req.body;

    const [users] = await db.pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const user = users[0];

    if (!user.otp_code || user.otp_code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > new Date(user.otp_expires)) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await db.pool.query(
      'UPDATE users SET password = ?, otp_code = NULL, otp_expires = NULL WHERE email = ?',
      [hashedPassword, email]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

