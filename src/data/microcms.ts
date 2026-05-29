import { createClient } from 'microcms-js-sdk';
import { MICROCMS_API_KEY, MICROCMS_SERVICE_DOMAIN } from 'astro:env/server';
import type { Category, Post, Profile, SiteNotification } from './types';

type MicroCMSCategoryResponse = {
  id: string;
  name: string;
};

type MicroCMSMedia = {
  url: string;
  width: number;
  height: number;
};

type MicroCMSPostResponse = {
  id: string;
  caption?: string;
  category: MicroCMSCategoryResponse;
  thumbnail: MicroCMSMedia;
  images: MicroCMSMedia[];
  publishedAt: string;
};

type MicroCMSProfileResponse = {
  content: string;
};

type MicroCMSNotificationResponse = {
  content: string;
};

export const isConfigured = Boolean(MICROCMS_SERVICE_DOMAIN && MICROCMS_API_KEY);

const client = isConfigured
  ? createClient({
      serviceDomain: MICROCMS_SERVICE_DOMAIN as string,
      apiKey: MICROCMS_API_KEY as string,
    })
  : null;

function requireClient(): NonNullable<typeof client> {
  if (!client) {
    throw new Error(
      '[microcms] MICROCMS_SERVICE_DOMAIN and MICROCMS_API_KEY must be set'
    );
  }
  return client;
}

function toCategory(raw: MicroCMSCategoryResponse): Category {
  return { id: raw.id, name: raw.name };
}

function toPost(raw: MicroCMSPostResponse): Post {
  return {
    id: raw.id,
    caption: raw.caption ?? '',
    category: toCategory(raw.category),
    thumbnail: {
      url: raw.thumbnail.url,
      width: raw.thumbnail.width,
      height: raw.thumbnail.height,
    },
    images: raw.images.map((image, idx) => ({
      url: image.url,
      width: image.width,
      height: image.height,
      order: idx + 1,
    })),
    publishedAt: raw.publishedAt,
  };
}

export async function getCategories(): Promise<Category[]> {
  const c = requireClient();
  const result = await c.getList<MicroCMSCategoryResponse>({
    endpoint: 'categories',
    queries: { limit: 100, orders: 'createdAt' },
  });
  return result.contents.map(toCategory);
}

export async function getAllPosts(): Promise<Post[]> {
  const c = requireClient();
  const limit = 100;
  const collected: MicroCMSPostResponse[] = [];
  let offset = 0;
  while (true) {
    const result = await c.getList<MicroCMSPostResponse>({
      endpoint: 'posts',
      queries: {
        limit,
        offset,
        orders: '-publishedAt',
        depth: 2,
      },
    });
    collected.push(...result.contents);
    if (collected.length >= result.totalCount) break;
    offset += limit;
  }
  return collected.map(toPost);
}

export async function getProfile(): Promise<Profile> {
  const c = requireClient();
  const result = await c.getObject<MicroCMSProfileResponse>({
    endpoint: 'profile',
  });
  return { content: result.content };
}

export async function getNotification(): Promise<SiteNotification> {
  const c = requireClient();
  const result = await c.getObject<MicroCMSNotificationResponse>({
    endpoint: 'notification',
  });
  return { content: result.content };
}
