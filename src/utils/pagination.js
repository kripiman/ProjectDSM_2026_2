/**
 * Turns validated `page` and `limit` values into the triple used by `findAndCountAll`.
 * @param {{ page: number, limit: number }} query
 */
const toPageWindow = ({ page, limit }) => ({
  page,
  limit,
  offset: (page - 1) * limit
});

/**
 * Pagination block included in list responses.
 * @param {{ page: number, limit: number }} window
 * @param {number} total Number of rows matching the query (before paginating).
 */
const buildPagination = ({ page, limit }, total) => ({
  total,
  page,
  limit,
  total_pages: limit > 0 ? Math.ceil(total / limit) : 0
});

module.exports = {
  toPageWindow,
  buildPagination
};
