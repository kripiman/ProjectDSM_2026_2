const { Router } = require('express');
const { requireAuth, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  createTaxonomySchema,
  updateTaxonomySchema,
  listTaxonomyQuery,
  taxonomyRocksQuery
} = require('../validations/taxonomy.validation');
const { USER_ROLES } = require('../config/constants');

/**
 * Builds the router of a taxonomy entity (categories or types) from its controller.
 * Reading is public; creating, editing and deleting are reserved for administrators.
 * @param {ReturnType<typeof import('../controllers/taxonomy.controller').category>} controller
 */
const buildTaxonomyRouter = (controller) => {
  const router = Router();
  const adminOnly = [requireAuth, authorize(USER_ROLES.ADMIN)];

  router.get('/', validate(listTaxonomyQuery, 'query'), controller.list);
  router.get('/:id', controller.getById);
  router.get('/:id/rocks', validate(taxonomyRocksQuery, 'query'), controller.listRocks);

  router.post('/', ...adminOnly, validate(createTaxonomySchema), controller.create);
  router.put('/:id', ...adminOnly, validate(updateTaxonomySchema), controller.update);
  router.patch('/:id', ...adminOnly, validate(updateTaxonomySchema), controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);

  return router;
};

module.exports = {
  buildTaxonomyRouter
};
