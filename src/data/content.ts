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

// Module-level caches: each value is fetched at most once per build, then
// reused across every page render. Without this every page hits microCMS
// for categories/notification etc., which dominates build time.
let postsPromise: Promise<Post[]> | null = null;
let categoriesPromise: Promise<Category[]> | null = null;
let profilePromise: Promise<Profile> | null = null;
let notificationPromise: Promise<SiteNotification> | null = null;

export async function getAllPosts(): Promise<Post[]> {
  if (postsPromise) return postsPromise;
  postsPromise = (async () => {
    if (useMicroCMS) return microcms.getAllPosts();
    return [...mockData.posts].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  })();
  return postsPromise;
}

export async function getCategories(): Promise<Category[]> {
  if (categoriesPromise) return categoriesPromise;
  categoriesPromise = (async () => {
    if (useMicroCMS) return microcms.getCategories();
    return mockData.categories;
  })();
  return categoriesPromise;
}

export async function getProfile(): Promise<Profile> {
  if (profilePromise) return profilePromise;
  profilePromise = (async () => {
    if (useMicroCMS) return microcms.getProfile();
    return mockData.profile;
  })();
  return profilePromise;
}

export async function getNotification(): Promise<SiteNotification> {
  if (notificationPromise) return notificationPromise;
  notificationPromise = (async () => {
    if (useMicroCMS) return microcms.getNotification();
    return mockData.notification;
  })();
  return notificationPromise;
}

export async function getPostsByCategory(categoryName: string): Promise<Post[]> {
  const all = await getAllPosts();
  return all.filter((p) => p.category.name === categoryName);
}

export async function getPost(id: string): Promise<Post | undefined> {
  const all = await getAllPosts();
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
