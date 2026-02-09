const { getPrisma } = require('../config/prisma');
const { ok, fail } = require('../utils/apiResponse');
const { serializeSupportPage, serializeFAQ } = require('../serializers/supportSerializer');
const { toDbSupportSlug } = require('../utils/enums');

async function getPages(req, res) {
  const prisma = getPrisma();
  const pages = await prisma.supportPage.findMany({ orderBy: { slug: 'asc' } });
  return ok(res, { message: 'Support pages fetched', data: pages.map(serializeSupportPage) });
}

async function getPageBySlug(req, res) {
  const prisma = getPrisma();
  const slug = toDbSupportSlug(req.params.slug);
  const page = await prisma.supportPage.findUnique({ where: { slug } });
  if (!page) return fail(res, { status: 404, message: 'Support page not found' });
  return ok(res, { message: 'Support page fetched', data: serializeSupportPage(page) });
}

async function updatePage(req, res) {
  const prisma = getPrisma();
  const slug = toDbSupportSlug(req.params.slug);
  const page = await prisma.supportPage.upsert({
    where: { slug },
    update: {
      title: req.body.title ?? undefined,
      content: req.body.content,
      lastUpdated: new Date(),
      updatedById: req.user.id,
    },
    create: {
      slug,
      title: req.body.title || slug,
      content: req.body.content,
      lastUpdated: new Date(),
      updatedById: req.user.id,
    },
  });
  return ok(res, { message: 'Support page updated', data: serializeSupportPage(page) });
}

async function listFAQs(req, res) {
  const prisma = getPrisma();
  const where = {};
  if (req.query.category) where.category = String(req.query.category);
  const rows = await prisma.fAQ.findMany({ where, orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  return ok(res, { message: 'FAQs fetched', data: rows.map(serializeFAQ) });
}

async function getFAQ(req, res) {
  const prisma = getPrisma();
  const row = await prisma.fAQ.findUnique({ where: { id: req.params.id } });
  if (!row) return fail(res, { status: 404, message: 'FAQ not found' });
  return ok(res, { message: 'FAQ fetched', data: serializeFAQ(row) });
}

async function createFAQ(req, res) {
  const prisma = getPrisma();
  const row = await prisma.fAQ.create({
    data: {
      question: req.body.question,
      answer: req.body.answer,
      category: req.body.category,
      order: req.body.order ?? 0,
      isActive: true,
    },
  });
  return ok(res, { message: 'FAQ created', data: serializeFAQ(row) });
}

async function updateFAQ(req, res) {
  const prisma = getPrisma();
  const row = await prisma.fAQ.update({
    where: { id: req.params.id },
    data: {
      question: req.body.question,
      answer: req.body.answer,
      category: req.body.category,
      order: req.body.order ?? 0,
    },
  });
  return ok(res, { message: 'FAQ updated', data: serializeFAQ(row) });
}

async function deleteFAQ(req, res) {
  const prisma = getPrisma();
  await prisma.fAQ.delete({ where: { id: req.params.id } });
  return ok(res, { message: 'FAQ deleted', data: null });
}

async function getSettings(req, res) {
  const prisma = getPrisma();
  const row = await prisma.platformSettings.findFirst();
  return ok(res, { message: 'Settings fetched', data: row || {} });
}

async function updateSettings(req, res) {
  const prisma = getPrisma();
  const existing = await prisma.platformSettings.findFirst();
  const row = existing
    ? await prisma.platformSettings.update({ where: { id: existing.id }, data: { ...req.body } })
    : await prisma.platformSettings.create({ data: { ...req.body } });
  return ok(res, { message: 'Settings updated', data: row });
}

module.exports = {
  getPages,
  getPageBySlug,
  updatePage,
  listFAQs,
  getFAQ,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  getSettings,
  updateSettings,
};


