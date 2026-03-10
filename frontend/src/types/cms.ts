export interface CmsPost {
  id: number;
  title: string;
  slug: string;
  section: string;
  excerpt: string | null;
  content: string;
  image_url: string | null;
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
