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

// Super-admin only — manage subcategories
router.post('/', requireAuth, requireRole(['super_admin']), createSubcategory);
router.put('/:id', requireAuth, requireRole(['super_admin']), updateSubcategory);
router.delete('/:id', requireAuth, requireRole(['super_admin']), deleteSubcategory);

module.exports = router;
