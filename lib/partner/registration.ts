export const districts = [
  "Ampara",
  "Anuradhapura",
  "Badulla",
  "Batticaloa",
  "Colombo",
  "Galle",
  "Gampaha",
  "Hambantota",
  "Jaffna",
  "Kalutara",
  "Kandy",
  "Kegalle",
  "Kilinochchi",
  "Kurunegala",
  "Mannar",
  "Matale",
  "Matara",
  "Monaragala",
  "Mullaitivu",
  "Nuwara Eliya",
  "Polonnaruwa",
  "Puttalam",
  "Ratnapura",
  "Trincomalee",
  "Vavuniya",
] as const;

export const propertyTypes = {
  hotel: "Hotel",
  boutique_hotel: "Boutique hotel",
  resort: "Resort",
  villa: "Villa",
  guest_house: "Guest house",
  restaurant: "Restaurant",
  cafe: "Café",
  day_out_venue: "Day out venue",
  other: "Other",
};

export const propertyCategories = { stays: "Stays", dining: "Dining", day_outs: "Day Outs" };

export const stayTypes = ["hotel", "boutique_hotel", "resort", "villa", "guest_house"];

export const propertyStatus = {
  pending: [
    "Pending review",
    "Ayaale will check your business details, location and authorization.",
  ],
  more_information_required: [
    "More information needed",
    "Ayaale needs more information to verify this property.",
  ],
  verified: [
    "Verified",
    "Ayaale has verified your property. Offer approval is handled separately.",
  ],
  rejected: ["Registration declined", "Ayaale could not approve this registration."],
  suspended: ["Suspended", "This property is currently unavailable on Ayaale."],
} as const;

export function isPropertyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
