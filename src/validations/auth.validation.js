const { z } = require('zod');

const REQUIRED_CREDENTIALS = 'Email and password are required';

// bcrypt only considers the first 72 bytes of a password.
const MAX_PASSWORD_LENGTH = 72;

// The longest address SMTP allows.
const MAX_EMAIL_LENGTH = 254;

const emailField = z
  .string({ error: REQUIRED_CREDENTIALS })
  .trim()
  .toLowerCase()
  .email('Invalid email address')
  .max(MAX_EMAIL_LENGTH, `Email must be at most ${MAX_EMAIL_LENGTH} characters`);

const registerSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...raw };
  if (data.username && !data.userName) data.userName = data.username;
  return data;
}, z.object({
  email: emailField,
  password: z
    .string({ error: REQUIRED_CREDENTIALS })
    .min(6, 'Password must be at least 6 characters')
    .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
  userName: z.string().trim().min(2, 'Username must be at least 2 characters').optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  display_name: z.string().trim().optional().nullable(),
  guest_token: z.string().optional().nullable()
}));

const loginSchema = z.object({
  email: emailField,
  password: z.string({ error: REQUIRED_CREDENTIALS }).min(1, REQUIRED_CREDENTIALS)
});

module.exports = {
  registerSchema,
  loginSchema
};
