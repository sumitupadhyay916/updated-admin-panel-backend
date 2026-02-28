const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

/**
 * @desc    Create a new staff member for a seller
 * @route   POST /api/staff
 * @access  Private/Seller
 */
exports.createStaff = async (req, res) => {
  try {
    const { name, email, password, role, permissions, phone } = req.body;
    const sellerId = req.user.id; // from auth middleware

    // 1. Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists',
      });
    }

    // 2. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Create User and Staff records in a transaction
    const newStaff = await prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          phone,
          role: 'staff',
          status: 'active',
          createdById: sellerId,
        },
      });

      const staffProfile = await prisma.staff.create({
        data: {
          userId: user.id,
          sellerId,
          role: role || 'Staff',
          permissions: permissions || [],
        },
      });

      return { user, staffProfile };
    });

    res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: {
        id: newStaff.staffProfile.id,
        userId: newStaff.user.id,
        name: newStaff.user.name,
        email: newStaff.user.email,
        phone: newStaff.user.phone,
        status: newStaff.user.status,
        role: newStaff.staffProfile.role,
        permissions: newStaff.staffProfile.permissions,
        createdAt: newStaff.staffProfile.createdAt,
      },
    });
  } catch (error) {
    console.error('Error creating staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create staff member',
      error: error.message,
    });
  }
};

/**
 * @desc    Get all staff members for the logged-in seller
 * @route   GET /api/staff
 * @access  Private/Seller
 */
exports.getStaff = async (req, res) => {
  try {
    const sellerId = req.user.id;

    const staffList = await prisma.staff.findMany({
      where: { sellerId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            avatar: true,
            createdAt: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format the response to be flat and easy for the frontend
    const formattedStaff = staffList.map(staff => ({
      id: staff.id,
      userId: staff.user.id,
      name: staff.user.name,
      email: staff.user.email,
      phone: staff.user.phone,
      status: staff.user.status,
      avatar: staff.user.avatar,
      role: staff.role,
      permissions: staff.permissions,
      createdAt: staff.user.createdAt,
    }));

    res.status(200).json({
      success: true,
      data: formattedStaff,
    });
  } catch (error) {
    console.error('Error fetching staff list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff list',
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single staff member
 * @route   GET /api/staff/:id
 * @access  Private/Seller
 */
exports.getStaffMember = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;

    const staffMember = await prisma.staff.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            avatar: true,
            createdAt: true,
          }
        }
      }
    });

    if (!staffMember) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found',
      });
    }

    // Ensure the staff member belongs to this seller
    if (staffMember.sellerId !== sellerId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this staff member',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: staffMember.id,
        userId: staffMember.user.id,
        name: staffMember.user.name,
        email: staffMember.user.email,
        phone: staffMember.user.phone,
        status: staffMember.user.status,
        avatar: staffMember.user.avatar,
        role: staffMember.role,
        permissions: staffMember.permissions,
        createdAt: staffMember.user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff member',
      error: error.message,
    });
  }
};

/**
 * @desc    Update a staff member
 * @route   PUT /api/staff/:id
 * @access  Private/Seller
 */
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;
    const { name, phone, role, permissions, status, password } = req.body;

    // Verify staff exists and belongs to seller
    const existingStaff = await prisma.staff.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!existingStaff || existingStaff.sellerId !== sellerId) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found or unauthorized',
      });
    }

    // Prepare User update data
    const userUpdateData = {};
    if (name) userUpdateData.name = name;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (status) userUpdateData.status = status;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      userUpdateData.passwordHash = await bcrypt.hash(password, salt);
    }

    // Prepare Staff update data
    const staffUpdateData = {};
    if (role) staffUpdateData.role = role;
    if (permissions) staffUpdateData.permissions = permissions;

    // Perform updates in transaction
    const updatedStaff = await prisma.$transaction(async (prisma) => {
      const updatedProfile = await prisma.staff.update({
        where: { id },
        data: staffUpdateData,
      });

      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: existingStaff.userId },
          data: userUpdateData,
        });
      }

      return await prisma.staff.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, status: true, avatar: true }
          }
        }
      });
    });

    res.status(200).json({
      success: true,
      message: 'Staff member updated successfully',
      data: {
        id: updatedStaff.id,
        userId: updatedStaff.user.id,
        name: updatedStaff.user.name,
        email: updatedStaff.user.email,
        phone: updatedStaff.user.phone,
        status: updatedStaff.user.status,
        avatar: updatedStaff.user.avatar,
        role: updatedStaff.role,
        permissions: updatedStaff.permissions,
      },
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete a staff member
 * @route   DELETE /api/staff/:id
 * @access  Private/Seller
 */
exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.user.id;

    // Verify staff exists and belongs to seller
    const existingStaff = await prisma.staff.findUnique({
      where: { id }
    });

    if (!existingStaff || existingStaff.sellerId !== sellerId) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found or unauthorized',
      });
    }

    // Delete both user and staff profile
    await prisma.$transaction(async (prisma) => {
      // Deleting user will cascade and delete the staff profile because of onDelete: Cascade
      await prisma.user.delete({
        where: { id: existingStaff.userId },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Staff member deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      error: error.message,
    });
  }
};
