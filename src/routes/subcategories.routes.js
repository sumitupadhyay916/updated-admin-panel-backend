const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} = require('../controllers/subcategoriesController');

const router = express.Router();

// Public — anyone can list subcategories (needed by seller panel dropdowns + consumer frontend)
router.get('/', listSubcategories);

// Manage subcategories — allow super_admin, admin, and seller
router.post('/', requireAuth, requireRole(['super_admin', 'admin', 'seller']), createSubcategory);
router.put('/:id', requireAuth, requireRole(['super_admin', 'admin', 'seller']), updateSubcategory);
router.delete('/:id', requireAuth, requireRole(['super_admin', 'admin', 'seller']), deleteSubcategory);

module.exports = router;
