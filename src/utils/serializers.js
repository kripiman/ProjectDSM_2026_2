/**
 * Public representation of a user account. Only fields that are safe to return to
 * the client belong here: never the password hash or session internals.
 * @param {import('sequelize').Model} user
 */
const serializeUser = (user) => ({
  id: user.id,
  email: user.email,
  userName: user.userName,
  phone: user.phone,
  display_name: user.display_name,
  avatar_url: user.avatar_url,
  is_anonymous: user.is_anonymous,
  role: user.role,
  status: user.status,
  current_level: user.current_level,
  experience_points: user.experience_points
});

module.exports = {
  serializeUser
};
