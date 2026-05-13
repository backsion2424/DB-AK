const STORAGE_KEY = 'db_archive_categories';

export async function listCategories(): Promise<Category[]> {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    // Initial categories if empty
    const defaults = [{ id: '1', name: '전체', order: 0 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults as any;
  }
  return JSON.parse(data);
}

export async function addCategory(name: string) {
  const categories = await listCategories();
  const newCat = {
    id: crypto.randomUUID(),
    name,
    order: categories.length
  };
  categories.push(newCat as any);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  return { id: newCat.id };
}

export async function updateCategory(id: string, data: Partial<Category>) {
  const categories = await listCategories();
  const idx = categories.findIndex(c => c.id === id);
  if (idx === -1) return false;
  categories[idx] = { ...categories[idx], ...data } as any;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  return true;
}

export async function deleteCategory(id: string) {
  const categories = await listCategories();
  const filtered = categories.filter(c => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}
