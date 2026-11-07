export const issueReasons = {
  incorrect_price: "Incorrect price",
  unavailable_offer: "Unavailable offer",
  misleading_information: "Misleading information",
  unreachable_contact: "Unreachable contact",
  other: "Other",
};

export type ReportTarget = "offer" | "property";

export type ReportState =
  | { status: "idle" | "received" }
  | { status: "error"; message: string; field?: "reason" | "comment" | "email" };
