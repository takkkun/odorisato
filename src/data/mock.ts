import type { Category, Post, Profile, SiteNotification } from './types';

const categories: Category[] = [
  { id: 'cat-works', name: 'works' },
  { id: 'cat-illust', name: 'illust' },
];

const posts: Post[] = Array.from({ length: 50 }, (_, i) => {
  const index = i + 1;
  const seed = `s${index}`;
  const category = categories[i % categories.length];
  const imageCount = (i % 3) + 1;
  return {
    id: `post-${index}`,
    caption: index % 3 === 0 ? '' : `Sample caption ${index}`,
    category,
    thumbnail: {
      url: `https://picsum.photos/seed/${seed}-thumb/520/312`,
      width: 260,
      height: 156,
    },
    images: Array.from({ length: imageCount }, (_, j) => ({
      url: `https://picsum.photos/seed/${seed}-img${j}/1600/1067`,
      width: 1600,
      height: 1067,
      order: j + 1,
    })),
    publishedAt: new Date(2024, 11 - (i % 12), 1).toISOString(),
  };
});

export const mockData = {
  categories,
  posts,
  profile: {
    content:
      '佐藤おどり / odori sato\n連絡先: example@example.com\n\nイラストレーターのポートフォリオサイトです。',
  } as Profile,
  notification: {
    content: 'うどんがたべたすぎて泣きそう',
  } as SiteNotification,
};
