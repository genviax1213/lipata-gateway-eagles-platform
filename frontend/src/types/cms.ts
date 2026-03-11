export interface CmsPost {
  id: number;
  title: string;
  slug: string;
  section: string;
  post_type: "article" | "video";
  excerpt: string | null;
  content: string;
  image_url: string | null;
  video_provider: "youtube" | "facebook" | null;
  video_url: string | null;
  video_embed_url: string | null;
  video_thumbnail_url: string | null;
  video_thumbnail_text: string | null;
  is_featured: boolean;
  show_on_homepage_community: boolean;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string | null;
  author?: {
    id: number;
    name: string;
  } | null;
  is_owned?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
}
