const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireAuth, requireRole } = require('../middlewares/auth');

// Protect all routes
router.use(requireAuth);

// Allow sellers, admins, and super_admins to access staff management
router.use(requireRole(['super_admin', 'admin', 'seller']));

// Routes
router.route('/')
  .post(staffController.createStaff)
  .get(staffController.getStaff);

router.route('/:id')
  .get(staffController.getStaffMember)
  .put(staffController.updateStaff)
  .delete(staffController.deleteStaff);

module.exports = router;
