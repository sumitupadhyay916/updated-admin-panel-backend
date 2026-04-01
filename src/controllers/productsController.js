const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeProduct } = require('../serializers/productSerializer');
const { toDbPackagingType, toDbOccasion } = require('../utils/enums');

async function listProducts(req, res) {
  try {
    const prisma = getPrisma();
    const { page, limit, search } = parsePagination(req.query);
    const user = req.user;

    const where = {};
    if (req.query.sellerId) where.sellerId = String(req.query.sellerId);
    if (req.query.stock) where.stock = String(req.query.stock);
    if (req.query.deity) where.deity = String(req.query.deity);
    if (req.query.material) where.material = String(req.query.material);
    if (req.query.isFeatured !== undefined) where.isFeatured = String(req.query.isFeatured) === 'true';
    if (req.query.minPrice) where.price = { gte: Number(req.query.minPrice) };
    if (req.query.maxPrice) where.price = { ...(where.price || {}), lte: Number(req.query.maxPrice) };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filter by role
    if (user && user.role === 'admin') {
      // 1. Seller access: Admin can ONLY see products from their own account or their assigned sellers
      where.AND = [
        {
          OR: [
            { sellerId: user.id },
            { seller: { adminId: user.id } }
          ]
        }
      ];

      // 2. Category access: existing logic
      const assignedCategoryIds = await prisma.adminCategory.findMany({
        where: { adminId: user.id },
        select: { categoryId: true },
      });
      const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
      console.log(`[Products] Admin ${user.id} has assigned categories:`, categoryIds);

      if (categoryIds.length > 0) {
        if (req.query.categoryId) {
          const requestedCategoryId = parseInt(req.query.categoryId, 10);
          if (!categoryIds.includes(requestedCategoryId)) {
            console.log(`[Products] Admin ${user.id} requested category ${requestedCategoryId} but doesn't have access`);
            return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
          }
          where.AND.push({ categoryId: requestedCategoryId });
        } else {
          where.AND.push({ categoryId: { in: categoryIds } });
        }
      } else if (req.query.categoryId) {
        where.AND.push({ categoryId: parseInt(req.query.categoryId, 10) });
      }
    } else if (user && (user.role === 'seller' || user.role === 'staff')) {
      // Sellers and Staff can only see their own products (assigned to the seller)
      const sellerId = user.sellerId;
      if (sellerId) {
        console.log(`[Products] ${user.role} associated with seller ${sellerId} filtering products`);
        where.sellerId = sellerId;
      }
    } else if (req.query.categoryId) {
      // For super_admin or other roles, allow specific categoryId filter
      where.categoryId = parseInt(req.query.categoryId, 10);
    }

    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          images: true,
          seller: true,
          category: true,
          subcategory: true,
          options: {
            include: {
              values: true
            }
          },
          variants: {
            include: {
              images: true,
              specifications: true,
              optionValues: {
                include: {
                  optionValue: {
                    include: {
                      option: true
                    }
                  }
                }
              }
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return ok(res, { message: 'Products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
  } catch (error) {
    console.error('[listProducts] Fatal Error:', error);
    return fail(res, { status: 500, message: 'Internal server error while fetching products' });
  }
}

async function getProduct(req, res) {
  const prisma = getPrisma();
  const user = req.user;
  const productId = parseInt(req.params.id, 10);

  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
      options: {
        include: {
          values: true
        }
      },
      variants: {
        include: {
          images: true,
          specifications: true,
          optionValues: {
            include: {
              optionValue: {
                include: {
                  option: true
                }
              }
            }
          }
        }
      }
    }
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });

  // If user is admin (not super_admin), verify they have access to this product's seller AND category
  if (user && user.role === 'admin') {
    // 1. Check seller access
    const isOwnerOrManager = p.sellerId === user.id || p.seller?.adminId === user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }

    // 2. Check category access
    if (p.categoryId) {
      const hasCatAccess = await prisma.adminCategory.findFirst({
        where: {
          adminId: user.id,
          categoryId: p.categoryId,
        },
      });
      if (!hasCatAccess) {
        return fail(res, { status: 403, message: 'You do not have access to this product (invalid category)' });
      }
    }
  }

  return ok(res, { message: 'Product fetched', data: serializeProduct(p) });
}

async function createProduct(req, res) {
  const prisma = getPrisma();

  // Determine sellerId based on user role
  let sellerId;
  if (req.user.role === 'super_admin' || req.user.role === 'admin') {
    // Super admin and admin can specify sellerId from request body.
    // If not provided, default to creating under their own account ("My Products").
    sellerId = req.body.sellerId || req.user.id;
  } else if (['seller', 'staff'].includes(req.user.role)) {
    // Sellers and Staff can only create products for themselves
    sellerId = req.user.sellerId;
  }

  if (!sellerId) return fail(res, { status: 400, message: 'Seller ID is required' });

  // Validate required fields
  if (!req.body.name || !req.body.name.trim()) {
    return fail(res, { status: 400, message: 'Product name is required' });
  }
  if (!req.body.categoryId) {
    return fail(res, { status: 400, message: 'Category is required' });
  }
  if (!req.body.hasVariants) {
    if (!req.body.price || req.body.price <= 0) {
      return fail(res, { status: 400, message: 'Valid price is required' });
    }
    if (!req.body.stock || !['available', 'unavailable'].includes(req.body.stock)) {
      return fail(res, { status: 400, message: 'Stock status must be available or unavailable' });
    }
  }

  // Verify category exists
  const category = await prisma.category.findUnique({ where: { id: parseInt(req.body.categoryId, 10) } });
  if (!category) {
    return fail(res, { status: 400, message: 'Invalid category' });
  }

  // For admin role, verify they have access to this category
  if (req.user.role === 'admin') {
    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: category.id,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this category' });
    }
  }

  // For seller/staff role, verify the category is assigned to their admin
  if (['seller', 'staff'].includes(req.user.role)) {
    const seller = await prisma.user.findUnique({
      where: { id: req.user.sellerId },
      select: { adminId: true },
    });

    if (!seller || !seller.adminId) {
      return fail(res, { status: 403, message: 'You are not assigned to an admin' });
    }

    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: seller.adminId,
        categoryId: category.id,
      },
    });

    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You can only create products in categories assigned to your admin' });
    }
  }

  // Verify seller exists and validate based on role:
  // - For admin/super_admin creating "My Products": sellerId can be their own user id
  // - Otherwise, sellerId must belong to a seller user
  const seller = await prisma.user.findUnique({
    where: { id: sellerId },
  });
  if (!seller) {
    return fail(res, { status: 400, message: 'Invalid seller' });
  }

  const isMyProductsOwner =
    (req.user.role === 'admin' || req.user.role === 'super_admin') && sellerId === req.user.id;

  if (!isMyProductsOwner) {
    // When assigning to a seller, validate the target is a seller
    if (seller.role !== 'seller') {
      return fail(res, { status: 400, message: 'Invalid seller' });
    }

    // For admin role, verify they have access to this seller
    if (req.user.role === 'admin') {
      if (seller.adminId !== req.user.id) {
        return fail(res, { status: 403, message: 'You do not have access to this seller' });
      }
    }
  }

  // Resolve subcategory if provided
  let subcategoryId = null;
  let subcategorySlug = null;
  if (req.body.subcategoryId && req.body.subcategoryId !== '__none__') {
    const sub = await prisma.subcategory.findUnique({ where: { id: parseInt(req.body.subcategoryId, 10) } });
    if (!sub) return fail(res, { status: 400, message: 'Invalid subcategory' });
    subcategoryId = sub.id;
    subcategorySlug = sub.slug;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Product
      const product = await tx.product.create({
        data: {
          sellerId,
          categoryId: parseInt(req.body.categoryId, 10),
          subcategoryId,
          subcategorySlug,
          name: req.body.name.trim(),
          description: req.body.description || req.body.name.trim(),
          price: parseFloat(req.body.price) || 0,
          stock: req.body.stock || 'available',
          stockQuantity: parseInt(req.body.stockQuantity, 10) || 0,
          metadata: {
            hasVariants: req.body.hasVariants === true,
            brand: req.body.brand || undefined,
            care: req.body.care || undefined,
            materials: req.body.materials || undefined,
            ageGroups: Array.isArray(req.body.ageGroups) ? req.body.ageGroups : undefined,
            isNew: req.body.isNew === true,
            isBestseller: req.body.isBestseller === true,
            dimensions: req.body.dimensions || undefined,
            additionalInfo: req.body.additionalInfo || [],
            variantAdditionalInfo: req.body.variantAdditionalInfo || undefined,
            additionalInfoByColor: req.body.additionalInfoByColor || undefined
          },
          deity: req.body.deity || 'Other',
          material: req.body.material || 'Brass',
          height: req.body.height || 0.0,
          weight: req.body.weight || 0.0,
          handcrafted: req.body.handcrafted || false,
          occasion: req.body.occasion ? (req.body.occasion || []).map(toDbOccasion) : [],
          religionCategory: req.body.religionCategory || 'Hindu',
          packagingType: req.body.packagingType ? toDbPackagingType(req.body.packagingType) : 'Standard',
          fragile: req.body.fragile || false,
          comparePrice: req.body.comparePrice ? parseFloat(req.body.comparePrice) : null,
          lowStockThreshold: req.body.lowStockThreshold ?? 5,
          tags: req.body.tags || [],
          images: {
            create: (req.body.images || []).map((url, idx) => ({ url, sortOrder: idx })),
          },
        }
      });

      // 2. Auto-Generate Options and Values from Variants
      const optionMap = {}; // Maps optionName to mapped created Option ID
      const valueMap = {};  // Maps "OptionName:ValueName" to created Value ID

      if (req.body.hasVariants && Array.isArray(req.body.variants)) {
        // Collect unique values for dynamically observed options from v.attributes and v.color
        const detectedOptions = { Color: new Set() };

        req.body.variants.forEach(v => {
          if (v.color) detectedOptions.Color.add(v.color);
          
          if (v.attributes && typeof v.attributes === 'object') {
            for (const [key, value] of Object.entries(v.attributes)) {
              if (value) {
                if (!detectedOptions[key]) detectedOptions[key] = new Set();
                detectedOptions[key].add(value);
              }
            }
          }
        });

        // Create options for whichever were populated
        for (const [optName, valuesSet] of Object.entries(detectedOptions)) {
          if (valuesSet.size > 0) {
            const createdOption = await tx.productOption.create({
              data: {
                productId: product.id,
                name: optName,
                values: {
                  create: Array.from(valuesSet).map(val => ({ value: val }))
                }
              },
              include: { values: true }
            });
            optionMap[optName] = createdOption.id;
            createdOption.values.forEach(v => {
              valueMap[`${optName}:${v.value}`] = v.id;
            });
          }
        }

        // 3. Create Variants and link to OptionValues
        for (const v of req.body.variants) {
          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              price: parseFloat(v.price) || 0,
              mrp: v.mrp !== undefined ? parseFloat(v.mrp) : null,
              comparePrice: v.mrp ? parseFloat(v.mrp) : (v.comparePrice ? parseFloat(v.comparePrice) : null),
              stock: parseInt(v.stockQuantity ?? v.stock, 10) || 0,
              stockQuantity: parseInt(v.stockQuantity ?? v.stock ?? 0, 10),
              size: v.attributes?.Size || null, // fallback for schema
              color: v.color || null,
              colorHex: v.colorHex || null,
              quality: v.attributes?.Quality || null, // fallback for schema
              sku: v.sku || null,
              description: v.description || null,
              images: {
                create: (v.images || v.imageUrls || []).map((url, idx) => ({ url, sortOrder: idx }))
              },
              specifications: {
                create: (v.specifications || []).map((spec, idx) => ({
                  label: spec.label,
                  value: spec.value,
                  sortOrder: spec.sortOrder ?? idx
                }))
              }
            }
          });

          // Link variant to option values based on the detected properties
          const linksToCreate = [];
          
          if (v.color && valueMap[`Color:${v.color}`]) {
            linksToCreate.push({ variantId: variant.id, optionValueId: valueMap[`Color:${v.color}`] });
          }
          
          if (v.attributes && typeof v.attributes === 'object') {
            for (const [key, value] of Object.entries(v.attributes)) {
              const mapKey = `${key}:${value}`;
              if (value && valueMap[mapKey]) {
                linksToCreate.push({ variantId: variant.id, optionValueId: valueMap[mapKey] });
              }
            }
          }

          if (linksToCreate.length > 0) {
            await tx.variantOptionValue.createMany({ data: linksToCreate });
          }
        }
      }

      // 4. Update Category count
      await tx.category.update({
        where: { id: product.categoryId },
        data: { noOfProducts: { increment: 1 } },
      });

      return product;
    });

    // Fetch final result with all includes
    const finalProduct = await prisma.product.findUnique({
      where: { id: result.id },
      include: {
        images: true, seller: true, category: true, subcategory: true,
        options: { include: { values: true } },
        variants: {
          include: {
            images: true,
            specifications: true,
            optionValues: {
              include: { optionValue: { include: { option: true } } }
            }
          }
        }
      }
    });

    return ok(res, { message: 'Product created', data: serializeProduct(finalProduct) });
  } catch (error) {
    console.error('[createProduct] Error:', error);
    return fail(res, { status: 500, message: 'Failed to create product' });
  }
}

async function updateProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { seller: true },
  });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });

  if (['seller', 'staff'].includes(req.user.role)) {
    if (existing.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });
  } else if (req.user.role === 'admin') {
    // Check if the product belongs to the admin or one of their sellers
    const isOwnerOrManager = existing.sellerId === req.user.id || existing.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  // If categoryId is being changed, validate access
  if (req.body.categoryId && req.body.categoryId !== existing.categoryId) {
    const newCategoryId = parseInt(req.body.categoryId, 10);

    // For admin role, verify they have access to the new category
    if (req.user.role === 'admin') {
      const hasAccess = await prisma.adminCategory.findFirst({
        where: {
          adminId: req.user.id,
          categoryId: newCategoryId,
        },
      });
      if (!hasAccess) {
        return fail(res, { status: 403, message: 'You do not have access to this category' });
      }
    }

    // For seller/staff role, verify the new category is assigned to their admin
    if (['seller', 'staff'].includes(req.user.role)) {
      const seller = await prisma.user.findUnique({
        where: { id: req.user.sellerId },
        select: { adminId: true },
      });

      if (!seller || !seller.adminId) {
        return fail(res, { status: 403, message: 'You are not assigned to an admin' });
      }

      const hasAccess = await prisma.adminCategory.findFirst({
        where: {
          adminId: seller.adminId,
          categoryId: newCategoryId,
        },
      });

      if (!hasAccess) {
        return fail(res, { status: 403, message: 'You can only assign products to categories assigned to your admin' });
      }
    }
  }

  const updateData = {
    name: req.body.name ?? undefined,
    description: req.body.description ?? undefined,
    deity: req.body.deity ?? undefined,
    material: req.body.material ?? undefined,
    height: req.body.height ?? undefined,
    weight: req.body.weight ?? undefined,
    handcrafted: req.body.handcrafted ?? undefined,
    occasion: req.body.occasion ? req.body.occasion.map(toDbOccasion) : undefined,
    religionCategory: req.body.religionCategory ?? undefined,
    packagingType: req.body.packagingType ? toDbPackagingType(req.body.packagingType) : undefined,
    fragile: req.body.fragile ?? undefined,
    price: req.body.price ?? undefined,
    comparePrice: req.body.comparePrice ?? undefined,
    stockQuantity: req.body.stockQuantity ?? undefined,
    lowStockThreshold: req.body.lowStockThreshold ?? undefined,
    tags: req.body.tags ?? undefined,
    status: req.body.status ?? undefined,
    isFeatured: req.body.isFeatured ?? undefined,
    stock: req.body.stock ?? undefined,
  };

  if (req.body.hasVariants !== undefined) {
    updateData.hasVariants = req.body.hasVariants === true;
    updateData.metadata = {
      ...(typeof existing.metadata === 'object' && existing.metadata !== null ? existing.metadata : {}),
      hasVariants: req.body.hasVariants === true
    };
  }

  // Add categoryId to updateData if provided
  if (req.body.categoryId) {
    updateData.categoryId = parseInt(req.body.categoryId, 10);
  }

  // Handle subcategoryId update
  if (req.body.subcategoryId !== undefined) {
    if (req.body.subcategoryId === null || req.body.subcategoryId === '' || req.body.subcategoryId === '__none__') {
      updateData.subcategoryId = null;
      updateData.subcategorySlug = null;
    } else {
      const subId = parseInt(req.body.subcategoryId, 10);
      const sub = await prisma.subcategory.findUnique({ where: { id: subId } });
      if (!sub) {
        return fail(res, { status: 400, message: 'Invalid subcategory' });
      }
      updateData.subcategoryId = sub.id;
      updateData.subcategorySlug = sub.slug;
    }
  }

  // Allow super_admin and admin to change sellerId
  if ((req.user.role === 'super_admin' || req.user.role === 'admin') && req.body.sellerId) {
    const nextSellerId = String(req.body.sellerId);

    // Allow moving product back to "My Products" (admin/super_admin owns it)
    const isMyProductsOwner = nextSellerId === req.user.id;

    if (!isMyProductsOwner) {
      const targetSeller = await prisma.user.findUnique({ where: { id: nextSellerId } });
      if (!targetSeller || targetSeller.role !== 'seller') {
        return fail(res, { status: 400, message: 'Invalid seller' });
      }
      if (req.user.role === 'admin' && targetSeller.adminId !== req.user.id) {
        return fail(res, { status: 403, message: 'You do not have access to this seller' });
      }
    }

    updateData.sellerId = nextSellerId;
  }

  try {
    const p = await prisma.$transaction(async (tx) => {
      // 1. Update core product data (incorporating metadata updates)
      const existingProduct = await tx.product.findUnique({ where: { id: parseInt(req.params.id, 10) } });
      const currentMeta = existingProduct?.metadata || {};
      
      const newMeta = { ...currentMeta };
      if (req.body.hasVariants !== undefined) newMeta.hasVariants = req.body.hasVariants === true;
      if (req.body.brand !== undefined) newMeta.brand = req.body.brand;
      if (req.body.care !== undefined) newMeta.care = req.body.care;
      if (req.body.materials !== undefined) newMeta.materials = req.body.materials;
      if (req.body.ageGroups !== undefined) newMeta.ageGroups = req.body.ageGroups;
      if (req.body.isNew !== undefined) newMeta.isNew = req.body.isNew;
      if (req.body.isBestseller !== undefined) newMeta.isBestseller = req.body.isBestseller;
      if (req.body.dimensions !== undefined) newMeta.dimensions = req.body.dimensions;
      if (req.body.additionalInfo !== undefined) newMeta.additionalInfo = req.body.additionalInfo;
      if (req.body.variantAdditionalInfo !== undefined) newMeta.variantAdditionalInfo = req.body.variantAdditionalInfo;
      if (req.body.additionalInfoByColor !== undefined) newMeta.additionalInfoByColor = req.body.additionalInfoByColor;

      updateData.metadata = newMeta;
      console.log(`[Products] Updating product ${req.params.id} metadata:`, JSON.stringify(newMeta, null, 2));

      const updated = await tx.product.update({
        where: { id: parseInt(req.params.id, 10) },
        data: updateData,
      });

      // 2. Sync Images if provided - More efficient approach
      if (req.body.images && Array.isArray(req.body.images)) {
        const newImages = req.body.images;
        const currentImages = await tx.productImage.findMany({
          where: { productId: updated.id },
          select: { id: true, url: true }
        });

        const currentUrls = currentImages.map(img => img.url);

        // URLs to delete (in DB but not in request)
        const urlsToDelete = currentUrls.filter(url => !newImages.includes(url));
        if (urlsToDelete.length > 0) {
          await tx.productImage.deleteMany({
            where: {
              productId: updated.id,
              url: { in: urlsToDelete }
            }
          });
        }

        // URLs to add (in request but not in DB)
        const urlsToAdd = newImages.filter(url => !currentUrls.includes(url));
        if (urlsToAdd.length > 0) {
          await tx.productImage.createMany({
            data: urlsToAdd.map((url, idx) => ({
              productId: updated.id,
              url,
              sortOrder: newImages.indexOf(url) // Preserve new order
            }))
          });
        }

        // Optionally update sortOrder for all images to match the new request order
        // This ensures the order in the request is strictly followed
        const finalImages = await tx.productImage.findMany({
          where: { productId: updated.id }
        });

        for (const img of finalImages) {
          const newIdx = newImages.indexOf(img.url);
          if (newIdx !== -1 && img.sortOrder !== newIdx) {
            await tx.productImage.update({
              where: { id: img.id },
              data: { sortOrder: newIdx }
            });
          }
        }
      }

      // 3. Sync Options and Variants
      if (req.body.hasVariants !== undefined || req.body.variants) {
        // Delete existing options (cascades to productOptionValues and variantOptionValues)
        await tx.productOption.deleteMany({ where: { productId: updated.id } });
        // Delete existing variants
        await tx.productVariant.deleteMany({ where: { productId: updated.id } });

        if (req.body.hasVariants && Array.isArray(req.body.variants)) {
          const optionMap = {};
          const valueMap = {};

          // Collect unique values for dynamically observed options from v.attributes and v.color
          const detectedOptions = { Color: new Set() };

          req.body.variants.forEach(v => {
            if (v.color) detectedOptions.Color.add(v.color);
            
            if (v.attributes && typeof v.attributes === 'object') {
              for (const [key, value] of Object.entries(v.attributes)) {
                if (value) {
                  if (!detectedOptions[key]) detectedOptions[key] = new Set();
                  detectedOptions[key].add(value);
                }
              }
            }
          });

          // Recreate Options
          for (const [optName, valuesSet] of Object.entries(detectedOptions)) {
            if (valuesSet.size > 0) {
              const createdOption = await tx.productOption.create({
                data: {
                  productId: updated.id,
                  name: optName,
                  values: {
                    create: Array.from(valuesSet).map(val => ({ value: val }))
                  }
                },
                include: { values: true }
              });
              optionMap[optName] = createdOption.id;
              createdOption.values.forEach(v => {
                valueMap[`${optName}:${v.value}`] = v.id;
              });
            }
          }

          // Recreate Variants
          for (const v of req.body.variants) {
            const variant = await tx.productVariant.create({
              data: {
                productId: updated.id,
                price: parseFloat(v.price) || 0,
                mrp: v.mrp !== undefined ? parseFloat(v.mrp) : null,
                comparePrice: v.mrp ? parseFloat(v.mrp) : (v.comparePrice ? parseFloat(v.comparePrice) : null),
                stock: parseInt(v.stockQuantity ?? v.stock, 10) || 0,
                stockQuantity: parseInt(v.stockQuantity ?? v.stock ?? 0, 10),
                size: v.attributes?.Size || null, // fallback for schema
                color: v.color || null,
                colorHex: v.colorHex || null,
                quality: v.attributes?.Quality || null, // fallback for schema
                sku: v.sku || null,
                description: v.description || null,
                images: {
                  create: (v.images || v.imageUrls || []).map((url, idx) => ({ url, sortOrder: idx }))
                },
                specifications: {
                  create: (v.specifications || []).map((spec, idx) => ({
                    label: spec.label,
                    value: spec.value,
                    sortOrder: spec.sortOrder ?? idx
                  }))
                }
              }
            });

            // Link variant to option values
            const linksToCreate = [];
            if (v.color && valueMap[`Color:${v.color}`]) {
              linksToCreate.push({ variantId: variant.id, optionValueId: valueMap[`Color:${v.color}`] });
            }

            if (v.attributes && typeof v.attributes === 'object') {
              for (const [key, value] of Object.entries(v.attributes)) {
                const mapKey = `${key}:${value}`;
                if (value && valueMap[mapKey]) {
                  linksToCreate.push({ variantId: variant.id, optionValueId: valueMap[mapKey] });
                }
              }
            }

            if (linksToCreate.length > 0) {
              await tx.variantOptionValue.createMany({ data: linksToCreate });
            }
          }
        }
      }

      return updated;
    });

    const refreshed = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: {
        images: true,
        seller: true,
        category: true,
        subcategory: true,
        options: {
          include: {
            values: true
          }
        },
        variants: {
          include: {
            images: true,
            specifications: true,
            optionValues: {
              include: {
                optionValue: {
                  include: {
                    option: true
                  }
                }
              }
            }
          }
        },
      }
    });

    return ok(res, { message: 'Product updated', data: serializeProduct(refreshed) });
  } catch (error) {
    console.error('[updateProduct] Error:', error);
    return fail(res, { status: 500, message: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.product.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { category: true, seller: true },
  });
  if (!existing) return fail(res, { status: 404, message: 'Product not found' });

  if (['seller', 'staff'].includes(req.user.role)) {
    if (existing.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });
  } else if (req.user.role === 'admin') {
    // Check if the product belongs to the admin or one of their sellers
    const isOwnerOrManager = existing.sellerId === req.user.id || existing.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  await prisma.product.delete({ where: { id: parseInt(req.params.id, 10) } });

  // Decrement category product count
  await prisma.category.update({
    where: { id: existing.categoryId },
    data: { noOfProducts: { decrement: 1 } },
  });

  return ok(res, { message: 'Product deleted', data: null });
}

async function approveProduct(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
      options: {
        include: {
          values: true
        }
      },
      variants: {
        include: {
          images: true,
          optionValues: {
            include: {
              optionValue: {
                include: {
                  option: true
                }
              }
            }
          }
        }
      },
    },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });

  // For admin role, verify they have access to this product's seller
  if (req.user.role === 'admin') {
    const isOwnerOrManager = p.sellerId === req.user.id || p.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  return ok(res, { message: 'Product approved', data: serializeProduct(p) });
}

async function rejectProduct(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
      options: {
        include: {
          values: true
        }
      },
      variants: {
        include: {
          images: true,
          optionValues: {
            include: {
              optionValue: {
                include: {
                  option: true
                }
              }
            }
          }
        }
      },
    },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });

  // For admin role, verify they have access to this product's seller
  if (req.user.role === 'admin') {
    const isOwnerOrManager = p.sellerId === req.user.id || p.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  return ok(res, { message: 'Product rejected', data: serializeProduct(p) });
}

async function updateStock(req, res) {
  const prisma = getPrisma();
  const p = await prisma.product.findUnique({
    where: { id: parseInt(req.params.id, 10) },
    include: { category: true, seller: true },
  });
  if (!p) return fail(res, { status: 404, message: 'Product not found' });

  if (['seller', 'staff'].includes(req.user.role)) {
    if (p.sellerId !== req.user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });
  } else if (req.user.role === 'admin') {
    // Check if the product belongs to the admin or one of their sellers
    const isOwnerOrManager = p.sellerId === req.user.id || p.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  const stockStatus = req.body.stock || req.body.stockStatus;
  if (!stockStatus || !['available', 'unavailable'].includes(stockStatus)) {
    return fail(res, { status: 400, message: 'Stock status must be available or unavailable' });
  }

  const updated = await prisma.product.update({
    where: { id: p.id },
    data: { stock: stockStatus },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
      options: {
        include: {
          values: true
        }
      },
      variants: {
        include: {
          images: true,
          optionValues: {
            include: {
              optionValue: {
                include: {
                  option: true
                }
              }
            }
          }
        }
      },
    },
  });

  return ok(res, { message: 'Stock updated', data: serializeProduct(updated) });
}

async function inventory(req, res) {
  const prisma = getPrisma();
  const productId = parseInt(req.params.id, 10);
  const user = req.user;

  // Verify product exists and user has access
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { seller: true }
  });
  if (!product) return fail(res, { status: 404, message: 'Product not found' });

  if (['seller', 'staff'].includes(user.role)) {
    if (product.sellerId !== user.sellerId) return fail(res, { status: 403, message: 'Forbidden' });
  } else if (user.role === 'admin') {
    const isOwnerOrManager = product.sellerId === user.id || product.seller?.adminId === user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }
  }

  const rows = await prisma.inventoryMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    include: { product: true },
  });
  const data = rows.map((m) => ({
    id: m.id,
    productId: m.productId,
    productName: m.product?.name || '',
    type: m.type,
    quantity: m.quantity,
    previousStock: m.previousStock,
    newStock: m.newStock,
    reason: m.reason,
    notes: m.notes || undefined,
    createdBy: m.createdById,
    createdAt: m.createdAt.toISOString(),
  }));
  return ok(res, { message: 'Inventory movements fetched', data });
}

async function lowStock(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const user = req.user;

  const where = { stock: 'unavailable' };

  // If user is admin (not super_admin), filter by assigned categories AND manage sellers
  if (user && user.role === 'admin') {
    where.AND = [
      {
        OR: [
          { sellerId: user.id },
          { seller: { adminId: user.id } }
        ]
      }
    ];

    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.AND.push({ categoryId: { in: categoryIds } });
    } else {
      return ok(res, { message: 'Unavailable products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: true, seller: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Unavailable products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

async function pending(req, res) {
  const prisma = getPrisma();
  const { page, limit } = parsePagination(req.query);
  const user = req.user;
  const where = {};

  // If user is admin (not super_admin), filter by assigned categories AND manage sellers
  if (user && user.role === 'admin') {
    where.AND = [
      {
        OR: [
          { sellerId: user.id },
          { seller: { adminId: user.id } }
        ]
      }
    ];

    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.AND.push({ categoryId: { in: categoryIds } });
    } else {
      return ok(res, { message: 'Products fetched', data: [], meta: buildMeta({ page, limit, total: 0 }) });
    }
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { images: true, seller: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return ok(res, { message: 'Products fetched', data: rows.map(serializeProduct), meta: buildMeta({ page, limit, total }) });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  approveProduct,
  rejectProduct,
  updateStock,
  inventory,
  lowStock,
  pending,
};




// ============================================
// INVENTORY MANAGEMENT ENDPOINTS
// ============================================

async function getInventoryStats(req, res) {
  try {
    const prisma = getPrisma();
    const user = req.user;
    console.log('Fetching inventory stats for user:', user?.id, user?.role);

    // Build where clause based on user role
    const where = {};
    // If user is seller or staff, restrict low stock fetching to their own products
    if (user && ['seller', 'staff'].includes(user.role)) {
      where.sellerId = user.sellerId || user.id;
    } else if (user.role === 'admin') {
      where.AND = [
        {
          OR: [
            { sellerId: user.id },
            { seller: { adminId: user.id } }
          ]
        }
      ];

      const assignedCategoryIds = await prisma.adminCategory.findMany({
        where: { adminId: user.id },
        select: { categoryId: true },
      });
      const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
      if (categoryIds.length > 0) {
        where.AND.push({ categoryId: { in: categoryIds } });
      } else {
        return ok(res, {
          message: 'Inventory stats fetched',
          data: {
            totalProducts: 0,
            totalStockQuantity: 0,
            deliveredQuantity: 0,
            reservedQuantity: 0,
            shippingQuantity: 0,
            lowStockProducts: 0,
          },
        });
      }
    }

    // Get all products for this seller/admin
    const products = await prisma.product.findMany({
      where,
      select: { id: true, stockQuantity: true, lowStockThreshold: true, stock: true },
    });

    const productIds = products.map(p => p.id);
    const totalProducts = products.length;

    // Sum total stock quantity across all products
    const totalStockQuantity = products.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);

    // Count low stock products (where stockQuantity < lowStockThreshold)
    const lowStockProducts = products.filter(p =>
      (p.stockQuantity || 0) < (p.lowStockThreshold || 5)
    ).length;

    // Sum delivered quantities (products in delivered orders)
    const deliveredResult = await prisma.orderItem.aggregate({
      where: {
        productId: { in: productIds },
        order: { orderStatus: 'delivered' },
      },
      _sum: { quantity: true },
    });

    // Sum reserved quantities (products in abandoned carts)
    const reservedResult = await prisma.abandonedCartItem.aggregate({
      where: {
        productId: { in: productIds.map(String) },
        cart: { status: 'abandoned' },
      },
      _sum: { quantity: true },
    });

    // Sum shipping quantities (products in pending/processing/shipped orders ONLY)
    // EXCLUDE cancelled, returned, and delivered orders
    const shippingResult = await prisma.orderItem.aggregate({
      where: {
        productId: { in: productIds },
        order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
      },
      _sum: { quantity: true },
    });

    const stats = {
      totalProducts,
      totalStockQuantity,
      deliveredQuantity: Number(deliveredResult._sum.quantity || 0),
      reservedQuantity: Number(reservedResult._sum.quantity || 0),
      shippingQuantity: Number(shippingResult._sum.quantity || 0),
      lowStockProducts,
    };

    // NOTE: Stock status is NOT auto-updated here. It should only be changed
    // manually by admins/sellers or via the updateProductStock endpoint.
    // Auto-updating here caused products to incorrectly go unavailable when
    // the inventory stats page was loaded.

    return ok(res, {
      message: 'Inventory stats fetched',
      data: stats,
    });
  } catch (error) {
    console.error('[getInventoryStats] 500 Error:', error);
    return fail(res, { status: 500, message: error.message, stack: error.stack });
  }
}

async function updateProductStock(req, res) {
  const prisma = getPrisma();
  const productId = parseInt(req.params.id, 10);
  const { adjustment, variantAdjustments } = req.body; // Map of changes

  if (
    (adjustment === undefined || typeof adjustment !== 'number') &&
    (!Array.isArray(variantAdjustments) || variantAdjustments.length === 0)
  ) {
    return fail(res, { status: 400, message: 'Valid adjustment values are required' });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, seller: true, variants: true },
  });

  if (!product) {
    return fail(res, { status: 404, message: 'Product not found' });
  }

  // Authorization check
  if (req.user.role === 'seller' && product.sellerId !== req.user.id) {
    return fail(res, { status: 403, message: 'Forbidden' });
  }

  if (req.user.role === 'admin') {
    const isOwnerOrManager = product.sellerId === req.user.id || product.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }

    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: product.categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid category)' });
    }
  }

  let finalProductOutput = null;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      let newTotalQuantity = 0;
      let isFirstStockAdjustment = true;

      // Case 1: Variant-level stock adjustment
      if (product.hasVariants && Array.isArray(variantAdjustments) && variantAdjustments.length > 0) {
        let totalVariantSum = 0;

        // Iterate through all product variants to recalculate total stock
        const updatedVariants = await Promise.all(
          product.variants.map(async (variant) => {
            // Find if this variant has an adjustment
            const vAdj = variantAdjustments.find(a => a.variantId === variant.id);
            const adjValue = vAdj ? Number(vAdj.adjustment) : 0;
            
            let currentVQty = variant.stockQuantity || 0;
            let newVQty = Math.max(0, currentVQty + adjValue);
            totalVariantSum += newVQty;

            // Only update if there's an actual adjustment
            if (adjValue !== 0) {
              const newVStockStatus = newVQty === 0 ? 'unavailable' : (variant.stock === 'unavailable' && newVQty > 0 ? variant.stock : variant.stock);

              const updatedVar = await tx.productVariant.update({
                where: { id: variant.id },
                data: {
                  stockQuantity: newVQty,
                  // In schema `stock` on variant is an Int, but let's sync stockQuantity
                  stock: newVQty, 
                }
              });

              // Create specific movement record highlighting the variant
              await tx.inventoryMovement.create({
                data: {
                  productId: product.id,
                  type: adjValue > 0 ? 'in' : adjValue < 0 ? 'out' : 'adjustment',
                  quantity: Math.abs(adjValue),
                  previousStock: currentVQty,
                  newStock: newVQty,
                  reason: 'Manual stock adjustment (Variant)',
                  notes: `Stock adjusted by ${adjValue > 0 ? '+' : ''}${adjValue} for variant ${variant.color || ''} ${variant.size || ''}`,
                  createdById: req.user.id,
                },
              });
              
              isFirstStockAdjustment = false;
              return updatedVar;
            }
            return variant;
          })
        );
        newTotalQuantity = totalVariantSum;

      } else {
        // Case 2: Base product stock adjustment
        const previousQuantity = product.stockQuantity || 0;
        const adjValue = Number(adjustment) || 0;
        newTotalQuantity = Math.max(0, previousQuantity + adjValue);

        if (adjValue !== 0) {
          await tx.inventoryMovement.create({
            data: {
              productId,
              type: adjValue > 0 ? 'in' : adjValue < 0 ? 'out' : 'adjustment',
              quantity: Math.abs(adjValue),
              previousStock: previousQuantity,
              newStock: newTotalQuantity,
              reason: 'Manual stock adjustment',
              notes: `Stock adjusted by ${adjValue > 0 ? '+' : ''}${adjValue}`,
              createdById: req.user.id,
            },
          });
          isFirstStockAdjustment = false;
        }
      }

      // Update the main product's total stock
      let newStock = product.stock; 
      if (newTotalQuantity === 0) {
        newStock = 'unavailable';
      }

      return tx.product.update({
        where: { id: productId },
        data: {
          stockQuantity: newTotalQuantity,
          stock: newStock,
        },
        include: { images: true, seller: true, category: true, subcategory: true, variants: true },
      });
    });

    return ok(res, {
      message: 'Stock updated successfully',
      data: serializeProduct(updated),
    });
  } catch (error) {
    console.error('[updateProductStock] Error:', error);
    return fail(res, { status: 500, message: 'Failed to update stock' });
  }
}

async function getProductInventoryDetails(req, res) {
  const prisma = getPrisma();
  const productId = parseInt(req.params.id, 10);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: true,
      seller: true,
      category: true,
      subcategory: true,
      variants: {
        include: {
          optionValues: {
            include: {
              optionValue: {
                include: {
                  option: true
                }
              }
            }
          }
        }
      }
    },
  });

  if (!product) {
    return fail(res, { status: 404, message: 'Product not found' });
  }

  // Authorization check
  if (req.user.role === 'seller' && product.sellerId !== req.user.id) {
    return fail(res, { status: 403, message: 'Forbidden' });
  }

  if (req.user.role === 'admin') {
    const isOwnerOrManager = product.sellerId === req.user.id || product.seller?.adminId === req.user.id;
    if (!isOwnerOrManager) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid seller)' });
    }

    const hasAccess = await prisma.adminCategory.findFirst({
      where: {
        adminId: req.user.id,
        categoryId: product.categoryId,
      },
    });
    if (!hasAccess) {
      return fail(res, { status: 403, message: 'You do not have access to this product (invalid category)' });
    }
  }

  // Get inventory details - sum quantities for this specific product
  const [deliveredCount, inCartCount, inShippingCount] = await Promise.all([
    // Delivered quantity
    prisma.orderItem.aggregate({
      where: {
        productId,
        order: { orderStatus: 'delivered' },
      },
      _sum: { quantity: true },
    }),
    // In cart quantity (abandoned carts)
    prisma.abandonedCartItem.aggregate({
      where: {
        productId: String(productId),
        cart: { status: 'abandoned' },
      },
      _sum: { quantity: true },
    }),
    // In shipping/processing/pending quantity (EXCLUDES cancelled, returned, delivered)
    prisma.orderItem.aggregate({
      where: {
        productId,
        order: { orderStatus: { in: ['pending', 'processing', 'shipped'] } },
      },
      _sum: { quantity: true },
    }),
  ]);

  const deliveredQuantity = Number(deliveredCount._sum.quantity || 0);
  const reservedQuantity = Number(inCartCount._sum.quantity || 0);
  const shippingQuantity = Number(inShippingCount._sum.quantity || 0);

  // For variants, totalStock is the sum of variant stock
  let totalStock = product.stockQuantity || 0;
  if (product.hasVariants && product.variants && product.variants.length > 0) {
    totalStock = product.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
  }

  const availableStock = Math.max(0, totalStock - reservedQuantity - shippingQuantity - deliveredQuantity);

  return ok(res, {
    message: 'Product inventory details fetched',
    data: {
      ...serializeProduct(product),
      variants: product.variants, // Pass variants so frontend can access their IDs and fields
      totalStock,
      availableStock,
      deliveredQuantity,
      reservedQuantity,
      shippingQuantity,
    },
  });
}

async function getCartDetails(req, res) {
  const prisma = getPrisma();
  const user = req.user;

  // Build where clause based on user role
  const where = {};
  if (user && ['seller', 'staff'].includes(user.role)) {
    where.sellerId = user.sellerId || user.id;
  } else if (user.role === 'admin') {
    where.AND = [
      {
        OR: [
          { sellerId: user.id },
          { seller: { adminId: user.id } }
        ]
      }
    ];

    const assignedCategoryIds = await prisma.adminCategory.findMany({
      where: { adminId: user.id },
      select: { categoryId: true },
    });
    const categoryIds = assignedCategoryIds.map((ac) => ac.categoryId);
    if (categoryIds.length > 0) {
      where.AND.push({ categoryId: { in: categoryIds } });
    } else {
      return ok(res, {
        message: 'Cart details fetched',
        data: [],
      });
    }
  }

  // Get all products for this seller/admin
  const products = await prisma.product.findMany({
    where,
    include: {
      images: {
        take: 1,
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const productIds = products.map(p => p.id);

  // Get all abandoned cart items for these products
  const cartItems = await prisma.abandonedCartItem.findMany({
    where: {
      productId: { in: productIds.map(String) },
      cart: { status: 'abandoned' },
    },
    include: {
      cart: {
        select: {
          id: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  // Group by product and aggregate
  const cartDetails = [];
  for (const product of products) {
    const items = cartItems.filter(item => item.productId === String(product.id));

    if (items.length > 0) {
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const uniqueCarts = new Set(items.map(item => item.cart.id)).size;

      cartDetails.push({
        productId: product.id,
        productPid: product.pid,
        productName: product.name,
        productImage: product.images && product.images.length > 0 ? product.images[0].url : null,
        productPrice: product.price,
        reservedQuantity: totalQuantity,
        numberOfCarts: uniqueCarts,
        carts: items.map(item => ({
          cartId: item.cart.id,
          userId: item.cart.customerId,
          quantity: item.quantity,
          addedAt: item.cart.createdAt.toISOString(),
          updatedAt: item.cart.updatedAt.toISOString(),
        })),
      });
    }
  }

  // Sort by reserved quantity descending
  cartDetails.sort((a, b) => b.reservedQuantity - a.reservedQuantity);

  return ok(res, {
    message: 'Cart details fetched',
    data: cartDetails,
  });
}

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  approveProduct,
  rejectProduct,
  updateStock,
  inventory,
  lowStock,
  pending,
  getInventoryStats,
  updateProductStock,
  getProductInventoryDetails,
  getCartDetails,
};
