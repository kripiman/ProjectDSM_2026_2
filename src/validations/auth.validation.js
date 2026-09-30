const { z } = require('zod');

const registerSchema = z.preprocess((raw) => {
  if (typeof raw !== 'object' || raw === null) return raw;
  const data = { ...raw };
  if (data.username && !data.userName) data.userName = data.username;
  return data;
}, z.object({
  email: z.string({ required_error: 'Email and password are required' }).email('Invalid email address'),
  password: z.string({ required_error: 'Email and password are required' }).min(6, 'Password must be at least 6 characters'),
  userName: z.string().min(2, 'Username must be at least 2 characters').optional().nullable(),
  phone: z.string().optional().nullable(),
  display_name: z.string().optional().nullable(),
  guest_token: z.string().optional().nullable()
}));

const loginSchema = z.object({
  email: z.string({ required_error: 'Email and password are required' }).email('Invalid email address'),
  password: z.string({ required_error: 'Email and password are required' }).min(1, 'Email and password are required')
});

module.exports = {
  registerSchema,
  loginSchema
};
