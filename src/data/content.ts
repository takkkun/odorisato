import { mockData } from './mock';
import * as microcms from './microcms';
import type { Category, Post, Profile, SiteNotification } from './types';

export const POSTS_PER_PAGE = 40;

const useMicroCMS = microcms.isConfigured;

if (!useMicroCMS) {
  console.warn(
    '[content] microCMS not configured. Using mock data. Set MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY in .env to enable.'
  );
}

let postCache: Post[] | null = null;

async function loadAllPosts(): Promise<Post[]> {
  if (postCache) return postCache;
  if (useMicroCMS) {
    postCache = await microcms.getAllPosts();
  } else {
    postCache = [...mockData.posts].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }
  return postCache;
}

export async function getCategories(): Promise<Category[]> {
  if (useMicroCMS) return microcms.getCategories();
  return mockData.categories;
}

export async function getProfile(): Promise<Profile> {
  if (useMicroCMS) return microcms.getProfile();
  return mockData.profile;
}

export async function getNotification(): Promise<SiteNotification> {
  if (useMicroCMS) return microcms.getNotification();
  return mockData.notification;
}

export async function getAllPosts(): Promise<Post[]> {
  return loadAllPosts();
}

export async function getPostsByCategory(categoryName: string): Promise<Post[]> {
  const all = await loadAllPosts();
  return all.filter((p) => p.category.name === categoryName);
}

export async function getPost(id: string): Promise<Post | undefined> {
  const all = await loadAllPosts();
  return all.find((p) => p.id === id);
}

export type PaginatedResult<T> = {
  items: T[];
  totalPages: number;
  currentPage: number;
};

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number = POSTS_PER_PAGE
): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const start = (currentPage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    totalPages,
    currentPage,
  };
}
