const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');

// ─── Seller: Get My Policies ──────────────────────────────────────────────────
async function getMyPolicies(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  try {
    let policy = await prisma.sellerPolicy.findUnique({ where: { sellerId } });
    if (!policy) {
      // Auto-create empty policy record on first access
      policy = await prisma.sellerPolicy.create({
        data: { sellerId, privacyPolicy: '', termsConditions: '' },
      });
    }
    return ok(res, { data: policy });
  } catch (error) {
    console.error('[SellerPolicies] getMyPolicies error:', error);
    return fail(res, { status: 500, message: 'Failed to load policies' });
  }
}

// ─── Seller: Update My Policies ───────────────────────────────────────────────
async function updateMyPolicies(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  const { privacyPolicy, termsConditions } = req.body;
  try {
    const policy = await prisma.sellerPolicy.upsert({
      where: { sellerId },
      update: {
        ...(privacyPolicy !== undefined && { privacyPolicy }),
        ...(termsConditions !== undefined && { termsConditions }),
      },
      create: {
        sellerId,
        privacyPolicy: privacyPolicy || '',
        termsConditions: termsConditions || '',
      },
    });
    return ok(res, { message: 'Policies saved', data: policy });
  } catch (error) {
    console.error('[SellerPolicies] updateMyPolicies error:', error);
    return fail(res, { status: 500, message: 'Failed to save policies' });
  }
}

// ─── Seller: Get My FAQs ──────────────────────────────────────────────────────
async function getMyFAQs(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  try {
    const faqs = await prisma.sellerFAQ.findMany({
      where: { sellerId },
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    return ok(res, { data: faqs });
  } catch (error) {
    console.error('[SellerPolicies] getMyFAQs error:', error);
    return fail(res, { status: 500, message: 'Failed to load FAQs' });
  }
}

// ─── Seller: Create FAQ ───────────────────────────────────────────────────────
async function createMyFAQ(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  const { question, answer, category = 'General', order = 0 } = req.body;
  try {
    if (!question || !answer) {
      return fail(res, { status: 400, message: 'Question and answer are required' });
    }
    const faq = await prisma.sellerFAQ.create({
      data: { sellerId, question, answer, category, order },
    });
    return res.status(201).json({ success: true, message: 'FAQ created', data: faq });
  } catch (error) {
    console.error('[SellerPolicies] createMyFAQ error:', error);
    return fail(res, { status: 500, message: 'Failed to create FAQ' });
  }
}

// ─── Seller: Update FAQ ───────────────────────────────────────────────────────
async function updateMyFAQ(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  const { id } = req.params;
  const { question, answer, category, order } = req.body;
  try {
    const existing = await prisma.sellerFAQ.findFirst({ where: { id, sellerId } });
    if (!existing) return fail(res, { status: 404, message: 'FAQ not found' });

    const faq = await prisma.sellerFAQ.update({
      where: { id },
      data: {
        ...(question && { question }),
        ...(answer && { answer }),
        ...(category && { category }),
        ...(order !== undefined && { order }),
      },
    });
    return ok(res, { message: 'FAQ updated', data: faq });
  } catch (error) {
    console.error('[SellerPolicies] updateMyFAQ error:', error);
    return fail(res, { status: 500, message: 'Failed to update FAQ' });
  }
}

// ─── Seller: Delete FAQ ───────────────────────────────────────────────────────
async function deleteMyFAQ(req, res) {
  const prisma = getPrisma();
  const sellerId = req.user.sellerId || req.user.id;
  const { id } = req.params;
  try {
    const existing = await prisma.sellerFAQ.findFirst({ where: { id, sellerId } });
    if (!existing) return fail(res, { status: 404, message: 'FAQ not found' });

    await prisma.sellerFAQ.delete({ where: { id } });
    return ok(res, { message: 'FAQ deleted' });
  } catch (error) {
    console.error('[SellerPolicies] deleteMyFAQ error:', error);
    return fail(res, { status: 500, message: 'Failed to delete FAQ' });
  }
}

// ─── Public: Get Seller Policies ─────────────────────────────────────────────
async function getPublicSellerPolicies(req, res) {
  const prisma = getPrisma();
  const { sellerId } = req.params;
  try {
    // Validate seller exists
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, name: true, businessName: true },
    });
    if (!seller) return fail(res, { status: 404, message: 'Seller not found' });

    const policy = await prisma.sellerPolicy.findUnique({ where: { sellerId } });
    const sellerName = seller.businessName || seller.name;

    return ok(res, {
      data: {
        sellerId,
        sellerName,
        privacyPolicy: policy?.privacyPolicy || '',
        termsConditions: policy?.termsConditions || '',
      },
    });
  } catch (error) {
    console.error('[SellerPolicies] getPublicSellerPolicies error:', error);
    return fail(res, { status: 500, message: 'Failed to load seller policies' });
  }
}

// ─── Public: Get Seller FAQs ─────────────────────────────────────────────────
async function getPublicSellerFAQs(req, res) {
  const prisma = getPrisma();
  const { sellerId } = req.params;
  try {
    const faqs = await prisma.sellerFAQ.findMany({
      where: { sellerId },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
      select: { id: true, question: true, answer: true, category: true, order: true },
    });
    return ok(res, { data: faqs });
  } catch (error) {
    console.error('[SellerPolicies] getPublicSellerFAQs error:', error);
    return fail(res, { status: 500, message: 'Failed to load seller FAQs' });
  }
}

module.exports = {
  getMyPolicies,
  updateMyPolicies,
  getMyFAQs,
  createMyFAQ,
  updateMyFAQ,
  deleteMyFAQ,
  getPublicSellerPolicies,
  getPublicSellerFAQs,
};
