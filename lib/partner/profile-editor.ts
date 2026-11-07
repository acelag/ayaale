export const informationFields = [
  { name: "name", label: "Property name", max: 160, required: true },
  { name: "description", label: "Description", max: 5000, multiline: true },
  { name: "address", label: "Street address", max: 500, required: true, multiline: true },
  { name: "district", label: "District", max: 80, required: true },
  { name: "google_maps_url", label: "Google Maps link", max: 2048, type: "url" },
] as const;

export const contactFields = [
  { name: "public_phone", label: "Business phone", max: 16, type: "tel" },
  { name: "public_whatsapp", label: "Business WhatsApp", max: 16, type: "tel" },
  { name: "public_email", label: "Business email", max: 254, type: "email" },
  { name: "website_url", label: "Website", max: 2048, type: "url" },
  { name: "google_reviews_url", label: "Google reviews link", max: 2048, type: "url" },
  { name: "facebook_url", label: "Facebook link", max: 2048, type: "url" },
  { name: "instagram_url", label: "Instagram link", max: 2048, type: "url" },
] as const;

export type ProfileField = {
  name: (typeof informationFields | typeof contactFields)[number]["name"];
  label: string;
  max: number;
  required?: boolean;
  multiline?: boolean;
  type?: string;
};

export type GalleryPhoto = { id: string; alt: string };
export type PhotoAsset = { id: string; width: number; height: number };
export type EditorProfile = Record<ProfileField["name"], string | null> & {
  amenities: string[];
  gallery: GalleryPhoto[];
};

export type PropertyEditor = {
  version: string;
  editable: boolean;
  requestStatus: string | null;
  decisionMessage?: string | null;
  profile: EditorProfile;
};
