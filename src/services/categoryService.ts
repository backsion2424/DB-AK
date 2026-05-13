import { Category } from '../types';

export async function listCategories(): Promise<Category[]> {
  return (await window.electron.categories.list()) as Category[];
}

export async function addCategory(name: string) {
  return await window.electron.categories.add({ name });
}

export async function updateCategory(id: string, data: Partial<Category>) {
  return await window.electron.categories.update(id, data);
}

export async function deleteCategory(id: string) {
  return await window.electron.categories.delete(id);
}
