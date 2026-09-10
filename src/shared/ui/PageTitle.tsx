import type { ReactNode } from "react";
import { CustomFieldsManager, type CustomFieldsScope } from "./custom-fields/CustomFieldsManager";

export function PageTitle({ title, subtitle, actions, customFieldsScope }: { title: string; subtitle: string; actions?: ReactNode; customFieldsScope?: CustomFieldsScope }) {
  const resolvedScope = customFieldsScope ?? (title === "Особовий склад" ? "personnel" : null);
  return <>
    <div className="page-title">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {actions && <div className="header-actions">
        {resolvedScope && <CustomFieldsManager scope={resolvedScope} />}
        {actions}
      </div>}
    </div>
  </>;
}
