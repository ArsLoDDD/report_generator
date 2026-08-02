export type TemplateStatus = "ready" | "warning" | "error";

export type Template = {
  name: string;
  description: string;
  changed: string;
  status: TemplateStatus;
  variables: number;
};

export type Person = {
  id: number;
  fullName: string;
  rank: string;
  position: string;
  unit: string;
};

export type Screen = "generator" | "templates" | "people" | "generated" | "settings";
