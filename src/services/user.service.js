const { Op } = require('sequelize');
const { User, sequelize } = require('../models');
const { AppError } = require('../utils/app_error');
const { USER_ROLES, USER_STATUS, ERROR_CODES } = require('../config/constants');

class UserService {
  /**
   * Rejects accounts that are suspended or banned.
   * @throws {AppError} 403
   */
  static assertActive(user) {
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new AppError(403, 'Account is suspended or inactive', ERROR_CODES.FORBIDDEN);
    }
  }

  /**
   * Makes sure an operation does not remove the last active administrator, which
   * would leave the platform without anyone able to manage it. It must run inside the
   * transaction that applies the change so that concurrent operations are serialized.
   * @param {import('sequelize').Model} user Account that is about to lose its admin standing.
   * @param {string} action Short description used in the error message.
   */
  static async assertNotLastActiveAdmin(user, action, { transaction } = {}) {
    if (user.role !== USER_ROLES.ADMIN || user.status !== USER_STATUS.ACTIVE) {
      return;
    }

    const otherActiveAdmins = await User.count({
      where: {
        role: USER_ROLES.ADMIN,
        status: USER_STATUS.ACTIVE,
        is_anonymous: false,
        id: { [Op.ne]: user.id }
      },
      transaction
    });

    if (otherActiveAdmins === 0) {
      throw new AppError(409, `Cannot ${action}`, ERROR_CODES.CONFLICT);
    }
  }

  /**
   * Changes the role of a registered account. Guest sessions have no role to change
   * and the guest role cannot be handed to a registered account.
   */
  static async changeRole(userId, newRole) {
    return sequelize.transaction(async (transaction) => {
      const user = await UserService.findOrFail(userId, transaction);

      if (user.is_anonymous) {
        throw new AppError(400, 'Guest sessions cannot be assigned a role', ERROR_CODES.VALIDATION_ERROR);
      }
      if (newRole === USER_ROLES.GUEST) {
        throw new AppError(400, 'The guest role cannot be assigned to a registered account', ERROR_CODES.VALIDATION_ERROR);
      }
      if (user.role === USER_ROLES.ADMIN && newRole !== USER_ROLES.ADMIN) {
        await UserService.assertNotLastActiveAdmin(user, 'demote the last active administrator', { transaction });
      }

      // Instance update: the model hook keeps `role` and `role_id` in agreement.
      await user.update({ role: newRole }, { transaction });
      return user;
    });
  }

  /**
   * Activates, suspends or bans an account. Suspending or banning also ends every
   * session issued so far, so reactivating the account does not revive old tokens.
   */
  static async changeStatus(userId, newStatus) {
    return sequelize.transaction(async (transaction) => {
      const user = await UserService.findOrFail(userId, transaction);
      const losesAccess = newStatus !== USER_STATUS.ACTIVE;

      if (losesAccess) {
        await UserService.assertNotLastActiveAdmin(user, 'suspend the last active administrator', { transaction });
      }

      await user.update({
        status: newStatus,
        ...(losesAccess && { token_version: user.token_version + 1 })
      }, { transaction });
      return user;
    });
  }

  /**
   * Closes an account: the personal data is erased and the account can no longer be
   * used. The row itself is kept (soft delete) so that the recognitions, feedback and
   * other records attached to it stay consistent. The e-mail, user name and phone are
   * released, so they can be registered again.
   */
  static async deleteAccount(userId) {
    return sequelize.transaction(async (transaction) => {
      const user = await UserService.findOrFail(userId, transaction);
      await UserService.assertNotLastActiveAdmin(user, 'delete the last active administrator account', { transaction });

      await user.update({
        email: null,
        userName: null,
        phone: null,
        password_hash: null,
        display_name: null,
        avatar_url: null,
        token_version: user.token_version + 1
      }, { transaction });
      await user.destroy({ transaction });
    });
  }

  static async findOrFail(userId, transaction) {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      throw new AppError(404, `User with ID '${userId}' not found`, ERROR_CODES.NOT_FOUND);
    }
    return user;
  }
}

module.exports = UserService;
