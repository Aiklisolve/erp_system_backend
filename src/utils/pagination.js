// src/utils/pagination.js

// Read page & limit from query and compute offset
export function getPagination(req, defaultLimit = 20, maxLimit = 100) {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limitRaw = parseInt(req.query.limit || String(defaultLimit), 10);
    const limit = Math.min(Math.max(limitRaw || defaultLimit, 1), maxLimit);
    const offset = (page - 1) * limit;
  
    return { page, limit, offset };
  }
  
  // Build a standard pagination meta object
  export function buildPaginationMeta(page, limit, totalItems) {
    const total = Number(totalItems || 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  
    return {
      current_page: page,
      total_pages: totalPages,
      total_items: total,
      items_per_page: limit,
      has_next: page < totalPages,
      has_prev: page > 1
    };
  }
  