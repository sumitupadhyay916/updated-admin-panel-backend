const { fromDbSupportSlug } = require('../utils/enums');

function serializeSupportPage(p) {
  return {
    id: p.id,
    slug: fromDbSupportSlug(p.slug),
    title: p.title,
    content: p.content,
    lastUpdated: p.lastUpdated.toISOString().split('T')[0],
    updatedBy: p.updatedById,
  };
}

function serializeFAQ(f) {
  return {
    id: f.id,
    question: f.question,
    answer: f.answer,
    category: f.category,
    order: f.order,
    isActive: f.isActive,
  };
}

module.exports = { serializeSupportPage, serializeFAQ };


