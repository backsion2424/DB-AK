export const addCategory = async (name: string) => {
  const cats = JSON.parse(localStorage.getItem('sg_categories') || '[]');
  const newCat = { id: Date.now().toString(), name, order: cats.length };
  localStorage.setItem('sg_categories', JSON.stringify([...cats, newCat]));
  return newCat;
};

export const updateCategory = async (id: string, data: any) => {
  const cats = JSON.parse(localStorage.getItem('sg_categories') || '[]');
  const next = cats.map((c: any) => c.id === id ? { ...c, ...data } : c);
  localStorage.setItem('sg_categories', JSON.stringify(next));
};

export const deleteCategory = async (id: string) => {
  const cats = JSON.parse(localStorage.getItem('sg_categories') || '[]');
  const next = cats.filter((c: any) => c.id !== id);
  localStorage.setItem('sg_categories', JSON.stringify(next));
};

export const getCategoriesByUserId = async () => {
    return JSON.parse(localStorage.getItem('sg_categories') || '[]');
};
