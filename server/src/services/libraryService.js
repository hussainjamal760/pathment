const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/** Org-shared mentor Library (documents). */
class LibraryService {
  async list() {
    const docs = await models.Document.findAll({ order: [['pinned', 'DESC'], ['updated_at', 'DESC']] });
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      summary: d.summary,
      author: d.author,
      url: d.url,
      readMins: d.readMins,
      pinned: d.pinned,
      updatedAt: d.updatedAt
    }));
  }

  async create(data, author) {
    if (!data.title || !data.title.trim()) throw new ValidationError('title is required');
    return models.Document.create({
      title: data.title.trim(),
      category: data.category || 'guidance',
      summary: data.summary || null,
      url: data.url || null,
      readMins: data.readMins ? Number(data.readMins) : null,
      author: data.author || author || null,
      pinned: false
    });
  }

  async togglePin(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    d.pinned = !d.pinned;
    await d.save();
    return d;
  }

  async remove(id) {
    const d = await models.Document.findByPk(id);
    if (!d) throw new NotFoundError('Document not found');
    await d.destroy();
    return { removed: true };
  }
}

module.exports = new LibraryService();
