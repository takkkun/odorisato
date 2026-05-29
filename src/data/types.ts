export type Category = {
  id: string;
  name: string;
};

export type PostImage = {
  url: string;
  width: number;
  height: number;
  order: number;
};

export type Post = {
  id: string;
  caption: string;
  category: Category;
  thumbnail: {
    url: string;
    width: number;
    height: number;
  };
  images: PostImage[];
  publishedAt: string;
};

export type Profile = {
  content: string;
};

export type SiteNotification = {
  content: string;
};
