export type Person = { id: number; rank: string; fullName: string; position: string; unit: string };
export type Report = { id: number; templateId: number | null; personId: number | null; title: string; status: "draft" | "generated"; createdAt: string };
export type ReportDraft = Omit<Report, "id" | "createdAt">;
